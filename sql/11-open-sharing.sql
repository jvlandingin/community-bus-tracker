-- ============================================================
--  PATCH: the admin page can let anyone share, without the key
--
--  Until now putting a bus on the map needed the share key, which
--  lives only in the link posted to the group chat. That keeps
--  strangers off the map, and it also keeps off every rider who
--  never saw the link, which is most of them. This adds a switch,
--  "open_sharing" in settings, that lets a page with no key start
--  a trip.
--
--  What it costs, written down because the switch makes it easy to
--  forget. The route slug is public (it is in config.txt) and so is
--  the anon key, so with the switch on anyone on the internet can
--  post a bus with a short script, without opening the site. The
--  sharer cap then becomes a way to lock real sharers out: fill it
--  with made-up buses and every real Start is refused. Stopping one
--  from the admin page blocks one session id, and a script makes a
--  new one each time. With no key there is no key to rotate. What
--  still holds: every check on a position (on the route, plausible
--  speed, one write in 2 seconds per session, the cap), and the
--  fact that nothing is kept beyond one row per trip.
--
--  So the way out is the switch itself. Turning it off does what
--  rotating the key does for keyed sharers, at once and without a
--  grace period: every bus that was started without the key is
--  taken off the map, and their next write is refused. Sharers who
--  have the key are not touched, and the key keeps working whether
--  the switch is on or off.
--
--  Absent means off, which is every settings object stored before
--  this, so nothing changes until an admin turns it on.
--
--  The checks on a position move into _write_position(), which both
--  writers call, so the keyed and keyless paths cannot drift apart.
--  set_bus_position keeps its signature, its messages and its
--  behaviour exactly.
--
--  Apply after 10-weekend-hours.sql. Safe to re-run.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Which buses came in without the key
-- ------------------------------------------------------------
-- The only thing it is for is taking those buses off the map when the
-- switch goes off, and letting the admin page mark them. It says nothing
-- about a person.
alter table public.bus_positions
  add column if not exists keyless boolean not null default false;

-- ------------------------------------------------------------
-- The setting
-- ------------------------------------------------------------
-- As in 10-weekend-hours.sql, plus the open_sharing line.
create or replace function public._check_settings(s jsonb)
returns void language plpgsql immutable
as $$
declare d text; w jsonb; t text; i int; n int; k int; hs jsonb; lbl text;
begin
  if s is null or jsonb_typeof(s) <> 'object' then raise exception 'settings must be an object'; end if;
  foreach d in array array['headway_min','bus_expiry_min','sighting_expiry_min','max_sessions'] loop
    if jsonb_typeof(s->d) <> 'number' then raise exception '% must be a number', d; end if;
  end loop;
  if (s->>'headway_min')::numeric not between 1 and 720 then raise exception 'headway_min out of range'; end if;
  if (s->>'bus_expiry_min')::numeric not between 1 and 120 then raise exception 'bus_expiry_min out of range'; end if;
  if (s->>'sighting_expiry_min')::numeric not between 5 and 1440 then raise exception 'sighting_expiry_min out of range'; end if;
  if (s->>'max_sessions')::numeric not between 1 and 200 then raise exception 'max_sessions out of range'; end if;
  -- Only a real true turns it on (see set_open_position), so a string
  -- "false" would be harmless; it is refused anyway, so the stored value
  -- always says what it means.
  if s ? 'open_sharing' and jsonb_typeof(s->'open_sharing') <> 'boolean' then
    raise exception 'open_sharing must be true or false';
  end if;
  if jsonb_typeof(s->'hours') <> 'object' then raise exception 'hours must be an object'; end if;
  if (s->'hours') ? 'weekend' and jsonb_typeof(s->'hours'->'weekend') <> 'object' then
    raise exception 'hours.weekend must be an object';
  end if;
  -- k = 1 is the weekday pair, k = 2 the weekend one when present
  for k in 1..2 loop
    if k = 1 then hs := s->'hours'; else hs := s->'hours'->'weekend'; end if;
    if hs is null then continue; end if;
    foreach d in array array['north','south'] loop
      lbl := case when k = 1 then 'hours.' else 'hours.weekend.' end || d;
      -- "is null" first: jsonb_typeof of a missing key is NULL, which no
      -- comparison turns into true, and the loop below would then crash on
      -- a null bound instead of naming the missing direction.
      if hs->d is null or jsonb_typeof(hs->d) <> 'array' then raise exception '% must be a list of windows', lbl; end if;
      n := jsonb_array_length(hs->d);
      if n < 1 or n > 6 then raise exception '%: 1 to 6 windows', lbl; end if;
      for i in 0 .. n-1 loop
        w := hs->d->i;
        if jsonb_typeof(w) <> 'array' or jsonb_array_length(w) not in (2, 3) then
          raise exception '% window % must be [start,end] or [start,end,minutes]', lbl, i+1;
        end if;
        foreach t in array array[w->>0, w->>1] loop
          if t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
            raise exception '% window %: times must be HH:MM (24h)', lbl, i+1;
          end if;
        end loop;
        if (w->>0) >= (w->>1) then
          raise exception '% window %: start must be before end', lbl, i+1;
        end if;
        if jsonb_array_length(w) = 3 then
          if jsonb_typeof(w->2) <> 'number' then
            raise exception '% window %: the interval must be a number of minutes', lbl, i+1;
          end if;
          if (w->>2)::numeric not between 1 and 720 then
            raise exception '% window %: interval out of range', lbl, i+1;
          end if;
        end if;
      end loop;
    end loop;
  end loop;
end;
$$;

-- Saving with the switch off takes every keyless bus off the map in the
-- same transaction, so there is no moment where the admin believes they
-- are gone and they are not. Their thanks_now rows go with them, by the
-- cascade that table is built on.
create or replace function public.admin_set_settings(p_slug text, p_admin text, p_settings jsonb)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public._require_admin(p_slug, p_admin);
  perform public._check_settings(p_settings);
  update public.routes set settings = p_settings where slug = p_slug;
  if (p_settings->'open_sharing') is distinct from 'true'::jsonb then
    delete from public.bus_positions where route_slug = p_slug and keyless;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- The checks on a position, shared by both writers
-- ------------------------------------------------------------
-- Everything set_bus_position did in 08-position-checks.sql after finding
-- the route, unchanged, plus the keyless flag. Not callable from outside:
-- it trusts that the caller has already decided this write may happen.
create or replace function public._write_position(
  r public.routes, p_via_prev boolean, p_keyless boolean, p_session text,
  p_lat double precision, p_lng double precision, p_speed double precision,
  p_direction text, p_label text)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare
  last_ts timestamptz;
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
  if p_lat is null or p_lng is null
     or p_lat < 13.90 or p_lat > 14.75 or p_lng < 120.70 or p_lng > 121.15 then
    raise exception 'position off route';
  end if;
  -- Checked, never kept: see 08-position-checks.sql.
  if p_speed is not null and (p_speed < 0 or p_speed > 60) then
    raise exception 'implausible speed';
  end if;

  select updated_at into last_ts from public.bus_positions
   where route_slug = r.slug and session_id = p_session;

  if p_via_prev and last_ts is null then
    raise exception 'invalid key';
  end if;

  if last_ts is not null and now() - last_ts < interval '2 seconds' then
    raise exception 'rate limited';
  end if;

  -- Only the buses the map shows count: see 08-position-checks.sql.
  cap := greatest(coalesce((r.settings->>'max_sessions')::int, 25), 1);
  if last_ts is null and
     (select count(*) from public.bus_positions b
       where b.route_slug = r.slug
         and b.updated_at >= now() - make_interval(
               mins => greatest(coalesce((r.settings->>'bus_expiry_min')::int, 10), 1))) >= cap then
    raise exception 'too many active sessions';
  end if;

  insert into public.bus_positions
    (route_key, route_slug, session_id, lat, lng, speed, direction, bus_label, keyless, updated_at)
  values (r.key, r.slug, p_session, p_lat, p_lng, null, p_direction,
          nullif(trim(p_label), ''), p_keyless, now())
  on conflict (route_slug, session_id) do update
    set lat = excluded.lat, lng = excluded.lng, speed = null,
        direction = excluded.direction, bus_label = excluded.bus_label,
        route_key = excluded.route_key, keyless = excluded.keyless,
        updated_at = now();

  perform public._sweep(r.slug);
end;
$$;

-- ------------------------------------------------------------
-- The two writers
-- ------------------------------------------------------------
-- With the key: as in 08-position-checks.sql, the checks moved out.
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
  select * into r from public.routes where key = p_key;
  if r.slug is null then
    select * into r from public.routes
     where prev_key = p_key and prev_key_expires is not null and prev_key_expires > now();
    if r.slug is null then raise exception 'invalid key'; end if;
    via_prev := true;
  end if;
  perform public._write_position(r, via_prev, false, p_session,
                                 p_lat, p_lng, p_speed, p_direction, p_label);
end;
$$;

-- Without it: the public slug instead of the key, and only while the
-- switch is on. Checked on every write rather than at Start, so turning
-- the switch off stops a keyless trip already under way.
create or replace function public.set_open_position(
  p_slug text, p_session text,
  p_lat double precision, p_lng double precision, p_speed double precision,
  p_direction text, p_label text)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare
  r public.routes;
begin
  select * into r from public.routes where slug = p_slug;
  if r.slug is null then raise exception 'invalid route'; end if;
  if (r.settings->'open_sharing') is distinct from 'true'::jsonb then
    raise exception 'open sharing is off';
  end if;
  perform public._write_position(r, false, true, p_session,
                                 p_lat, p_lng, p_speed, p_direction, p_label);
end;
$$;

-- ------------------------------------------------------------
-- The admin's list says which buses came in without the key
-- ------------------------------------------------------------
-- It changes shape, so the old one goes rather than gaining an overload.
-- A page from before this ignores the extra column; this page reads a
-- missing one as false.
drop function if exists public.admin_list_sharers(text, text);

-- As in 08-position-checks.sql, plus keyless.
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
     where b.route_slug = p_slug
     order by b.updated_at desc;
end;
$$;

revoke execute on function
  public._write_position(public.routes, boolean, boolean, text,
                         double precision, double precision, double precision, text, text)
from public, anon, authenticated;

grant execute on function
  public.set_bus_position(text, text, double precision, double precision, double precision, text, text),
  public.set_open_position(text, text, double precision, double precision, double precision, text, text),
  public.admin_set_settings(text, text, jsonb),
  public.admin_list_sharers(text, text)
to anon, authenticated;

commit;
