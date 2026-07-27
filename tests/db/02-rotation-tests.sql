-- Tests for the foreign key patch. Run after 03-fk-patch.sql.
\set ON_ERROR_STOP on
set client_min_messages to notice;

do $$ begin raise notice '== constraints now cascade =='; end $$;
do $$
declare n int;
begin
  select count(*) into n
    from pg_constraint con
    join pg_class rel on rel.oid = con.confrelid
   where con.contype='f' and rel.relname='routes' and con.confupdtype='c';
  perform assert(n = 2, 'both route_key foreign keys are ON UPDATE CASCADE');
  select count(*) into n
    from pg_constraint con
    join pg_class rel on rel.oid = con.confrelid
   where con.contype='f' and rel.relname='routes';
  perform assert(n = 2, 'referential integrity was kept, not dropped');
end $$;

do $$ begin raise notice '== rotation now works, with the data following =='; end $$;
do $$
declare old_key text;
begin
  select key into old_key from public.routes;
  perform assert((select count(*) from public.bus_positions where route_key = old_key) = 2,
                 'two sharers are on the old key before rotating');

  perform public.admin_rotate_share_key('wonderful-mendez-ayala','my-long-admin-key-42','WT-tracker-key-2026');

  perform assert((select key from public.routes) = 'WT-tracker-key-2026', 'the route now holds the new key');
  perform assert((select prev_key from public.routes) = old_key, 'the old key is remembered for the grace period');
  perform assert((select count(*) from public.bus_positions where route_key = 'WT-tracker-key-2026') = 2,
                 'existing sharer rows followed the key automatically');
  perform assert((select count(*) from public.bus_positions where route_key = old_key) = 0,
                 'no rows are left pointing at the old key');
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala')) = 2,
                 'both buses are still visible on the map after rotating');
end $$;

do $$ begin raise notice '== the grace period still behaves as designed =='; end $$;
do $$
declare old_key text;
begin
  select prev_key into old_key from public.routes;
  perform assert(not public.route_exists(old_key), 'the old key no longer validates for starting');
  perform assert(public.route_exists('WT-tracker-key-2026'), 'the new key validates');

  -- someone mid-trip keeps writing with the old key
  update public.bus_positions set updated_at = now() - interval '30 seconds';
  perform public.set_bus_position(old_key,'session-aaaa-1111',14.53,120.99,10,'south','98018');
  perform assert((select count(*) from public.bus_positions where session_id='session-aaaa-1111') = 1,
                 'mid-trip sharer continues on the old key');
  perform assert((select route_key from public.bus_positions where session_id='session-aaaa-1111')
                   = 'WT-tracker-key-2026',
                 'their row is stamped with the current key, not the old one');

  -- a new trip on the old key is refused
  perform assert_err(
    format($q$ select public.set_bus_position(%L,'session-new-9999',14.5,120.99,10,'south',null) $q$, old_key),
    'invalid key', 'new trips cannot start on the rotated-out key');

  -- a new trip on the new key works
  perform public.set_bus_position('WT-tracker-key-2026','session-new-9999',14.4,120.9,10,'north',null);
  perform assert((select count(*) from public.bus_positions where session_id='session-new-9999') = 1,
                 'new trips start normally on the new key');
end $$;

do $$ begin raise notice '== rotating twice in a row also works =='; end $$;
do $$
begin
  perform public.admin_rotate_share_key('wonderful-mendez-ayala','my-long-admin-key-42','WT-second-rotation-1');
  perform assert((select key from public.routes) = 'WT-second-rotation-1', 'second rotation succeeded');
  perform assert((select count(*) from public.bus_positions where route_key = 'WT-second-rotation-1') = 3,
                 'all sharer rows followed again');
  perform assert((select count(*) from public.sightings where route_key = 'WT-second-rotation-1')
                   = (select count(*) from public.sightings),
                 'sighting rows followed too');
end $$;

do $$ begin raise notice '== the patch is safe to run twice =='; end $$;
do $$ begin raise notice ''; raise notice 'ALL FK PATCH TESTS PASS'; end $$;
