-- ============================================================
--  PATCH: a bus outside the route area is shown to its own
--  phone only, instead of refused
--
--  Since 01-base.sql a position outside a box around the route
--  (Cavite and Metro Manila's south) has been refused with
--  'position off route', so a bus somewhere else can never be put
--  on the riders' map. That still holds. What changes is what the
--  sharer gets: instead of a refusal, the position is kept on the
--  trip's row as before, marked off_route, and get_positions hands
--  that row to its own phone and to nobody else. The sharer sees
--  their bus on their own map; riders never see it; once the bus is
--  inside the area, the next write shows it to everyone.
--
--  Why: Google Play reviews the Android app from wherever its
--  reviewers are, and wants every part of an app reachable without
--  a location-dependent lock. Refused outside the area, sharing could
--  not be reviewed at all. A reviewer key that skipped the check was
--  the other way, and was refused: anyone holding it could have put
--  a made-up bus on the real map from anywhere. A bus only its own
--  phone can see is harmless whoever starts it, so there is nothing
--  to hand out and nothing to leak.
--
--  What it does not change. Nothing new is kept: it is the same one
--  row per trip, overwritten and swept exactly as before, with one
--  more yes or no on it. A position with no coordinates is still
--  refused with 'position off route', as are a wrong key, a made-up
--  direction and an impossible speed. The old set_bus_position,
--  which only pages from before 11-open-sharing.sql call and which
--  cannot say "only you", still refuses an off-route position.
--
--  The cap. Buses off the route do not count towards the sharer cap,
--  which is about the riders' map. They have a small cap of their
--  own, so nobody can fill the table from abroad. A bus that drives
--  into the area is counted against the riders' cap at that moment,
--  as if it had just started there.
--
--  How the page knows. Both writers now answer 'private' for a
--  position kept off the map. set_keyed_position already answered
--  with a word (null for a write that landed), so it gains one;
--  set_open_position answered nothing and now answers the same way.
--  A page from before this reads any word as a failed write, which
--  is what it saw before for an off-route position anyway.
--
--  Apply after 13-bus-look.sql. Safe to re-run.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Which buses are outside the route area
-- ------------------------------------------------------------
-- Overwritten by every write, like the position it describes.
alter table public.bus_positions
  add column if not exists off_route boolean not null default false;

-- ------------------------------------------------------------
-- The write
-- ------------------------------------------------------------
-- It changes shape, so the old one goes rather than gaining an overload.
drop function if exists public._write_position(
  public.routes, boolean, boolean, text,
  double precision, double precision, double precision, text, text);

-- As in 11-open-sharing.sql, except that p_hide_off keeps an off-route
-- position for its own phone instead of refusing it, and the answer is
-- whether it did.
create or replace function public._write_position(
  r public.routes, p_via_prev boolean, p_keyless boolean, p_session text,
  p_lat double precision, p_lng double precision, p_speed double precision,
  p_direction text, p_label text, p_hide_off boolean)
returns boolean language plpgsql security definer set search_path to 'public'
as $$
declare
  last_ts timestamptz;
  was_off boolean;
  off boolean;
  cap int;
begin
  if p_session is null or p_session !~ '^[A-Za-z0-9\-]{8,64}$' then
    raise exception 'invalid session';
  end if;
  if exists (select 1 from public.kicked_sessions k
              where k.route_slug = r.slug and k.session_id = p_session and k.until > now()) then
    raise exception 'session blocked';
  end if;
  -- NULL is named in both checks below because a comparison with NULL is
  -- NULL, and IF reads that as false.
  if p_direction is null or p_direction not in ('north','south') then
    raise exception 'invalid direction';
  end if;
  if p_label is not null and char_length(p_label) > 12 then
    raise exception 'label too long';
  end if;
  -- No position at all is still no bus, and nor is one that is nowhere on
  -- Earth. Postgres sorts NaN above every number, so it fails these too.
  if p_lat is null or p_lng is null
     or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'position off route';
  end if;
  off := p_lat < 13.90 or p_lat > 14.75 or p_lng < 120.70 or p_lng > 121.15;
  if off and not p_hide_off then
    raise exception 'position off route';
  end if;
  -- Checked, never kept: see 08-position-checks.sql.
  if p_speed is not null and (p_speed < 0 or p_speed > 60) then
    raise exception 'implausible speed';
  end if;

  select updated_at, off_route into last_ts, was_off from public.bus_positions
   where route_slug = r.slug and session_id = p_session;

  if p_via_prev and last_ts is null then
    raise exception 'invalid key';
  end if;

  if last_ts is not null and now() - last_ts < interval '2 seconds' then
    raise exception 'rate limited';
  end if;

  -- Only the buses the riders' map shows count: see 08-position-checks.sql.
  -- A bus coming into the area from outside it is counted as it arrives.
  cap := greatest(coalesce((r.settings->>'max_sessions')::int, 25), 1);
  if not off and (last_ts is null or was_off) and
     (select count(*) from public.bus_positions b
       where b.route_slug = r.slug and not b.off_route
         and b.updated_at >= now() - make_interval(
               mins => greatest(coalesce((r.settings->>'bus_expiry_min')::int, 10), 1))) >= cap then
    raise exception 'too many active sessions';
  end if;
  -- Buses outside the area have ten places of their own, whatever the
  -- riders' cap is, so they can neither crowd out a real sharer nor fill
  -- the table.
  if off and last_ts is null and
     (select count(*) from public.bus_positions b
       where b.route_slug = r.slug and b.off_route
         and b.updated_at >= now() - make_interval(
               mins => greatest(coalesce((r.settings->>'bus_expiry_min')::int, 10), 1))) >= 10 then
    raise exception 'too many active sessions';
  end if;

  insert into public.bus_positions
    (route_key, route_slug, session_id, lat, lng, speed, direction, bus_label, keyless, off_route, updated_at)
  values (r.key, r.slug, p_session, p_lat, p_lng, null, p_direction,
          nullif(trim(p_label), ''), p_keyless, off, now())
  on conflict (route_slug, session_id) do update
    set lat = excluded.lat, lng = excluded.lng, speed = null,
        direction = excluded.direction, bus_label = excluded.bus_label,
        route_key = excluded.route_key, keyless = excluded.keyless,
        off_route = excluded.off_route, updated_at = now();

  perform public._sweep(r.slug);
  return off;
end;
$$;

-- ------------------------------------------------------------
-- The writers
-- ------------------------------------------------------------
-- As in 12-share-pin.sql. It can only say yes or fail, so it still
-- refuses an off-route position rather than keep one its page would
-- report as live.
create or replace function public.set_bus_position(
  p_key text, p_session text,
  p_lat double precision, p_lng double precision, p_speed double precision,
  p_direction text, p_label text)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare
  r public.routes;
  via_prev boolean := false;
begin
  -- It finds the route by the key alone, so it cannot count a wrong one.
  if public._is_pin(p_key) then raise exception 'invalid key'; end if;
  select * into r from public.routes where key = p_key;
  if r.slug is null then
    select * into r from public.routes
     where prev_key = p_key and prev_key_expires is not null and prev_key_expires > now();
    if r.slug is null then raise exception 'invalid key'; end if;
    via_prev := true;
  end if;
  perform public._write_position(r, via_prev, false, p_session,
                                 p_lat, p_lng, p_speed, p_direction, p_label, false);
end;
$$;

-- As in 13-bus-look.sql, answering 'private' for a bus kept off the map.
create or replace function public.set_keyed_position(
  p_slug text, p_key text, p_session text,
  p_lat double precision, p_lng double precision, p_speed double precision,
  p_direction text, p_label text, p_look text default null)
returns text language plpgsql security definer set search_path to 'public'
as $$
declare
  r public.routes;
  known boolean;
  off boolean;
begin
  select * into r from public.routes where slug = p_slug;
  if r.slug is null then raise exception 'invalid route'; end if;
  known := exists (select 1 from public.bus_positions
                    where route_slug = r.slug and session_id = p_session);

  if p_key is not null and p_key = r.key then
    if public._key_paused(r) and not known then return 'too many tries'; end if;
    off := public._write_position(r, false, false, p_session,
                                  p_lat, p_lng, p_speed, p_direction, p_label, true);
    perform public._set_look(r.slug, p_session, p_look);
    return case when off then 'private' end;
  end if;

  if p_key is not null and p_key = r.prev_key
     and r.prev_key_expires is not null and r.prev_key_expires > now() then
    off := public._write_position(r, true, false, p_session,
                                  p_lat, p_lng, p_speed, p_direction, p_label, true);
    perform public._set_look(r.slug, p_session, p_look);
    return case when off then 'private' end;
  end if;

  if public._key_paused(r) then return 'too many tries'; end if;
  if public._is_pin(r.key) and public._key_failed(r.slug) then return 'too many tries'; end if;
  return 'invalid key';
end;
$$;

-- It changes what it returns, so the old one goes first.
drop function if exists public.set_open_position(
  text, text, double precision, double precision, double precision, text, text, text);

-- As in 13-bus-look.sql, answering like set_keyed_position: nothing for a
-- bus on the map, 'private' for one kept off it.
create or replace function public.set_open_position(
  p_slug text, p_session text,
  p_lat double precision, p_lng double precision, p_speed double precision,
  p_direction text, p_label text, p_look text default null)
returns text language plpgsql security definer set search_path to 'public'
as $$
declare
  r public.routes;
  off boolean;
begin
  select * into r from public.routes where slug = p_slug;
  if r.slug is null then raise exception 'invalid route'; end if;
  if (r.settings->'open_sharing') is distinct from 'true'::jsonb then
    raise exception 'open sharing is off';
  end if;
  off := public._write_position(r, false, true, p_session,
                                p_lat, p_lng, p_speed, p_direction, p_label, true);
  perform public._set_look(r.slug, p_session, p_look);
  return case when off then 'private' end;
end;
$$;

-- ------------------------------------------------------------
-- The readers
-- ------------------------------------------------------------
-- As in 13-bus-look.sql, less every off-route bus but the caller's own.
-- p_self is the caller's session id, which only its phone holds, so
-- nobody else can ask for one.
create or replace function public.get_positions(p_slug text, p_self text default null)
returns table(pub_id text, is_self boolean, thanks integer,
              lat double precision, lng double precision,
              direction text, bus_label text, updated_at timestamptz, look text)
language sql stable security definer set search_path to 'public'
as $$
  select public._pub_id(r.pub_salt, b.session_id),
         (p_self is not null and b.session_id = p_self),
         -- null for everyone else's bus, not zero: see 07-thanks.sql
         case when p_self is not null and b.session_id = p_self
              then (select count(*)::int from public.thanks_now t
                     where t.route_slug = b.route_slug and t.session_id = b.session_id)
              else null end,
         b.lat, b.lng, b.direction, b.bus_label, b.updated_at, b.look
    from public.bus_positions b
    join public.routes r on r.slug = b.route_slug
   where b.route_slug = p_slug
     and (not b.off_route or (p_self is not null and b.session_id = p_self))
     and b.updated_at >= now() - make_interval(
           mins => greatest(coalesce((r.settings->>'bus_expiry_min')::int, 10), 1))
   order by b.updated_at desc;
$$;

-- As in 11-open-sharing.sql, less the off-route buses: the admin page's
-- list is the riders' map, with a Stop button beside each bus on it.
create or replace function public.admin_list_sharers(p_slug text, p_admin text)
returns table(session_id text, lat double precision, lng double precision,
              direction text, bus_label text, updated_at timestamptz, keyless boolean)
language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public._require_admin(p_slug, p_admin);
  return query
    select b.session_id, b.lat, b.lng, b.direction, b.bus_label, b.updated_at, b.keyless
      from public.bus_positions b
     where b.route_slug = p_slug and not b.off_route
     order by b.updated_at desc;
end;
$$;

revoke execute on function
  public._write_position(public.routes, boolean, boolean, text,
                         double precision, double precision, double precision, text, text, boolean)
from public, anon, authenticated;

grant execute on function
  public.set_bus_position(text, text, double precision, double precision, double precision, text, text),
  public.set_keyed_position(text, text, text, double precision, double precision, double precision, text, text, text),
  public.set_open_position(text, text, double precision, double precision, double precision, text, text, text),
  public.get_positions(text, text),
  public.admin_list_sharers(text, text)
to anon, authenticated;

commit;
