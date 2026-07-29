-- ============================================================
--  FEATURE: how many people have the map open right now
--
--  The admin page could see sharers and nothing else, so the one
--  question an organiser actually asks — is anyone using this? —
--  had no answer beyond guessing. Reads are anonymous and stay
--  that way, so the count has to be built rather than derived.
--
--  What is stored: a random id the watching tab made up for
--  itself, and the time it was last seen. No location, no IP, no
--  user agent, nothing about a person, and nothing that outlives
--  the tab: rows are deleted three minutes after the last beat,
--  so the table only ever holds who is here NOW. The no-history
--  property is untouched — there is still no record of anything
--  having happened, only of what is happening.
--
--  This is the first thing in the system that observes watchers
--  at all, which is why it gives up as much as it can and still
--  answer the question: the count is admin-only (nothing public
--  advertises it), and only a total is ever returned, never the
--  ids behind it. There is no admin function that lists watchers,
--  deliberately, because nothing needs one and its existence
--  would be the interesting thing to steal.
--
--  Honest limits, printed next to the number in the admin page:
--   * it counts open tabs, not people
--   * mark_watching takes no key, because a watcher has none, so
--     anyone could call it in a loop with made-up ids and inflate
--     the number. The per-route cap bounds that to a fixed size
--     rather than an unbounded table, and the count comes back
--     flagged when it is sitting at the cap.
--
--  Safe to run more than once.
-- ============================================================

begin;

create table if not exists public.watching_now (
  route_slug text not null,
  watcher_id text not null,
  last_seen  timestamptz not null default now(),
  primary key (route_slug, watcher_id)
);
alter table public.watching_now enable row level security;

create index if not exists watching_now_seen
  on public.watching_now (route_slug, last_seen);

-- ------------------------------------------------------------
-- The two constants, as functions, so the window and the cap have
-- one definition each instead of a copy in every caller.
-- ------------------------------------------------------------
-- How long after its last beat a tab still counts as watching. The
-- client beats every 60 seconds, so this tolerates one missed beat
-- before someone drops out of the count.
create or replace function public._watching_window()
returns interval language sql immutable as $$ select interval '3 minutes'; $$;

-- Ceiling on rows per route. Far above any real number for this
-- route (the architecture notes put rush hour at 10 to 20, and say
-- to revisit the whole design past 200), so reaching it means
-- either unexpected success or someone inflating it. Either way the
-- table stops growing there.
create or replace function public._watching_cap()
returns integer language sql immutable as $$ select 1000; $$;

-- Cleanup is a delete, not an archive. Nothing is kept.
create or replace function public._sweep_watching(p_slug text)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  delete from public.watching_now
   where route_slug = p_slug and last_seen < now() - public._watching_window();
end;
$$;

-- ------------------------------------------------------------
-- The heartbeat. No key: a watcher does not have one.
-- ------------------------------------------------------------
-- Named mark_watching rather than anything containing ping, track,
-- stat or count on purpose. Those substrings in a request path are
-- filter-list targets, and a blocked heartbeat fails silently and
-- undercounts, which is worse than not having the number at all.
-- See "Content blockers" in docs/ARCHITECTURE.md.
create or replace function public.mark_watching(p_slug text, p_watcher text)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare seen timestamptz; live int;
begin
  -- same shape as a sharing session id: unguessable, and short
  -- enough that a caller cannot use this table as free storage
  if p_watcher is null or p_watcher !~ '^[A-Za-z0-9\-]{8,64}$' then
    raise exception 'invalid watcher';
  end if;
  if not exists (select 1 from public.routes where slug = p_slug) then
    raise exception 'invalid route';
  end if;

  select last_seen into seen from public.watching_now
   where route_slug = p_slug and watcher_id = p_watcher;

  if seen is not null then
    -- flood guard: beating faster than the client does costs a
    -- lookup and nothing else. Not an error, because a watcher has
    -- done nothing wrong and the page must not care either way.
    if now() - seen < interval '10 seconds' then return; end if;
    update public.watching_now set last_seen = now()
     where route_slug = p_slug and watcher_id = p_watcher;
    perform public._sweep_watching(p_slug);
    return;
  end if;

  perform public._sweep_watching(p_slug);

  select count(*) into live from public.watching_now where route_slug = p_slug;
  if live >= public._watching_cap() then
    -- saturate quietly. Refusing loudly would put an error in front
    -- of someone who is only looking at a map.
    return;
  end if;

  insert into public.watching_now (route_slug, watcher_id, last_seen)
  values (p_slug, p_watcher, now())
  on conflict (route_slug, watcher_id) do update set last_seen = now();
end;
$$;

-- Ordinary writes clean it up too, so a route nobody is watching
-- does not sit on rows until the next watcher happens to arrive.
create or replace function public._sweep(p_slug text)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare bus_min int; sig_min int;
begin
  select coalesce((settings->>'bus_expiry_min')::int, 10),
         coalesce((settings->>'sighting_expiry_min')::int, 120)
    into bus_min, sig_min
    from public.routes where slug = p_slug;
  delete from public.bus_positions
   where route_slug = p_slug
     and updated_at < now() - make_interval(mins => greatest(bus_min, 1) * 2);
  delete from public.sightings
   where route_slug = p_slug
     and created_at < now() - make_interval(mins => greatest(sig_min, 5));
  delete from public.kicked_sessions
   where route_slug = p_slug and until < now();
  perform public._sweep_watching(p_slug);
end;
$$;

-- ------------------------------------------------------------
-- The read. Admin key required, and a total only.
-- ------------------------------------------------------------
create or replace function public.admin_watching_count(p_slug text, p_admin text)
returns table(watching integer, capped boolean)
language plpgsql security definer set search_path to 'public'
as $$
declare n int;
begin
  perform public._require_admin(p_slug, p_admin);
  select count(*) into n from public.watching_now w
   where w.route_slug = p_slug
     and w.last_seen > now() - public._watching_window();
  return query select n, n >= public._watching_cap();
end;
$$;

-- ------------------------------------------------------------
-- Grants: the helpers stay internal, as everywhere else here
-- ------------------------------------------------------------
revoke execute on function public._watching_window() from public, anon, authenticated;
revoke execute on function public._watching_cap() from public, anon, authenticated;
revoke execute on function public._sweep_watching(text) from public, anon, authenticated;
revoke execute on function public._sweep(text) from public, anon, authenticated;

grant execute on function
  public.mark_watching(text, text),
  public.admin_watching_count(text, text)
to anon, authenticated;

commit;
