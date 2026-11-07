-- ============================================================
--  FEATURE: a rider can tip the sharer of the bus they rode
--
--  A sharer may switch on "Accept tips?" on the sharing tab and pick
--  the QR code their GCash, Maya or bank app makes for receiving
--  money. While it is on, each position their phone sends carries that
--  code. A rider who told a bus's popup "I'm on this bus", rode it at
--  least a kilometre and taps "I got off" is asked "Say thanks to
--  sharer with a tip/donation?", with the code drawn by their own page.
--  The money goes from the rider's app to the sharer's account, as any
--  QR payment does. Nothing about it passes through here: no amount,
--  no record of who paid, nothing that adds up.
--
--  Only a real QR Ph code is kept (_qr_key below): the EMV layout
--  every Philippine wallet and bank prints, its checksum right, the
--  country PH, a person-to-person or merchant identifier, and no fixed
--  amount, because a tip is the rider's to choose. Anything else is
--  stored as nothing rather than refused, as a bad look is in
--  13-bus-look.sql: a bad code must never cost a position. So the code
--  can never be a link, a word or anything but an account to pay.
--
--  Where it lives: on the trip's own row in bus_positions, overwritten
--  by every write and deleted with the row when the trip ends or
--  expires, like the position. No history of it is kept.
--
--  Who can read it: get_bus_qr hands it out for one live bus on the
--  riders' map at a time, by the public id every map already has, and
--  never in get_positions, so no page holds every bus's code. Reads
--  need no key, which is the honest cost and the reason this is off
--  until a sharer switches it on: while a bus that takes tips is live,
--  anyone determined can read its code, and with it the name, partly
--  masked, that a payment app shows, and any mobile number printed
--  inside it, beside the bus's position. The app's privacy panel and
--  for-operators.html say so.
--
--  Two fences, both about the code and never the bus:
--
--   * Reports hide it. Once a bus has three "Not a real bus?" taps
--     (wrong_bus_now, 15-say-wrong.sql) get_bus_qr stops handing out
--     its code for the rest of the trip. Unlike everything else about
--     reports this acts on its own, because all it can cost a real
--     sharer is one trip's tips: the bus stays on the map.
--
--   * An organizer can ban a code. The ban is kept as a salted hash of
--     the account inside the code, never the code, per route, until an
--     organizer lifts it, so that account cannot be shown on any trip
--     again. Getting round it takes another payment account, which
--     takes another registered SIM: a higher bar than any login. It is
--     the one thing here that outlives a trip, and it is a list an
--     organizer chose to make of scrambled accounts, not of people.
--
--  The two writers gain p_qr with a default, so a page from before
--  this calls them exactly as it did. A page from after this, against
--  a database from before it, is refused for the unknown argument and
--  sends the position again without one.
--
--  Named qr and get_bus_qr, never tip or donate: the request path is
--  what content blockers match.
--
--  Apply after 15-say-wrong.sql. Safe to re-run.
-- ============================================================

begin;

alter table public.bus_positions add column if not exists qr text;
alter table public.bus_positions drop constraint if exists bus_positions_qr_shape;
alter table public.bus_positions add constraint bus_positions_qr_shape
  check (qr is null or (char_length(qr) between 30 and 512 and qr ~ '^000201[ -~]+$'));

-- ------------------------------------------------------------
-- What counts as a QR Ph code
-- ------------------------------------------------------------
-- CRC-16/CCITT-FALSE, as EMV QR codes carry it in field 63: polynomial
-- 0x1021, starting from 0xFFFF, over everything up to and including
-- "6304", written as four upper-case hex digits. Its check value, for
-- '123456789', is 29B1.
create or replace function public._qr_crc(p text)
returns text language plpgsql immutable
as $$
declare
  crc int := 65535;
  b bytea := convert_to(coalesce(p, ''), 'UTF8');
  i int;
  j int;
begin
  for i in 0 .. length(b) - 1 loop
    crc := crc # (get_byte(b, i) << 8);
    for j in 1 .. 8 loop
      if (crc & 32768) <> 0 then crc := ((crc << 1) # 4129) & 65535;
      else crc := (crc << 1) & 65535;
      end if;
    end loop;
  end loop;
  return upper(lpad(to_hex(crc), 4, '0'));
end;
$$;

-- The account inside a QR Ph code, or null when it is not one. The
-- account is every merchant account field (26 to 51) whose identifier,
-- its own field 00, is QR Ph's person-to-person or merchant one, written
-- out whole: what a ban is made of, so a code that differs only in its
-- name, city or checksum is the same account. Never raises: it is
-- called on every write.
create or replace function public._qr_key(p text)
returns text language plpgsql immutable
as $$
declare
  n int;
  i int := 1;
  l int;
  t text;
  v text;
  first boolean := true;
  crc_seen boolean := false;
  country text;
  acct text := '';
  j int;
  sl int;
  guid text;
begin
  if p is null then return null; end if;
  n := char_length(p);
  if n < 30 or n > 512 or p !~ '^[ -~]+$' then return null; end if;
  while i <= n loop
    -- The checksum is the last field: nothing may follow it.
    if crc_seen then return null; end if;
    if substr(p, i, 4) !~ '^[0-9]{4}$' then return null; end if;
    t := substr(p, i, 2);
    l := substr(p, i + 2, 2)::int;
    if l < 1 or i + 3 + l > n then return null; end if;
    v := substr(p, i + 4, l);
    if first and (t <> '00' or v <> '01') then return null; end if;
    first := false;
    if t = '54' then return null; end if;           -- a fixed amount
    if t = '58' then country := v; end if;
    if t = '63' then
      if l <> 4 or upper(v) <> public._qr_crc(substr(p, 1, i + 3)) then return null; end if;
      crc_seen := true;
    end if;
    if t between '26' and '51' then
      -- The template's own fields; 00 is whose scheme it is.
      guid := null;
      j := 1;
      while j <= l loop
        if substr(v, j, 4) !~ '^[0-9]{4}$' then return null; end if;
        sl := substr(v, j + 2, 2)::int;
        if sl < 1 or j + 3 + sl > l then return null; end if;
        if substr(v, j, 2) = '00' then guid := lower(substr(v, j + 4, sl)); end if;
        j := j + 4 + sl;
      end loop;
      if guid in ('com.p2pqrpay', 'ph.ppmi.p2m') then
        acct := acct || t || lpad(l::text, 2, '0') || v;
      end if;
    end if;
    i := i + 4 + l;
  end loop;
  if not crc_seen or country is distinct from 'PH' or acct = '' then return null; end if;
  return acct;
end;
$$;

-- What a ban is kept as: not the account, a salted hash of it, salted
-- per route like every public id here.
create or replace function public._qr_mark(p_salt text, p_key text)
returns text language sql immutable
as $$
  select substr(encode(sha256(convert_to(
    coalesce(p_salt,'') || '|qr|' || coalesce(p_key,''), 'UTF8')), 'hex'), 1, 32);
$$;

-- "Not a real bus?" taps on one bus at which its code stops being handed
-- out, for the rest of that trip.
create or replace function public._qr_hide_at()
returns integer language sql immutable as $$ select 3; $$;

-- ------------------------------------------------------------
-- Bans
-- ------------------------------------------------------------
create table if not exists public.qr_bans (
  route_slug text not null references public.routes (slug) on delete cascade on update cascade,
  mark       text not null,
  created_at timestamptz not null default now(),
  primary key (route_slug, mark)
);
alter table public.qr_bans enable row level security;

create or replace function public._qr_banned(p_slug text, p_salt text, p_key text)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select p_key is not null and exists (
    select 1 from public.qr_bans x
     where x.route_slug = p_slug and x.mark = public._qr_mark(p_salt, p_key));
$$;

-- Sets the code on a row the caller has just written: the code when it is
-- a QR Ph code nobody has banned, otherwise nothing. Every write sets it,
-- so a sharer who switches tips off mid-trip takes none from the next one.
create or replace function public._set_qr(r public.routes, p_session text, p_qr text)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare k text := public._qr_key(p_qr);
begin
  update public.bus_positions
     set qr = case when k is not null and not public._qr_banned(r.slug, r.pub_salt, k)
                   then p_qr end
   where route_slug = r.slug and session_id = p_session;
end;
$$;

-- ------------------------------------------------------------
-- The two writers, with the code
-- ------------------------------------------------------------
-- They change shape, so the old ones go rather than gaining an overload:
-- PostgREST cannot choose between two functions of the same name.
drop function if exists public.set_keyed_position(text, text, text, double precision, double precision, double precision, text, text, text);
drop function if exists public.set_open_position(text, text, double precision, double precision, double precision, text, text, text);

-- As in 14-off-route-private.sql, plus p_qr.
create or replace function public.set_keyed_position(
  p_slug text, p_key text, p_session text,
  p_lat double precision, p_lng double precision, p_speed double precision,
  p_direction text, p_label text, p_look text default null, p_qr text default null)
returns text language plpgsql security definer set search_path to 'public'
as $$
declare
  r public.routes;
  known boolean;
  off boolean;
begin
  select * into r from public.routes where slug = p_slug;
  if r.slug is null then raise exception 'invalid route'; end if;
  known := exists (select 1 from public.bus_positions
                    where route_slug = r.slug and session_id = p_session);

  if p_key is not null and p_key = r.key then
    if public._key_paused(r) and not known then return 'too many tries'; end if;
    off := public._write_position(r, false, false, p_session,
                                  p_lat, p_lng, p_speed, p_direction, p_label, true);
    perform public._set_look(r.slug, p_session, p_look);
    perform public._set_qr(r, p_session, p_qr);
    return case when off then 'private' end;
  end if;

  if p_key is not null and p_key = r.prev_key
     and r.prev_key_expires is not null and r.prev_key_expires > now() then
    off := public._write_position(r, true, false, p_session,
                                  p_lat, p_lng, p_speed, p_direction, p_label, true);
    perform public._set_look(r.slug, p_session, p_look);
    perform public._set_qr(r, p_session, p_qr);
    return case when off then 'private' end;
  end if;

  if public._key_paused(r) then return 'too many tries'; end if;
  if public._is_pin(r.key) and public._key_failed(r.slug) then return 'too many tries'; end if;
  return 'invalid key';
end;
$$;

-- As in 14-off-route-private.sql, plus p_qr.
create or replace function public.set_open_position(
  p_slug text, p_session text,
  p_lat double precision, p_lng double precision, p_speed double precision,
  p_direction text, p_label text, p_look text default null, p_qr text default null)
returns text language plpgsql security definer set search_path to 'public'
as $$
declare
  r public.routes;
  off boolean;
begin
  select * into r from public.routes where slug = p_slug;
  if r.slug is null then raise exception 'invalid route'; end if;
  if (r.settings->'open_sharing') is distinct from 'true'::jsonb then
    raise exception 'open sharing is off';
  end if;
  off := public._write_position(r, false, true, p_session,
                                p_lat, p_lng, p_speed, p_direction, p_label, true);
  perform public._set_look(r.slug, p_session, p_look);
  perform public._set_qr(r, p_session, p_qr);
  return case when off then 'private' end;
end;
$$;

-- ------------------------------------------------------------
-- The read: one bus's code, for a rider who rode it
-- ------------------------------------------------------------
-- By the pub_id off the map, as say_thanks and say_wrong find a bus, and
-- only a live bus on the riders' map: never one outside the route area,
-- one with three "Not a real bus?" taps, or one whose code has been
-- banned since it was written. Nothing for anything else, including a
-- bus that has gone, so this cannot be used to test what is live. A
-- read, so it writes nothing.
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
     and not public._qr_banned(b.route_slug, r.pub_salt, public._qr_key(b.qr))
   limit 1;
$$;

-- ------------------------------------------------------------
-- Organizers: who takes tips, a ban, and lifting them
-- ------------------------------------------------------------
-- It changes what it returns, so the old one goes first. As in
-- 14-off-route-private.sql, plus whether the bus takes tips: a yes or no,
-- never the code, which the organizer has no use for.
drop function if exists public.admin_list_sharers(text, text);
create or replace function public.admin_list_sharers(p_slug text, p_admin text)
returns table(session_id text, lat double precision, lng double precision,
              direction text, bus_label text, updated_at timestamptz, keyless boolean,
              qr boolean)
language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public._require_admin(p_slug, p_admin);
  return query
    select b.session_id, b.lat, b.lng, b.direction, b.bus_label, b.updated_at, b.keyless,
           b.qr is not null
      from public.bus_positions b
     where b.route_slug = p_slug and not b.off_route
     order by b.updated_at desc;
end;
$$;

-- Bans the account in this bus's code, and takes it off every live bus
-- that carries it. True if there was a code to ban.
create or replace function public.admin_ban_qr(p_slug text, p_admin text, p_session text)
returns boolean language plpgsql security definer set search_path to 'public'
as $$
declare
  r public.routes;
  k text;
begin
  r := public._require_admin(p_slug, p_admin);
  select public._qr_key(b.qr) into k from public.bus_positions b
   where b.route_slug = r.slug and b.session_id = p_session;
  if k is null then return false; end if;
  insert into public.qr_bans (route_slug, mark)
  values (r.slug, public._qr_mark(r.pub_salt, k))
  on conflict do nothing;
  update public.bus_positions b set qr = null
   where b.route_slug = r.slug and b.qr is not null and public._qr_key(b.qr) = k;
  return true;
end;
$$;

-- How many accounts are banned on this route. A count, never a list:
-- there is nothing in a ban an organizer could read anyway.
create or replace function public.admin_qr_bans(p_slug text, p_admin text)
returns integer language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public._require_admin(p_slug, p_admin);
  return (select count(*)::int from public.qr_bans where route_slug = p_slug);
end;
$$;

-- Lifts every ban on this route, for an organizer who banned by mistake.
-- All of them, because a ban cannot be told from another: answers how many.
create or replace function public.admin_lift_qr_bans(p_slug text, p_admin text)
returns integer language plpgsql security definer set search_path to 'public'
as $$
declare n int;
begin
  perform public._require_admin(p_slug, p_admin);
  delete from public.qr_bans where route_slug = p_slug;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function
  public._qr_crc(text),
  public._qr_key(text),
  public._qr_mark(text, text),
  public._qr_hide_at(),
  public._qr_banned(text, text, text),
  public._set_qr(public.routes, text, text)
from public, anon, authenticated;

grant execute on function
  public.set_keyed_position(text, text, text, double precision, double precision, double precision, text, text, text, text),
  public.set_open_position(text, text, double precision, double precision, double precision, text, text, text, text),
  public.get_bus_qr(text, text),
  public.admin_list_sharers(text, text),
  public.admin_ban_qr(text, text, text),
  public.admin_qr_bans(text, text),
  public.admin_lift_qr_bans(text, text)
to anon, authenticated;

commit;
