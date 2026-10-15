-- Tests for sql/12-share-pin.sql.
--
-- A share key may be a PIN of 4 to 8 digits. While it is, 20 wrong tries
-- in 10 minutes pause new trips on the route for 10 minutes, the right PIN
-- included, and the old calls that cannot count a wrong try refuse to
-- test one. A long key is exactly as it was.
--
-- Run against a freshly migrated database. now() does not move inside a
-- transaction, so time is moved by editing the stored timestamps.
\set ON_ERROR_STOP on
set client_min_messages to notice;

-- assert helpers, plus setup steps A and B
\ir _prelude.sql

create or replace function rot(k text) returns void language sql as $$
  select public.admin_rotate_share_key('wonderful-mendez-ayala','my-long-admin-key-42', k);
$$;
create or replace function chk(k text) returns text language sql as $$
  select public.check_share_key('wonderful-mendez-ayala', k);
$$;
create or replace function put(k text, s text) returns text language sql as $$
  select public.set_keyed_position('wonderful-mendez-ayala', k, s, 14.4, 120.9, null, 'north', null);
$$;
create or replace function fails() returns int language sql as $$
  select key_fail_count from public.routes where slug = 'wonderful-mendez-ayala';
$$;
-- lets the same session write again without waiting out the 2 second limit
create or replace function age(s text) returns void language sql as $$
  update public.bus_positions set updated_at = now() - interval '5 seconds' where session_id = s;
$$;

do $$ begin raise notice '== what a share key may be =='; end $$;
do $$
begin
  delete from public.bus_positions;
  perform assert_err($q$ select rot('123') $q$, 'or a PIN of 4 to 8 digits', 'three digits is too short');
  perform assert_err($q$ select rot('12a4') $q$, 'or a PIN of 4 to 8 digits', 'a PIN is digits only');
  perform assert_err($q$ select rot('short') $q$, 'or a PIN of 4 to 8 digits', 'and a long key is still 8 or more');
  perform rot('4821');
  perform assert((select key from public.routes) = '4821', 'four digits is a PIN');
  perform rot('123456789');
  perform assert(not public._is_pin('123456789'), 'nine digits is a long key, not a PIN');
  perform rot('482193');
  perform assert((select (public.get_settings('wonderful-mendez-ayala')->>'share_pin')::boolean),
                 'readers are told the key is a PIN');
  perform assert(not (public.get_settings('wonderful-mendez-ayala')::text like '%482193%'),
                 'and nothing else about it');
  perform assert_err($q$ select rot('482193') $q$, 'already the current share key', 'rotating to the same PIN is refused');
end $$;

do $$ begin raise notice '== the right PIN, a wrong one =='; end $$;
do $$
begin
  perform assert(chk('482193') = 'ok', 'the gate takes the right PIN');
  perform assert(fails() = 0, 'and counts nothing for it');
  perform assert(chk('000000') = 'invalid key', 'a wrong PIN is refused');
  perform assert(fails() = 1, 'and counted, though nothing was raised');
  perform assert(chk(null) = 'invalid key', 'no PIN is a wrong PIN');
  perform assert(put('482193', 'session-pin-0001') is null, 'a trip starts with the right PIN');
  perform assert(exists (select 1 from public.bus_positions where session_id='session-pin-0001'),
                 'and is on the map');
  perform assert(put('111111', 'session-pin-0002') = 'invalid key', 'a trip with a wrong PIN is refused');
  perform assert(not exists (select 1 from public.bus_positions where session_id='session-pin-0002'),
                 'and is not on the map');
  perform assert(fails() = 3, 'every wrong try is counted, at the gate or on the trip');
  perform assert_err($q$ select put('482193', 'bad id') $q$, 'invalid session',
                     'the other checks still raise as before');
  perform assert_err($q$ select public.check_share_key('no-such-route','482193') $q$, 'invalid route',
                     'an unknown route is refused');
end $$;

do $$ begin raise notice '== the old calls will not test a PIN =='; end $$;
do $$
begin
  perform assert(not public.route_exists('482193'), 'route_exists says no, even to the right PIN');
  perform assert_err(
    $q$ select public.set_bus_position('482193','session-pin-0003',14.4,120.9,null,'north',null) $q$,
    'invalid key', 'set_bus_position refuses the right PIN');
  perform assert_err(
    $q$ select public.set_bus_position('000001','session-pin-0003',14.4,120.9,null,'north',null) $q$,
    'invalid key', 'and a wrong one');
  perform assert(fails() = 3, 'neither can count, so neither tests anything');
end $$;

do $$ begin raise notice '== 20 wrong tries in 10 minutes pause new trips =='; end $$;
do $$
declare i int; last text;
begin
  for i in 1..16 loop
    last := chk(lpad(i::text, 6, '9'));
  end loop;
  perform assert(last = 'invalid key' and fails() = 19, 'nineteen wrong tries are only counted');
  perform assert(chk('999999') = 'too many tries', 'the twentieth pauses the route');
  perform assert((select key_paused_until from public.routes) = now() + interval '10 minutes',
                 'for 10 minutes');
  perform assert(chk('482193') = 'too many tries', 'the right PIN is refused at the gate while paused');
  perform assert(put('482193', 'session-pin-0004') = 'too many tries', 'and cannot start a trip');
  perform assert(not exists (select 1 from public.bus_positions where session_id='session-pin-0004'),
                 'so nothing new reaches the map');
  perform age('session-pin-0001');
  perform assert(put('482193', 'session-pin-0001') is null, 'while a trip already under way goes on');
  perform assert(put('000002', 'session-pin-0001') = 'too many tries',
                 'and a wrong PIN is told only that the route is paused');
  perform assert(fails() = 0, 'tries during the pause are not counted towards another');
end $$;

do $$ begin raise notice '== the admin page sees it, and can end it =='; end $$;
do $$
declare s record;
begin
  select * into s from public.admin_key_status('wonderful-mendez-ayala','my-long-admin-key-42');
  perform assert(s.is_pin and s.pin_length = 6, 'it is told the key is a 6-digit PIN');
  perform assert(s.paused_until is not null and s.last_paused is not null, 'and that trips are paused');
  perform assert_err($q$ select * from public.admin_key_status('wonderful-mendez-ayala','wrong-admin-key-000') $q$,
                     'invalid admin key', 'only the admin is told');
  perform assert_err($q$ select public.admin_resume_key('wonderful-mendez-ayala','wrong-admin-key-000') $q$,
                     'invalid admin key', 'and only the admin can resume');
  perform public.admin_resume_key('wonderful-mendez-ayala','my-long-admin-key-42');
  perform assert(chk('482193') = 'ok', 'resuming lets the right PIN in again');
  select * into s from public.admin_key_status('wonderful-mendez-ayala','my-long-admin-key-42');
  perform assert(s.paused_until is null and s.last_paused is not null,
                 'and the admin still sees that it happened');
end $$;

do $$ begin raise notice '== the pause and the window run out =='; end $$;
do $$
begin
  update public.routes set key_paused_until = now() - interval '1 second';
  perform assert(chk('482193') = 'ok', 'a pause that has run out stops nothing');
  update public.routes set key_fail_count = 19, key_fail_since = now() - interval '11 minutes';
  perform assert(chk('000003') = 'invalid key' and fails() = 1,
                 'nineteen tries more than 10 minutes ago are forgotten, not added to');
  update public.routes set key_fail_count = 15, key_fail_since = now() - interval '9 minutes';
  perform assert((select recent_failures from public.admin_key_status('wonderful-mendez-ayala','my-long-admin-key-42')) = 15,
                 'the admin page sees the tries inside the window');
  update public.routes set key_fail_since = now() - interval '11 minutes';
  perform assert((select recent_failures from public.admin_key_status('wonderful-mendez-ayala','my-long-admin-key-42')) = 0,
                 'and not the ones outside it');
end $$;

do $$ begin raise notice '== a new key ends the pause, and the grace still works =='; end $$;
do $$
begin
  update public.routes set key_paused_until = now() + interval '5 minutes', key_fail_count = 7,
                           key_fail_since = now();
  perform rot('a-long-share-key-77');
  perform assert((select key_paused_until is null and key_fail_count = 0 from public.routes),
                 'changing the key ends the pause and forgets the count');
  perform age('session-pin-0001');
  perform assert(put('482193', 'session-pin-0001') is null, 'a trip under way finishes on the old PIN');
  perform assert_err($q$ select put('482193', 'session-pin-0005') $q$, 'invalid key',
                     'a new one cannot start on it');
  perform assert(not (public.get_settings('wonderful-mendez-ayala')->>'share_pin')::boolean,
                 'readers are told the key is no longer a PIN');
end $$;

do $$ begin raise notice '== a long key has no limit, as before =='; end $$;
do $$
declare i int;
begin
  for i in 1..25 loop
    perform assert(chk('wrong-long-key-' || i) = 'invalid key', 'a wrong long key is only refused (' || i || ')');
  end loop;
  perform assert(fails() = 0 and (select key_paused_until is null from public.routes),
                 'nothing is counted and nothing is paused');
  perform assert(chk('a-long-share-key-77') = 'ok', 'the right long key still gets in');
  perform assert(public.route_exists('a-long-share-key-77'), 'route_exists still knows a long key');
  perform public.set_bus_position('a-long-share-key-77','session-long-0001',14.4,120.9,null,'north',null);
  perform assert(put('a-long-share-key-77', 'session-long-0002') is null,
                 'and both writers take it');
end $$;

do $$ begin raise notice '== the count cannot be called around =='; end $$;
do $$
begin
  perform assert(not has_function_privilege('anon', 'public._key_failed(text)', 'execute'),
                 'anon cannot call _key_failed');
  perform assert(has_function_privilege('anon', 'public.check_share_key(text,text)', 'execute')
                 and has_function_privilege('anon',
                   -- with the look 13-bus-look.sql added
                   'public.set_keyed_position(text,text,text,double precision,double precision,double precision,text,text,text)',
                   'execute'),
                 'anon can call the gate and the writer');
end $$;

drop function rot(text); drop function chk(text); drop function put(text, text);
drop function fails(); drop function age(text);

do $$ begin raise notice 'ALL 10 CHECKS PASSED'; end $$;
