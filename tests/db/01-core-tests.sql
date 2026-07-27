-- Behavioural tests, run against the freshly migrated database.
-- Any failed expectation raises and aborts the script.

\set ON_ERROR_STOP on
set client_min_messages to notice;

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
select public.rename_route_slug((select slug from public.routes limit 1), 'wonderful-mendez-ayala');
select public.admin_setup('wonderful-mendez-ayala', 'my-long-admin-key-42');

do $$ begin raise notice '== migration integrity =='; end $$;
do $$
begin
  perform assert((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='get_positions') = 1,
                 'obsolete get_positions overloads dropped');
  perform assert((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='get_sightings') = 1,
                 'obsolete get_sightings overloads dropped');
  perform assert((select count(*) from public.bus_positions where route_slug='wonderful-mendez-ayala') = 2,
                 'live sharers survived migration and the slug rename');
  perform assert((select count(*) from public.sightings where route_slug='wonderful-mendez-ayala') = 2,
                 'sightings survived migration and the slug rename');
  perform assert((select settings->>'headway_min' from public.routes) = '30',
                 'settings seeded from the old config values');
  perform assert((select settings->'hours'->'north'->0->>0 from public.routes) = '03:00',
                 'seeded hours preserve the old first trip');
end $$;

do $$ begin raise notice '== public reads: slug only, no secrets, no writes =='; end $$;
do $$
declare before int; after int;
begin
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala')) = 2,
                 'get_positions works with the slug alone');
  perform assert((select count(*) from public.get_positions('wrong-slug')) = 0,
                 'wrong slug sees nothing');
  perform assert((select count(*) from public.get_sightings('wonderful-mendez-ayala')) = 2,
                 'get_sightings works with the slug alone');
  perform assert((select (public.get_settings('wonderful-mendez-ayala'))->'settings'->>'headway_min') = '30',
                 'get_settings returns the settings');
  perform assert(public.get_settings('wrong-slug') is null,
                 'get_settings on a wrong slug returns nothing');

  -- reads must not delete: make a stale row, read, row must still exist
  update public.bus_positions set updated_at = now() - interval '3 hours'
   where session_id = 'session-bbbb-2222';
  select count(*) into before from public.bus_positions;
  perform count(*) from public.get_positions('wonderful-mendez-ayala');
  select count(*) into after from public.bus_positions;
  perform assert(before = after, 'reads perform no deletes');
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala')) = 1,
                 'stale sessions are filtered from reads');

  -- writes sweep: a fresh write removes rows stale beyond 2x expiry
  update public.bus_positions set updated_at = now() - interval '30 seconds'
   where session_id = 'session-aaaa-1111';   -- step past the 2s write rate limit
  perform public.set_bus_position('OLD-SHARE-KEY-123', 'session-aaaa-1111',
                                  14.52, 120.99, 11, 'south', '98018');
  perform assert(not exists (select 1 from public.bus_positions where session_id='session-bbbb-2222'),
                 'writes sweep rows stale beyond twice the expiry');
end $$;

do $$ begin raise notice '== secrets stay out of public reach =='; end $$;
do $$
begin
  perform assert(
    not has_function_privilege('anon', 'public._require_admin(text,text)', 'execute'),
    'anon cannot call _require_admin');
  perform assert(
    not has_function_privilege('anon', 'public._hash_admin(text,text)', 'execute'),
    'anon cannot call _hash_admin');
  perform assert(
    not has_function_privilege('anon', 'public.rename_route_slug(text,text)', 'execute'),
    'anon cannot rename the slug');
  perform assert(
    has_function_privilege('anon', 'public.get_positions(text)', 'execute'),
    'anon can read positions');
  perform assert(
    not has_table_privilege('anon', 'public.routes', 'select'),
    'anon cannot select the routes table (where keys live)');
  perform assert(
    (select public.get_settings('wonderful-mendez-ayala'))::text !~ 'KEY|hash|salt',
    'get_settings leaks no key material');
end $$;

do $$ begin raise notice '== sharing still requires the key =='; end $$;
do $$
begin
  perform assert(public.route_exists('OLD-SHARE-KEY-123'), 'current key validates');
  perform assert(not public.route_exists('made-up-key'), 'wrong key does not');
  perform assert_err(
    $q$ select public.set_bus_position('made-up-key','session-cccc-3333',14.5,120.99,10,'south',null) $q$,
    'invalid key', 'writes with a wrong key are refused');
  perform assert_err(
    $q$ select public.set_bus_position('OLD-SHARE-KEY-123','session-dddd-4444',15.5,120.99,10,'south',null) $q$,
    'position off route', 'bounding box check preserved');
  perform assert_err(
    $q$ select public.set_bus_position('OLD-SHARE-KEY-123','session-dddd-4444',14.5,120.99,99,'south',null) $q$,
    'implausible speed', 'speed check preserved');
  perform assert_err(
    $q$ select public.set_bus_position('OLD-SHARE-KEY-123','session-aaaa-1111',14.5,120.99,10,'south',null) $q$,
    'rate limited', 'per-session 2 second rate limit preserved');
end $$;

do $$ begin raise notice '== admin auth =='; end $$;
do $$
begin
  perform assert(public.admin_check('wonderful-mendez-ayala','my-long-admin-key-42'),
                 'correct admin key accepted');
  perform assert_err(
    $q$ select public.admin_check('wonderful-mendez-ayala','wrong-admin-key-xx') $q$,
    'invalid admin key', 'wrong admin key refused');
  perform assert_err(
    $q$ select public.admin_setup('wonderful-mendez-ayala','takeover-attempt-key') $q$,
    'already set', 'admin_setup cannot be used twice (no takeover)');
  perform assert((select admin_hash from public.routes) !~ 'my-long-admin-key',
                 'admin key stored only as a hash');
end $$;

do $$ begin raise notice '== notice board =='; end $$;
do $$
begin
  perform public.admin_set_notice('wonderful-mendez-ayala','my-long-admin-key-42',
                                  'New hours from the March poster: 6-10am and 3:40-8pm', null);
  perform assert(
    (select (public.get_settings('wonderful-mendez-ayala'))->'notice'->>'text') like 'New hours%',
    'notice appears in get_settings');
  perform public.admin_set_notice('wonderful-mendez-ayala','my-long-admin-key-42','short lived', 10);
  update public.routes set notice_expires = now() - interval '1 minute';
  perform assert(
    (select coalesce(jsonb_typeof((public.get_settings('wonderful-mendez-ayala'))->'notice'),'null') = 'null'),
    'expired notice disappears from get_settings (json null, which the app reads as null)');
  perform public.admin_set_notice('wonderful-mendez-ayala','my-long-admin-key-42', null, null);
  perform assert((select notice_text from public.routes) is null, 'clearing the notice works');
  perform assert_err(
    $q$ select public.admin_set_notice('wonderful-mendez-ayala','wrong-key-here-x','x',null) $q$,
    'invalid admin key', 'notice cannot be set without the admin key');
end $$;

do $$ begin raise notice '== settings validation =='; end $$;
do $$
declare good jsonb := jsonb_build_object(
  'hours', jsonb_build_object(
     'north', jsonb_build_array(jsonb_build_array('06:00','10:00'), jsonb_build_array('15:40','20:00')),
     'south', jsonb_build_array(jsonb_build_array('06:00','10:00'), jsonb_build_array('15:40','20:00'))),
  'headway_min', 30, 'bus_expiry_min', 10, 'sighting_expiry_min', 120, 'max_sessions', 25);
begin
  perform public.admin_set_settings('wonderful-mendez-ayala','my-long-admin-key-42', good);
  perform assert(
    (select (public.get_settings('wonderful-mendez-ayala'))->'settings'->'hours'->'north'->1->>0) = '15:40',
    'the split schedule from the new poster saves and reads back');
  perform assert_err(
    format($q$ select public.admin_set_settings('wonderful-mendez-ayala','my-long-admin-key-42', %L::jsonb) $q$,
           jsonb_set(good, '{hours,north}', '[["25:00","26:00"]]'::jsonb)::text),
    'HH:MM', 'malformed times rejected');
  perform assert_err(
    format($q$ select public.admin_set_settings('wonderful-mendez-ayala','my-long-admin-key-42', %L::jsonb) $q$,
           jsonb_set(good, '{hours,north}', '[["10:00","06:00"]]'::jsonb)::text),
    'start must be before end', 'inverted window rejected');
  perform assert_err(
    format($q$ select public.admin_set_settings('wonderful-mendez-ayala','my-long-admin-key-42', %L::jsonb) $q$,
           jsonb_set(good, '{max_sessions}', '9999'::jsonb)::text),
    'out of range', 'silly session cap rejected');
end $$;

do $$ begin raise notice '== key rotation with finish-your-trip grace =='; end $$;
do $$
begin
  -- an active session exists on the old key: session-aaaa-1111
  perform public.admin_rotate_share_key('wonderful-mendez-ayala','my-long-admin-key-42','NEW-SHARE-KEY-456');
  perform assert(not public.route_exists('OLD-SHARE-KEY-123'),
                 'after rotation, the old key no longer validates for starting');
  perform assert(public.route_exists('NEW-SHARE-KEY-456'), 'the new key validates');

  -- the mid-trip sharer keeps writing with the old key
  update public.bus_positions set updated_at = now() - interval '30 seconds'
   where session_id = 'session-aaaa-1111';
  perform public.set_bus_position('OLD-SHARE-KEY-123','session-aaaa-1111',14.53,120.99,10,'south','98018');
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala')
                  where session_id='session-aaaa-1111') = 1,
                 'mid-trip sharer continues on the old key (grace)');

  -- a NEW session with the old key is refused
  perform assert_err(
    $q$ select public.set_bus_position('OLD-SHARE-KEY-123','session-eeee-5555',14.5,120.99,10,'south',null) $q$,
    'invalid key', 'new trips cannot start on the rotated-out key');

  -- a new session with the new key works
  perform public.set_bus_position('NEW-SHARE-KEY-456','session-ffff-6666',14.4,120.9,10,'north',null);
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala')) = 2,
                 'new key starts new sessions normally');

  -- once grace lapses, the old key dies completely
  update public.routes set prev_key_expires = now() - interval '1 minute';
  update public.bus_positions set updated_at = now() - interval '30 seconds'
   where session_id = 'session-aaaa-1111';
  perform assert_err(
    $q$ select public.set_bus_position('OLD-SHARE-KEY-123','session-aaaa-1111',14.54,120.99,10,'south',null) $q$,
    'invalid key', 'after the grace period the old key stops entirely');
end $$;

do $$ begin raise notice '== sightings: open posting, flood cap, admin delete =='; end $$;
do $$
declare victim bigint; i int;
begin
  delete from public.sightings;  -- clean slate for counting
  perform public.add_sighting('wonderful-mendez-ayala', 'Southbound at PITX 5:10pm');
  perform assert((select count(*) from public.get_sightings('wonderful-mendez-ayala')) = 1,
                 'anyone can post a sighting with just the slug');
  perform assert_err(
    $q$ select public.add_sighting('wrong-slug', 'hello') $q$,
    'invalid route', 'posting needs a valid slug');
  for i in 1..4 loop
    perform public.add_sighting('wonderful-mendez-ayala', 'post ' || i);
  end loop;
  perform assert_err(
    $q$ select public.add_sighting('wonderful-mendez-ayala', 'one too many') $q$,
    'sighting flood', 'sixth post inside a minute is refused');

  select sid into victim from public.sightings where body = 'post 2';
  perform public.admin_delete_sighting('wonderful-mendez-ayala','my-long-admin-key-42', victim);
  perform assert(not exists (select 1 from public.sightings where sid = victim),
                 'admin delete removes exactly the targeted sighting');
  perform assert((select count(*) from public.sightings) = 4, 'other sightings untouched');
  perform assert_err(
    format($q$ select public.admin_delete_sighting('wonderful-mendez-ayala','bad-admin-key-00', %s) $q$,
           (select min(sid) from public.sightings)),
    'invalid admin key', 'delete requires the admin key');
end $$;

do $$ begin raise notice '== kick and clear =='; end $$;
do $$
begin
  perform public.admin_kick('wonderful-mendez-ayala','my-long-admin-key-42','session-ffff-6666');
  perform assert(not exists (select 1 from public.bus_positions where session_id='session-ffff-6666'),
                 'admin kick removes the session');
  perform assert_err(
    $q$ select public.admin_kick('wonderful-mendez-ayala','bad-admin-key-00','session-aaaa-1111') $q$,
    'invalid admin key', 'kick requires the admin key');

  -- keyless clear: the unguessable session id is the credential
  perform public.set_bus_position('NEW-SHARE-KEY-456','session-gggg-7777',14.4,120.9,10,'north',null);
  perform public.clear_bus_position('wonderful-mendez-ayala','session-gggg-7777');
  perform assert(not exists (select 1 from public.bus_positions where session_id='session-gggg-7777'),
                 'clear_bus_position works with slug plus session id');
end $$;

do $$ begin raise notice '== cap comes from settings =='; end $$;
do $$
declare i int;
begin
  delete from public.bus_positions;
  perform public.admin_set_settings('wonderful-mendez-ayala','my-long-admin-key-42', jsonb_build_object(
    'hours', jsonb_build_object('north', '[["06:00","10:00"]]'::jsonb, 'south', '[["06:00","10:00"]]'::jsonb),
    'headway_min', 30, 'bus_expiry_min', 10, 'sighting_expiry_min', 120, 'max_sessions', 3));
  for i in 1..3 loop
    perform public.set_bus_position('NEW-SHARE-KEY-456','session-cap-000' || i, 14.4, 120.9, 10, 'north', null);
  end loop;
  perform assert_err(
    $q$ select public.set_bus_position('NEW-SHARE-KEY-456','session-cap-0004',14.4,120.9,10,'north',null) $q$,
    'too many active sessions', 'session cap is read from admin settings');
end $$;

do $$ begin raise notice '== ping =='; end $$;
do $$
begin
  perform assert(public.ping() >= 1, 'ping works for the keep-alive monitor');
end $$;

do $$ begin raise notice ''; raise notice 'ALL DATABASE TESTS PASS'; end $$;
