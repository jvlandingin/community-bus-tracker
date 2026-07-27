-- Shared setup for every database suite. Each suite pulls this in with
-- \ir, so any suite can be run on its own against a freshly migrated
-- database rather than only after the one before it.
--
-- It does two things:
--   1. defines the assert helpers the suites are written in
--   2. runs setup steps A and B from sql/README.md, so the route has the
--      slug and admin key the suites expect
--
-- It deliberately does NOT touch the seed rows from 00-legacy-baseline.sql.
-- 02-rotation-tests.sql expects both seeded sharers to still be sitting on
-- the original key, which is why it cannot be run after 01-core-tests.sql.

create or replace function assert(cond boolean, label text)
returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'PASS: %', label;
end; $$;

create or replace function assert_err(sql text, frag text, label text)
returns void language plpgsql as $$
begin
  begin
    execute sql;
    raise exception 'FAIL: % (no error raised)', label;
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if position(frag in sqlerrm) = 0 then
      raise exception 'FAIL: % (got: %)', label, sqlerrm;
    end if;
  end;
  raise notice 'PASS: %', label;
end; $$;

-- ================= setup steps A and B =================
-- Written to be repeatable, so chaining two suites in one database does
-- not fail on 'slug already in use' before reaching an actual check.
do $$
begin
  if not exists (select 1 from public.routes where slug = 'wonderful-mendez-ayala') then
    perform public.rename_route_slug(
      (select slug from public.routes limit 1), 'wonderful-mendez-ayala');
  end if;
  if (select admin_hash from public.routes where slug = 'wonderful-mendez-ayala') is null then
    perform public.admin_setup('wonderful-mendez-ayala', 'my-long-admin-key-42');
  end if;
end $$;
