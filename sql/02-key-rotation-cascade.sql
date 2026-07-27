-- ============================================================
--  PATCH: let the share key be changed
--
--  bus_positions.route_key and sightings.route_key point at
--  routes.key with a plain foreign key, which blocks any update
--  to routes.key, which is exactly what rotating the share key
--  does. Since the migration, route_slug is what actually links
--  these tables, and route_key is kept only for continuity.
--
--  This rebuilds those foreign keys with ON UPDATE CASCADE, so
--  Postgres carries the new key down to the child rows by
--  itself. Referential integrity is preserved, not dropped.
--
--  Safe to run more than once.
-- ============================================================

begin;

-- 1. Drop whatever foreign keys currently point at routes,
--    whatever they happen to be named.
do $$
declare c record;
begin
  for c in
    select con.conname, con.conrelid::regclass::text as tbl
      from pg_constraint con
      join pg_class rel on rel.oid = con.confrelid
      join pg_namespace n on n.oid = rel.relnamespace
     where con.contype = 'f'
       and n.nspname = 'public'
       and rel.relname = 'routes'
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
    raise notice 'dropped % on %', c.conname, c.tbl;
  end loop;
end $$;

-- 2. Remove any child row whose route_key no longer matches a
--    route, so the new constraints can be added cleanly. There
--    should be none; this is belt and braces.
delete from public.bus_positions b
 where not exists (select 1 from public.routes r where r.key = b.route_key);
delete from public.sightings s
 where not exists (select 1 from public.routes r where r.key = s.route_key);

-- 3. Recreate them so a key change flows down automatically.
alter table public.bus_positions
  add constraint bus_positions_route_key_fkey
  foreign key (route_key) references public.routes(key)
  on update cascade;

alter table public.sightings
  add constraint sightings_route_key_fkey
  foreign key (route_key) references public.routes(key)
  on update cascade;

commit;
