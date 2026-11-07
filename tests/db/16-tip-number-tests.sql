-- Tests for sql/18-tip-number.sql.
--
-- "Accept tips?" may take a GCash or Maya number as well as a QR Ph code.
-- Most checks here are about what it must never become: free text, a
-- link, a number in any shape but the one the page writes, or a way round
-- a ban by switching wallets. Everything else is 16-tips.sql's, held by
-- 14-tips-tests.sql, and re-checked here for a number.
--
-- Run against a freshly migrated database.
\set ON_ERROR_STOP on
set client_min_messages to notice;

-- assert helpers, plus setup steps A and B
\ir _prelude.sql

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
create or replace function age(s text) returns void language sql as $$
  update public.bus_positions set updated_at = now() - interval '5 seconds' where session_id = s;
$$;

do $$ begin raise notice '== a wallet and a number, in the page''s one shape =='; end $$;
do $$
begin
  perform assert(public._qr_key('gcash:09000000000') = 'num:09000000000', 'a GCash number is an account');
  perform assert(public._qr_key('maya:09000000000') = 'num:09000000000', 'and the same number in Maya is the same account');
  perform assert(public._qr_key('gcash:09000000001') <> public._qr_key('gcash:09000000000'), 'two numbers differ');
  perform assert(public._qr_key('gcash:0900 000 0000') is null and public._qr_key('gcash:+639000000000') is null and
                 public._qr_key('gcash:9000000000') is null,
                 'only the shape the page writes: no spaces, no +63, no missing 0');
  perform assert(public._qr_key('gcash:08000000000') is null and public._qr_key('gcash:0900000000') is null and
                 public._qr_key('gcash:090000000000') is null,
                 'a Philippine mobile number only: 09 and nine more digits');
  perform assert(public._qr_key('paypal:09000000000') is null and public._qr_key('GCash:09000000000') is null and
                 public._qr_key('09000000000') is null,
                 'GCash or Maya, picked, never another word');
  perform assert(public._qr_key('gcash:09000000000 salamat po') is null and public._qr_key('gcash:09000000000\nhi') is null,
                 'and nothing written after it');
  perform assert(public._qr_key('Send tips to 09000000000') is null and public._qr_key('https://gcash.example/09000000000') is null,
                 'so a number can never come with free text or a link');
end $$;

do $$ begin raise notice '== it goes with a position, and to a rider who rode the bus =='; end $$;
do $$
begin
  delete from public.bus_positions;
  perform assert(put('session-num-0001', 'gcash:09000000000') is null, 'a write with a number goes in');
  perform assert(stored('session-num-0001') = 'gcash:09000000000', 'and the number is kept on the trip''s row, as written');
  perform assert(read_qr('session-num-0001') = 'gcash:09000000000', 'a rider reads it by the bus''s public id, as a code');
  perform age('session-num-0001');
  perform put('session-num-0001', 'Send tips to 09000000000');
  perform assert(stored('session-num-0001') is null, 'free text is stored as nothing, and the position still goes in');
  perform age('session-num-0001');
  perform put('session-num-0001', 'maya:09000000002');
  perform assert(read_qr('session-num-0001') = 'maya:09000000002', 'a Maya number too');
  perform assert_err(
    $q$ update public.bus_positions set qr = 'gcash: call me' where session_id = 'session-num-0001' $q$,
    'bus_positions_qr_shape', 'the table refuses any other shape');
  perform assert(not exists (select 1 from public.get_positions('wonderful-mendez-ayala') g
                              where row_to_json(g)::text like '%0900000000%'),
                 'and the map''s read never carries it');
end $$;

do $$ begin raise notice '== reports and bans hold for a number as for a code =='; end $$;
do $$
declare p text := t_pub('session-num-0001');
begin
  perform public.say_wrong('wonderful-mendez-ayala', 'bus', p, 'watch-num-aaaa-1');
  perform public.say_wrong('wonderful-mendez-ayala', 'bus', p, 'watch-num-bbbb-2');
  perform public.say_wrong('wonderful-mendez-ayala', 'bus', p, 'watch-num-cccc-3');
  perform assert(read_qr('session-num-0001') is null, 'three "Not a real bus?" taps hide a number');
  perform put('session-num-0002', 'gcash:09000000003', 14.41);
  perform assert(public.admin_ban_qr('wonderful-mendez-ayala', 'my-long-admin-key-42', 'session-num-0002'),
                 'an organizer can ban a number');
  perform assert(stored('session-num-0002') is null, 'which takes it off the bus');
  perform put('session-num-0003', 'maya:09000000003', 14.42);
  perform assert(stored('session-num-0003') is null, 'and the same number in the other wallet is banned too');
  perform put('session-num-0004', 'gcash:09000000004', 14.43);
  perform assert(read_qr('session-num-0004') = 'gcash:09000000004', 'another number is untouched');
  perform assert(not exists (select 1 from public.qr_bans where mark like '%0900%'), 'the ban is a scrambled mark, never the number');
end $$;

do $$ begin raise notice '== a QR still works as before =='; end $$;
do $$
declare a text := '00020101021127770012com.p2pqrpay0111GXCHPHM2XXX02089996440304120000000000000514+63-90000000005204601653036085802PH5912JU*N D*** C.6005Kawit6304DBEA';
begin
  perform put('session-num-0005', a, 14.44);
  perform assert(read_qr('session-num-0005') = a, 'a QR Ph code is kept and read back unchanged');
  perform assert(public._qr_key('https://example.com') is null and public._qr_key('') is null and public._qr_key(null) is null,
                 'and what was never a code is still nothing');
  perform assert(not has_function_privilege('anon', 'public._qr_key(text)', 'execute'), 'the rule is not callable from outside');
end $$;
