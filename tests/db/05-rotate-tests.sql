-- Tests for sql/05-rotate-same-key.sql.
--
-- Rotating the share key to the value it already had used to succeed and
-- copy that value into prev_key, so the "retired" key kept starting new
-- sessions for the next four hours through the grace path.
--
-- Run against a freshly migrated database.
\set ON_ERROR_STOP on
set client_min_messages to notice;

-- assert helpers, plus setup steps A and B
\ir _prelude.sql

do $$ begin raise notice '== rotating to the current key is refused =='; end $$;
do $$
declare k text;
begin
  select key into k from public.routes;

  perform assert_err(
    format($q$ select public.admin_rotate_share_key('wonderful-mendez-ayala','my-long-admin-key-42',%L) $q$, k),
    'already the current share key', 'rotating to the key you already have is refused');

  perform assert((select key from public.routes) = k, 'the key is unchanged');
  perform assert((select prev_key from public.routes) is null,
                 'and no grace window was opened on the key still in use');
end $$;

do $$ begin raise notice '== a real rotation still works =='; end $$;
do $$
declare k text;
begin
  select key into k from public.routes;
  perform public.admin_rotate_share_key('wonderful-mendez-ayala','my-long-admin-key-42','WT-genuinely-new-key');
  perform assert((select key from public.routes) = 'WT-genuinely-new-key', 'the new key is in place');
  perform assert((select prev_key from public.routes) = k, 'the old key gets its grace window');
  perform assert(public.route_exists('WT-genuinely-new-key'), 'the new key starts new sessions');
  perform assert(not public.route_exists(k), 'the old key does not');
end $$;

do $$ begin raise notice '== the guard did not break the other checks =='; end $$;
do $$
begin
  perform assert_err(
    $q$ select public.admin_rotate_share_key('wonderful-mendez-ayala','my-long-admin-key-42','short') $q$,
    'share key must be', 'a too-short key is still refused');
  perform assert_err(
    $q$ select public.admin_rotate_share_key('wonderful-mendez-ayala','wrong-admin-key','WT-another-new-key') $q$,
    'invalid admin key', 'rotation still needs the admin key');
  perform assert((select key from public.routes) = 'WT-genuinely-new-key',
                 'neither refusal changed the key');
end $$;

do $$ begin raise notice ''; raise notice 'ALL ROTATION GUARD TESTS PASS'; end $$;
