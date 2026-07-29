-- Tests for sql/06-watching-count.sql.
--
-- The count of people watching is the first thing in the system that
-- observes watchers at all, so most of these checks are about what it
-- refuses to do: keep anything after the tab is gone, hand an id to
-- anyone, or grow without a ceiling when someone feeds it junk.
--
-- Run against a freshly migrated database.
\set ON_ERROR_STOP on
set client_min_messages to notice;

-- assert helpers, plus setup steps A and B
\ir _prelude.sql

do $$ begin raise notice '== counting =='; end $$;
do $$
begin
  perform assert((select watching from public.admin_watching_count(
                    'wonderful-mendez-ayala','my-long-admin-key-42')) = 0,
                 'nobody watching to start with');

  perform public.mark_watching('wonderful-mendez-ayala','watch-aaaa-1111');
  perform assert((select watching from public.admin_watching_count(
                    'wonderful-mendez-ayala','my-long-admin-key-42')) = 1,
                 'one tab beating counts as one');

  -- the same tab beating again is the same tab, which is the whole
  -- reason the id exists
  update public.watching_now set last_seen = now() - interval '30 seconds';
  perform public.mark_watching('wonderful-mendez-ayala','watch-aaaa-1111');
  perform assert((select watching from public.admin_watching_count(
                    'wonderful-mendez-ayala','my-long-admin-key-42')) = 1,
                 'the same tab beating twice is still one');
  perform assert((select count(*) from public.watching_now) = 1,
                 'and does not leave a second row behind');

  perform public.mark_watching('wonderful-mendez-ayala','watch-bbbb-2222');
  perform assert((select watching from public.admin_watching_count(
                    'wonderful-mendez-ayala','my-long-admin-key-42')) = 2,
                 'a second tab counts as two');
end $$;

do $$ begin raise notice '== a closed tab stops counting, and stops being stored =='; end $$;
do $$
begin
  -- nothing tells the server a tab closed: it simply stops beating,
  -- which has to be enough on its own
  update public.watching_now set last_seen = now() - interval '4 minutes'
   where watcher_id = 'watch-bbbb-2222';
  perform assert((select watching from public.admin_watching_count(
                    'wonderful-mendez-ayala','my-long-admin-key-42')) = 1,
                 'a tab that stopped beating drops out of the count');

  -- and the row itself goes on the next write, rather than lingering
  update public.watching_now set last_seen = now() - interval '30 seconds'
   where watcher_id = 'watch-aaaa-1111';
  perform public.mark_watching('wonderful-mendez-ayala','watch-aaaa-1111');
  perform assert(not exists (select 1 from public.watching_now
                              where watcher_id = 'watch-bbbb-2222'),
                 'the stale row is deleted, not kept');
  perform assert((select count(*) from public.watching_now) = 1,
                 'so the table only ever holds who is here now');
end $$;

do $$ begin raise notice '== an ordinary write sweeps it too =='; end $$;
do $$
begin
  update public.watching_now set last_seen = now() - interval '4 minutes';
  -- a sighting is the cheapest write that calls _sweep
  perform public.add_sighting('wonderful-mendez-ayala','sweep check');
  perform assert((select count(*) from public.watching_now) = 0,
                 'a route nobody is watching does not sit on stale rows');

  -- and redefining _sweep did not lose what it swept before
  insert into public.kicked_sessions (route_slug, session_id, until)
  values ('wonderful-mendez-ayala','expired-block-1', now() - interval '1 minute');
  perform public.add_sighting('wonderful-mendez-ayala','sweep check two');
  perform assert(not exists (select 1 from public.kicked_sessions
                              where session_id = 'expired-block-1'),
                 'expired blocks are still cleared by the same sweep');
end $$;

do $$ begin raise notice '== what it refuses =='; end $$;
do $$
begin
  perform assert_err(
    $q$ select public.mark_watching('wonderful-mendez-ayala','short') $q$,
    'invalid watcher', 'a too-short watcher id is refused');
  perform assert_err(
    $q$ select public.mark_watching('wonderful-mendez-ayala', repeat('x', 65)) $q$,
    'invalid watcher', 'an over-long one is refused, so this is not free storage');
  perform assert_err(
    $q$ select public.mark_watching('wonderful-mendez-ayala','watch aaaa;drop') $q$,
    'invalid watcher', 'anything outside letters, digits and hyphens is refused');
  perform assert_err(
    $q$ select public.mark_watching('wonderful-mendez-ayala', null) $q$,
    'invalid watcher', 'null is refused');
  perform assert_err(
    $q$ select public.mark_watching('no-such-route','watch-cccc-3333') $q$,
    'invalid route', 'a made-up route is refused');
  perform assert((select count(*) from public.watching_now) = 0,
                 'and none of those wrote a row');
end $$;

do $$ begin raise notice '== the flood guard =='; end $$;
do $$
declare seen timestamptz;
begin
  perform public.mark_watching('wonderful-mendez-ayala','watch-dddd-4444');
  select last_seen into seen from public.watching_now
   where watcher_id = 'watch-dddd-4444';

  -- beating faster than the client does is a no-op, NOT an error: the
  -- page must not show anyone a failure over a number they never see
  perform public.mark_watching('wonderful-mendez-ayala','watch-dddd-4444');
  perform assert((select last_seen from public.watching_now
                   where watcher_id = 'watch-dddd-4444') = seen,
                 'a beat inside 10 seconds does not even write');
  perform assert((select watching from public.admin_watching_count(
                    'wonderful-mendez-ayala','my-long-admin-key-42')) = 1,
                 'and the tab still counts');
end $$;

do $$ begin raise notice '== the cap bounds what a made-up flood can do =='; end $$;
do $$
begin
  -- mark_watching takes no key, because a watcher has none, so anyone
  -- can call it with invented ids. The cap is what stops that being an
  -- unbounded table rather than a wrong number.
  insert into public.watching_now (route_slug, watcher_id, last_seen)
  select 'wonderful-mendez-ayala', 'flood-' || lpad(g::text, 6, '0'), now()
    from generate_series(1, 1000) g
  on conflict do nothing;

  perform assert((select capped from public.admin_watching_count(
                    'wonderful-mendez-ayala','my-long-admin-key-42')),
                 'the count comes back flagged when it is sitting at the cap');

  perform public.mark_watching('wonderful-mendez-ayala','watch-eeee-5555');
  perform assert(not exists (select 1 from public.watching_now
                              where watcher_id = 'watch-eeee-5555'),
                 'a new tab past the cap adds no row');
  perform assert((select count(*) from public.watching_now) <= 1001,
                 'so the table stops growing instead of filling the disk');

  -- an existing tab still beats normally, because it costs nothing new
  update public.watching_now set last_seen = now() - interval '30 seconds'
   where watcher_id = 'flood-000001';
  perform public.mark_watching('wonderful-mendez-ayala','flood-000001');
  perform assert((select last_seen from public.watching_now
                   where watcher_id = 'flood-000001') > now() - interval '10 seconds',
                 'and a tab already counted keeps beating at the cap');

  delete from public.watching_now;
end $$;

do $$ begin raise notice '== the number is admin-only, and it is only a number =='; end $$;
do $$
begin
  perform assert_err(
    $q$ select public.admin_watching_count('wonderful-mendez-ayala','wrong-admin-key') $q$,
    'invalid admin key', 'reading the count needs the admin key');

  perform assert(has_function_privilege('anon', 'public.mark_watching(text,text)', 'execute'),
                 'a watcher can beat with no key, because it has none');
  perform assert(has_function_privilege('anon', 'public.admin_watching_count(text,text)', 'execute'),
                 'the admin page reaches the count through the anon key, as every admin function does');
  perform assert(not has_function_privilege('anon', 'public._sweep_watching(text)', 'execute'),
                 'the sweep stays internal');
  perform assert(not has_function_privilege('anon', 'public._watching_window()', 'execute'),
                 'and so do the two constants');
  perform assert(not has_function_privilege('anon', 'public._watching_cap()', 'execute'),
                 'including the cap');

  -- the table is behind RLS with no policies, like every other one
  perform assert((select relrowsecurity from pg_class
                   where oid = 'public.watching_now'::regclass),
                 'watching_now has row level security on');
  perform assert(not exists (select 1 from pg_policy
                              where polrelid = 'public.watching_now'::regclass),
                 'and no policies, so the anon key cannot read it directly');

  -- there is deliberately no function that returns a watcher id to
  -- anyone. If one is ever added, this fails, which is the point.
  perform assert(not exists (
      select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and has_function_privilege('anon', p.oid, 'execute')
         and pg_get_function_result(p.oid) ilike '%watcher_id%'),
    'nothing anon can call returns a watcher id');
end $$;

do $$ begin raise notice '== nothing about a person is stored =='; end $$;
do $$
begin
  perform assert((select string_agg(column_name, ',' order by ordinal_position)
                    from information_schema.columns
                   where table_schema = 'public' and table_name = 'watching_now')
                 = 'route_slug,watcher_id,last_seen',
                 'the table holds a route, a random id and a timestamp, and nothing else');
end $$;

do $$ begin raise notice ''; raise notice 'ALL WATCHING COUNT TESTS PASS'; end $$;
