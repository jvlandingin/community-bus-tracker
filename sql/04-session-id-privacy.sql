-- ============================================================
--  PATCH: stop handing every watcher the keys to the map
--
--  clear_bus_position(slug, session) takes no secret. The reason
--  written down for that was "the session id is unguessable, so
--  the session id is the credential". That was true while reads
--  needed the share key. It stopped being true in July 2026,
--  when watching became open to everyone, because get_positions
--  returns session_id to any anonymous caller.
--
--  The consequence, reproduced against a real database: read the
--  live session ids off get_positions, replay each one into
--  clear_bus_position, and every bus is gone from the map. No key
--  at any step. The sharing phones republish within seconds, so
--  it is griefing rather than damage, but it is a loop anyone
--  can run against the whole route.
--
--  The fix is to stop publishing the session id, not to add a
--  key to clear_bus_position: the sendBeacon cleanup on page
--  close cannot set headers, and it has to keep working across a
--  share key rotation.
--
--   * get_positions now returns pub_id, a salted hash of the
--     session id. It is stable for the length of a trip, which
--     is all the map needs it for (marker identity, clustering),
--     and it is useless to clear_bus_position.
--   * p_self lets a sharer's own phone recognise its own row,
--     which the duplicate-sharer warning needs. You can only
--     pass a session id you already hold.
--   * admin_list_sharers gives the admin page the real session
--     ids, behind the admin key, because admin_kick needs them.
--
--  No new data is stored about anyone: pub_salt is one random
--  string per route. The no-history property is untouched.
--
--  Safe to run more than once.
-- ============================================================

begin;

alter table public.routes add column if not exists pub_salt text;
update public.routes
   set pub_salt = replace(gen_random_uuid()::text, '-', '')
 where pub_salt is null;
-- default as well as backfill, so a route added by hand later gets one
-- rather than failing the not-null on insert
alter table public.routes alter column pub_salt set default replace(gen_random_uuid()::text, '-', '');
alter table public.routes alter column pub_salt set not null;

-- The public stand-in for a session id. Not reversible, and not equal to
-- any real session id, so it cannot be replayed into clear_bus_position.
create or replace function public._pub_id(p_salt text, p_session text)
returns text language sql immutable
as $$
  select substr(encode(sha256(convert_to(coalesce(p_salt,'') || coalesce(p_session,''), 'UTF8')), 'hex'), 1, 32);
$$;

-- Signature changes, so the old one has to go rather than gain an
-- overload: PostgREST cannot choose between two same-named functions.
drop function if exists public.get_positions(text);

create or replace function public.get_positions(p_slug text, p_self text default null)
returns table(pub_id text, is_self boolean, lat double precision, lng double precision,
              speed double precision, direction text, bus_label text, updated_at timestamptz)
language sql stable security definer set search_path to 'public'
as $$
  select public._pub_id(r.pub_salt, b.session_id),
         (p_self is not null and b.session_id = p_self),
         b.lat, b.lng, b.speed, b.direction, b.bus_label, b.updated_at
    from public.bus_positions b
    join public.routes r on r.slug = b.route_slug
   where b.route_slug = p_slug
     and b.updated_at >= now() - make_interval(
           mins => greatest(coalesce((r.settings->>'bus_expiry_min')::int, 10), 1))
   order by b.updated_at desc;
$$;

-- The admin page needs the real session id, because that is what
-- admin_kick and admin_unblock take. Behind the admin key.
create or replace function public.admin_list_sharers(p_slug text, p_admin text)
returns table(session_id text, lat double precision, lng double precision,
              speed double precision, direction text, bus_label text, updated_at timestamptz)
language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public._require_admin(p_slug, p_admin);
  return query
    select b.session_id, b.lat, b.lng, b.speed, b.direction, b.bus_label, b.updated_at
      from public.bus_positions b
     where b.route_slug = p_slug
     order by b.updated_at desc;
end;
$$;

revoke execute on function public._pub_id(text, text) from public, anon, authenticated;
grant execute on function
  public.get_positions(text, text),
  public.admin_list_sharers(text, text)
to anon, authenticated;

commit;
