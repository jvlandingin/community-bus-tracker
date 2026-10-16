-- ============================================================
--  PATCH: a sharer may show their bus to riders
--
--  The app lets a sharer dress a drawing of a bus on their own phone:
--  decorations earned by sharing, accessories and paint bought with the
--  app's barya. It is theirs alone unless they switch on "Show customized
--  bus to riders" in the app, which is off unless they do. Then each position
--  their phone sends carries a short code for that bus, and a rider who
--  taps the bus on the map sees it.
--
--  What the code is: a digit for the paint, then up to 40 letters, one per
--  thing worn, from the app's own fixed lists. Nothing else fits, so it can
--  carry no words, no colour of anybody's choosing and no link. A code of
--  any other shape is stored as nothing rather than refused: a bad look must
--  never cost a position.
--
--  Where it lives: on the trip's own row in bus_positions, overwritten by
--  every write and deleted with the row when the trip ends or expires,
--  exactly like the position. No history of it is kept.
--
--  The honest cost, which the app says where the switch is: riders can
--  recognise a decorated bus from one trip to the next. That is why it is
--  the sharer's choice and off unless they make it.
--
--  The two writers gain p_look with a default, so a page from before this
--  calls them exactly as it did and simply shows a plain bus. A page from
--  after this, against a database from before it, is refused for the
--  unknown argument and sends the position again without one.
--
--  Apply after 12-share-pin.sql. Safe to re-run.
-- ============================================================

begin;

alter table public.bus_positions add column if not exists look text;
alter table public.bus_positions drop constraint if exists bus_positions_look_shape;
alter table public.bus_positions add constraint bus_positions_look_shape
  check (look is null or look ~ '^[0-9][A-Za-z]{0,40}$');

-- A look, or nothing for anything not shaped like one.
create or replace function public._clean_look(p_look text)
returns text language sql immutable
as $$ select case when p_look ~ '^[0-9][A-Za-z]{0,40}$' then p_look else null end; $$;

-- Sets the look on a row the caller has just written. Every write sets it,
-- so a sharer who switches showing off mid-trip is plain from the next one.
create or replace function public._set_look(p_slug text, p_session text, p_look text)
returns void language sql security definer set search_path to 'public'
as $$
  update public.bus_positions set look = public._clean_look(p_look)
   where route_slug = p_slug and session_id = p_session;
$$;

-- ------------------------------------------------------------
-- The two writers, with the look
-- ------------------------------------------------------------
-- They change shape, so the old ones go rather than gaining an overload:
-- PostgREST cannot choose between two functions of the same name.
drop function if exists public.set_keyed_position(text, text, text, double precision, double precision, double precision, text, text);
drop function if exists public.set_open_position(text, text, double precision, double precision, double precision, text, text);

-- As in 12-share-pin.sql, plus p_look.
create or replace function public.set_keyed_position(
  p_slug text, p_key text, p_session text,
  p_lat double precision, p_lng double precision, p_speed double precision,
  p_direction text, p_label text, p_look text default null)
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
    if public._key_paused(r) and not known then return 'too many tries'; end if;
    perform public._write_position(r, false, false, p_session,
                                   p_lat, p_lng, p_speed, p_direction, p_label);
    perform public._set_look(r.slug, p_session, p_look);
    return null;
  end if;

  if p_key is not null and p_key = r.prev_key
     and r.prev_key_expires is not null and r.prev_key_expires > now() then
    perform public._write_position(r, true, false, p_session,
                                   p_lat, p_lng, p_speed, p_direction, p_label);
    perform public._set_look(r.slug, p_session, p_look);
    return null;
  end if;

  if public._key_paused(r) then return 'too many tries'; end if;
  if public._is_pin(r.key) and public._key_failed(r.slug) then return 'too many tries'; end if;
  return 'invalid key';
end;
$$;

-- As in 11-open-sharing.sql, plus p_look.
create or replace function public.set_open_position(
  p_slug text, p_session text,
  p_lat double precision, p_lng double precision, p_speed double precision,
  p_direction text, p_label text, p_look text default null)
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
  perform public._set_look(r.slug, p_session, p_look);
end;
$$;

-- ------------------------------------------------------------
-- The read, with the look
-- ------------------------------------------------------------
drop function if exists public.get_positions(text, text);

-- As in 08-position-checks.sql, plus look: null for every bus whose sharer
-- has not chosen to show it.
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
     and b.updated_at >= now() - make_interval(
           mins => greatest(coalesce((r.settings->>'bus_expiry_min')::int, 10), 1))
   order by b.updated_at desc;
$$;

revoke execute on function public._set_look(text, text, text) from public, anon, authenticated;

grant execute on function
  public.set_keyed_position(text, text, text, double precision, double precision, double precision, text, text, text),
  public.set_open_position(text, text, double precision, double precision, double precision, text, text, text),
  public.get_positions(text, text)
to anon, authenticated;

commit;
