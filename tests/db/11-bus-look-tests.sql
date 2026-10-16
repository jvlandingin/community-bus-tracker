-- Tests for sql/13-bus-look.sql.
--
-- A sharer who chooses to may show their bus to riders: each write carries
-- a short code for it, stored on the trip's row and read back with the
-- position. Only a code of the app's own shape is kept, a bad one costs
-- nothing but the look, a page that sends none is a plain bus, and the
-- look goes when the trip does.
--
-- Run against a freshly migrated database.
\set ON_ERROR_STOP on
set client_min_messages to notice;

-- assert helpers, plus setup steps A and B
\ir _prelude.sql

create or replace function shared_key() returns text language sql as $$
  select key from public.routes where slug = 'wonderful-mendez-ayala';
$$;
create or replace function put(s text, look text) returns text language sql as $$
  select public.set_keyed_position('wonderful-mendez-ayala', shared_key(), s, 14.4, 120.9, null, 'north', null, look);
$$;
create or replace function seen(s text) returns text language sql as $$
  select g.look from public.get_positions('wonderful-mendez-ayala', s) g where g.is_self;
$$;
-- lets the same session write again without waiting out the 2 second limit
create or replace function age(s text) returns void language sql as $$
  update public.bus_positions set updated_at = now() - interval '5 seconds' where session_id = s;
$$;

do $$ begin raise notice '== a look goes with a position, and comes back with it =='; end $$;
do $$
begin
  delete from public.bus_positions;
  perform assert(put('session-look-0001', '1Fc') is null, 'a write with a look goes in');
  perform assert(seen('session-look-0001') = '1Fc', 'and watchers read the look with the position');
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala') g where g.look = '1Fc') = 1,
                 'everyone reads it, not only the sharer: that is what showing is');
  perform age('session-look-0001');
  perform assert(put('session-look-0001', null) is null and seen('session-look-0001') is null,
                 'a write without one makes the bus plain again from that write on');
end $$;

do $$ begin raise notice '== only the app''s own shape is kept =='; end $$;
do $$
begin
  perform age('session-look-0001');
  perform assert(put('session-look-0001', 'hello') is null, 'a look of the wrong shape costs nothing but the look');
  perform assert(seen('session-look-0001') is null, 'it is stored as nothing');
  perform age('session-look-0001');
  perform put('session-look-0001', '1<script>');
  perform assert(seen('session-look-0001') is null, 'no markup');
  perform age('session-look-0001');
  perform put('session-look-0001', '1 abc');
  perform assert(seen('session-look-0001') is null, 'no spaces, so no words');
  perform age('session-look-0001');
  perform put('session-look-0001', '1' || repeat('a', 41));
  perform assert(seen('session-look-0001') is null, 'nothing longer than forty letters');
  perform age('session-look-0001');
  perform put('session-look-0001', '6' || repeat('a', 40));
  perform assert(seen('session-look-0001') = '6' || repeat('a', 40), 'forty letters and a paint digit is the most');
  perform assert_err(
    $q$ update public.bus_positions set look = 'free text' where session_id = 'session-look-0001' $q$,
    'bus_positions_look_shape', 'the table refuses any other shape too');
end $$;

do $$ begin raise notice '== a page from before this is unaffected =='; end $$;
do $$
begin
  perform assert(public.set_keyed_position('wonderful-mendez-ayala', shared_key(), 'session-look-0002',
                   14.41, 120.91, null, 'south', '98019') is null,
                 'the writer still answers a call with no look at all');
  perform assert(seen('session-look-0002') is null, 'and that bus is plain');
  perform assert((select count(*) from pg_proc where proname = 'set_keyed_position') = 1 and
                 (select count(*) from pg_proc where proname = 'set_open_position') = 1 and
                 (select count(*) from pg_proc where proname = 'get_positions') = 1,
                 'one function of each name, so PostgREST never has two to choose between');
end $$;

do $$ begin raise notice '== without the key, with open sharing on =='; end $$;
do $$
declare s jsonb;
begin
  select settings into s from public.routes where slug = 'wonderful-mendez-ayala';
  perform public.admin_set_settings('wonderful-mendez-ayala', 'my-long-admin-key-42', s || '{"open_sharing":true}'::jsonb);
  perform public.set_open_position('wonderful-mendez-ayala', 'session-look-0003', 14.42, 120.92, null, 'north', null, '3ab');
  perform assert(seen('session-look-0003') = '3ab', 'a keyless trip may show its bus as well');
  perform age('session-look-0003');
  perform public.set_open_position('wonderful-mendez-ayala', 'session-look-0003', 14.42, 120.92, null, 'north', null);
  perform assert(seen('session-look-0003') is null, 'and is plain again without one');
end $$;

do $$ begin raise notice '== the look goes when the trip does =='; end $$;
do $$
begin
  perform age('session-look-0001');
  perform put('session-look-0001', '2gh');
  perform public.clear_bus_position('wonderful-mendez-ayala', 'session-look-0001');
  perform assert(not exists (select 1 from public.bus_positions where session_id = 'session-look-0001'),
                 'Stop takes the row, and the look with it');
  perform assert(not exists (select 1 from information_schema.tables
                              where table_schema = 'public' and table_name ~ 'look'),
                 'there is no table of looks to outlive a trip');
  perform assert(not has_function_privilege('anon', 'public._set_look(text,text,text)', 'execute'),
                 'the helper is not callable from outside');
  perform assert(has_function_privilege('anon', 'public.set_keyed_position(text,text,text,double precision,double precision,double precision,text,text,text)', 'execute') and
                 has_function_privilege('anon', 'public.set_open_position(text,text,double precision,double precision,double precision,text,text,text)', 'execute') and
                 has_function_privilege('anon', 'public.get_positions(text,text)', 'execute'),
                 'the writers and the read are');
end $$;
