-- Tests for sql/07-thanks.sql.
--
-- Saying salamat is a one-tap kindness, and almost every check here is
-- about what it refuses to become: a total that survives the trip, a
-- number anybody but the sharer can read, or a way to find out which
-- rider tapped it.
--
-- Run against a freshly migrated database.
\set ON_ERROR_STOP on
set client_min_messages to notice;

-- assert helpers, plus setup steps A and B
\ir _prelude.sql

-- One live bus, and the pub_id a watcher would have read off the map.
create or replace function t_pub(p_session text) returns text
language sql as $$
  select public._pub_id((select pub_salt from public.routes where slug='wonderful-mendez-ayala'),
                        p_session);
$$;
create or replace function t_count(p_session text) returns int
language sql as $$
  select count(*)::int from public.thanks_now
   where route_slug='wonderful-mendez-ayala' and session_id=p_session;
$$;
create or replace function t_seen(p_session text) returns int
language sql as $$
  select thanks from public.get_positions('wonderful-mendez-ayala', p_session)
   where is_self;
$$;

do $$
declare k text;
begin
  select key into k from public.routes;
  delete from public.bus_positions;
  perform public.set_bus_position(k, 'session-ty-0001', 14.23, 120.92, 10, 'north', '98018');
  perform public.set_bus_position(k, 'session-ty-0002', 14.31, 120.95, 10, 'south', '77012');
end $$;

do $$ begin raise notice '== a rider can thank the bus they can see =='; end $$;
do $$
begin
  perform assert(t_count('session-ty-0001') = 0, 'a trip starts with none');

  perform public.say_thanks('wonderful-mendez-ayala', t_pub('session-ty-0001'), 'watch-aaaa-1111');
  perform assert(t_count('session-ty-0001') = 1, 'one tap is one');

  -- the point of the mark: a second tap from the same tab is the same tap
  perform public.say_thanks('wonderful-mendez-ayala', t_pub('session-ty-0001'), 'watch-aaaa-1111');
  perform assert(t_count('session-ty-0001') = 1, 'the same rider tapping twice is still one');

  perform public.say_thanks('wonderful-mendez-ayala', t_pub('session-ty-0001'), 'watch-bbbb-2222');
  perform assert(t_count('session-ty-0001') = 2, 'a second rider is two');

  -- and it lands on the bus that was thanked, not on the route
  perform assert(t_count('session-ty-0002') = 0, 'the other bus on the route got none of them');
end $$;

do $$ begin raise notice '== the count is for the sharer, and nobody else =='; end $$;
do $$
declare rows_seen int;
begin
  perform assert(t_seen('session-ty-0001') = 2,
                 'the sharer sees their own count, by passing their own session id');

  -- an anonymous watcher gets the map and nothing else
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala')
                   where thanks is not null) = 0,
                 'a watcher who names no session sees no count on any bus');

  -- and naming one session does not open the others
  select count(*) into rows_seen
    from public.get_positions('wonderful-mendez-ayala', 'session-ty-0002')
   where thanks is not null;
  perform assert(rows_seen = 1, 'naming your own session shows exactly one count, yours');
  perform assert(t_seen('session-ty-0002') = 0,
                 'and yours is your own number, not the busy bus next to you');

  -- null rather than 0 for everyone else, so a quiet bus and a popular one
  -- are indistinguishable to a reader deciding which bus to wait for
  perform assert((select thanks from public.get_positions('wonderful-mendez-ayala','session-ty-0002')
                   where not is_self) is null,
                 'another bus reads null, not a number a reader could compare');

  -- the pub_id is not a way in either: it is what every watcher already has
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala',
                    t_pub('session-ty-0001')) where thanks is not null) = 0,
                 'replaying a published pub_id as p_self unlocks no count');
end $$;

do $$ begin raise notice '== nothing here says who was grateful =='; end $$;
do $$
declare m1 text; m2 text;
begin
  -- the stored value is not the watcher id, so it cannot be matched against
  -- watching_now, which is the only other place a watcher id is ever written
  perform assert(not exists (select 1 from public.thanks_now where mark like 'watch-%'),
                 'the watcher id itself is never stored');

  select mark into m1 from public.thanks_now
   where session_id='session-ty-0001'
     and mark = public._thanks_mark(
           (select pub_salt from public.routes where slug='wonderful-mendez-ayala'),
           'session-ty-0001','watch-aaaa-1111');
  perform assert(m1 is not null, 'the mark is the salted hash of the tab and the trip');

  -- the same tab thanking a different bus leaves an unrelated value, so the
  -- table cannot be read as "this rider follows that driver"
  perform public.say_thanks('wonderful-mendez-ayala', t_pub('session-ty-0002'), 'watch-aaaa-1111');
  select mark into m2 from public.thanks_now where session_id='session-ty-0002';
  perform assert(m1 <> m2, 'the same tab thanking two buses leaves two unrelated marks');

  -- nothing at all returns it, not even behind the admin key
  perform assert((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public'
                    and pg_get_function_result(p.oid) like '%mark%') = 0,
                 'no function returns the mark to anyone, admin included');
  perform assert(not has_function_privilege('anon','public._thanks_mark(text,text,text)','execute'),
                 'and anon cannot compute one to test a guess against the table');
  perform assert(not has_function_privilege('anon','public._thanks_cap()','execute'),
                 'the cap stays internal too');
end $$;

do $$ begin raise notice '== it cannot outlive the trip =='; end $$;
do $$
begin
  perform assert(t_count('session-ty-0001') = 2, 'two on the board before the trip ends');

  -- Stop, or closing the tab: the sendBeacon path
  perform public.clear_bus_position('wonderful-mendez-ayala', 'session-ty-0001');
  perform assert(t_count('session-ty-0001') = 0,
                 'stopping deletes them with the bus, by cascade, not by a sweep anyone must remember');
  perform assert((select count(*) from public.thanks_now) = 1,
                 'and takes only that trip''s, leaving the other bus alone');
end $$;

do $$ begin raise notice '== nor start again where the last one left off =='; end $$;
do $$
declare k text;
begin
  select key into k from public.routes;
  -- the same phone, the same session id, a new trip: sessionStorage keeps the
  -- id across a stop and start, so this is the ordinary case, not an odd one
  perform public.set_bus_position(k, 'session-ty-0001', 14.24, 120.92, 10, 'north', '98018');
  perform assert(t_count('session-ty-0001') = 0,
                 'the same phone sharing again starts from nothing');
  perform assert(t_seen('session-ty-0001') = 0, 'and is told nothing about the trip before');
end $$;

do $$ begin raise notice '== a stale trip takes its thanks with it =='; end $$;
do $$
begin
  perform public.say_thanks('wonderful-mendez-ayala', t_pub('session-ty-0001'), 'watch-cccc-3333');
  perform assert(t_count('session-ty-0001') = 1, 'one on the board');

  -- the phone stops reporting: a dead battery, a tunnel, a locked screen
  update public.bus_positions set updated_at = now() - interval '3 hours'
   where session_id = 'session-ty-0001';
  -- an unrelated write elsewhere on the route runs the sweep
  perform public.say_thanks('wonderful-mendez-ayala', t_pub('session-ty-0002'), 'watch-dddd-4444');
  perform assert(not exists (select 1 from public.bus_positions where session_id='session-ty-0001'),
                 'the stale bus is swept');
  perform assert(t_count('session-ty-0001') = 0, 'and its thanks are gone with it');
end $$;

do $$ begin raise notice '== a bus that is not there cannot be thanked =='; end $$;
do $$
declare before int;
begin
  before := (select count(*) from public.thanks_now);
  -- a pub_id read off the map for a trip that has since ended. Quietly does
  -- nothing: an error here would be shown to someone being kind, and would
  -- also turn this into a way to test whether a given pub_id is still live.
  perform public.say_thanks('wonderful-mendez-ayala', t_pub('session-ty-gone'), 'watch-eeee-5555');
  perform assert((select count(*) from public.thanks_now) = before,
                 'thanking a bus that has gone records nothing, and does not complain');

  perform assert_err(
    $q$ select public.say_thanks('wonderful-mendez-ayala','not-a-pub-id','watch-eeee-5555') $q$,
    'invalid bus', 'a malformed bus id is refused');
  perform assert_err(
    $q$ select public.say_thanks('wonderful-mendez-ayala', repeat('a',32), 'no') $q$,
    'invalid watcher', 'a malformed watcher id is refused');
  perform assert_err(
    $q$ select public.say_thanks('no-such-route', repeat('a',32), 'watch-eeee-5555') $q$,
    'invalid route', 'an unknown route is refused');
end $$;

do $$ begin raise notice '== the number is bounded, because the call takes no key =='; end $$;
do $$
declare i int;
begin
  delete from public.thanks_now;
  -- anyone reading the source can call this in a loop with invented ids.
  -- The cap is what turns that from an unbounded table into a number that
  -- is merely exaggerated.
  for i in 1..(public._thanks_cap() + 20) loop
    perform public.say_thanks('wonderful-mendez-ayala', t_pub('session-ty-0002'),
                              'watch-flood-' || lpad(i::text, 4, '0'));
  end loop;
  perform assert(t_count('session-ty-0002') = public._thanks_cap(),
                 'a flood stops at the cap rather than filling the table');
  perform assert(t_seen('session-ty-0002') = public._thanks_cap(),
                 'and that is what the sharer is shown, saturated');
end $$;

do $$ begin raise notice '== the table only ever describes the present =='; end $$;
do $$
begin
  -- the property the whole design is for: nothing here can be read as a
  -- record of something that happened, only of something happening
  perform assert(not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='thanks_now'
       and column_name in ('total','count','lifetime','all_time')),
    'no column accumulates anything');
  perform assert((select count(*) from information_schema.tables
                   where table_schema='public' and table_name like '%thanks%') = 1,
                 'there is one thanks table, and no archive beside it');
  -- and it is reachable only through the function, like everything else
  perform assert((select relrowsecurity from pg_class
                   where oid='public.thanks_now'::regclass),
                 'RLS is on, with no policy, so the anon key cannot read the rows');
  perform assert(has_function_privilege('anon','public.say_thanks(text,text,text)','execute'),
                 'saying it needs no key, because a watcher has none');
end $$;

do $$ begin raise notice '== every trip ending takes its thanks with it =='; end $$;
do $$
declare k text;
begin
  delete from public.bus_positions;
  select key into k from public.routes;
  perform public.set_bus_position(k, 'session-ty-kick', 14.23, 120.92, 10, 'north', null);
  perform public.say_thanks('wonderful-mendez-ayala', t_pub('session-ty-kick'), 'watch-aaaa-1111');
  perform assert(t_count('session-ty-kick') = 1, 'one on the board');

  -- an admin stopping a sharer is a trip ending too, and nothing in
  -- admin_kick mentions this table
  perform public.admin_kick('wonderful-mendez-ayala', 'my-long-admin-key-42', 'session-ty-kick');
  perform assert(t_count('session-ty-kick') = 0, 'a kick takes them as well');
end $$;

do $$ begin raise notice '== renaming the route moves them, rather than orphaning them =='; end $$;
do $$
declare k text;
begin
  select key into k from public.routes;
  perform public.set_bus_position(k, 'session-ty-move', 14.23, 120.92, 10, 'north', null);
  perform public.say_thanks('wonderful-mendez-ayala', t_pub('session-ty-move'), 'watch-aaaa-1111');
  perform public.rename_route_slug('wonderful-mendez-ayala', 'renamed-route');
  perform assert((select count(*) from public.thanks_now where route_slug='renamed-route') = 1,
                 'the rows follow the parent, by the same cascade bus_positions uses');
  perform public.rename_route_slug('renamed-route', 'wonderful-mendez-ayala');
end $$;

do $$ begin raise notice 'ALL 07 CHECKS PASSED'; end $$;
