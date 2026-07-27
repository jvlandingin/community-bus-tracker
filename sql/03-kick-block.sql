-- ============================================================
--  PATCH: make Stop actually stop
--
--  admin_kick deleted the row, but the sharing phone rewrites a
--  position every 5 seconds, so the bus reappeared immediately.
--  Kicking now also blocks that session for 6 hours (longer than
--  a full trip), and the sharing phone is told plainly and stops.
--
--  What is stored: a random session id and an expiry time. No
--  location, no name, nothing about a person. The no-history
--  property is untouched: there is still no record of where any
--  bus has been.
--
--  Honest limit: a blocked person can reload the page to get a
--  new session id. This raises the effort from nothing at all to
--  a deliberate act. Rotating the share key is still the only
--  real expulsion.
--
--  Safe to run more than once.
-- ============================================================

begin;

create table if not exists public.kicked_sessions (
  route_slug text not null,
  session_id text not null,
  until      timestamptz not null,
  primary key (route_slug, session_id)
);
alter table public.kicked_sessions enable row level security;

-- cleanup of expired blocks joins the existing sweep
create or replace function public._sweep(p_slug text)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare bus_min int; sig_min int;
begin
  select coalesce((settings->>'bus_expiry_min')::int, 10),
         coalesce((settings->>'sighting_expiry_min')::int, 120)
    into bus_min, sig_min
    from public.routes where slug = p_slug;
  delete from public.bus_positions
   where route_slug = p_slug
     and updated_at < now() - make_interval(mins => greatest(bus_min, 1) * 2);
  delete from public.sightings
   where route_slug = p_slug
     and created_at < now() - make_interval(mins => greatest(sig_min, 5));
  delete from public.kicked_sessions
   where route_slug = p_slug and until < now();
end;
$$;

-- kick: remove the bus AND stop it coming back
create or replace function public.admin_kick(p_slug text, p_admin text, p_session text)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public._require_admin(p_slug, p_admin);
  delete from public.bus_positions where route_slug = p_slug and session_id = p_session;
  insert into public.kicked_sessions (route_slug, session_id, until)
  values (p_slug, p_session, now() + interval '6 hours')
  on conflict (route_slug, session_id) do update set until = excluded.until;
end;
$$;

-- undo a kick, because a mis-tap should be reversible
create or replace function public.admin_unblock(p_slug text, p_admin text, p_session text)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public._require_admin(p_slug, p_admin);
  delete from public.kicked_sessions where route_slug = p_slug and session_id = p_session;
end;
$$;

create or replace function public.admin_list_blocked(p_slug text, p_admin text)
returns table(session_id text, until timestamptz)
language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public._require_admin(p_slug, p_admin);
  return query
    select k.session_id, k.until from public.kicked_sessions k
     where k.route_slug = p_slug and k.until > now()
     order by k.until desc;
end;
$$;

-- writes from a blocked session are refused
create or replace function public.set_bus_position(
  p_key text, p_session text,
  p_lat double precision, p_lng double precision, p_speed double precision,
  p_direction text, p_label text)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare
  r public.routes;
  via_prev boolean := false;
  last_ts timestamptz;
  cap int;
begin
  select * into r from public.routes where key = p_key;
  if r.slug is null then
    select * into r from public.routes
     where prev_key = p_key and prev_key_expires is not null and prev_key_expires > now();
    if r.slug is null then raise exception 'invalid key'; end if;
    via_prev := true;
  end if;
  if p_session is null or p_session !~ '^[A-Za-z0-9\-]{8,64}$' then
    raise exception 'invalid session';
  end if;
  if exists (select 1 from public.kicked_sessions k
              where k.route_slug = r.slug and k.session_id = p_session and k.until > now()) then
    raise exception 'session blocked';
  end if;
  if p_direction not in ('north','south') then
    raise exception 'invalid direction';
  end if;
  if p_label is not null and char_length(p_label) > 12 then
    raise exception 'label too long';
  end if;
  if p_lat < 13.90 or p_lat > 14.75 or p_lng < 120.70 or p_lng > 121.15 then
    raise exception 'position off route';
  end if;
  if p_speed is null then p_speed := 0; end if;
  if p_speed < 0 or p_speed > 60 then
    raise exception 'implausible speed';
  end if;

  select updated_at into last_ts from public.bus_positions
   where route_slug = r.slug and session_id = p_session;

  if via_prev and last_ts is null then
    raise exception 'invalid key';
  end if;

  if last_ts is not null and now() - last_ts < interval '2 seconds' then
    raise exception 'rate limited';
  end if;

  cap := greatest(coalesce((r.settings->>'max_sessions')::int, 25), 1);
  if last_ts is null and
     (select count(*) from public.bus_positions where route_slug = r.slug) >= cap then
    raise exception 'too many active sessions';
  end if;

  insert into public.bus_positions
    (route_key, route_slug, session_id, lat, lng, speed, direction, bus_label, updated_at)
  values (r.key, r.slug, p_session, p_lat, p_lng, p_speed, p_direction,
          nullif(trim(p_label), ''), now())
  on conflict (route_slug, session_id) do update
    set lat = excluded.lat, lng = excluded.lng, speed = excluded.speed,
        direction = excluded.direction, bus_label = excluded.bus_label,
        route_key = excluded.route_key, updated_at = now();

  perform public._sweep(r.slug);
end;
$$;

revoke execute on function public._sweep(text) from public, anon, authenticated;
grant execute on function
  public.admin_unblock(text, text, text),
  public.admin_list_blocked(text, text)
to anon, authenticated;

commit;
