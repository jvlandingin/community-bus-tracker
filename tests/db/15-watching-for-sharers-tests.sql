-- Tests for sql/17-watching-for-sharers.sql.
--
-- A sharer sees how many people have the map open. Most checks here are
-- about who may never see the number (anyone who is not that bus's own
-- phone, and that phone while its bus is kept off the riders' map), and
-- about what it must never become: anything but the live gauge it was,
-- with nothing kept.
--
-- Run against a freshly migrated database.
\set ON_ERROR_STOP on
set client_min_messages to notice;

-- assert helpers, plus setup steps A and B
\ir _prelude.sql

create or replace function shared_key() returns text language sql as $$
  select key from public.routes where slug = 'wonderful-mendez-ayala';
$$;
create or replace function put(s text, lat double precision default 14.4) returns text language sql as $$
  select public.set_keyed_position('wonderful-mendez-ayala', shared_key(), s, lat, 120.9, null, 'north', null);
$$;
-- what the sharing phone is told, on its own row
create or replace function seen_by(s text) returns integer language sql as $$
  select g.watching from public.get_positions('wonderful-mendez-ayala', s) g where g.is_self;
$$;

do $$ begin raise notice '== the sharer is told how many have the map open =='; end $$;
do $$
begin
  delete from public.bus_positions;
  delete from public.watching_now;
  perform put('session-seen-0001');
  perform put('session-seen-0002', 14.41);
  perform assert(seen_by('session-seen-0001') = 0, 'nobody watching yet is a zero for the page to leave undrawn');
  perform public.mark_watching('wonderful-mendez-ayala', 'watch-seen-aaaa-1');
  perform public.mark_watching('wonderful-mendez-ayala', 'watch-seen-bbbb-2');
  perform public.mark_watching('wonderful-mendez-ayala', 'watch-seen-cccc-3');
  perform assert(seen_by('session-seen-0001') = 3, 'three tabs beating are three, on the sharer''s own row');
  perform assert(seen_by('session-seen-0001') =
                 (select watching from public.admin_watching_count('wonderful-mendez-ayala', 'my-long-admin-key-42')),
                 'the same number the organizer sees');
  update public.watching_now set last_seen = now() - interval '4 minutes' where watcher_id = 'watch-seen-cccc-3';
  perform assert(seen_by('session-seen-0001') = 2, 'a tab that stopped beating stops counting');
end $$;

do $$ begin raise notice '== and nobody else is =='; end $$;
do $$
begin
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala') g where g.watching is not null) = 0,
                 'a reader with no session id gets no number on any bus');
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala', 'session-seen-0001') g
                   where not g.is_self and g.watching is not null) = 0,
                 'a sharer gets it on their own bus only, never on another');
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala', 'not-a-session-0000') g
                   where g.watching is not null) = 0,
                 'an invented session id gets nothing');
  perform assert(put('session-seen-0003', 10.3) = 'private', 'a bus outside the route area');
  perform assert((select g.is_self and g.watching is null
                    from public.get_positions('wonderful-mendez-ayala', 'session-seen-0003') g where g.is_self),
                 'is told nothing: nobody can see it');
end $$;

do $$ begin raise notice '== it is the same live gauge, and keeps nothing =='; end $$;
do $$
declare before int;
begin
  select count(*) into before from public.watching_now;
  perform seen_by('session-seen-0001');
  perform assert((select count(*) from public.watching_now) = before, 'reading it writes nothing');
  perform assert((select provolatile from pg_proc where proname = 'get_positions') = 's',
                 'get_positions is still declared stable');
  perform assert(not exists (select 1 from information_schema.tables
                              where table_schema = 'public' and table_name ~ 'watch' and table_name <> 'watching_now'),
                 'there is no table of counts: no total, no peak, no yesterday');
  perform assert((select count(*) from pg_proc where proname = 'get_positions') = 1,
                 'one get_positions, so PostgREST never has two to choose between');
  perform assert(pg_get_function_result('public.get_positions(text,text)'::regprocedure)
                   ~ 'pub_id.*is_self.*thanks.*lat.*lng.*direction.*bus_label.*updated_at.*look.*watching',
                 'and it still returns everything the page reads, with the count last');
  perform assert(has_function_privilege('anon', 'public.get_positions(text,text)', 'execute'),
                 'and anyone can call it, as before');
end $$;
