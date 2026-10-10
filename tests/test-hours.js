// Tests the multi-window operating hours logic exactly as shipped.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const block = html.slice(html.indexOf('// ---- Operating hours (unit tested)'),
                         html.indexOf('// ---- END operating hours'));
const S = {};
new Function('S', 'let SET={hours:{north:[],south:[]}};' + block +
  'S.parseHM=parseHM;S.fmtHM=fmtHM;S.withinWindows=withinWindows;S.hoursLabel=function(d,w){SET.hours[d]=w;return hoursLabel(d);};' +
  'S.nextTrip=function(d,w,m){SET.hours[d]=w;return nextTrip(d,m);};' +
  'S.serviceState=serviceState;S.inParolSeason=inParolSeason;' +
  'S.routeState=function(n,s,m){SET.hours.north=n;SET.hours.south=s;return routeState(m);};')(S);

let fail = 0;
const check = (c, label, note) => { console.log((c ? 'PASS  ' : 'FAIL  ') + label + (note?'   '+note:'')); if (!c) fail++; };
const M = (h, m) => h * 60 + m;
const poster = [['06:00','10:00'], ['15:40','20:00']];   // the March 2026 poster

check(S.parseHM('06:00') === 360 && S.parseHM('15:40') === 940, 'parseHM reads 24h times');
check(S.parseHM('6:00') === null && S.parseHM('25:00') === null, 'parseHM rejects malformed times');
check(S.fmtHM('06:00') === '6:00 AM' && S.fmtHM('15:40') === '3:40 PM'
   && S.fmtHM('00:05') === '12:05 AM' && S.fmtHM('12:00') === '12:00 PM',
   'fmtHM displays 12h with correct noon and midnight');

check(S.withinWindows(poster, M(7,0)) === true,  'inside the morning window: open');
check(S.withinWindows(poster, M(12,0)) === true, 'noon: still open (10am departure is en route until 1:30pm)');
check(S.withinWindows(poster, M(14,0)) === false, '2:00pm: genuinely closed between the windows');
check(S.withinWindows(poster, M(15,40)) === true, '3:40pm: the afternoon window opens');
check(S.withinWindows(poster, M(23,0)) === true,  '11:00pm: last 8pm departure still en route');
check(S.withinWindows(poster, M(23,31)) === false, '11:31pm: everything has arrived, closed');
check(S.withinWindows(poster, M(3,0)) === false,  '3:00am: closed before first trip');
check(S.withinWindows([], M(12,0)) === true, 'no data: never claims closed');
check(S.withinWindows([['xx:yy','10:00']], M(2,0)) === true, 'malformed data: never claims closed');

const single = [['03:00','16:00']];  // the seeded old schedule
check(S.withinWindows(single, M(12,0)) === true && S.withinWindows(single, M(19,31)) === false,
   'the old single-window schedule behaves exactly as before');

check(S.hoursLabel('north', poster) === '6:00 AM - 10:00 AM\n3:40 PM - 8:00 PM',
   'split hours display as two lines', JSON.stringify(S.hoursLabel('north', poster)));
check(S.hoursLabel('south', []) === 'see schedule', 'missing hours degrade politely');

// The empty headline names the next departure. It used to name the day's
// first window whatever the time, so every afternoon between the windows it
// sent riders home until tomorrow morning with a trip due at 3:40 PM.
check(S.nextTrip('north', poster, M(14,0)) === '3:40 PM',
   '2:00pm, closed between the windows: next departure is this afternoon', S.nextTrip('north', poster, M(14,0)));
check(S.nextTrip('north', poster, M(3,0)) === '6:00 AM', '3:00am: the first trip of the day');
check(S.nextTrip('north', poster, M(23,45)) === '6:00 AM', 'after the last window: wraps to tomorrow\'s first');
check(S.nextTrip('north', [['15:40','20:00'], ['06:00','10:00']], M(14,0)) === '3:40 PM',
   'windows saved out of order are still read in time order');
check(S.nextTrip('north', [], M(14,0)) === '', 'no hours: says nothing rather than guessing');

// The hours card says what the service is doing right now, under the
// day-at-a-glance band. Its three states have to agree with the headline,
// which decides "closed" with withinWindows: a card reading "last buses
// still on the road" over a headline saying the service has stopped would
// leave a rider believing whichever they read second.
check(S.serviceState(poster, M(7,0)) === 'departing', '7:00am: buses are leaving');
check(S.serviceState(poster, M(10,0)) === 'departing', '10:00am: the last departure of the window still counts');
check(S.serviceState(poster, M(10,1)) === 'enroute', '10:01am: no more departures, the last ones are on the road');
check(S.serviceState(poster, M(13,30)) === 'enroute', '1:30pm: the 10am bus may still be arriving');
check(S.serviceState(poster, M(13,31)) === 'closed', '1:31pm: closed until the afternoon');
check(S.serviceState(poster, M(15,40)) === 'departing', '3:40pm: departing again');
check(S.serviceState(poster, M(23,31)) === 'closed', '11:31pm: closed for the night');
check(S.serviceState([], M(12,0)) === 'unknown', 'no hours: unknown, never closed');
check(S.serviceState([['xx:yy','10:00']], M(2,0)) === 'unknown', 'unreadable hours: unknown, never closed');
for (const [name, w] of [['the poster', poster], ['the old single window', single]]) {
  let disagree = [];
  for (let m = 0; m < 1440; m++) {
    if ((S.serviceState(w, m) !== 'closed') !== S.withinWindows(w, m)) disagree.push(m);
  }
  check(disagree.length === 0, `${name}: the card and the headline agree at every minute of the day`,
    disagree.length ? 'first disagreement at minute ' + disagree[0] : '1440 minutes checked');
}
// Both directions in one line: whichever is busier speaks for the route.
check(S.routeState(poster, [['04:00','05:00']], M(7,0)) === 'departing', 'one direction departing: the route is departing');
check(S.routeState([['04:00','05:00']], [['05:00','06:00']], M(7,0)) === 'enroute', 'only buses still on the road: en route');
check(S.routeState(poster, poster, M(14,0)) === 'closed', 'both closed: closed');
check(S.routeState([], poster, M(14,0)) === 'unknown', 'one direction unknown: the route does not claim closed');

// Pasko season, which the admin page can switch off: the ber months, to
// Three Kings. Local dates, as the phone reading the page sees them.
check(!S.inParolSeason(new Date(2026, 7, 31)), '31 August: not yet');
check(S.inParolSeason(new Date(2026, 8, 1)), '1 September: the ber months start, so does the parol');
check(S.inParolSeason(new Date(2026, 11, 25)), 'Christmas Day');
check(S.inParolSeason(new Date(2027, 0, 6)), '6 January: Three Kings, the last day');
check(!S.inParolSeason(new Date(2027, 0, 7)), '7 January: down it comes');
check(!S.inParolSeason(new Date(2027, 5, 12)), 'June: no');

console.log(fail ? `\n${fail} FAILED` : '\nALL PASS');
process.exit(fail ? 1 : 0);
