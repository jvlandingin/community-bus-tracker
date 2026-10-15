-- Tests for sql/11-open-sharing.sql.
--
-- The switch that lets a page with no key put a bus on the map: off
-- unless an admin turns it on, held to every check a keyed write is, and
-- turning it off takes every keyless bus off the map at once while
-- leaving the keyed ones alone.
--
-- Run against a freshly migrated database.
\set ON_ERROR_STOP on
set client_min_messages to notice;

-- assert helpers, plus setup steps A and B
\ir _prelude.sql

-- Saves the current settings with open_sharing set to v, or removed for null.
create or replace function set_open(v boolean) returns void language plpgsql as $$
declare s jsonb;
begin
  select settings into s from public.routes where slug = 'wonderful-mendez-ayala';
  s := case when v is null then s - 'open_sharing'
            else s || jsonb_build_object('open_sharing', v) end;
  perform public.admin_set_settings('wonderful-mendez-ayala', 'my-long-admin-key-42', s);
end; $$;

do $$ begin raise notice '== off unless an admin turns it on =='; end $$;
do $$
begin
  delete from public.bus_positions;
  perform assert(not ((select settings from public.routes) ? 'open_sharing'),
                 'no stored setting has the key before an admin saves one');
  perform assert_err(
    $q$ select public.set_open_position('wonderful-mendez-ayala','session-open-0001',14.4,120.9,null,'north',null) $q$,
    'open sharing is off', 'absent means off');
  perform set_open(false);
  perform assert_err(
    $q$ select public.set_open_position('wonderful-mendez-ayala','session-open-0001',14.4,120.9,null,'north',null) $q$,
    'open sharing is off', 'false means off');
  perform assert_err(
    $q$ select public.admin_set_settings('wonderful-mendez-ayala','my-long-admin-key-42',
          (select settings || '{"open_sharing":"true"}'::jsonb from public.routes)) $q$,
    'open_sharing must be true or false', 'a string is not a switch');
  perform assert_err(
    $q$ select public.admin_set_settings('wonderful-mendez-ayala','my-long-admin-key-42',
          (select settings || '{"open_sharing":1}'::jsonb from public.routes)) $q$,
    'open_sharing must be true or false', 'nor is a number');
  perform assert_err(
    $q$ select public.set_open_position('no-such-route','session-open-0001',14.4,120.9,null,'north',null) $q$,
    'invalid route', 'an unknown slug is refused');
  perform assert(not exists (select 1 from public.bus_positions), 'nothing reached the table');
end $$;

do $$ begin raise notice '== on: anyone with the slug can share =='; end $$;
do $$
begin
  perform set_open(true);
  perform public.set_open_position('wonderful-mendez-ayala','session-open-0001',14.4,120.9,null,'north','12');
  perform assert((select keyless from public.bus_positions where session_id='session-open-0001'),
                 'the bus is on the map, marked keyless');
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala')) = 1,
                 'and watchers see it like any other');
  perform assert(not exists (select 1 from public.get_positions('wonderful-mendez-ayala') g
                              where to_jsonb(g) ? 'keyless'),
                 'watchers are not told which buses had no key');
  perform assert((select keyless from public.admin_list_sharers('wonderful-mendez-ayala','my-long-admin-key-42')
                   where session_id='session-open-0001'),
                 'the admin page is');
  perform assert_err(
    $q$ select public.admin_list_sharers('wonderful-mendez-ayala','wrong-admin-key-000') $q$,
    'invalid admin key', 'and only the admin page');
end $$;

do $$ begin raise notice '== held to every check a keyed write is =='; end $$;
do $$
begin
  perform assert_err(
    $q$ select public.set_open_position('wonderful-mendez-ayala','bad id',14.4,120.9,null,'north',null) $q$,
    'invalid session', 'a malformed session id');
  perform assert_err(
    $q$ select public.set_open_position('wonderful-mendez-ayala','session-open-0002',null,null,null,'north',null) $q$,
    'position off route', 'no position');
  perform assert_err(
    $q$ select public.set_open_position('wonderful-mendez-ayala','session-open-0002',10.0,120.9,null,'north',null) $q$,
    'position off route', 'a position off the route');
  perform assert_err(
    $q$ select public.set_open_position('wonderful-mendez-ayala','session-open-0002',14.4,120.9,null,'east',null) $q$,
    'invalid direction', 'a made-up direction');
  perform assert_err(
    $q$ select public.set_open_position('wonderful-mendez-ayala','session-open-0002',14.4,120.9,99,'north',null) $q$,
    'implausible speed', 'an impossible speed');
  perform assert_err(
    $q$ select public.set_open_position('wonderful-mendez-ayala','session-open-0002',14.4,120.9,null,'north','1234567890123') $q$,
    'label too long', 'a long label');
  perform assert_err(
    $q$ select public.set_open_position('wonderful-mendez-ayala','session-open-0001',14.41,120.9,null,'north',null) $q$,
    'rate limited', 'a second write inside 2 seconds');
  perform assert((select speed from public.bus_positions where session_id='session-open-0001') is null,
                 'speed is not kept');
end $$;

do $$ begin raise notice '== the cap and a stop from the admin page still hold =='; end $$;
do $$
declare s jsonb;
begin
  select settings into s from public.routes;
  perform public.admin_set_settings('wonderful-mendez-ayala','my-long-admin-key-42',
                                    s || '{"max_sessions":2}'::jsonb);
  perform public.set_open_position('wonderful-mendez-ayala','session-open-0003',14.4,120.9,null,'south',null);
  perform assert_err(
    $q$ select public.set_open_position('wonderful-mendez-ayala','session-open-0004',14.4,120.9,null,'north',null) $q$,
    'too many active sessions', 'the cap counts keyless buses');
  perform public.admin_set_settings('wonderful-mendez-ayala','my-long-admin-key-42', s);

  perform public.admin_kick('wonderful-mendez-ayala','my-long-admin-key-42','session-open-0003');
  perform assert_err(
    $q$ select public.set_open_position('wonderful-mendez-ayala','session-open-0003',14.4,120.9,null,'south',null) $q$,
    'session blocked', 'a stopped keyless session stays stopped');
end $$;

do $$ begin raise notice '== turning it off takes the keyless buses off, and only them =='; end $$;
do $$
declare k text;
begin
  select key into k from public.routes;
  perform public.set_bus_position(k,'session-keyed-0001',14.4,120.9,null,'north',null);
  perform assert(not (select keyless from public.bus_positions where session_id='session-keyed-0001'),
                 'a bus started with the key is not keyless, even with the switch on');
  perform public.set_open_position('wonderful-mendez-ayala','session-open-0005',14.4,120.9,null,'south',null);
  insert into public.thanks_now (route_slug, session_id, mark)
  values ('wonderful-mendez-ayala','session-open-0005','mark-test-0001');

  perform set_open(false);
  perform assert(not exists (select 1 from public.bus_positions where keyless),
                 'every keyless bus is gone the moment it is saved');
  perform assert(not exists (select 1 from public.thanks_now where session_id='session-open-0005'),
                 'and their salamat with them');
  perform assert(exists (select 1 from public.bus_positions where session_id='session-keyed-0001'),
                 'the keyed bus is left alone');
  perform assert_err(
    $q$ select public.set_open_position('wonderful-mendez-ayala','session-open-0005',14.4,120.9,null,'south',null) $q$,
    'open sharing is off', 'and a keyless trip under way cannot put itself back');

  perform set_open(true);
  perform public.set_open_position('wonderful-mendez-ayala','session-open-0006',14.4,120.9,null,'south',null);
  perform set_open(null);
  perform assert(not exists (select 1 from public.bus_positions where keyless),
                 'removing the setting is turning it off too');
end $$;

do $$ begin raise notice '== the keyed path is exactly what it was =='; end $$;
do $$
declare k text;
begin
  select key into k from public.routes;
  perform assert_err(
    $q$ select public.set_bus_position('not-the-key','session-keyed-0002',14.4,120.9,null,'north',null) $q$,
    'invalid key', 'a wrong key is still refused');
  perform assert_err(
    $q$ select public.set_bus_position('wonderful-mendez-ayala','session-keyed-0002',14.4,120.9,null,'north',null) $q$,
    'invalid key', 'and the public slug is not a key');
  perform public.admin_rotate_share_key('wonderful-mendez-ayala','my-long-admin-key-42','a-brand-new-share-key-1');
  perform assert_err(
    format($q$ select public.set_bus_position(%L,'session-keyed-0003',14.4,120.9,null,'north',null) $q$, k),
    'invalid key', 'a new trip on a rotated-out key is refused');
  -- now() is the transaction's start, so a sleep would not clear the limit
  update public.bus_positions set updated_at = now() - interval '5 seconds'
   where session_id = 'session-keyed-0001';
  perform public.set_bus_position(k,'session-keyed-0001',14.41,120.9,null,'north',null);
  perform assert((select lat from public.bus_positions where session_id='session-keyed-0001') = 14.41,
                 'while one already under way keeps going through the grace');
end $$;

do $$ begin raise notice '== the checks cannot be called around =='; end $$;
do $$
begin
  perform assert(
    not has_function_privilege('anon',
      'public._write_position(public.routes,boolean,boolean,text,double precision,double precision,double precision,text,text)',
      'execute'),
    'anon cannot call _write_position directly');
  perform assert(
    has_function_privilege('anon',
      -- with the look 13-bus-look.sql added: the suites check the database
      -- as it ends up
      'public.set_open_position(text,text,double precision,double precision,double precision,text,text,text)',
      'execute'),
    'anon can call set_open_position');
end $$;

drop function set_open(boolean);

do $$ begin raise notice 'ALL 09 CHECKS PASSED'; end $$;
