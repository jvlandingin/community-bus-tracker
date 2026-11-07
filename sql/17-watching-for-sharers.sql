-- ============================================================
--  FEATURE: a sharer sees how many people have the map open
--
--  Since 06-watching-count.sql the tracker beats every minute with a
--  random per-tab id, and the admin page can see how many devices
--  have the map open right now. That number is the best answer a
--  sharer can be given to "is anybody even looking?", and the app
--  now shows it on the sharing tab during a trip: "12 people have
--  the map open" (November 2026, the maintainer's decision).
--
--  What changes is who sees the number, not what is kept. It is the
--  same live gauge: rows deleted three minutes after a tab's last
--  beat, no total, no peak, no yesterday. It comes back on the
--  caller's own row in get_positions, beside thanks and for the same
--  reason: p_self is the trip's real session id, which only the
--  sharing phone holds, so nobody else can ask for it. And only while
--  that bus is on the riders' map: a bus kept for its own phone
--  outside the route area (14-off-route-private.sql) is seen by
--  nobody, so it is told nothing.
--
--  The page subtracts its own tab when its own beat is recent and
--  never draws a zero, as salamat never does.
--
--  get_positions changes shape by one column, which an older page
--  ignores, so pages and this can be deployed in either order.
--
--  Apply after 16-tips.sql. Safe to re-run.
-- ============================================================

begin;

-- It changes what it returns, so the old one goes first.
drop function if exists public.get_positions(text, text);

-- As in 14-off-route-private.sql, plus watching: how many devices have
-- the map open, on the caller's own row and only while it is on the
-- riders' map, otherwise null.
create or replace function public.get_positions(p_slug text, p_self text default null)
returns table(pub_id text, is_self boolean, thanks integer,
              lat double precision, lng double precision,
              direction text, bus_label text, updated_at timestamptz, look text,
              watching integer)
language sql stable security definer set search_path to 'public'
as $$
  select public._pub_id(r.pub_salt, b.session_id),
         (p_self is not null and b.session_id = p_self),
         -- null for everyone else's bus, not zero: see 07-thanks.sql
         case when p_self is not null and b.session_id = p_self
              then (select count(*)::int from public.thanks_now t
                     where t.route_slug = b.route_slug and t.session_id = b.session_id)
              else null end,
         b.lat, b.lng, b.direction, b.bus_label, b.updated_at, b.look,
         -- the live count from 06-watching-count.sql, for the sharer alone
         case when p_self is not null and b.session_id = p_self and not b.off_route
              then (select count(*)::int from public.watching_now w
                     where w.route_slug = b.route_slug
                       and w.last_seen > now() - public._watching_window())
              else null end
    from public.bus_positions b
    join public.routes r on r.slug = b.route_slug
   where b.route_slug = p_slug
     and (not b.off_route or (p_self is not null and b.session_id = p_self))
     and b.updated_at >= now() - make_interval(
           mins => greatest(coalesce((r.settings->>'bus_expiry_min')::int, 10), 1))
   order by b.updated_at desc;
$$;

grant execute on function public.get_positions(text, text) to anon, authenticated;

commit;
