-- ============================================================
--  FEATURE: a rider can say a bus or a sighting is wrong
--
--  Two things on the map can mislead a rider standing at the
--  roadside: a bus that is not a bus (somebody sharing from a car,
--  a jeepney, their house) and a sighting of one that never was.
--  Until now the only people who could notice were organizers
--  watching admin.html. This lets anybody who can see one say so
--  with one tap, and puts the count beside the Stop and Delete
--  buttons organizers already have.
--
--  Google Play expects it too: an app whose content comes from its
--  users has to let them report it, and every bus on this map is
--  one a user put there.
--
--  The same shape as 07-thanks.sql, for the same reasons:
--
--   * A report cannot outlive what it is about. Both tables are
--     children, by foreign key with ON DELETE CASCADE, of the bus
--     row and the sighting row, so a trip that ends or a sighting
--     that expires takes its reports with it, and Stop or Delete
--     from the admin page clears them. Nothing accumulates across
--     trips: no list of reported sharers can be built.
--
--   * It does not identify the rider who tapped. What is stored is
--     a salted hash of (what was reported, watcher id), so a row
--     here cannot be matched against watching_now or thanks_now,
--     and it exists only so a second tap is the same tap.
--
--   * Nobody but an organizer sees a count. Not the riders, who
--     would read one as a verdict on the bus, and not the sharer,
--     who would be told nothing they could act on. It does nothing
--     by itself: no number of reports takes a bus off the map,
--     because one person with a few tabs could then take a real one
--     off. An organizer reads it and decides.
--
--  Honest limit, as for salamat: say_wrong takes no key, because a
--  watcher has none, so anyone reading the source can call it with
--  invented watcher ids. The cap per bus and per sighting bounds
--  that to a fixed number. A count is a reason to look, not proof.
--
--  Named say_wrong, not report_*: the request path is what content
--  blockers match, and a blocked report fails where nobody sees it.
--
--  Apply after 14-off-route-private.sql. Safe to re-run.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- The tables. Children of what they are about, by foreign key.
-- ------------------------------------------------------------
-- As thanks_now: (route_slug, session_id) is unique on bus_positions, and
-- every path that ends a trip deletes that row. ON UPDATE CASCADE because
-- rename_route_slug moves the parent.
create table if not exists public.wrong_bus_now (
  route_slug text not null,
  session_id text not null,
  mark       text not null,
  created_at timestamptz not null default now(),
  primary key (route_slug, session_id, mark),
  foreign key (route_slug, session_id)
    references public.bus_positions (route_slug, session_id)
    on delete cascade on update cascade
);
alter table public.wrong_bus_now enable row level security;

-- sid is unique on sightings (01-base.sql) and never changes, so it is the
-- whole link; the route is the sighting's own.
create table if not exists public.wrong_sighting_now (
  sid        bigint not null references public.sightings (sid) on delete cascade,
  mark       text not null,
  created_at timestamptz not null default now(),
  primary key (sid, mark)
);
alter table public.wrong_sighting_now enable row level security;

-- Far above what a real mistake collects. Past it the tables stop growing
-- and the organizer has already been told plenty.
create or replace function public._wrong_cap()
returns integer language sql immutable as $$ select 50; $$;

-- ------------------------------------------------------------
-- The write. No key: a watcher does not have one.
-- ------------------------------------------------------------
-- p_kind is 'bus' or 'sighting'. For a bus, p_target is the pub_id off
-- the map, found among the route's live rows as say_thanks does it, and
-- never a bus outside the route area, which no rider can see. For a
-- sighting, it is the sid get_sightings already returns, and only one
-- still on the board.
--
-- Something that has gone is not an error: it returns quietly, as
-- say_thanks does, so this cannot be used to test what is live.
create or replace function public.say_wrong(p_slug text, p_kind text, p_target text, p_watcher text)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare r record; sess text; sig bigint; live int;
begin
  if p_watcher is null or p_watcher !~ '^[A-Za-z0-9\-]{8,64}$' then
    raise exception 'invalid watcher';
  end if;
  if p_kind is null or p_kind not in ('bus', 'sighting') then
    raise exception 'invalid kind';
  end if;

  select pub_salt,
         greatest(coalesce((settings->>'bus_expiry_min')::int, 10), 1) as bus_min,
         greatest(coalesce((settings->>'sighting_expiry_min')::int, 120), 5) as sig_min
    into r from public.routes where slug = p_slug;
  if not found then raise exception 'invalid route'; end if;

  if p_kind = 'bus' then
    if p_target is null or p_target !~ '^[0-9a-f]{32}$' then
      raise exception 'invalid bus';
    end if;
    select b.session_id into sess
      from public.bus_positions b
     where b.route_slug = p_slug
       and not b.off_route
       and b.updated_at >= now() - make_interval(mins => r.bus_min)
       and public._pub_id(r.pub_salt, b.session_id) = p_target;
    if not found then return; end if;

    select count(*) into live from public.wrong_bus_now w
     where w.route_slug = p_slug and w.session_id = sess;
    if live >= public._wrong_cap() then return; end if;

    -- 'wrong|' keeps this mark from ever equalling the same tab's salamat
    -- mark for the same bus.
    insert into public.wrong_bus_now (route_slug, session_id, mark)
    values (p_slug, sess, public._thanks_mark(r.pub_salt, 'wrong|' || sess, p_watcher))
    on conflict do nothing;
  else
    if p_target is null or p_target !~ '^[0-9]{1,18}$' then
      raise exception 'invalid sighting';
    end if;
    select s.sid into sig
      from public.sightings s
     where s.route_slug = p_slug
       and s.sid = p_target::bigint
       and s.created_at >= now() - make_interval(mins => r.sig_min);
    if not found then return; end if;

    select count(*) into live from public.wrong_sighting_now w where w.sid = sig;
    if live >= public._wrong_cap() then return; end if;

    insert into public.wrong_sighting_now (sid, mark)
    values (sig, public._thanks_mark(r.pub_salt, 'wrong-sighting|' || sig, p_watcher))
    on conflict do nothing;
  end if;

  -- A write, so it sweeps, like every other write here. Reads do not.
  perform public._sweep(p_slug);
end;
$$;

-- ------------------------------------------------------------
-- The read: organizers only, a count per thing and nothing else
-- ------------------------------------------------------------
-- The real session id, because Stop takes one and admin_list_sharers
-- already hands it out behind the same key. Never a mark.
create or replace function public.admin_list_wrong(p_slug text, p_admin text)
returns table(kind text, session_id text, sid bigint, reports integer)
language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public._require_admin(p_slug, p_admin);
  return query
    select 'bus'::text, w.session_id, null::bigint, count(*)::int
      from public.wrong_bus_now w
     where w.route_slug = p_slug
     group by w.session_id
    union all
    select 'sighting'::text, null::text, w.sid, count(*)::int
      from public.wrong_sighting_now w
      join public.sightings s on s.sid = w.sid
     where s.route_slug = p_slug
     group by w.sid;
end;
$$;

revoke execute on function public._wrong_cap() from public, anon, authenticated;

grant execute on function
  public.say_wrong(text, text, text, text),
  public.admin_list_wrong(text, text)
to anon, authenticated;

commit;
