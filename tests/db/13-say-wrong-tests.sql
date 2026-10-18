-- Tests for sql/15-say-wrong.sql.
--
-- A rider can say a bus or a sighting is wrong. Most checks here are
-- about what that must never become: a list of reported sharers that
-- outlives a trip, a count anybody but an organizer can read, a way to
-- find out which rider tapped, or a way to take a real bus off the map.
--
-- Run against a freshly migrated database.
\set ON_ERROR_STOP on
set client_min_messages to notice;

-- assert helpers, plus setup steps A and B
\ir _prelude.sql

create or replace function t_pub(p_session text) returns text
language sql as $$
  select public._pub_id((select pub_salt from public.routes where slug='wonderful-mendez-ayala'),
                        p_session);
$$;
create or replace function t_bus(p_session text) returns int
language sql as $$
  select count(*)::int from public.wrong_bus_now
   where route_slug='wonderful-mendez-ayala' and session_id=p_session;
$$;
create or replace function t_sig(p_sid bigint) returns int
language sql as $$
  select count(*)::int from public.wrong_sighting_now where sid=p_sid;
$$;
create or replace function t_listed(p_kind text) returns int
language sql as $$
  select coalesce(sum(reports), 0)::int
    from public.admin_list_wrong('wonderful-mendez-ayala', 'my-long-admin-key-42')
   where kind = p_kind;
$$;

do $$
declare k text;
begin
  select key into k from public.routes;
  delete from public.bus_positions;
  delete from public.sightings;
  perform public.set_bus_position(k, 'session-wr-0001', 14.23, 120.92, 10, 'north', '98018');
  perform public.set_bus_position(k, 'session-wr-0002', 14.31, 120.95, 10, 'south', '77012');
  perform public.add_sighting('wonderful-mendez-ayala', '▲ Northbound at Amadeo');
  perform public.add_sighting('wonderful-mendez-ayala', '▼ Southbound at Silang');
end $$;

do $$ begin raise notice '== a rider can say the bus they can see is wrong =='; end $$;
do $$
begin
  perform assert(t_bus('session-wr-0001') = 0, 'a trip starts with none');

  perform public.say_wrong('wonderful-mendez-ayala', 'bus', t_pub('session-wr-0001'), 'watch-aaaa-1111');
  perform assert(t_bus('session-wr-0001') = 1, 'one tap is one');

  perform public.say_wrong('wonderful-mendez-ayala', 'bus', t_pub('session-wr-0001'), 'watch-aaaa-1111');
  perform assert(t_bus('session-wr-0001') = 1, 'the same rider tapping twice is still one');

  perform public.say_wrong('wonderful-mendez-ayala', 'bus', t_pub('session-wr-0001'), 'watch-bbbb-2222');
  perform assert(t_bus('session-wr-0001') = 2, 'a second rider is two');
  perform assert(t_bus('session-wr-0002') = 0, 'the other bus got none of them');

  -- it does nothing by itself: the bus is still on everyone's map
  perform assert(exists (select 1 from public.get_positions('wonderful-mendez-ayala')
                          where pub_id = t_pub('session-wr-0001')),
                 'a reported bus stays on the map until an organizer decides');
end $$;

do $$ begin raise notice '== and the same of a sighting =='; end $$;
do $$
declare s1 bigint; s2 bigint;
begin
  select sid into s1 from public.sightings where body like '%Amadeo%';
  select sid into s2 from public.sightings where body like '%Silang%';
  perform public.say_wrong('wonderful-mendez-ayala', 'sighting', s1::text, 'watch-aaaa-1111');
  perform public.say_wrong('wonderful-mendez-ayala', 'sighting', s1::text, 'watch-aaaa-1111');
  perform public.say_wrong('wonderful-mendez-ayala', 'sighting', s1::text, 'watch-cccc-3333');
  perform assert(t_sig(s1) = 2, 'two riders, one of them twice, is two');
  perform assert(t_sig(s2) = 0, 'the other sighting got none');
  perform assert(exists (select 1 from public.get_sightings('wonderful-mendez-ayala') where sid = s1),
                 'a reported sighting stays on the board until an organizer decides');
end $$;

do $$ begin raise notice '== only an organizer sees a count =='; end $$;
do $$
declare s1 bigint;
begin
  select sid into s1 from public.sightings where body like '%Amadeo%';
  perform assert(t_listed('bus') = 2, 'the admin list has the bus''s two');
  perform assert((select reports from public.admin_list_wrong('wonderful-mendez-ayala','my-long-admin-key-42')
                   where kind='bus' and session_id='session-wr-0001') = 2,
                 'by its real session id, which Stop takes');
  perform assert((select reports from public.admin_list_wrong('wonderful-mendez-ayala','my-long-admin-key-42')
                   where kind='sighting' and sid=s1) = 2,
                 'and the sighting''s two, by the sid Delete takes');
  perform assert_err(
    $q$ select * from public.admin_list_wrong('wonderful-mendez-ayala','bad-admin-key-00') $q$,
    'invalid admin key', 'the list needs the admin key');

  -- not the sharer, and not anyone reading the map
  perform assert((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.prokind = 'f'
                    and p.proname not in ('admin_list_wrong', 'say_wrong', 't_bus', 't_sig')
                    and (pg_get_functiondef(p.oid) like '%wrong_bus_now%'
                         or pg_get_functiondef(p.oid) like '%wrong_sighting_now%')) = 0,
                 'nothing but the organizers'' list reads the reports');
end $$;

do $$ begin raise notice '== nothing here says who tapped =='; end $$;
do $$
declare m1 text; m2 text;
begin
  perform assert(not exists (select 1 from public.wrong_bus_now where mark like 'watch-%')
                 and not exists (select 1 from public.wrong_sighting_now where mark like 'watch-%'),
                 'the watcher id itself is never stored');

  -- the same tab saying salamat and saying wrong to one bus leaves two
  -- unrelated values
  perform public.say_thanks('wonderful-mendez-ayala', t_pub('session-wr-0001'), 'watch-aaaa-1111');
  select mark into m1 from public.thanks_now where session_id='session-wr-0001';
  perform assert(not exists (select 1 from public.wrong_bus_now where mark = m1),
                 'a report''s mark is not the same tab''s salamat mark');

  perform public.say_wrong('wonderful-mendez-ayala', 'bus', t_pub('session-wr-0002'), 'watch-aaaa-1111');
  select mark into m2 from public.wrong_bus_now where session_id='session-wr-0002';
  perform assert(not exists (select 1 from public.wrong_bus_now
                              where session_id='session-wr-0001' and mark = m2),
                 'the same tab reporting two buses leaves two unrelated marks');

  perform assert((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public'
                    and pg_get_function_result(p.oid) like '%mark%') = 0,
                 'no function returns a mark to anyone, admin included');
  perform assert(not has_function_privilege('anon','public._wrong_cap()','execute'),
                 'the cap stays internal');
  perform assert(has_function_privilege('anon','public.say_wrong(text,text,text,text)','execute'),
                 'a rider can call it with the anon key');
end $$;

do $$ begin raise notice '== a report cannot outlive what it is about =='; end $$;
do $$
declare k text; s1 bigint;
begin
  select key into k from public.routes;
  perform public.clear_bus_position('wonderful-mendez-ayala', 'session-wr-0001');
  perform assert(t_bus('session-wr-0001') = 0, 'Stop takes the bus''s reports with it, by cascade');
  perform assert(t_bus('session-wr-0002') = 1, 'and only that bus''s');

  -- the same phone sharing again starts clean
  perform public.set_bus_position(k, 'session-wr-0001', 14.24, 120.92, 10, 'north', '98018');
  perform assert(t_bus('session-wr-0001') = 0, 'a new trip on the same phone starts from nothing');

  -- an organizer's Stop
  perform public.admin_kick('wonderful-mendez-ayala', 'my-long-admin-key-42', 'session-wr-0002');
  perform assert(t_bus('session-wr-0002') = 0, 'an organizer''s Stop clears them');

  -- an organizer's Delete
  select sid into s1 from public.sightings where body like '%Amadeo%';
  perform public.admin_delete_sighting('wonderful-mendez-ayala', 'my-long-admin-key-42', s1);
  perform assert(t_sig(s1) = 0, 'deleting a sighting clears its reports');
end $$;

do $$ begin raise notice '== an expired sighting takes its reports with it =='; end $$;
do $$
declare s2 bigint;
begin
  select sid into s2 from public.sightings where body like '%Silang%';
  perform public.say_wrong('wonderful-mendez-ayala', 'sighting', s2::text, 'watch-dddd-4444');
  perform assert(t_sig(s2) = 1, 'one on the old sighting');
  update public.sightings set created_at = now() - interval '1 day' where sid = s2;
  -- any write runs the sweep
  perform public.add_sighting('wonderful-mendez-ayala', '▲ Northbound at Silang');
  perform assert(not exists (select 1 from public.sightings where sid = s2), 'the old sighting is swept');
  perform assert(t_sig(s2) = 0, 'and its reports are gone with it');
end $$;

do $$ begin raise notice '== only what a rider can see can be reported =='; end $$;
do $$
declare k text; before_b int; before_s int;
begin
  select key into k from public.routes;
  before_b := (select count(*) from public.wrong_bus_now);
  before_s := (select count(*) from public.wrong_sighting_now);

  -- a trip that has ended: quietly nothing
  perform public.say_wrong('wonderful-mendez-ayala', 'bus', t_pub('session-wr-gone'), 'watch-eeee-5555');
  perform public.say_wrong('wonderful-mendez-ayala', 'sighting', '999999999', 'watch-eeee-5555');

  -- a bus outside the route area, which only its own phone can see
  perform public.set_keyed_position('wonderful-mendez-ayala', k, 'session-wr-away', 40.7, -74.0, 0,
                                    'north', null, null);
  perform public.say_wrong('wonderful-mendez-ayala', 'bus', t_pub('session-wr-away'), 'watch-eeee-5555');

  -- a bus that stopped reporting a while ago
  perform public.set_bus_position(k, 'session-wr-0003', 14.25, 120.93, 10, 'north', null);
  update public.bus_positions set updated_at = now() - interval '15 minutes'
   where session_id = 'session-wr-0003';
  perform public.say_wrong('wonderful-mendez-ayala', 'bus', t_pub('session-wr-0003'), 'watch-eeee-5555');

  perform assert((select count(*) from public.wrong_bus_now) = before_b
                 and (select count(*) from public.wrong_sighting_now) = before_s,
                 'gone, hidden or stale things record nothing, and do not complain');

  perform assert_err(
    $q$ select public.say_wrong('wonderful-mendez-ayala','bus','not-a-pub-id','watch-eeee-5555') $q$,
    'invalid bus', 'a malformed bus id is refused');
  perform assert_err(
    $q$ select public.say_wrong('wonderful-mendez-ayala','sighting','1; drop','watch-eeee-5555') $q$,
    'invalid sighting', 'a malformed sighting id is refused');
  perform assert_err(
    $q$ select public.say_wrong('wonderful-mendez-ayala','driver',repeat('a',32),'watch-eeee-5555') $q$,
    'invalid kind', 'only a bus or a sighting can be reported');
  perform assert_err(
    $q$ select public.say_wrong('wonderful-mendez-ayala','bus',repeat('a',32),'no') $q$,
    'invalid watcher', 'a malformed watcher id is refused');
  perform assert_err(
    $q$ select public.say_wrong('no-such-route','bus',repeat('a',32),'watch-eeee-5555') $q$,
    'invalid route', 'an unknown route is refused');
end $$;

do $$ begin raise notice '== the number is bounded, because the call takes no key =='; end $$;
do $$
declare i int; s bigint;
begin
  for i in 1..(public._wrong_cap() + 20) loop
    perform public.say_wrong('wonderful-mendez-ayala', 'bus', t_pub('session-wr-0001'),
                             'watch-flood-' || lpad(i::text, 4, '0'));
  end loop;
  perform assert(t_bus('session-wr-0001') = public._wrong_cap(), 'a bus stops at the cap');

  select sid into s from public.sightings order by sid desc limit 1;
  for i in 1..(public._wrong_cap() + 20) loop
    perform public.say_wrong('wonderful-mendez-ayala', 'sighting', s::text,
                             'watch-flood-' || lpad(i::text, 4, '0'));
  end loop;
  perform assert(t_sig(s) = public._wrong_cap(), 'so does a sighting');
end $$;

do $$ begin raise notice '== a slug rename carries the reports along =='; end $$;
do $$
begin
  perform public.rename_route_slug('wonderful-mendez-ayala', 'renamed-route-wr');
  perform assert((select count(*) from public.wrong_bus_now where route_slug = 'renamed-route-wr')
                 = public._wrong_cap(), 'the bus''s reports follow the route''s new name');
  perform assert((select coalesce(sum(reports),0) from public.admin_list_wrong('renamed-route-wr','my-long-admin-key-42')
                   where kind = 'sighting') = public._wrong_cap(),
                 'and the sighting''s are found through the sighting');
end $$;

do $$ begin raise notice 'ALL SAY-WRONG TESTS PASSED'; end $$;
