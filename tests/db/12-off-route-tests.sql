-- Tests for sql/14-off-route-private.sql.
--
-- A bus outside the route area is kept for its own phone and shown to
-- nobody else, instead of refused: what lets the sharing screen be used,
-- and reviewed, from anywhere without ever putting a made-up bus on the
-- riders' map. Everything else a write is held to still holds.
--
-- Run against a freshly migrated database.
\set ON_ERROR_STOP on
set client_min_messages to notice;

-- assert helpers, plus setup steps A and B
\ir _prelude.sql

create or replace function shared_key() returns text language sql as $$
  select key from public.routes where slug = 'wonderful-mendez-ayala';
$$;
-- A keyed write; Mountain View is well outside the route, Tagaytay inside it.
create or replace function put(s text, lat double precision, lng double precision) returns text language sql as $$
  select public.set_keyed_position('wonderful-mendez-ayala', shared_key(), s, lat, lng, null, 'north', null, null);
$$;
create or replace function seen_by(s text) returns int language sql as $$
  select count(*)::int from public.get_positions('wonderful-mendez-ayala', s);
$$;
create or replace function seen_by_all() returns int language sql as $$
  select count(*)::int from public.get_positions('wonderful-mendez-ayala');
$$;
-- lets the same session write again without waiting out the 2 second limit
create or replace function age(s text) returns void language sql as $$
  update public.bus_positions set updated_at = now() - interval '5 seconds' where session_id = s;
$$;
create or replace function set_cap(n int) returns void language plpgsql as $$
declare s jsonb;
begin
  select settings into s from public.routes where slug = 'wonderful-mendez-ayala';
  perform public.admin_set_settings('wonderful-mendez-ayala', 'my-long-admin-key-42',
                                    s || jsonb_build_object('max_sessions', n));
end; $$;

do $$ begin raise notice '== outside the area, the bus is its own phone''s =='; end $$;
do $$
begin
  delete from public.bus_positions;
  perform assert(put('session-away-0001', 37.39, -122.08) = 'private',
                 'a keyed write outside the area answers private');
  perform assert((select off_route from public.bus_positions where session_id = 'session-away-0001'),
                 'and is kept, marked off the route');
  perform assert(seen_by('session-away-0001') = 1, 'its own phone sees it');
  perform assert((select is_self from public.get_positions('wonderful-mendez-ayala', 'session-away-0001')),
                 'as its own bus');
  perform assert(seen_by_all() = 0, 'a rider does not');
  perform assert(seen_by('session-some-other') = 0, 'nor another sharer');
  perform assert(not exists (select 1 from public.admin_list_sharers('wonderful-mendez-ayala', 'my-long-admin-key-42')),
                 'nor the admin page''s list, which is the riders'' map');
end $$;

do $$ begin raise notice '== inside it, the same bus is everyone''s =='; end $$;
do $$
begin
  perform age('session-away-0001');
  perform assert(put('session-away-0001', 14.10, 120.93) is null,
                 'a write inside the area answers nothing, as any write that landed');
  perform assert(not (select off_route from public.bus_positions where session_id = 'session-away-0001'),
                 'the mark is overwritten with the position');
  perform assert(seen_by_all() = 1, 'riders now see it');
  perform assert((select count(*) from public.admin_list_sharers('wonderful-mendez-ayala', 'my-long-admin-key-42')) = 1,
                 'and so does the admin page');
  perform age('session-away-0001');
  perform assert(put('session-away-0001', 13.50, 120.93) = 'private', 'back outside it');
  perform assert(seen_by_all() = 0, 'it leaves the riders'' map at once');
  perform assert((select count(*) from public.bus_positions) = 1, 'still one row for the trip, never two');
end $$;

do $$ begin raise notice '== the keyless writer answers the same way =='; end $$;
do $$
declare s jsonb;
begin
  delete from public.bus_positions;
  select settings into s from public.routes where slug = 'wonderful-mendez-ayala';
  perform public.admin_set_settings('wonderful-mendez-ayala', 'my-long-admin-key-42',
                                    s || '{"open_sharing":true}'::jsonb);
  perform assert(public.set_open_position('wonderful-mendez-ayala', 'session-away-0002', 10.0, 120.9, null, 'north', null) = 'private',
                 'outside the area: private');
  perform assert(public.set_open_position('wonderful-mendez-ayala', 'session-away-0003', 14.4, 120.9, null, 'north', null) is null,
                 'inside it: nothing');
  perform assert(seen_by_all() = 1, 'riders see the one inside');
  perform public.admin_set_settings('wonderful-mendez-ayala', 'my-long-admin-key-42', s);
  perform assert(not exists (select 1 from public.bus_positions where keyless),
                 'switching open sharing off still takes every keyless bus, private ones too');
end $$;

do $$ begin raise notice '== everything else is still refused =='; end $$;
do $$
declare k text := shared_key();
begin
  delete from public.bus_positions;
  perform assert_err($q$ select put('session-away-0004', null, null) $q$,
                     'position off route', 'no position');
  perform assert_err($q$ select put('session-away-0004', 'NaN', 120.9) $q$,
                     'position off route', 'NaN');
  perform assert_err($q$ select put('session-away-0004', 14.4, 'Infinity') $q$,
                     'position off route', 'infinity');
  perform assert_err($q$ select put('session-away-0004', 95, 120.9) $q$,
                     'position off route', 'a latitude nowhere on Earth');
  perform assert_err($q$ select put('session-away-0004', 14.4, -181) $q$,
                     'position off route', 'a longitude nowhere on Earth');
  perform assert_err(
    $q$ select public.set_keyed_position('wonderful-mendez-ayala', shared_key(), 'session-away-0004', 37.39, -122.08, 99, 'north', null, null) $q$,
    'implausible speed', 'an impossible speed, far away or not');
  perform assert(public.set_keyed_position('wonderful-mendez-ayala', 'made-up-key', 'session-away-0004', 37.39, -122.08, null, 'north', null, null) = 'invalid key',
                 'a wrong key far away is a wrong key');
  perform assert_err(
    format($q$ select public.set_bus_position(%L, 'session-away-0004', 37.39, -122.08, null, 'north', null) $q$, k),
    'position off route', 'the old writer, which cannot say private, still refuses');
  perform assert(not exists (select 1 from public.bus_positions), 'none of them reached the table');
end $$;

do $$ begin raise notice '== the caps =='; end $$;
do $$
declare i int;
begin
  delete from public.bus_positions;
  perform set_cap(1);
  perform assert(put('session-capr-0001', 14.4, 120.9) is null, 'one bus fills a cap of one');
  perform assert(put('session-capr-0002', 37.39, -122.08) = 'private',
                 'a bus outside the area does not need a place on the riders'' map');
  perform age('session-capr-0002');
  perform assert_err($q$ select put('session-capr-0002', 14.4, 120.9) $q$,
                     'too many active sessions', 'but it is counted when it drives into the area');
  perform assert(seen_by_all() = 1, 'so the riders'' map still holds one');
  perform set_cap(25);

  delete from public.bus_positions;
  for i in 1..10 loop
    perform put('session-capr-away-' || lpad(i::text, 2, '0'), 37.39, -122.08);
  end loop;
  perform assert_err($q$ select put('session-capr-away-11', 37.39, -122.08) $q$,
                     'too many active sessions', 'ten buses outside the area at a time');
  perform assert(put('session-capr-0003', 14.4, 120.9) is null, 'which never crowds out a real sharer');
  perform age('session-capr-away-01');
  perform assert(put('session-capr-away-01', 37.40, -122.08) = 'private', 'and one already going keeps going');
  update public.bus_positions set updated_at = now() - interval '15 minutes' where off_route;
  perform assert(put('session-capr-away-11', 37.39, -122.08) = 'private',
                 'the ten places free up as the buses go quiet, like the riders'' cap');
end $$;

do $$ begin raise notice '== it keeps nothing new =='; end $$;
do $$
begin
  delete from public.bus_positions;
  perform put('session-away-0005', 37.39, -122.08);
  perform public.clear_bus_position('wonderful-mendez-ayala', 'session-away-0005');
  perform assert(not exists (select 1 from public.bus_positions), 'Stop takes the row, as for any bus');
  perform assert(not exists (select 1 from information_schema.tables
                              where table_schema = 'public' and table_name ~ 'route_|off|away'),
                 'there is no table of where buses were outside the area');
  perform assert(not has_function_privilege('anon',
                   'public._write_position(public.routes,boolean,boolean,text,double precision,double precision,double precision,text,text,boolean)', 'execute'),
                 'the helper is not callable from outside');
  perform assert(has_function_privilege('anon', 'public.set_keyed_position(text,text,text,double precision,double precision,double precision,text,text,text)', 'execute') and
                 has_function_privilege('anon', 'public.set_open_position(text,text,double precision,double precision,double precision,text,text,text)', 'execute') and
                 has_function_privilege('anon', 'public.set_bus_position(text,text,double precision,double precision,double precision,text,text)', 'execute') and
                 has_function_privilege('anon', 'public.get_positions(text,text)', 'execute'),
                 'the writers and the read are');
end $$;
