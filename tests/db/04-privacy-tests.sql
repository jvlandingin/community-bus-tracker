-- Tests for sql/04-session-id-privacy.sql.
--
-- The bug being fixed: get_positions handed every anonymous watcher the
-- live session ids, and clear_bus_position takes a session id and no key,
-- so anyone could clear the whole route off the map on a loop.
--
-- Run against a freshly migrated database.
\set ON_ERROR_STOP on
set client_min_messages to notice;

-- assert helpers, plus setup steps A and B
\ir _prelude.sql

do $$ begin raise notice '== the session id is no longer published =='; end $$;
do $$
declare res text;
begin
  perform assert((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='get_positions') = 1,
                 'the single-argument get_positions was replaced, not overloaded');

  select pg_get_function_result(p.oid) into res
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='get_positions';
  perform assert(position('session_id' in res) = 0,
                 'get_positions no longer returns a session_id column at all');
  perform assert(position('pub_id' in res) > 0,
                 'it returns pub_id instead');

  perform assert(not has_function_privilege('anon', 'public._pub_id(text,text)', 'execute'),
                 'anon cannot call _pub_id to check ids against the salt');
  perform assert(has_function_privilege('anon', 'public.get_positions(text,text)', 'execute'),
                 'watching is still open to everyone');
end $$;

do $$ begin raise notice '== a published pub_id cannot clear anyone off the map =='; end $$;
do $$
declare k text; pid text;
begin
  select key into k from public.routes;
  delete from public.bus_positions;
  perform public.set_bus_position(k, 'session-priv-0001', 14.23, 120.92, 10, 'north', null);

  select pub_id into pid from public.get_positions('wonderful-mendez-ayala');
  perform assert(pid is not null, 'a watcher does get a stable id for the marker');
  perform assert(pid <> 'session-priv-0001', 'but it is not the session id');

  -- the whole attack, in one line: replay what the map gave you
  perform public.clear_bus_position('wonderful-mendez-ayala', pid);
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala')) = 1,
                 'replaying the published id removes nothing');

  -- the sharer's own phone, which holds the real session id, still works.
  -- This is the sendBeacon path on page close and must keep working.
  perform public.clear_bus_position('wonderful-mendez-ayala', 'session-priv-0001');
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala')) = 0,
                 'the sharer can still clear their own bus with no key');
end $$;

do $$ begin raise notice '== pub_id behaves the way the map needs =='; end $$;
do $$
declare k text; a1 text; a2 text; b1 text;
begin
  select key into k from public.routes;
  delete from public.bus_positions;
  perform public.set_bus_position(k, 'session-priv-aaaa', 14.23, 120.92, 10, 'north', null);
  perform public.set_bus_position(k, 'session-priv-bbbb', 14.24, 120.92, 10, 'north', null);

  select pub_id into a1 from public.get_positions('wonderful-mendez-ayala','session-priv-aaaa')
   where is_self;
  update public.bus_positions set updated_at = now() - interval '30 seconds';
  perform public.set_bus_position(k, 'session-priv-aaaa', 14.25, 120.92, 10, 'north', null);
  select pub_id into a2 from public.get_positions('wonderful-mendez-ayala','session-priv-aaaa')
   where is_self;
  perform assert(a1 = a2, 'pub_id is stable across polls, so the marker does not flicker');

  select pub_id into b1 from public.get_positions('wonderful-mendez-ayala','session-priv-bbbb')
   where is_self;
  perform assert(a1 <> b1, 'two sharers get different pub_ids, so they stay two buses');
end $$;

do $$ begin raise notice '== is_self only ever flags your own row =='; end $$;
do $$
begin
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala') where is_self) = 0,
                 'a plain watcher sees nothing flagged as theirs');
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala','session-priv-aaaa')
                  where is_self) = 1,
                 'a sharer passing their own session id sees exactly one row flagged');
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala','session-priv-aaaa')) = 2,
                 'and still sees every other bus on the route');
end $$;

do $$ begin raise notice '== the admin page can still stop a sharer =='; end $$;
do $$
begin
  perform assert_err(
    $q$ select public.admin_list_sharers('wonderful-mendez-ayala','wrong-admin-key') $q$,
    'invalid admin key', 'listing real session ids needs the admin key');

  perform assert((select count(*) from public.admin_list_sharers(
                    'wonderful-mendez-ayala','my-long-admin-key-42')) = 2,
                 'the admin sees both sharers');
  perform assert(exists (select 1 from public.admin_list_sharers(
                    'wonderful-mendez-ayala','my-long-admin-key-42')
                  where session_id = 'session-priv-aaaa'),
                 'and gets the real session id, which is what Stop needs');

  -- end to end: the id the admin page reads is the id admin_kick takes
  perform public.admin_kick('wonderful-mendez-ayala','my-long-admin-key-42',
    (select session_id from public.admin_list_sharers(
       'wonderful-mendez-ayala','my-long-admin-key-42') where session_id='session-priv-aaaa'));
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala')) = 1,
                 'stopping a sharer still works through the admin listing');
end $$;

do $$ begin raise notice ''; raise notice 'ALL PRIVACY TESTS PASS'; end $$;
