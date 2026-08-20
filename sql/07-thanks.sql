-- ============================================================
--  FEATURE: a rider can say salamat to the bus they can see
--
--  Sharing costs the person on board battery, data and the
--  discipline of leaving the screen on for an hour. Until now
--  nothing came back the other way at all. The strip on the
--  sharing tab was the first half of the answer — it proves the
--  bus reached the map — and this is the second: proof that a
--  person, not just a map, was on the other end.
--
--  WHAT THIS IS NOT, and the reason the shape below looks
--  over-careful for a thank-you button:
--
--   * It is not a score. A count belongs to ONE TRIP and dies
--     with it. The row is a child of bus_positions with an
--     ON DELETE CASCADE, so it is not merely swept away when the
--     trip ends, it cannot outlive it — Stop, a kick, a stale
--     sweep and a dropped connection all take it with them.
--     Nothing accumulates across trips, so no total per person
--     can be built, asked for, or subpoenaed. This matters more
--     than it looks: for-operators.html tells the bus company
--     that this tool cannot be used to review a driver, and a
--     per-driver appreciation total is exactly the metric that
--     promise is about.
--
--   * It is not a public number. get_positions reports the count
--     ONLY on the caller's own row — the one they proved is
--     theirs by passing their own session id as p_self. A count
--     visible next to every bus on the map would rank the buses
--     currently on the road in front of the riders choosing
--     between them, which is a competition nobody signed up for.
--
--   * It does not identify the rider who tapped. What is stored
--     is a salted hash of (watcher id, session id), not the
--     watcher id — so a row here cannot be matched against a row
--     in watching_now, and the same tab thanking two buses
--     leaves two values with nothing in common. It exists only
--     so a second tap on the same bus is the same tap.
--     Nothing returns it, to anyone, ever.
--
--  Honest limit, the same one the watching count carries and for
--  the same reason: say_thanks takes no key, because a watcher
--  has none. Anyone reading the source can call it in a loop
--  with invented watcher ids. The per-trip cap bounds that to a
--  small fixed number rather than an unbounded table, which is
--  the difference between a number that can be exaggerated and a
--  table that can be filled. It is a kind word, not evidence.
--
--  Safe to run more than once.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- The table. A child of the trip, by foreign key.
-- ------------------------------------------------------------
-- (route_slug, session_id) is a unique index on bus_positions, which is
-- what lets this reference it. ON DELETE CASCADE is the whole design:
-- every path that ends a trip already deletes that row, so not one of
-- them has to remember this table exists. ON UPDATE CASCADE for the same
-- reason bus_positions has it — rename_route_slug moves the parent.
create table if not exists public.thanks_now (
  route_slug text not null,
  session_id text not null,
  mark       text not null,
  created_at timestamptz not null default now(),
  primary key (route_slug, session_id, mark),
  foreign key (route_slug, session_id)
    references public.bus_positions (route_slug, session_id)
    on delete cascade on update cascade
);
alter table public.thanks_now enable row level security;

-- ------------------------------------------------------------
-- The cap, as a function, so it has one definition
-- ------------------------------------------------------------
-- Far above what a real trip on this route collects, so reaching it means
-- either a bus everybody loves or somebody feeding it junk. Either way the
-- table stops growing there and the number stops being interesting.
create or replace function public._thanks_cap()
returns integer language sql immutable as $$ select 50; $$;

-- The dedupe key. Deliberately NOT the watcher id: this value is useless
-- for joining against watching_now, or against this table's own rows for
-- another bus, because the session id is inside the hash. All it can do is
-- collide with itself, which is exactly what a second tap should do.
create or replace function public._thanks_mark(p_salt text, p_session text, p_watcher text)
returns text language sql immutable
as $$
  select substr(encode(sha256(convert_to(
    coalesce(p_salt,'') || '|' || coalesce(p_session,'') || '|' || coalesce(p_watcher,''),
    'UTF8')), 'hex'), 1, 32);
$$;

-- ------------------------------------------------------------
-- The write. No key: a watcher does not have one.
-- ------------------------------------------------------------
-- p_pub is the pub_id from get_positions, so the only buses that can be
-- thanked are the ones the caller can already see on the map. The real
-- session id is never in the caller's hands and is not needed here: the
-- hash is recomputed over the route's live rows to find the trip, which
-- costs a scan of at most max_sessions rows.
--
-- Named say_thanks and not anything containing like, fav, vote, star,
-- rate or social. Those substrings are what content-blocker filter lists
-- were written to catch, and a blocked call fails silently. Same lesson
-- as shareBtn and mark_watching — see docs/ARCHITECTURE.md.
create or replace function public.say_thanks(p_slug text, p_pub text, p_watcher text)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare r record; sess text; live int;
begin
  -- same shape as a sharing session id, and short enough that nobody can
  -- use this table as free storage
  if p_watcher is null or p_watcher !~ '^[A-Za-z0-9\-]{8,64}$' then
    raise exception 'invalid watcher';
  end if;
  -- exactly what _pub_id emits, so a malformed one never reaches the scan
  if p_pub is null or p_pub !~ '^[0-9a-f]{32}$' then
    raise exception 'invalid bus';
  end if;

  select pub_salt, greatest(coalesce((settings->>'bus_expiry_min')::int, 10), 1) as exp
    into r from public.routes where slug = p_slug;
  if not found then raise exception 'invalid route'; end if;

  -- Only a bus that is live right now. A pub_id read off the map an hour
  -- ago is not a bus anybody is on.
  select b.session_id into sess
    from public.bus_positions b
   where b.route_slug = p_slug
     and b.updated_at >= now() - make_interval(mins => r.exp)
     and public._pub_id(r.pub_salt, b.session_id) = p_pub;
  -- The trip ended between the map drawing the bus and the thumb landing
  -- on it. Nothing to record and nothing to apologise for: return quietly
  -- rather than put an error in front of someone being kind. It also means
  -- this function cannot be used to test whether a pub_id is live.
  if not found then return; end if;

  select count(*) into live from public.thanks_now t
   where t.route_slug = p_slug and t.session_id = sess;
  if live >= public._thanks_cap() then return; end if;

  insert into public.thanks_now (route_slug, session_id, mark)
  values (p_slug, sess, public._thanks_mark(r.pub_salt, sess, p_watcher))
  on conflict do nothing;

  -- A write, so it sweeps, like every other write here. Reads do not.
  perform public._sweep(p_slug);
end;
$$;

-- ------------------------------------------------------------
-- The read: on your own row only
-- ------------------------------------------------------------
-- Signature changes, so the old one goes rather than gaining an overload:
-- PostgREST cannot choose between two functions of the same name.
drop function if exists public.get_positions(text, text);

create or replace function public.get_positions(p_slug text, p_self text default null)
returns table(pub_id text, is_self boolean, thanks integer,
              lat double precision, lng double precision,
              speed double precision, direction text, bus_label text, updated_at timestamptz)
language sql stable security definer set search_path to 'public'
as $$
  select public._pub_id(r.pub_salt, b.session_id),
         (p_self is not null and b.session_id = p_self),
         -- null for everyone else's bus, not zero: a reader must not be
         -- able to tell a much-thanked bus from a quiet one, and null is
         -- the difference between "not for you" and "none".
         case when p_self is not null and b.session_id = p_self
              then (select count(*)::int from public.thanks_now t
                     where t.route_slug = b.route_slug and t.session_id = b.session_id)
              else null end,
         b.lat, b.lng, b.speed, b.direction, b.bus_label, b.updated_at
    from public.bus_positions b
    join public.routes r on r.slug = b.route_slug
   where b.route_slug = p_slug
     and b.updated_at >= now() - make_interval(
           mins => greatest(coalesce((r.settings->>'bus_expiry_min')::int, 10), 1))
   order by b.updated_at desc;
$$;

-- ------------------------------------------------------------
-- Grants: the helpers stay internal, as everywhere else here
-- ------------------------------------------------------------
revoke execute on function public._thanks_cap() from public, anon, authenticated;
revoke execute on function public._thanks_mark(text, text, text) from public, anon, authenticated;

grant execute on function
  public.say_thanks(text, text, text),
  public.get_positions(text, text)
to anon, authenticated;

commit;
