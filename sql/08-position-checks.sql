-- ============================================================
--  PATCH: a position has to be a position, the cap counts the
--  buses on the map, and speed is no longer kept
--
--  Three fixes to set_bus_position, from a review in October
--  2026, and the two reads that follow from the third.
--
--  1. NULL got past every check. They were written as
--     `if p_lat < 13.90 or ...` and `if p_direction not in (...)`,
--     a comparison with NULL is NULL, and IF reads NULL as false.
--     So anyone holding the share key could store a bus with no
--     coordinates. Leaflet throws on it, which stopped every
--     rider's bus list from drawing, and the admin page's live
--     list threw as well, so there was no Stop button for it.
--     Rotating the key did not remove it either: the row already
--     existed, so the old key went on writing to it through the
--     grace path. NULL is now refused by name, and the columns
--     refuse it too, so no later version of the function can let
--     it back in.
--
--  2. The session cap counted every row, however old. A refused
--     write raises, which rolls back the sweep at its end, so the
--     dead rows were never cleared by the one call they were
--     blocking: three phones that died at the end of the day
--     could refuse every new sharer the next morning while the
--     map showed no buses. The cap now counts the buses the map
--     shows, by the same window get_positions uses, so a dead row
--     stops counting the moment it stops being drawn.
--
--  3. Speed was stored and handed to anyone with the route's slug,
--     though no page has ever used it and neither the privacy
--     panel nor the operators' briefing mentioned it. It is the
--     one field this project's central promise is about: the tool
--     cannot be used to review a driver's speed. The parameter
--     stays, because pages already on phones send it, and an
--     impossible value is still refused, since a phone reporting
--     one is probably reporting a bad position too. But nothing
--     keeps it: existing values are cleared, the column is never
--     written again, and get_positions and admin_list_sharers no
--     longer return it.
--
--  Neither page reads speed, so this can be applied before or
--  after the pages that stop sending it are deployed.
--
--  Safe to run more than once.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- The rows the old checks let in, and the columns that now refuse them
-- ------------------------------------------------------------
-- A row with no position or direction is not a bus. Deleting it takes any
-- thanks_now rows with it, by the cascade that table is built on.
delete from public.bus_positions
 where lat is null or lng is null or direction is null;

alter table public.bus_positions
  alter column lat set not null,
  alter column lng set not null,
  alter column direction set not null;

update public.bus_positions set speed = null where speed is not null;

-- ------------------------------------------------------------
-- The write
-- ------------------------------------------------------------
-- As in 03-kick-block.sql except for the three changes above.
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
  -- Checked, never kept: see the header.
  if p_speed is not null and (p_speed < 0 or p_speed > 60) then
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

  -- Only the buses the map shows count. A refusal rolls back the sweep at
  -- the end of this function, so counting dead rows here meant they could
  -- never be swept by the writes they were refusing.
  cap := greatest(coalesce((r.settings->>'max_sessions')::int, 25), 1);
  if last_ts is null and
     (select count(*) from public.bus_positions b
       where b.route_slug = r.slug
         and b.updated_at >= now() - make_interval(
               mins => greatest(coalesce((r.settings->>'bus_expiry_min')::int, 10), 1))) >= cap then
    raise exception 'too many active sessions';
  end if;

  insert into public.bus_positions
    (route_key, route_slug, session_id, lat, lng, direction, bus_label, updated_at)
  values (r.key, r.slug, p_session, p_lat, p_lng, p_direction,
          nullif(trim(p_label), ''), now())
  on conflict (route_slug, session_id) do update
    set lat = excluded.lat, lng = excluded.lng,
        direction = excluded.direction, bus_label = excluded.bus_label,
        route_key = excluded.route_key, updated_at = now();

  perform public._sweep(r.slug);
end;
$$;

-- ------------------------------------------------------------
-- The reads, without speed
-- ------------------------------------------------------------
-- Both change shape, so the old ones go rather than gaining an overload:
-- PostgREST cannot choose between two functions of the same name.
drop function if exists public.get_positions(text, text);

-- As in 07-thanks.sql, less b.speed.
create or replace function public.get_positions(p_slug text, p_self text default null)
returns table(pub_id text, is_self boolean, thanks integer,
              lat double precision, lng double precision,
              direction text, bus_label text, updated_at timestamptz)
language sql stable security definer set search_path to 'public'
as $$
  select public._pub_id(r.pub_salt, b.session_id),
         (p_self is not null and b.session_id = p_self),
         -- null for everyone else's bus, not zero: see 07-thanks.sql
         case when p_self is not null and b.session_id = p_self
              then (select count(*)::int from public.thanks_now t
                     where t.route_slug = b.route_slug and t.session_id = b.session_id)
              else null end,
         b.lat, b.lng, b.direction, b.bus_label, b.updated_at
    from public.bus_positions b
    join public.routes r on r.slug = b.route_slug
   where b.route_slug = p_slug
     and b.updated_at >= now() - make_interval(
           mins => greatest(coalesce((r.settings->>'bus_expiry_min')::int, 10), 1))
   order by b.updated_at desc;
$$;

drop function if exists public.admin_list_sharers(text, text);

-- As in 04-session-id-privacy.sql, less b.speed.
create or replace function public.admin_list_sharers(p_slug text, p_admin text)
returns table(session_id text, lat double precision, lng double precision,
              direction text, bus_label text, updated_at timestamptz)
language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public._require_admin(p_slug, p_admin);
  return query
    select b.session_id, b.lat, b.lng, b.direction, b.bus_label, b.updated_at
      from public.bus_positions b
     where b.route_slug = p_slug
     order by b.updated_at desc;
end;
$$;

grant execute on function
  public.get_positions(text, text),
  public.admin_list_sharers(text, text)
to anon, authenticated;

commit;
