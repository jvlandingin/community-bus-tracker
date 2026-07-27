-- ============================================================
--  WT Live Tracker migration: admin page + public tracking
--
--  Run this ONCE in the Supabase SQL editor, BEFORE deploying
--  the new index.html and admin.html. Then follow the two
--  setup steps at the bottom of this file.
--
--  What it changes:
--   1. The route gains a public SLUG (safe to ship in config.txt).
--      Watching the map needs only the slug. Sharing still needs
--      the secret key. Rotating the key no longer breaks watching.
--   2. Settings move into the database: operating hours (now a
--      LIST of windows per direction, since the March 2026 poster
--      splits the day), headway, expiry times, session cap.
--   3. A pinned notice, set from the admin page, shown in the app.
--   4. Admin functions, all verified server side against a hashed
--      admin key that is never stored in plain text.
--   5. Key rotation with a grace period: sharers already on a trip
--      keep working for 4 hours; NEW sharers need the new key.
--   6. Reads no longer delete anything (the old get_positions ran
--      a DELETE on every read). Cleanup now happens on writes.
--   7. Drops the four obsolete function overloads.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Routes: slug, rotation, admin credentials, settings, notice
-- ------------------------------------------------------------
alter table public.routes add column if not exists slug text;
alter table public.routes add column if not exists prev_key text;
alter table public.routes add column if not exists prev_key_expires timestamptz;
alter table public.routes add column if not exists admin_salt text;
alter table public.routes add column if not exists admin_hash text;
alter table public.routes add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.routes add column if not exists notice_text text;
alter table public.routes add column if not exists notice_updated timestamptz;
alter table public.routes add column if not exists notice_expires timestamptz;

-- every route gets a random slug; you can rename it in step A below
update public.routes
   set slug = 'r-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)
 where slug is null;
alter table public.routes alter column slug set not null;
create unique index if not exists routes_slug_uniq on public.routes (slug);

-- seed settings with the values that were in config.txt, so nothing
-- changes behaviour until you edit them in the admin page
update public.routes
   set settings = jsonb_build_object(
     'hours', jsonb_build_object(
        'north', jsonb_build_array(jsonb_build_array('03:00','16:00')),
        'south', jsonb_build_array(jsonb_build_array('05:30','20:00'))),
     'headway_min', 30,
     'bus_expiry_min', 10,
     'sighting_expiry_min', 120,
     'max_sessions', 25)
 where settings = '{}'::jsonb;

-- ------------------------------------------------------------
-- 2. Data tables keyed by slug, so key rotation never orphans rows
-- ------------------------------------------------------------
alter table public.bus_positions add column if not exists route_slug text;
update public.bus_positions b set route_slug = r.slug
  from public.routes r where b.route_key = r.key and b.route_slug is null;
delete from public.bus_positions where route_slug is null;  -- orphans of deleted routes
create unique index if not exists bus_positions_slug_session
  on public.bus_positions (route_slug, session_id);

alter table public.sightings add column if not exists route_slug text;
update public.sightings s set route_slug = r.slug
  from public.routes r where s.route_key = r.key and s.route_slug is null;
delete from public.sightings where route_slug is null;
alter table public.sightings add column if not exists sid bigint generated always as identity;
create unique index if not exists sightings_sid_uniq on public.sightings (sid);

-- ------------------------------------------------------------
-- 3. Drop obsolete overloads (two generations were both live)
-- ------------------------------------------------------------
drop function if exists public.get_positions(text);
drop function if exists public.get_positions(text, integer);
drop function if exists public.get_sightings(text);
drop function if exists public.get_sightings(text, integer);
drop function if exists public.add_sighting(text, text);
drop function if exists public.clear_bus_position(text, text);
drop function if exists public.set_bus_position(text, text, double precision, double precision, double precision, text, text);

-- ------------------------------------------------------------
-- Internal helpers (not exposed)
-- ------------------------------------------------------------
create or replace function public._hash_admin(p_salt text, p_admin text)
returns text language sql immutable
as $$ select encode(sha256(convert_to(coalesce(p_salt,'') || coalesce(p_admin,''), 'UTF8')), 'hex'); $$;

create or replace function public._require_admin(p_slug text, p_admin text)
returns public.routes language plpgsql security definer set search_path to 'public'
as $$
declare r public.routes;
begin
  select * into r from public.routes where slug = p_slug;
  if r.slug is null then raise exception 'invalid route'; end if;
  if r.admin_hash is null then raise exception 'admin key not set up yet'; end if;
  if r.admin_hash <> public._hash_admin(r.admin_salt, p_admin) then
    raise exception 'invalid admin key';
  end if;
  return r;
end;
$$;

-- validates the settings shape so the admin page cannot save junk
create or replace function public._check_settings(s jsonb)
returns void language plpgsql immutable
as $$
declare d text; w jsonb; t text; i int; n int;
begin
  if s is null or jsonb_typeof(s) <> 'object' then raise exception 'settings must be an object'; end if;
  foreach d in array array['headway_min','bus_expiry_min','sighting_expiry_min','max_sessions'] loop
    if jsonb_typeof(s->d) <> 'number' then raise exception '% must be a number', d; end if;
  end loop;
  if (s->>'headway_min')::numeric not between 1 and 720 then raise exception 'headway_min out of range'; end if;
  if (s->>'bus_expiry_min')::numeric not between 1 and 120 then raise exception 'bus_expiry_min out of range'; end if;
  if (s->>'sighting_expiry_min')::numeric not between 5 and 1440 then raise exception 'sighting_expiry_min out of range'; end if;
  if (s->>'max_sessions')::numeric not between 1 and 200 then raise exception 'max_sessions out of range'; end if;
  if jsonb_typeof(s->'hours') <> 'object' then raise exception 'hours must be an object'; end if;
  foreach d in array array['north','south'] loop
    if jsonb_typeof(s->'hours'->d) <> 'array' then raise exception 'hours.% must be a list of windows', d; end if;
    n := jsonb_array_length(s->'hours'->d);
    if n < 1 or n > 6 then raise exception 'hours.%: 1 to 6 windows', d; end if;
    for i in 0 .. n-1 loop
      w := s->'hours'->d->i;
      if jsonb_typeof(w) <> 'array' or jsonb_array_length(w) <> 2 then
        raise exception 'hours.% window % must be [start,end]', d, i+1;
      end if;
      foreach t in array array[w->>0, w->>1] loop
        if t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
          raise exception 'hours.% window %: times must be HH:MM (24h)', d, i+1;
        end if;
      end loop;
      if (w->>0) >= (w->>1) then
        raise exception 'hours.% window %: start must be before end', d, i+1;
      end if;
    end loop;
  end loop;
end;
$$;

-- the ONE cleanup routine, called from writes only
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
end;
$$;

-- ------------------------------------------------------------
-- 4. Public reads: slug only, no secrets, and NO deletes
-- ------------------------------------------------------------
create or replace function public.get_settings(p_slug text)
returns jsonb language sql stable security definer set search_path to 'public'
as $$
  select jsonb_build_object(
    'settings', r.settings,
    'notice', case
        when r.notice_text is null then null
        when r.notice_expires is not null and r.notice_expires < now() then null
        else jsonb_build_object('text', r.notice_text, 'updated', r.notice_updated)
      end)
  from public.routes r where r.slug = p_slug;
$$;

create or replace function public.get_positions(p_slug text)
returns table(session_id text, lat double precision, lng double precision,
              speed double precision, direction text, bus_label text, updated_at timestamptz)
language sql stable security definer set search_path to 'public'
as $$
  select b.session_id, b.lat, b.lng, b.speed, b.direction, b.bus_label, b.updated_at
    from public.bus_positions b
    join public.routes r on r.slug = b.route_slug
   where b.route_slug = p_slug
     and b.updated_at >= now() - make_interval(
           mins => greatest(coalesce((r.settings->>'bus_expiry_min')::int, 10), 1))
   order by b.updated_at desc;
$$;

create or replace function public.get_sightings(p_slug text)
returns table(sid bigint, body text, created_at timestamptz)
language sql stable security definer set search_path to 'public'
as $$
  select s.sid, s.body, s.created_at
    from public.sightings s
    join public.routes r on r.slug = s.route_slug
   where s.route_slug = p_slug
     and s.created_at >= now() - make_interval(
           mins => greatest(coalesce((r.settings->>'sighting_expiry_min')::int, 120), 5))
   order by s.created_at desc
   limit 8;
$$;

-- ------------------------------------------------------------
-- 5. Writes: sharing still needs the key; rotation grace applies
-- ------------------------------------------------------------
-- Unchanged signature and meaning: true only for the CURRENT key.
-- A sharer trying to START with a rotated-out key is refused here.
create or replace function public.route_exists(p_key text)
returns boolean language sql stable security definer set search_path to 'public'
as $$ select exists (select 1 from public.routes where key = p_key); $$;

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
    -- grace: the previous key still works for a limited time...
    select * into r from public.routes
     where prev_key = p_key and prev_key_expires is not null and prev_key_expires > now();
    if r.slug is null then raise exception 'invalid key'; end if;
    via_prev := true;
  end if;
  if p_session is null or p_session !~ '^[A-Za-z0-9\-]{8,64}$' then
    raise exception 'invalid session';
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

  -- ...and only for sessions that were already sharing. New trips
  -- need the new key. This is what "finish your current trip" means.
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

-- Stopping needs no secret: the session id itself is unguessable,
-- and being able to remove a bus from the map is not sensitive the
-- way adding one is. This also lets the sendBeacon cleanup keep
-- working across a key rotation.
create or replace function public.clear_bus_position(p_slug text, p_session text)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  delete from public.bus_positions where route_slug = p_slug and session_id = p_session;
end;
$$;

-- Sightings: open to anyone (the admin can delete), with a per-route
-- flood limit so spam is a chore for the spammer, not the admin.
create or replace function public.add_sighting(p_slug text, p_body text)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  if not exists (select 1 from public.routes where slug = p_slug) then
    raise exception 'invalid route';
  end if;
  if p_body is null or char_length(trim(p_body)) < 1 or char_length(p_body) > 140 then
    raise exception 'invalid sighting text';
  end if;
  if (select count(*) from public.sightings
       where route_slug = p_slug and created_at > now() - interval '60 seconds') >= 5 then
    raise exception 'sighting flood';
  end if;
  insert into public.sightings (route_key, route_slug, body)
  select r.key, r.slug, trim(p_body) from public.routes r where r.slug = p_slug;
  perform public._sweep(p_slug);
end;
$$;

-- ------------------------------------------------------------
-- 6. Admin functions
-- ------------------------------------------------------------
-- One-time setup. Works only while no admin key exists, so it cannot
-- be used to take over a route. Changing it later requires the old key.
create or replace function public.admin_setup(p_slug text, p_new_admin text)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare s text := replace(gen_random_uuid()::text, '-', '');
begin
  if p_new_admin is null or char_length(p_new_admin) < 12 then
    raise exception 'admin key must be at least 12 characters';
  end if;
  update public.routes
     set admin_salt = s, admin_hash = public._hash_admin(s, p_new_admin)
   where slug = p_slug and admin_hash is null;
  if not found then
    raise exception 'route not found, or admin key already set';
  end if;
end;
$$;

create or replace function public.admin_check(p_slug text, p_admin text)
returns boolean language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public._require_admin(p_slug, p_admin);
  return true;
end;
$$;

create or replace function public.admin_change_key(p_slug text, p_admin text, p_new_admin text)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare s text := replace(gen_random_uuid()::text, '-', '');
begin
  perform public._require_admin(p_slug, p_admin);
  if p_new_admin is null or char_length(p_new_admin) < 12 then
    raise exception 'admin key must be at least 12 characters';
  end if;
  update public.routes
     set admin_salt = s, admin_hash = public._hash_admin(s, p_new_admin)
   where slug = p_slug;
end;
$$;

create or replace function public.admin_set_settings(p_slug text, p_admin text, p_settings jsonb)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public._require_admin(p_slug, p_admin);
  perform public._check_settings(p_settings);
  update public.routes set settings = p_settings where slug = p_slug;
end;
$$;

-- p_minutes null means the notice stays until cleared
create or replace function public.admin_set_notice(p_slug text, p_admin text, p_text text, p_minutes integer)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public._require_admin(p_slug, p_admin);
  if p_text is null or char_length(trim(p_text)) < 1 then
    update public.routes
       set notice_text = null, notice_updated = null, notice_expires = null
     where slug = p_slug;
    return;
  end if;
  if char_length(p_text) > 280 then raise exception 'notice too long (280 max)'; end if;
  if p_minutes is not null and (p_minutes < 5 or p_minutes > 43200) then
    raise exception 'notice expiry out of range';
  end if;
  update public.routes
     set notice_text = trim(p_text),
         notice_updated = now(),
         notice_expires = case when p_minutes is null then null
                               else now() + make_interval(mins => p_minutes) end
   where slug = p_slug;
end;
$$;

-- Rotate the SHARE key. Sharers already on a trip keep working for
-- 4 hours (one full trip); new sharers need the new key immediately.
create or replace function public.admin_rotate_share_key(p_slug text, p_admin text, p_new_key text)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare r public.routes;
begin
  r := public._require_admin(p_slug, p_admin);
  if p_new_key is null or p_new_key !~ '^[A-Za-z0-9_\-]{8,64}$' then
    raise exception 'share key must be 8 to 64 letters, digits, - or _';
  end if;
  if exists (select 1 from public.routes where key = p_new_key and slug <> p_slug) then
    raise exception 'key already in use';
  end if;
  update public.routes
     set prev_key = r.key,
         prev_key_expires = now() + interval '4 hours',
         key = p_new_key
   where slug = p_slug;
end;
$$;

create or replace function public.admin_kick(p_slug text, p_admin text, p_session text)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public._require_admin(p_slug, p_admin);
  delete from public.bus_positions where route_slug = p_slug and session_id = p_session;
end;
$$;

create or replace function public.admin_delete_sighting(p_slug text, p_admin text, p_sid bigint)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public._require_admin(p_slug, p_admin);
  delete from public.sightings where route_slug = p_slug and sid = p_sid;
end;
$$;

-- Rename the public slug everywhere at once. Run from the SQL editor
-- only (not callable by the app), used in setup step A below.
create or replace function public.rename_route_slug(p_old text, p_new text)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  if p_new is null or p_new !~ '^[a-z0-9][a-z0-9\-]{2,40}$' then
    raise exception 'slug must be 3 to 41 chars: lowercase letters, digits, hyphens';
  end if;
  if not exists (select 1 from public.routes where slug = p_old) then
    raise exception 'no route with slug %', p_old;
  end if;
  if exists (select 1 from public.routes where slug = p_new) then
    raise exception 'slug already in use';
  end if;
  update public.routes        set slug = p_new       where slug = p_old;
  update public.bus_positions set route_slug = p_new where route_slug = p_old;
  update public.sightings     set route_slug = p_new where route_slug = p_old;
end;
$$;

-- ------------------------------------------------------------
-- 7. Keep-alive target for the uptime monitor (7-day pause guard)
-- ------------------------------------------------------------
create or replace function public.ping()
returns integer language sql stable security definer set search_path to 'public'
as $$ select count(*)::int from public.routes; $$;

-- ------------------------------------------------------------
-- 8. Grants: RPC only, tables stay locked behind RLS-with-no-policies
-- ------------------------------------------------------------
revoke execute on function public._hash_admin(text, text) from public, anon, authenticated;
revoke execute on function public._require_admin(text, text) from public, anon, authenticated;
revoke execute on function public._check_settings(jsonb) from public, anon, authenticated;
revoke execute on function public._sweep(text) from public, anon, authenticated;
revoke execute on function public.rename_route_slug(text, text) from public, anon, authenticated;

grant execute on function
  public.get_settings(text), public.get_positions(text), public.get_sightings(text),
  public.route_exists(text),
  public.set_bus_position(text, text, double precision, double precision, double precision, text, text),
  public.clear_bus_position(text, text), public.add_sighting(text, text),
  public.admin_setup(text, text), public.admin_check(text, text),
  public.admin_change_key(text, text, text), public.admin_set_settings(text, text, jsonb),
  public.admin_set_notice(text, text, text, integer),
  public.admin_rotate_share_key(text, text, text),
  public.admin_kick(text, text, text), public.admin_delete_sighting(text, text, bigint),
  public.ping()
to anon, authenticated;

commit;

-- ============================================================
--  AFTER the migration, two setup steps, run these yourself
--  (edit the values first):
--
--  A. Pick your public route slug (goes in config.txt, safe to share).
--     Lowercase letters, digits and hyphens only:
--
--     select public.rename_route_slug(
--       (select slug from public.routes limit 1),
--       'wonderful-mendez-ayala');
--
--  B. Choose your ADMIN key (12+ characters; treat it like a
--     password, it is NOT the share key and goes nowhere public):
--
--     select public.admin_setup('wonderful-mendez-ayala', 'CHOOSE-A-LONG-ADMIN-KEY');
-- ============================================================
