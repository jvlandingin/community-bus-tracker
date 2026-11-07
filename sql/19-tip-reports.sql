-- ============================================================
--  FEATURE: anyone shown a sharer's tip QR or number can report it
--
--  A rider who rode a bus that takes tips is shown its sharer's QR or
--  GCash/Maya number when they get off (16-tips.sql, 18-tip-number.sql).
--  Until now the only way to say something was wrong with it was
--  "Not a real bus?", about the bus, not the payment. The maintainer
--  (November 2026): "admin or anyone should be able to report". So the
--  window that shows it has "Report this number" or "Report this QR",
--  and the admin page shows how many beside Ban tips, the organizers'
--  own way to act on it, which they already had.
--
--  The same shape as 15-say-wrong.sql, for the same reasons, through
--  the same call with a third kind, 'tip':
--
--   * A report cannot outlive what it is about: wrong_tip_now is a
--     child of the trip's row, by foreign key with ON DELETE CASCADE,
--     like wrong_bus_now. Nothing accumulates across trips.
--   * It does not identify the rider who tapped: a salted hash of
--     (the bus, the watcher id), prefixed so it never equals the same
--     tab's salamat or "Not a real bus?" mark.
--   * Only an organizer sees a count, beside Ban tips on the admin page.
--   * Only for a live bus on the riders' map that carries a code or a
--     number right now; anything else quietly records nothing.
--
--  Three reports hide the code or number for the rest of that trip,
--  as three "Not a real bus?" taps already did (get_bus_qr), each
--  counted on its own. The one kind of report that acts by itself,
--  because all it can cost a real sharer is one trip's tips: the bus
--  stays on the map.
--
--  say_wrong and get_bus_qr keep their shapes; admin_list_wrong keeps
--  its shape and gains rows of kind 'tip'. A page from before this
--  never sends 'tip'; a page from after it, against a database from
--  before it, is refused with 'invalid kind' and gives the button
--  back.
--
--  Apply after 18-tip-number.sql. Safe to re-run.
-- ============================================================

begin;

create table if not exists public.wrong_tip_now (
  route_slug text not null,
  session_id text not null,
  mark       text not null,
  created_at timestamptz not null default now(),
  primary key (route_slug, session_id, mark),
  foreign key (route_slug, session_id)
    references public.bus_positions (route_slug, session_id)
    on delete cascade on update cascade
);
alter table public.wrong_tip_now enable row level security;

-- As in 15-say-wrong.sql, plus p_kind 'tip': a live bus on the riders' map,
-- by its pub_id, that carries a code or a number right now.
create or replace function public.say_wrong(p_slug text, p_kind text, p_target text, p_watcher text)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare r record; sess text; sig bigint; live int;
begin
  if p_watcher is null or p_watcher !~ '^[A-Za-z0-9\-]{8,64}$' then
    raise exception 'invalid watcher';
  end if;
  if p_kind is null or p_kind not in ('bus', 'sighting', 'tip') then
    raise exception 'invalid kind';
  end if;

  select pub_salt,
         greatest(coalesce((settings->>'bus_expiry_min')::int, 10), 1) as bus_min,
         greatest(coalesce((settings->>'sighting_expiry_min')::int, 120), 5) as sig_min
    into r from public.routes where slug = p_slug;
  if not found then raise exception 'invalid route'; end if;

  if p_kind in ('bus', 'tip') then
    if p_target is null or p_target !~ '^[0-9a-f]{32}$' then
      raise exception 'invalid bus';
    end if;
    select b.session_id into sess
      from public.bus_positions b
     where b.route_slug = p_slug
       and not b.off_route
       and (p_kind = 'bus' or b.qr is not null)
       and b.updated_at >= now() - make_interval(mins => r.bus_min)
       and public._pub_id(r.pub_salt, b.session_id) = p_target;
    if not found then return; end if;

    if p_kind = 'bus' then
      select count(*) into live from public.wrong_bus_now w
       where w.route_slug = p_slug and w.session_id = sess;
      if live >= public._wrong_cap() then return; end if;
      insert into public.wrong_bus_now (route_slug, session_id, mark)
      values (p_slug, sess, public._thanks_mark(r.pub_salt, 'wrong|' || sess, p_watcher))
      on conflict do nothing;
    else
      select count(*) into live from public.wrong_tip_now w
       where w.route_slug = p_slug and w.session_id = sess;
      if live >= public._wrong_cap() then return; end if;
      insert into public.wrong_tip_now (route_slug, session_id, mark)
      values (p_slug, sess, public._thanks_mark(r.pub_salt, 'wrong-tip|' || sess, p_watcher))
      on conflict do nothing;
    end if;
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

-- As in 16-tips.sql, hidden after three reports of either kind.
create or replace function public.get_bus_qr(p_slug text, p_bus text)
returns text language sql stable security definer set search_path to 'public'
as $$
  select b.qr
    from public.bus_positions b
    join public.routes r on r.slug = b.route_slug
   where b.route_slug = p_slug
     and p_bus ~ '^[0-9a-f]{32}$'
     and b.qr is not null
     and not b.off_route
     and b.updated_at >= now() - make_interval(
           mins => greatest(coalesce((r.settings->>'bus_expiry_min')::int, 10), 1))
     and public._pub_id(r.pub_salt, b.session_id) = p_bus
     and (select count(*) from public.wrong_bus_now w
           where w.route_slug = b.route_slug and w.session_id = b.session_id) < public._qr_hide_at()
     and (select count(*) from public.wrong_tip_now w
           where w.route_slug = b.route_slug and w.session_id = b.session_id) < public._qr_hide_at()
     and not public._qr_banned(b.route_slug, r.pub_salt, public._qr_key(b.qr))
   limit 1;
$$;

-- As in 15-say-wrong.sql, plus a count per bus of reports about its tips.
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
    select 'tip'::text, w.session_id, null::bigint, count(*)::int
      from public.wrong_tip_now w
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

grant execute on function
  public.say_wrong(text, text, text, text),
  public.get_bus_qr(text, text),
  public.admin_list_wrong(text, text)
to anon, authenticated;

commit;
