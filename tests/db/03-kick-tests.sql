-- Tests for the kick/block patch in sql/03-kick-block.sql.
-- Clears bus_positions first, so it runs against a freshly migrated
-- database or after another suite.
\set ON_ERROR_STOP on
set client_min_messages to notice;

-- assert helpers, plus setup steps A and B
\ir _prelude.sql

do $$ begin raise notice '== reproduce the bug conditions, then check the fix =='; end $$;
do $$
declare k text;
begin
  select key into k from public.routes;
  delete from public.bus_positions;
  delete from public.kicked_sessions;

  -- a sharer is live
  perform public.set_bus_position(k, 'session-kick-0001', 14.23, 120.92, 10, 'north', null);
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala')) = 1,
                 'sharer is on the map before the kick');

  -- admin stops them
  perform public.admin_kick('wonderful-mendez-ayala', 'my-long-admin-key-42', 'session-kick-0001');
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala')) = 0,
                 'the bus leaves the map immediately');

  -- their phone tries again 5 seconds later, which is what used to bring it back
  perform assert_err(
    format($q$ select public.set_bus_position(%L,'session-kick-0001',14.24,120.92,10,'north',null) $q$, k),
    'session blocked', 'the phone cannot put the bus back');
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala')) = 0,
                 'the map stays clear');
end $$;

do $$ begin raise notice '== the block is targeted, not collateral =='; end $$;
do $$
declare k text;
begin
  select key into k from public.routes;
  perform public.set_bus_position(k, 'session-other-002', 14.30, 120.91, 10, 'north', '98018');
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala')) = 1,
                 'a different sharer is unaffected');
  perform assert((select count(*) from public.admin_list_blocked('wonderful-mendez-ayala','my-long-admin-key-42')) = 1,
                 'exactly one session is listed as blocked');
end $$;

do $$ begin raise notice '== a kick can be undone =='; end $$;
do $$
declare k text;
begin
  select key into k from public.routes;
  perform public.admin_unblock('wonderful-mendez-ayala','my-long-admin-key-42','session-kick-0001');
  perform assert((select count(*) from public.admin_list_blocked('wonderful-mendez-ayala','my-long-admin-key-42')) = 0,
                 'the block is gone from the list');
  perform public.set_bus_position(k, 'session-kick-0001', 14.25, 120.92, 10, 'north', null);
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala')) = 2,
                 'the unblocked sharer can share again');
end $$;

do $$ begin raise notice '== blocks expire by themselves =='; end $$;
do $$
declare k text;
begin
  select key into k from public.routes;
  perform public.admin_kick('wonderful-mendez-ayala','my-long-admin-key-42','session-kick-0001');
  update public.kicked_sessions set until = now() - interval '1 minute'
   where session_id = 'session-kick-0001';
  perform assert((select count(*) from public.admin_list_blocked('wonderful-mendez-ayala','my-long-admin-key-42')) = 0,
                 'an expired block no longer appears');
  perform public.set_bus_position(k, 'session-kick-0001', 14.26, 120.92, 10, 'north', null);
  perform assert(exists (select 1 from public.bus_positions where session_id='session-kick-0001'),
                 'an expired block no longer refuses writes');
  perform assert(not exists (select 1 from public.kicked_sessions where session_id='session-kick-0001'),
                 'the sweep cleared the expired block row');
end $$;

do $$ begin raise notice '== admin key is required for all of it =='; end $$;
do $$
begin
  perform assert_err(
    $q$ select public.admin_kick('wonderful-mendez-ayala','wrong-admin-key-x','session-other-002') $q$,
    'invalid admin key', 'kick needs the admin key');
  perform assert_err(
    $q$ select public.admin_unblock('wonderful-mendez-ayala','wrong-admin-key-x','session-other-002') $q$,
    'invalid admin key', 'unblock needs the admin key');
  perform assert_err(
    $q$ select * from public.admin_list_blocked('wonderful-mendez-ayala','wrong-admin-key-x') $q$,
    'invalid admin key', 'listing blocks needs the admin key');
end $$;

do $$ begin raise notice '== nothing about a person is stored =='; end $$;
do $$
declare cols text;
begin
  select string_agg(column_name, ',' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema='public' and table_name='kicked_sessions';
  perform assert(cols = 'route_slug,session_id,until',
                 'the block table holds only route, random session id and expiry: ' || cols);
  perform assert(cols !~ 'lat|lng|speed|name|label',
                 'no location or identifying column exists on it');
end $$;

do $$ begin raise notice '== a blocked session can still clear itself =='; end $$;
do $$
begin
  perform public.admin_kick('wonderful-mendez-ayala','my-long-admin-key-42','session-other-002');
  perform public.clear_bus_position('wonderful-mendez-ayala','session-other-002');
  perform assert(not exists (select 1 from public.bus_positions where session_id='session-other-002'),
                 'the tab-close cleanup still works for a blocked session');
end $$;

do $$ begin raise notice ''; raise notice 'ALL KICK TESTS PASS'; end $$;
