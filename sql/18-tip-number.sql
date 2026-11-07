-- ============================================================
--  PATCH: tips by a GCash or Maya number, as well as by QR
--
--  16-tips.sql took only a QR Ph code, read from the picture a
--  payment app saves. Two kinds of sharer could not use it: one
--  whose browser has no QR reader of its own (Safari on an iPhone,
--  Firefox), and one who would rather give their number. So "Accept
--  tips?" may now also take a wallet picked from a list, GCash or
--  Maya, and a Philippine mobile number, which a rider who rode the
--  bus sees at "I got off" with a Copy button (November 2026, the
--  maintainer's decision: "WhatsApp already shows everyone's phone
--  number").
--
--  Never free text. The page writes the number in one shape only,
--  'gcash:09171234567' or 'maya:09171234567', and that is all this
--  accepts beside a QR Ph code: no words of anyone's choosing, so
--  nothing for Google Play's rules on content users write, and no way
--  to put a link or a message on a bus.
--
--  The honest cost, which the page states before it keeps a number
--  ("Riders who ride your bus will see this number.") and the privacy
--  panel repeats: every rider offered it sees the sharer's full
--  mobile number, and anyone determined can read it beside the live
--  bus, as with a code. Nothing checks that the number is the
--  sharer's.
--
--  Everything else is 16-tips.sql's and does not change: the code is
--  on the trip's row and goes with it, get_bus_qr hands it out for one
--  bus at a time, three "Not a real bus?" taps hide it, and a ban
--  holds on the number in either wallet. Only the rule for what is
--  kept, _qr_key, and the column's check change.
--
--  Apply after 16-tips.sql. Safe to re-run. Until it is applied, a
--  number a page sends is stored as nothing, as anything else that
--  is not a QR Ph code is, and nobody is offered it.
-- ============================================================

begin;

alter table public.bus_positions drop constraint if exists bus_positions_qr_shape;
alter table public.bus_positions add constraint bus_positions_qr_shape
  check (qr is null
         or (char_length(qr) between 30 and 512 and qr ~ '^000201[ -~]+$')
         or qr ~ '^(gcash|maya):09[0-9]{9}$');

-- As in 16-tips.sql, plus a wallet and a number.
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
  -- A wallet and a mobile number, as the page writes them: the account is
  -- the number, whichever wallet, so a ban on it holds in both.
  if p ~ '^(gcash|maya):09[0-9]{9}$' then
    return 'num:' || substr(p, position(':' in p) + 1);
  end if;
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

revoke execute on function public._qr_key(text) from public, anon, authenticated;

commit;
