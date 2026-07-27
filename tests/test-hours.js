// Tests the multi-window operating hours logic exactly as shipped.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const block = html.slice(html.indexOf('// ---- Operating hours (unit tested)'),
                         html.indexOf('// ---- END operating hours'));
const S = {};
new Function('S', 'let SET={hours:{north:[],south:[]}};' + block +
  'S.parseHM=parseHM;S.fmtHM=fmtHM;S.withinWindows=withinWindows;S.hoursLabel=function(d,w){SET.hours[d]=w;return hoursLabel(d);};')(S);

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

console.log(fail ? `\n${fail} FAILED` : '\nALL PASS');
process.exit(fail ? 1 : 0);
