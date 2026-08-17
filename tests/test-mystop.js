// Checks the saved-stop maths as shipped: which bus counts as "coming to
// you", how far away it is along the road rather than across country, how
// many stops sit in between, and the words the card actually prints.
//
// The code under test is pulled straight out of index.html by its comment
// markers, like the other suites, so a passing run here cannot drift from
// what the app does. Keep the markers intact when editing that region.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const prog = html.slice(html.indexOf('// ---- ROUTE PROGRESS + WRONG-DIRECTION GUARD'),
                        html.indexOf('// ---- END ROUTE PROGRESS'));
const mine = html.slice(html.indexOf("// ---- THE READER'S OWN STOP (unit tested)"),
                        html.indexOf('// ---- END MY STOP'));
const hav = html.slice(html.indexOf('function haversineKm(a,b){'), html.indexOf('function timeAgo(ts){'));
const S = {};
new Function('S', hav + prog + mine +
  'S.buildRouteChain=buildRouteChain;S.routeProgressKm=routeProgressKm;' +
  'S.stopChainKms=stopChainKms;S.approachInfo=approachInfo;S.myStopWords=myStopWords;' +
  'S.haversineKm=haversineKm;')(S);

const txt = fs.readFileSync(path.join(ROOT, 'config-template.txt'), 'utf8').split(/\r?\n/);
const CP = txt.filter(l => l.trim().startsWith('CHECKPOINT =')).map(l => {
  const p = l.split('=')[1].split('|').map(x => x.trim());
  return { name: p[0], short: p[1], lat: +p[2], lng: +p[3] };
});
const STOPS = txt.filter(l => l.trim().startsWith('STOP =')).map(l => {
  const p = l.split('=')[1].split('|').map(x => x.trim());
  return { name: p[0], lat: +p[1], lng: +p[2], conf: (p[3] || 'M').toUpperCase() };
});
const CHAIN = S.buildRouteChain(CP);
const KMS = S.stopChainKms(STOPS, CP, CHAIN);

let fail = 0;
const check = (c, label, note) => { console.log((c ? 'PASS  ' : 'FAIL  ') + label + (note ? '   ' + note : '')); if (!c) fail++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const stop = n => { const s = STOPS.find(x => x.name === n); if (!s) throw new Error('no stop named ' + n); return s; };
const kmOf = n => S.routeProgressKm(stop(n), CP, CHAIN);
const bus = (dir, atStop, id) => ({ id: id || atStop, direction: dir, ts: 1, km: kmOf(atStop) });

console.log(`route is ${CHAIN[CHAIN.length - 1].toFixed(1)} km over ${CP.length} checkpoints, ${STOPS.length} stops\n`);

console.log('=== 1. every stop lands on the chain, in route order ===');
check(KMS.length === STOPS.filter(s => !isNaN(s.lat)).length,
  'every stop with coordinates gets a position', `${KMS.length} of ${STOPS.length}`);
check(KMS.every((k, i) => i === 0 || k >= KMS[i - 1]), 'and they come back sorted along the route');
check(KMS[0] >= 0 && KMS[KMS.length - 1] <= CHAIN[CHAIN.length - 1] + 0.001,
  'none of them fall off either end', `${KMS[0].toFixed(2)} to ${KMS[KMS.length - 1].toFixed(2)} km`);
// The list in config.txt is merged from two posters and is NOT in strict
// route order — the trap that made the direction guard use the checkpoints
// instead. Sorting by projected distance is what makes the count above
// independent of that, so prove the two orders really do differ.
{
  const listOrder = STOPS.filter(s => !isNaN(s.lat)).map(s => S.routeProgressKm(s, CP, CHAIN));
  const outOfOrder = listOrder.filter((k, i) => i && k < listOrder[i - 1]).length;
  check(outOfOrder > 0,
    'config order is not route order, so counting must not rely on it',
    `${outOfOrder} stops sit behind their predecessor in the file`);
}

console.log('\n=== 2. only buses that still have to reach you count ===');
{
  const me = kmOf('Manggahan');
  const behind = S.approachInfo([bus('north', 'Biclatan')], me, KMS, 'all');
  check(!!behind, 'a northbound bus short of your stop is reported');
  const past = S.approachInfo([bus('north', 'New Imus City Hall')], me, KMS, 'all');
  check(past === null, 'a northbound bus that already passed you is not',
    'it is not an answer to "when can I get on one"');
  // Southbound runs the chain the other way, so the same two facts invert.
  const sBehind = S.approachInfo([bus('south', 'New Imus City Hall')], me, KMS, 'all');
  check(!!sBehind, 'a southbound bus above your stop is reported');
  const sPast = S.approachInfo([bus('south', 'Biclatan')], me, KMS, 'all');
  check(sPast === null, 'a southbound bus already below it is not');
}

console.log('\n=== 3. the nearest one wins, and the filter is obeyed ===');
{
  const me = kmOf('New Imus City Hall');
  // Far bus first in the array, so passing this cannot be an accident of order.
  const list = [bus('north', 'Manggahan', 'far'), bus('north', 'SM City General Trias', 'near')];
  const got = S.approachInfo(list, me, KMS, 'all');
  check(got && got.id === 'near', 'the closest approaching bus is chosen, not the first in the list',
    got ? `${got.id} at ${got.km.toFixed(1)} km` : 'nothing');

  const mixed = [bus('north', 'Manggahan', 'nb'), bus('south', 'PITX', 'sb')];
  check(S.approachInfo(mixed, me, KMS, 'north').id === 'nb', 'filtering to northbound ignores the southbound bus');
  check(S.approachInfo(mixed, me, KMS, 'south').id === 'sb', 'and the other way round');
  check(S.approachInfo([bus('south', 'PITX', 'sb')], me, KMS, 'north') === null,
    'a filter with nothing behind it reports nothing rather than the wrong bus');
}

console.log('\n=== 4. distance follows the road, not the crow ===');
// The Tagaytay ridge hook doubles back on itself. Someone waiting at Salaban
// is 1.2 km from a bus at Metrogate in a straight line and 3.5 km by road,
// which is the difference between "it is basically here" and "you have a few
// minutes". This is the whole reason the measurement projects onto the chain.
{
  const me = kmOf("Salaban (Shakey's Bypass)");
  const got = S.approachInfo([bus('north', 'Metrogate Tagaytay')], me, KMS, 'all');
  const crow = S.haversineKm(stop('Metrogate Tagaytay'), stop("Salaban (Shakey's Bypass)"));
  check(!!got && near(got.km, 3.5, 0.15), 'the ridge hook is measured along the route',
    got ? `${got.km.toFixed(1)} km by road` : 'nothing');
  check(crow < 1.5, 'a straight line would have called the same bus far closer',
    `${crow.toFixed(1)} km as the crow flies — off by ${(got.km / crow).toFixed(1)}x`);
}

console.log('\n=== 5. how many stops are in between ===');
// Read straight off config-template.txt: between Biclatan and New Imus City
// Hall lie Manggahan, LPU-Cavite, Monterey, Sunny Brooke, Vista Mall,
// Santiago, SM City General Trias, Greengate Homes and Malagasang 1-G.
{
  const me = kmOf('New Imus City Hall');
  const got = S.approachInfo([bus('north', 'Biclatan')], me, KMS, 'all');
  check(got.stops === 9, 'nine stops sit between Biclatan and New Imus City Hall', `counted ${got.stops}`);
  check(!KMS.some(k => k === me && k > Math.min(got.busKm, me) && k < Math.max(got.busKm, me)),
    'and your own stop is never counted as one of them');

  // Adjacent stops have nothing between them, which is the wording's other branch.
  const next = S.approachInfo([bus('north', 'Ospital ng Imus')], kmOf('Alapan 2-B'), KMS, 'all');
  check(next.stops === 0, 'consecutive stops report none in between', `counted ${next.stops}`);
}

console.log('\n=== 6. the words the card prints ===');
{
  const far = S.approachInfo([bus('north', 'Biclatan')], kmOf('New Imus City Hall'), KMS, 'all');
  check(S.myStopWords(far) === '▲ Northbound · 13 km away · about 9 stops before yours',
    'a distant northbound bus reads in whole km', `"${S.myStopWords(far)}"`);

  const mid = S.approachInfo([bus('north', 'Metrogate Tagaytay')], kmOf("Salaban (Shakey's Bypass)"), KMS, 'all');
  check(/^▲ Northbound · 3\.5 km away · about \d+ stops? before yours$/.test(S.myStopWords(mid)),
    'under 10 km it gains a decimal, because 3 vs 4 km is a real wait', `"${S.myStopWords(mid)}"`);

  const close = S.approachInfo([{ id: 'c', direction: 'south', ts: 1, km: kmOf('Manggahan') + 0.2 }],
    kmOf('Manggahan'), KMS, 'all');
  check(S.myStopWords(close).indexOf('under 500 m away') > 0,
    'inside half a km it stops quoting a number the phone cannot back up', `"${S.myStopWords(close)}"`);
  check(S.myStopWords(close).indexOf('▼ Southbound') === 0, 'and it names the direction it is coming from');
  check(S.myStopWords(close).indexOf('yours is the next stop') > 0,
    'with nothing in between, it says so rather than printing "about 0 stops"');
  check(S.myStopWords(null) === null, 'no bus coming produces no sentence at all');
  // Never minutes. An ETA needs travel-time history this system does not keep,
  // so the card must not learn to imply one.
  [far, mid, close].forEach((i, n) => check(!/\bmin|\bETA|arriv/i.test(S.myStopWords(i)),
    `sentence ${n + 1} promises no arrival time`, S.myStopWords(i)));
}

console.log('\n=== 7. nothing here throws on a half-built page ===');
{
  const me = kmOf('Manggahan');
  check(S.approachInfo([], me, KMS, 'all') === null, 'an empty bus list returns null');
  check(S.approachInfo([bus('north', 'Biclatan')], null, KMS, 'all') === null, 'no saved stop returns null');
  check(S.approachInfo([bus('north', 'Biclatan')], NaN, KMS, 'all') === null, 'an unplaceable stop returns null');
  check(S.approachInfo([{ id: 'x', direction: 'north', ts: 1, km: null }], me, KMS, 'all') === null,
    'a bus that cannot be placed on the chain is skipped, not counted as here');
  check(S.stopChainKms([], CP, CHAIN).length === 0, 'no stops configured yields no positions');
  check(S.stopChainKms([{ name: 'bad', lat: NaN, lng: NaN }], CP, CHAIN).length === 0,
    'a stop with unreadable coordinates is dropped rather than placed at zero');
  check(S.stopChainKms(STOPS, [], []).length === 0, 'and with no checkpoints yet, nothing is placed');
}

console.log(fail ? `\n${fail} FAILED` : '\nALL PASS');
process.exit(fail ? 1 : 0);
