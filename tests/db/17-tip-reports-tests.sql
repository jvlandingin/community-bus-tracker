-- Tests for sql/19-tip-reports.sql.
--
-- Anyone shown a sharer's tip code or number can report it; an organizer
-- sees how many beside Ban tips. Most checks here are about what it must
-- never become, as for "Not a real bus?": a list of reported sharers that
-- outlives a trip, a count anybody but an organizer can read, a way to
-- find out who tapped, or a way to take a real bus off the map.
--
-- Run against a freshly migrated database.
\set ON_ERROR_STOP on
set client_min_messages to notice;

-- assert helpers, plus setup steps A and B
\ir _prelude.sql

create or replace function shared_key() returns text language sql as $$
  select key from public.routes where slug = 'wonderful-mendez-ayala';
$$;
create or replace function t_pub(s text) returns text language sql as $$
  select public._pub_id((select pub_salt from public.routes where slug='wonderful-mendez-ayala'), s);
$$;
create or replace function put(s text, code text, lat double precision default 14.4) returns text language sql as $$
  select public.set_keyed_position('wonderful-mendez-ayala', shared_key(), s, lat, 120.9, null, 'north', null, null, code);
$$;
create or replace function tip_reports(s text) returns int language sql as $$
  select count(*)::int from public.wrong_tip_now where route_slug = 'wonderful-mendez-ayala' and session_id = s;
$$;
create or replace function report(s text, w text) returns void language sql as $$
  select public.say_wrong('wonderful-mendez-ayala', 'tip', t_pub(s), w);
$$;
create or replace function read_qr(s text) returns text language sql as $$
  select public.get_bus_qr('wonderful-mendez-ayala', t_pub(s));
$$;
create or replace function listed(s text) returns int language sql as $$
  select coalesce(sum(reports), 0)::int from public.admin_list_wrong('wonderful-mendez-ayala', 'my-long-admin-key-42')
   where kind = 'tip' and session_id = s;
$$;

do $$ begin raise notice '== anyone shown a tip can report it =='; end $$;
do $$
begin
  delete from public.bus_positions;
  perform put('session-tr-0001', 'gcash:09000000000');
  perform report('session-tr-0001', 'watch-tr-aaaa-1');
  perform assert(tip_reports('session-tr-0001') = 1, 'one tap is one');
  perform report('session-tr-0001', 'watch-tr-aaaa-1');
  perform assert(tip_reports('session-tr-0001') = 1, 'the same rider tapping twice is still one');
  perform report('session-tr-0001', 'watch-tr-bbbb-2');
  perform assert(tip_reports('session-tr-0001') = 2 and listed('session-tr-0001') = 2,
                 'a second rider is two, and the organizer sees two beside that bus');
  perform assert(read_qr('session-tr-0001') = 'gcash:09000000000', 'two reports change nothing for riders');
  perform report('session-tr-0001', 'watch-tr-cccc-3');
  perform assert(read_qr('session-tr-0001') is null, 'the third hides the number for the rest of the trip');
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala') g where g.pub_id = t_pub('session-tr-0001')) = 1,
                 'and the bus stays on the map');
  perform assert((select count(*) from public.wrong_bus_now where session_id = 'session-tr-0001') = 0,
                 'a report about the tip is not a report that the bus is not real');
end $$;

do $$ begin raise notice '== only what a rider can be shown =='; end $$;
do $$
begin
  perform put('session-tr-0002', null, 14.41);
  perform report('session-tr-0002', 'watch-tr-aaaa-1');
  perform assert(tip_reports('session-tr-0002') = 0, 'a bus that takes no tips records nothing, and does not complain');
  perform put('session-tr-0003', 'maya:09000000001', 10.3);
  perform report('session-tr-0003', 'watch-tr-aaaa-1');
  perform assert(tip_reports('session-tr-0003') = 0, 'nor does a bus outside the route area, which nobody is shown');
  perform public.say_wrong('wonderful-mendez-ayala', 'tip', t_pub('session-gone-9999'), 'watch-tr-aaaa-1');
  perform assert((select count(*) from public.wrong_tip_now where session_id = 'session-gone-9999') = 0,
                 'nor does a bus that has gone');
  perform assert_err($q$ select public.say_wrong('wonderful-mendez-ayala', 'tip', 'not-a-pub-id', 'watch-tr-aaaa-1') $q$,
                     'invalid bus', 'a malformed bus id is refused');
  perform assert_err($q$ select public.say_wrong('wonderful-mendez-ayala', 'tip', repeat('a', 32), 'no') $q$,
                     'invalid watcher', 'a malformed watcher id is refused');
end $$;

do $$ begin raise notice '== nothing here says who tapped, and it goes with the trip =='; end $$;
do $$
begin
  perform assert(not exists (select 1 from public.wrong_tip_now where mark like '%watch-tr%'),
                 'the mark is scrambled, never the watcher id');
  perform assert(not exists (select 1 from public.wrong_tip_now t join public.thanks_now h using (mark)) and
                 not exists (select 1 from public.wrong_tip_now t join public.wrong_bus_now b using (mark)),
                 'and it can never equal the same tab''s salamat or "Not a real bus?" mark');
  perform public.clear_bus_position('wonderful-mendez-ayala', 'session-tr-0001');
  perform assert(tip_reports('session-tr-0001') = 0, 'Stop takes the reports with the trip');
  perform put('session-tr-0001', 'gcash:09000000000');
  perform assert(read_qr('session-tr-0001') = 'gcash:09000000000', 'and the next trip starts clean');
  perform assert(not exists (select 1 from information_schema.columns
                              where table_schema = 'public' and table_name = 'wrong_tip_now'
                                and column_name not in ('route_slug', 'session_id', 'mark', 'created_at')),
                 'a report keeps the trip, a scrambled mark and a time, nothing else');
end $$;

do $$ begin raise notice '== who can see the count =='; end $$;
do $$
begin
  perform assert_err($q$ select * from public.admin_list_wrong('wonderful-mendez-ayala', 'bad-admin-key-00') $q$,
                     'invalid admin key', 'the count needs the admin key');
  perform assert(not exists (select 1 from public.get_positions('wonderful-mendez-ayala', 'session-tr-0001') g
                              where row_to_json(g)::text ~ 'wrong|report'),
                 'neither riders nor the sharer read it on the map');
  perform assert(has_function_privilege('anon', 'public.say_wrong(text,text,text,text)', 'execute'),
                 'and anyone can call say_wrong, as before');
end $$;
