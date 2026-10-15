-- ============================================================
--  PATCH: the share key may be a PIN, and wrong guesses are limited
--
--  The share key had to be 8 to 64 letters and digits, which is
--  safe and awkward: nobody says one out loud on a bus. An admin
--  may now set a PIN of 4 to 8 digits instead, easy to post on a
--  sign or tell a conductor.
--
--  A short PIN is only a lock if guessing it is slow. Until now
--  nothing limited wrong keys: the server answered every one at
--  once, and the route slug it needs is public, so 10,000 four-digit
--  PINs would go in minutes. So, while the key is a PIN:
--
--   - 20 wrong tries on the route inside 10 minutes pause new trips
--     for 10 minutes. During the pause a NEW trip is refused even
--     with the right PIN, or the guess that happened to be right
--     would still get in. Trips already under way are not touched.
--     That makes a 4-digit PIN about a day and a half of steady
--     guessing on average and a 6-digit one months.
--   - The cost: while somebody is guessing, real sharers cannot
--     start either. It is per route, not per phone, because the
--     database has nothing reliable to tell two guessers apart.
--     The admin page shows the pause, and changing the key ends it.
--   - A long key is left exactly as it was, with no limit, since
--     nobody can guess one and a limit would only hand out the
--     pause for free.
--
--  Counting needs the route, so every key check now arrives with
--  the slug: check_share_key for the gate and set_keyed_position
--  for the trip. A wrong guess is answered with a returned value,
--  never an exception, because an exception rolls back the
--  transaction and the count with it.
--
--  The two old calls stay for pages already on phones, and neither
--  will test a PIN: set_bus_position refuses any PIN-shaped key, and
--  route_exists answers false for one. Otherwise they would be a way
--  round the count.
--
--  Apply after 11-open-sharing.sql. Safe to re-run.
-- ============================================================

begin;

alter table public.routes add column if not exists key_fail_count integer not null default 0;
alter table public.routes add column if not exists key_fail_since timestamptz;
alter table public.routes add column if not exists key_paused_until timestamptz;
alter table public.routes add column if not exists key_last_paused timestamptz;

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------
create or replace function public._is_pin(p_key text)
returns boolean language sql immutable
as $$ select coalesce(p_key ~ '^[0-9]{4,8}$', false); $$;

-- One wrong PIN on this route. Returns true when new trips are paused
-- after it. 20 inside 10 minutes starts a 10 minute pause, and a fresh
-- window after it, so a guesser gets 20 tries per 10 minutes at best.
create or replace function public._key_failed(p_slug text)
returns boolean language plpgsql security definer set search_path to 'public'
as $$
declare r public.routes;
begin
  select * into r from public.routes where slug = p_slug for update;
  if r.key_paused_until is not null and r.key_paused_until > now() then
    return true;
  end if;
  if r.key_fail_since is null or r.key_fail_since < now() - interval '10 minutes' then
    update public.routes set key_fail_since = now(), key_fail_count = 1 where slug = p_slug;
    return false;
  end if;
  if r.key_fail_count + 1 >= 20 then
    update public.routes
       set key_fail_count = 0, key_fail_since = null,
           key_paused_until = now() + interval '10 minutes', key_last_paused = now()
     where slug = p_slug;
    return true;
  end if;
  update public.routes set key_fail_count = r.key_fail_count + 1 where slug = p_slug;
  return false;
end;
$$;

create or replace function public._key_paused(r public.routes)
returns boolean language sql stable
as $$ select public._is_pin(r.key) and r.key_paused_until is not null and r.key_paused_until > now(); $$;

-- ------------------------------------------------------------
-- The gate: is this the key?
-- ------------------------------------------------------------
-- 'ok', 'invalid key' or 'too many tries'. Writes, unlike route_exists,
-- because a wrong PIN has to be counted somewhere.
create or replace function public.check_share_key(p_slug text, p_key text)
returns text language plpgsql security definer set search_path to 'public'
as $$
declare r public.routes;
begin
  select * into r from public.routes where slug = p_slug;
  if r.slug is null then raise exception 'invalid route'; end if;
  if public._key_paused(r) then return 'too many tries'; end if;
  if p_key is not null and p_key = r.key then return 'ok'; end if;
  if public._is_pin(r.key) and public._key_failed(r.slug) then return 'too many tries'; end if;
  return 'invalid key';
end;
$$;

-- ------------------------------------------------------------
-- The trip, with the key and the slug
-- ------------------------------------------------------------
-- Returns null when the position went in. A wrong key or a pause comes
-- back as 'invalid key' or 'too many tries' rather than an exception, so
-- the count survives; every other refusal still raises, from
-- _write_position, exactly as set_bus_position's do.
create or replace function public.set_keyed_position(
  p_slug text, p_key text, p_session text,
  p_lat double precision, p_lng double precision, p_speed double precision,
  p_direction text, p_label text)
returns text language plpgsql security definer set search_path to 'public'
as $$
declare
  r public.routes;
  known boolean;
begin
  select * into r from public.routes where slug = p_slug;
  if r.slug is null then raise exception 'invalid route'; end if;
  known := exists (select 1 from public.bus_positions
                    where route_slug = r.slug and session_id = p_session);

  if p_key is not null and p_key = r.key then
    -- The right PIN, but paused: only a trip already on the map goes on.
    if public._key_paused(r) and not known then return 'too many tries'; end if;
    perform public._write_position(r, false, false, p_session,
                                   p_lat, p_lng, p_speed, p_direction, p_label);
    return null;
  end if;

  -- The rotation grace, as in set_bus_position: a trip already under way
  -- may finish on the old key. A new one gets 'invalid key' from inside.
  if p_key is not null and p_key = r.prev_key
     and r.prev_key_expires is not null and r.prev_key_expires > now() then
    perform public._write_position(r, true, false, p_session,
                                   p_lat, p_lng, p_speed, p_direction, p_label);
    return null;
  end if;

  if public._key_paused(r) then return 'too many tries'; end if;
  if public._is_pin(r.key) and public._key_failed(r.slug) then return 'too many tries'; end if;
  return 'invalid key';
end;
$$;

-- ------------------------------------------------------------
-- The old calls, which must not test a PIN
-- ------------------------------------------------------------
-- As in 01-base.sql, less any PIN.
create or replace function public.route_exists(p_key text)
returns boolean language sql stable security definer set search_path to 'public'
as $$ select not public._is_pin(p_key) and exists (select 1 from public.routes where key = p_key); $$;

-- As in 11-open-sharing.sql, less any PIN.
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
                                 p_lat, p_lng, p_speed, p_direction, p_label);
end;
$$;

-- ------------------------------------------------------------
-- Readers are told whether to offer a number pad
-- ------------------------------------------------------------
-- As in 01-base.sql, plus share_pin. Says only that the key is a PIN,
-- never its length or anything else about it.
create or replace function public.get_settings(p_slug text)
returns jsonb language sql stable security definer set search_path to 'public'
as $$
  select jsonb_build_object(
    'settings', r.settings,
    'share_pin', public._is_pin(r.key),
    'notice', case
        when r.notice_text is null then null
        when r.notice_expires is not null and r.notice_expires < now() then null
        else jsonb_build_object('text', r.notice_text, 'updated', r.notice_updated)
      end)
  from public.routes r where r.slug = p_slug;
$$;

-- ------------------------------------------------------------
-- The admin side
-- ------------------------------------------------------------
-- As in 05-rotate-same-key.sql, taking a PIN as well, and a new key ends
-- any pause and forgets the count: whoever was guessing was guessing the
-- old one.
create or replace function public.admin_rotate_share_key(p_slug text, p_admin text, p_new_key text)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare r public.routes;
begin
  r := public._require_admin(p_slug, p_admin);
  if p_new_key is null or not (p_new_key ~ '^[A-Za-z0-9_\-]{8,64}$' or public._is_pin(p_new_key)) then
    raise exception 'share key must be 8 to 64 letters, digits, - or _, or a PIN of 4 to 8 digits';
  end if;
  if p_new_key = r.key then
    raise exception 'that is already the current share key';
  end if;
  if exists (select 1 from public.routes where key = p_new_key and slug <> p_slug) then
    raise exception 'key already in use';
  end if;
  update public.routes
     set prev_key = r.key,
         prev_key_expires = now() + interval '4 hours',
         key = p_new_key,
         key_fail_count = 0, key_fail_since = null, key_paused_until = null
   where slug = p_slug;
end;
$$;

-- What the admin page needs to say about the key without showing it.
create or replace function public.admin_key_status(p_slug text, p_admin text)
returns table(is_pin boolean, pin_length integer, recent_failures integer,
              paused_until timestamptz, last_paused timestamptz)
language plpgsql security definer set search_path to 'public'
as $$
declare r public.routes;
begin
  r := public._require_admin(p_slug, p_admin);
  return query select
    public._is_pin(r.key),
    case when public._is_pin(r.key) then char_length(r.key) else null end,
    case when r.key_fail_since is not null and r.key_fail_since >= now() - interval '10 minutes'
         then r.key_fail_count else 0 end,
    case when r.key_paused_until > now() then r.key_paused_until else null end,
    r.key_last_paused;
end;
$$;

-- Lets new trips start again before the 10 minutes are up. Changing the
-- key does the same and is usually the better answer, since whoever was
-- guessing can carry on against this one.
create or replace function public.admin_resume_key(p_slug text, p_admin text)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public._require_admin(p_slug, p_admin);
  update public.routes
     set key_fail_count = 0, key_fail_since = null, key_paused_until = null
   where slug = p_slug;
end;
$$;

revoke execute on function public._key_failed(text) from public, anon, authenticated;
revoke execute on function public._key_paused(public.routes) from public, anon, authenticated;

grant execute on function
  public.check_share_key(text, text),
  public.set_keyed_position(text, text, text, double precision, double precision, double precision, text, text),
  public.route_exists(text),
  public.set_bus_position(text, text, double precision, double precision, double precision, text, text),
  public.get_settings(text),
  public.admin_rotate_share_key(text, text, text),
  public.admin_key_status(text, text),
  public.admin_resume_key(text, text)
to anon, authenticated;

commit;
