-- Tests for sql/08-position-checks.sql.
--
-- Three things a write used to let through: a bus with no position, a
-- route full of dead rows refusing every new sharer, and a speed nobody
-- used, kept and published anyway.
--
-- Run against a freshly migrated database.
\set ON_ERROR_STOP on
set client_min_messages to notice;

-- assert helpers, plus setup steps A and B
\ir _prelude.sql

do $$ begin raise notice '== a bus has to have a position and a direction =='; end $$;
do $$
declare k text;
begin
  select key into k from public.routes;
  delete from public.bus_positions;
  perform assert_err(
    format($q$ select public.set_bus_position(%L,'session-null-0001',null,null,null,null,null) $q$, k),
    'invalid direction', 'a write with nothing in it is refused');
  perform assert_err(
    format($q$ select public.set_bus_position(%L,'session-null-0002',null,null,10,'north',null) $q$, k),
    'position off route', 'no latitude or longitude is refused');
  perform assert_err(
    format($q$ select public.set_bus_position(%L,'session-null-0003',null,120.9,10,'north',null) $q$, k),
    'position off route', 'no latitude is refused');
  perform assert_err(
    format($q$ select public.set_bus_position(%L,'session-null-0004',14.4,null,10,'north',null) $q$, k),
    'position off route', 'no longitude is refused');
  perform assert_err(
    format($q$ select public.set_bus_position(%L,'session-null-0005',14.4,120.9,10,null,null) $q$, k),
    'invalid direction', 'no direction is refused');
  -- NaN was already refused, because Postgres sorts it above every number;
  -- worth pinning now that the check has been rewritten
  perform assert_err(
    format($q$ select public.set_bus_position(%L,'session-null-0006','NaN',120.9,10,'north',null) $q$, k),
    'position off route', 'NaN is still refused');
  perform assert(not exists (select 1 from public.bus_positions),
                 'none of them reached the table');

  perform public.set_bus_position(k, 'session-null-0007', 14.4, 120.9, 10, 'north', null);
  perform assert((select count(*) from public.bus_positions) = 1, 'a real position still goes in');
end $$;

do $$ begin raise notice '== and the table refuses it even without the function =='; end $$;
do $$
begin
  perform assert((select count(*) from information_schema.columns
                   where table_schema='public' and table_name='bus_positions'
                     and column_name in ('lat','lng','direction') and is_nullable='NO') = 3,
                 'lat, lng and direction are NOT NULL');
  perform assert_err(
    $q$ insert into public.bus_positions (route_key, route_slug, session_id, lat, lng, direction)
        select key, slug, 'session-null-0008', null, 120.9, 'north' from public.routes $q$,
    'null value', 'a direct insert with no position is refused by the column');
end $$;

do $$ begin raise notice '== the old key cannot be used to keep one alive =='; end $$;
do $$
declare old_k text;
begin
  select key into old_k from public.routes;
  delete from public.bus_positions;
  perform public.set_bus_position(old_k, 'session-null-grace', 14.4, 120.9, 10, 'north', null);
  perform public.admin_rotate_share_key('wonderful-mendez-ayala','my-long-admin-key-42','NEW-SHARE-KEY-808');
  -- the existing session still writes on the old key, for its trip
  update public.bus_positions set updated_at = now() - interval '5 seconds';
  perform assert_err(
    format($q$ select public.set_bus_position(%L,'session-null-grace',null,null,null,'north',null) $q$, old_k),
    'position off route', 'the grace path refuses a NULL position too');
  perform public.set_bus_position(old_k, 'session-null-grace', 14.41, 120.91, 10, 'north', null);
  perform assert((select lat from public.bus_positions where session_id='session-null-grace') = 14.41,
                 'while a real one still goes through it');
end $$;

do $$ begin raise notice '== the cap counts the buses the map shows =='; end $$;
do $$
declare k text; i int;
begin
  select key into k from public.routes;
  delete from public.bus_positions;
  perform public.admin_set_settings('wonderful-mendez-ayala','my-long-admin-key-42', jsonb_build_object(
    'hours', jsonb_build_object('north', '[["06:00","10:00"]]'::jsonb, 'south', '[["06:00","10:00"]]'::jsonb),
    'headway_min', 30, 'bus_expiry_min', 10, 'sighting_expiry_min', 120, 'max_sessions', 3));
  for i in 1..3 loop
    perform public.set_bus_position(k, 'session-cap8-000' || i, 14.4, 120.9, 10, 'north', null);
  end loop;
  perform assert_err(
    format($q$ select public.set_bus_position(%L,'session-cap8-0004',14.4,120.9,10,'north',null) $q$, k),
    'too many active sessions', 'three live buses still fill a cap of three');

  -- the three phones die: off the map after one expiry, swept after two
  update public.bus_positions set updated_at = now() - interval '15 minutes';
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala')) = 0,
                 'the map shows none of them');
  perform public.set_bus_position(k, 'session-cap8-0004', 14.4, 120.9, 10, 'north', null);
  perform assert(exists (select 1 from public.bus_positions where session_id='session-cap8-0004'),
                 'so a new sharer gets on, though the dead rows are not yet swept');

  -- and dead for hours: the case that used to lock the route until a sighting
  delete from public.bus_positions;
  for i in 1..3 loop
    perform public.set_bus_position(k, 'session-cap8-010' || i, 14.4, 120.9, 10, 'north', null);
  end loop;
  update public.bus_positions set updated_at = now() - interval '10 hours';
  perform public.set_bus_position(k, 'session-cap8-0105', 14.4, 120.9, 10, 'north', null);
  perform assert((select count(*) from public.bus_positions) = 1,
                 'a new sharer gets on, and their write sweeps the dead rows');
end $$;

do $$ begin raise notice '== speed is checked, never kept =='; end $$;
do $$
declare k text;
begin
  select key into k from public.routes;
  delete from public.bus_positions;
  perform public.set_bus_position(k, 'session-speed-001', 14.4, 120.9, 23.6, 'north', '98019');
  perform assert((select speed from public.bus_positions where session_id='session-speed-001') is null,
                 'a reported speed is not stored');
  update public.bus_positions set updated_at = now() - interval '5 seconds';
  perform public.set_bus_position(k, 'session-speed-001', 14.41, 120.9, 30.1, 'north', '98019');
  perform assert((select speed from public.bus_positions where session_id='session-speed-001') is null,
                 'nor is the next one, on the update path');
  perform public.set_bus_position(k, 'session-speed-002', 14.4, 120.9, null, 'south', null);
  perform assert(exists (select 1 from public.bus_positions where session_id='session-speed-002'),
                 'a page that sends no speed at all is accepted');
  perform assert_err(
    format($q$ select public.set_bus_position(%L,'session-speed-003',14.4,120.9,99,'north',null) $q$, k),
    'implausible speed', 'an impossible speed is still refused');

  perform assert(pg_get_function_result('public.get_positions(text,text)'::regprocedure) !~ 'speed',
                 'get_positions does not return speed');
  perform assert(pg_get_function_result('public.admin_list_sharers(text,text)'::regprocedure) !~ 'speed',
                 'admin_list_sharers does not return speed');
  perform assert(pg_get_function_result('public.get_positions(text,text)'::regprocedure)
                   ~ 'pub_id.*is_self.*thanks.*lat.*lng.*direction.*bus_label.*updated_at',
                 'and get_positions still returns everything else the page reads');
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala', 'session-speed-001')
                   where is_self and thanks = 0) = 1,
                 'including the sharer''s own row and its count');
end $$;

do $$ begin raise notice '== the reads are still the only ones, and still open =='; end $$;
do $$
begin
  perform assert((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname='public' and p.proname='get_positions') = 1,
                 'one get_positions, no overload left behind');
  perform assert((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname='public' and p.proname='admin_list_sharers') = 1,
                 'one admin_list_sharers, no overload left behind');
  perform assert(has_function_privilege('anon','public.get_positions(text,text)','execute'),
                 'anon can still read positions');
  perform assert(has_function_privilege('anon','public.admin_list_sharers(text,text)','execute'),
                 'and the admin page can still list sharers');
  perform assert((select count(*) from public.admin_list_sharers('wonderful-mendez-ayala','my-long-admin-key-42')) = 2,
                 'which it does, behind the admin key');
  perform assert_err(
    $q$ select * from public.admin_list_sharers('wonderful-mendez-ayala','wrong-admin-key-xx') $q$,
    'invalid admin key', 'and not without it');
end $$;

-- ============================================================
-- Run the migration again over the rows the old checks let in: it has to
-- clear them, and it has to be safe to run twice.
-- ============================================================
do $$ begin raise notice '== a second run clears what the old function let in =='; end $$;
alter table public.bus_positions
  alter column lat drop not null,
  alter column lng drop not null,
  alter column direction drop not null;
do $$
declare k text;
begin
  select key into k from public.routes;
  insert into public.bus_positions (route_key, route_slug, session_id, lat, lng, speed, direction)
  values (k, 'wonderful-mendez-ayala', 'session-old-nulls', null, null, null, null);
  update public.bus_positions set speed = 12.5 where session_id = 'session-speed-002';
end $$;

\ir ../../sql/08-position-checks.sql

do $$
begin
  perform assert(not exists (select 1 from public.bus_positions where session_id='session-old-nulls'),
                 'the row with no position is gone');
  perform assert(not exists (select 1 from public.bus_positions where speed is not null),
                 'every stored speed is cleared');
  perform assert(exists (select 1 from public.bus_positions where session_id='session-speed-002'),
                 'and the real buses are left alone');
  perform assert((select count(*) from information_schema.columns
                   where table_schema='public' and table_name='bus_positions'
                     and column_name in ('lat','lng','direction') and is_nullable='NO') = 3,
                 'the columns refuse NULL again');
end $$;

do $$ begin raise notice 'ALL 08 CHECKS PASSED'; end $$;
