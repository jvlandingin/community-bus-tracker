-- Tests for sql/16-tips.sql.
--
-- A sharer who switches on "Accept tips?" sends their payment QR code with
-- each position; a rider who rode the bus can read it, one bus at a time.
-- Most checks here are about what the code must never be (a link, a word,
-- a fixed amount, anything but a QR Ph account), who may never read it,
-- and what may never outlive the trip: only a ban an organizer chose.
--
-- The sample codes are made up (account 000000000000, mobile +63-9000000000,
-- which no network issues) and their checksums were worked out by a separate
-- implementation, so _qr_crc is checked against something other than itself.
--
-- Run against a freshly migrated database.
\set ON_ERROR_STOP on
set client_min_messages to notice;

-- assert helpers, plus setup steps A and B
\ir _prelude.sql

-- A: a person-to-person code, as a payment app prints one.
-- A2: the same account with another city and point of initiation.
-- B: another account. M: a merchant code. AMT: a fixed amount.
-- SG: another country. NOG: no QR Ph identifier.
create or replace function q(name text) returns text language sql immutable as $$
  select case name
    when 'A'   then '00020101021127770012com.p2pqrpay0111GXCHPHM2XXX02089996440304120000000000000514+63-90000000005204601653036085802PH5912JU*N D*** C.6005Kawit6304DBEA'
    when 'A2'  then '00020101021227770012com.p2pqrpay0111GXCHPHM2XXX02089996440304120000000000000514+63-90000000005204601653036085802PH5912JU*N D*** C.6004Imus6304150F'
    when 'B'   then '00020101021127590012com.p2pqrpay0111GXCHPHM2XXX02089996440304120000000000015204601653036085802PH5908MA*** S.6006Bacoor6304F3B3'
    when 'M'   then '00020101021128460011ph.ppmi.p2m0111PAPHPHM1XXX03120000000000025204581253036085802PH5909SARI SARI6006Silang63046CAA'
    when 'AMT' then '00020101021227770012com.p2pqrpay0111GXCHPHM2XXX02089996440304120000000000000514+63-9000000000520460165303608540550.005802PH5912JU*N D*** C.6005Kawit6304E50B'
    when 'SG'  then '00020101021127770012com.p2pqrpay0111GXCHPHM2XXX02089996440304120000000000000514+63-90000000005204601653037025802SG5912JU*N D*** C.6005Kawit6304C225'
    when 'NOG' then '00020101021127240015com.example.pay0101X5204601653036085802PH5901X6005Kawit630431AF'
  end;
$$;

create or replace function shared_key() returns text language sql as $$
  select key from public.routes where slug = 'wonderful-mendez-ayala';
$$;
create or replace function t_pub(s text) returns text language sql as $$
  select public._pub_id((select pub_salt from public.routes where slug='wonderful-mendez-ayala'), s);
$$;
create or replace function put(s text, code text, lat double precision default 14.4) returns text language sql as $$
  select public.set_keyed_position('wonderful-mendez-ayala', shared_key(), s, lat, 120.9, null, 'north', null, null, code);
$$;
create or replace function stored(s text) returns text language sql as $$
  select qr from public.bus_positions where route_slug = 'wonderful-mendez-ayala' and session_id = s;
$$;
create or replace function read_qr(s text) returns text language sql as $$
  select public.get_bus_qr('wonderful-mendez-ayala', t_pub(s));
$$;
-- lets the same session write again without waiting out the 2 second limit
create or replace function age(s text) returns void language sql as $$
  update public.bus_positions set updated_at = now() - interval '5 seconds' where session_id = s;
$$;

do $$ begin raise notice '== what counts as a QR Ph code =='; end $$;
do $$
begin
  perform assert(public._qr_crc('123456789') = '29B1', 'the checksum is CRC-16/CCITT-FALSE, by its check value');
  perform assert(public._qr_crc(substr(q('A'), 1, char_length(q('A')) - 4)) = 'DBEA',
                 'and agrees with a separate implementation on a whole code');
  perform assert(public._qr_key(q('A')) is not null, 'a person-to-person code is one');
  perform assert(public._qr_key(q('M')) is not null, 'so is a merchant one');
  perform assert(public._qr_key(q('A')) = public._qr_key(q('A2')),
                 'the account is the same whatever the city, name or checksum around it');
  perform assert(public._qr_key(q('A')) <> public._qr_key(q('B')), 'and two accounts differ');
  perform assert(public._qr_key(lower(q('A'))) is null, 'a code with its fields mangled is not one');
  perform assert(public._qr_key(overlay(q('A') placing 'DBEB' from char_length(q('A')) - 3)) is null,
                 'nor is one with a wrong checksum');
  perform assert(public._qr_key(q('A') || '0102XX') is null, 'nor one with anything after the checksum');
  perform assert(public._qr_key(q('AMT')) is null, 'nor one with a fixed amount: a tip is the rider''s to choose');
  perform assert(public._qr_key(q('SG')) is null, 'nor one from another country');
  perform assert(public._qr_key(q('NOG')) is null, 'nor one that is not QR Ph''s');
  perform assert(public._qr_key('https://example.com/pay?to=me') is null, 'a link is not one');
  perform assert(public._qr_key('Salamat po sa inyo lahat') is null, 'nor are words');
  perform assert(public._qr_key(null) is null and public._qr_key('') is null, 'nor is nothing');
  perform assert(public._qr_key(substr(q('A'), 1, 40)) is null, 'nor half a code');
  perform assert(public._qr_key('000201' || repeat('9', 600)) is null, 'nor anything longer than any code');
end $$;

do $$ begin raise notice '== a code goes with a position, and only a real one =='; end $$;
do $$
begin
  delete from public.bus_positions;
  perform assert(put('session-tip-0001', q('A')) is null, 'a write with a code goes in');
  perform assert(stored('session-tip-0001') = q('A'), 'and the code is kept on the trip''s row, unchanged');
  perform age('session-tip-0001');
  perform assert(put('session-tip-0001', 'https://example.com/pay') is null,
                 'a write with something else is still a write: a bad code costs nothing but the code');
  perform assert(stored('session-tip-0001') is null, 'and is stored as nothing');
  perform age('session-tip-0001');
  perform put('session-tip-0001', q('AMT'));
  perform assert(stored('session-tip-0001') is null, 'so is a fixed amount');
  perform age('session-tip-0001');
  perform put('session-tip-0001', q('A'));
  perform age('session-tip-0001');
  perform assert(put('session-tip-0001', null) is null and stored('session-tip-0001') is null,
                 'a write without one takes tips off from that write on');
  perform assert_err(
    $q$ update public.bus_positions set qr = 'free text' where session_id = 'session-tip-0001' $q$,
    'bus_positions_qr_shape', 'the table refuses any other shape too');
end $$;

do $$ begin raise notice '== a page from before this is unaffected =='; end $$;
do $$
begin
  perform assert(public.set_keyed_position('wonderful-mendez-ayala', shared_key(), 'session-tip-0002',
                   14.41, 120.91, null, 'south', '98019') is null,
                 'the writer still answers a call with no code at all');
  perform assert(public.set_keyed_position('wonderful-mendez-ayala', shared_key(), 'session-tip-0003',
                   14.42, 120.92, null, 'south', '98020', '1Fc') is null,
                 'or with a look and no code');
  perform assert(stored('session-tip-0002') is null and stored('session-tip-0003') is null,
                 'and those buses take no tips');
  perform assert((select count(*) from pg_proc where proname = 'set_keyed_position') = 1 and
                 (select count(*) from pg_proc where proname = 'set_open_position') = 1 and
                 (select count(*) from pg_proc where proname = 'admin_list_sharers') = 1,
                 'one function of each name, so PostgREST never has two to choose between');
  perform assert(not exists (select 1 from public.get_positions('wonderful-mendez-ayala') g
                              where row_to_json(g)::text like '%com.p2pqrpay%'),
                 'and the map''s read never carries it: no page holds every bus''s code');
end $$;

do $$ begin raise notice '== one bus''s code, for a rider who rode it =='; end $$;
do $$
begin
  perform age('session-tip-0001');
  perform put('session-tip-0001', q('A'));
  perform assert(read_qr('session-tip-0001') = q('A'), 'a rider reads a bus''s code by its public id');
  perform assert(read_qr('session-tip-0002') is null, 'a bus that takes no tips has none');
  perform assert(public.get_bus_qr('wonderful-mendez-ayala', 'session-tip-0001') is null,
                 'never by the real session id');
  perform assert(public.get_bus_qr('wonderful-mendez-ayala', 'not-a-bus') is null, 'nor by anything else');
  perform assert(public.get_bus_qr('another-route', t_pub('session-tip-0001')) is null,
                 'nor on another route');
  perform assert(public.get_bus_qr('wonderful-mendez-ayala', t_pub('session-gone-0009')) is null,
                 'a bus that has gone answers nothing, so this cannot test what is live');
  update public.bus_positions set updated_at = now() - interval '2 hours' where session_id = 'session-tip-0001';
  perform assert(read_qr('session-tip-0001') is null, 'nor does a bus gone quiet past the expiry');
  update public.bus_positions set updated_at = now() - interval '5 seconds' where session_id = 'session-tip-0001';
end $$;

do $$ begin raise notice '== outside the route area, nobody else sees it =='; end $$;
do $$
begin
  perform assert(put('session-tip-0004', q('B'), 10.3) = 'private', 'a bus outside the area is its own phone''s');
  perform assert(stored('session-tip-0004') = q('B'), 'its code is kept with it');
  perform assert(read_qr('session-tip-0004') is null, 'but no rider can read it');
end $$;

do $$ begin raise notice '== three "Not a real bus?" taps hide the code, not the bus =='; end $$;
do $$
declare p text := t_pub('session-tip-0001');
begin
  perform public.say_wrong('wonderful-mendez-ayala', 'bus', p, 'watch-tip-aaaa-1');
  perform public.say_wrong('wonderful-mendez-ayala', 'bus', p, 'watch-tip-bbbb-2');
  perform assert(read_qr('session-tip-0001') = q('A'), 'two taps change nothing');
  perform public.say_wrong('wonderful-mendez-ayala', 'bus', p, 'watch-tip-cccc-3');
  perform assert(read_qr('session-tip-0001') is null, 'the third stops the code being handed out');
  perform assert((select count(*) from public.get_positions('wonderful-mendez-ayala') g where g.pub_id = p) = 1,
                 'and the bus stays on the map');
  perform assert(stored('session-tip-0001') = q('A'), 'nothing was written by a read');
  perform public.clear_bus_position('wonderful-mendez-ayala', 'session-tip-0001');
  perform put('session-tip-0001', q('A'));
  perform assert(read_qr('session-tip-0001') = q('A'), 'a new trip starts clean: the taps went with the old one');
end $$;

do $$ begin raise notice '== an organizer can ban an account =='; end $$;
do $$
declare n int;
begin
  perform put('session-tip-0005', q('A2'), 14.45);
  perform assert((select qr from public.admin_list_sharers('wonderful-mendez-ayala', 'my-long-admin-key-42')
                   where session_id = 'session-tip-0005'),
                 'the organizer''s list says which buses take tips');
  perform assert(not exists (select 1 from information_schema.routines r
                              join information_schema.parameters x on x.specific_name = r.specific_name
                             where r.routine_name = 'admin_list_sharers' and x.data_type = 'text'
                               and x.parameter_mode = 'OUT' and x.parameter_name = 'qr'),
                 'a yes or no, never the code');
  perform assert_err($q$ select public.admin_ban_qr('wonderful-mendez-ayala', 'wrong-key', 'session-tip-0001') $q$,
                     'invalid admin key', 'banning needs the admin key');
  perform assert(public.admin_ban_qr('wonderful-mendez-ayala', 'my-long-admin-key-42', 'session-tip-0001'),
                 'a code is banned from the bus that carries it');
  perform assert(stored('session-tip-0001') is null and stored('session-tip-0005') is null,
                 'and taken off every live bus with the same account, whatever its city');
  perform assert(not exists (select 1 from public.qr_bans where mark like '%com.p2pqrpay%' or mark like '%0000000000%'),
                 'the ban is a scrambled mark, never the account');
  perform age('session-tip-0001');
  perform put('session-tip-0001', q('A'));
  perform assert(stored('session-tip-0001') is null, 'a banned account is stored as nothing on the next write');
  perform put('session-tip-0006', q('A2'), 14.46);
  perform assert(stored('session-tip-0006') is null, 'nor on another trip');
  perform put('session-tip-0007', q('B'), 14.47);
  perform assert(read_qr('session-tip-0007') = q('B'), 'another account is untouched');
  perform assert(not public.admin_ban_qr('wonderful-mendez-ayala', 'my-long-admin-key-42', 'session-tip-0002'),
                 'a bus without a code has nothing to ban');
  perform assert(public.admin_qr_bans('wonderful-mendez-ayala', 'my-long-admin-key-42') = 1,
                 'the organizer sees how many are banned');
  -- Banned after it was written: the read checks too.
  update public.bus_positions set qr = q('B') where session_id = 'session-tip-0002';
  perform public.admin_ban_qr('wonderful-mendez-ayala', 'my-long-admin-key-42', 'session-tip-0007');
  update public.bus_positions set qr = q('B') where session_id = 'session-tip-0002';
  perform assert(read_qr('session-tip-0002') is null, 'a banned code is never handed out, however it got there');
  n := public.admin_lift_qr_bans('wonderful-mendez-ayala', 'my-long-admin-key-42');
  perform assert(n = 2, 'lifting answers how many');
  perform assert(public.admin_qr_bans('wonderful-mendez-ayala', 'my-long-admin-key-42') = 0, 'and leaves none');
  perform age('session-tip-0001');
  perform put('session-tip-0001', q('A'));
  perform assert(read_qr('session-tip-0001') = q('A'), 'a lifted account takes tips again');
end $$;

do $$ begin raise notice '== without the key, with open sharing on =='; end $$;
do $$
declare s jsonb;
begin
  select settings into s from public.routes where slug = 'wonderful-mendez-ayala';
  perform public.admin_set_settings('wonderful-mendez-ayala', 'my-long-admin-key-42', s || '{"open_sharing":true}'::jsonb);
  perform assert(public.set_open_position('wonderful-mendez-ayala', 'session-tip-0008', 14.48, 120.9, null,
                   'north', null, null, q('M')) is null, 'the keyless writer takes a code too');
  perform assert(read_qr('session-tip-0008') = q('M'), 'and a rider reads it the same way');
  perform public.admin_set_settings('wonderful-mendez-ayala', 'my-long-admin-key-42', s);
end $$;

do $$ begin raise notice '== it goes when the trip does =='; end $$;
do $$
begin
  perform public.clear_bus_position('wonderful-mendez-ayala', 'session-tip-0001');
  perform assert(read_qr('session-tip-0001') is null, 'Stop takes the row, and the code with it');
  perform public.admin_kick('wonderful-mendez-ayala', 'my-long-admin-key-42', 'session-tip-0007');
  perform assert(stored('session-tip-0007') is null, 'so does an organizer''s Stop');
  perform assert(not exists (select 1 from information_schema.columns
                              where table_schema = 'public' and column_name = 'qr'
                                and table_name <> 'bus_positions'),
                 'there is no table of codes to outlive a trip');
  perform assert(not exists (select 1 from information_schema.columns
                              where table_schema = 'public' and table_name = 'qr_bans'
                                and column_name not in ('route_slug', 'mark', 'created_at')),
                 'and a ban keeps a route, a scrambled mark and a date, nothing else');
end $$;

do $$ begin raise notice '== a renamed route keeps its bans =='; end $$;
do $$
begin
  perform assert(stored('session-tip-0008') is null,
                 'switching open sharing off took the keyless bus, and its code, with it');
  perform put('session-tip-0009', q('B'), 14.49);
  perform assert(public.admin_ban_qr('wonderful-mendez-ayala', 'my-long-admin-key-42', 'session-tip-0009'),
                 'a ban to carry over');
  perform public.rename_route_slug('wonderful-mendez-ayala', 'renamed-route-tip');
  perform assert(public.admin_qr_bans('renamed-route-tip', 'my-long-admin-key-42') = 1,
                 'the ban follows the route');
  perform public.rename_route_slug('renamed-route-tip', 'wonderful-mendez-ayala');
end $$;

do $$ begin raise notice '== who can call what =='; end $$;
do $$
begin
  perform assert(not has_function_privilege('anon', 'public._qr_key(text)', 'execute') and
                 not has_function_privilege('anon', 'public._qr_crc(text)', 'execute') and
                 not has_function_privilege('anon', 'public._set_qr(public.routes, text, text)', 'execute') and
                 not has_function_privilege('anon', 'public._qr_banned(text, text, text)', 'execute'),
                 'the helpers are not callable from outside');
  perform assert(has_function_privilege('anon', 'public.get_bus_qr(text, text)', 'execute') and
                 has_function_privilege('anon', 'public.admin_ban_qr(text, text, text)', 'execute') and
                 has_function_privilege('anon',
                   'public.set_keyed_position(text, text, text, double precision, double precision, double precision, text, text, text, text)',
                   'execute'),
                 'the writers, the read and the admin calls are');
  perform assert((select provolatile from pg_proc where proname = 'get_bus_qr') = 's',
                 'the read is declared stable: it writes nothing');
end $$;
