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
  'S.haversineKm=haversineKm;S.namedStopKms=namedStopKms;S.stopsBetween=stopsBetween;S.rideState=rideState;' +
  'S.aboardBus=aboardBus;S.aboardInfo=aboardInfo;S.aboardWords=aboardWords;')(S);

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

console.log('\n=== 8. the stop-by-stop card draws the stops it counted ===');
// The card under the map draws one dot per stop still to pass and names the
// next one. If the dots came from a different projection than the count,
// the picture and the number beside it would disagree on the same card.
{
  const NAMED = S.namedStopKms(STOPS, CP, CHAIN);
  check(NAMED.length === KMS.length && NAMED.every((s, i) => s.km === KMS[i]),
    'the named stops are the counted stops, in the same order', `${NAMED.length} stops`);
  check(NAMED.every(s => typeof s.name === 'string' && s.name.length > 0), 'and every one has its name');

  const me = kmOf('New Imus City Hall');
  const nb = S.approachInfo([bus('north', 'Biclatan')], me, KMS, 'all');
  const nbList = S.stopsBetween(nb, me, NAMED);
  check(nbList.length === nb.stops, 'northbound: one dot per stop it counted', `${nbList.length} vs ${nb.stops}`);
  // The same nine section 5 reads off the template, though not in the
  // template's order: Manggahan and LPU-Cavite stand side by side, 120 m
  // apart along the chain, so which of them is "next" is the projection's
  // call. What has to hold is that the list runs the way the bus does.
  const NINE = ['Manggahan', 'LPU-Cavite', 'Monterey', 'Sunny Brooke', 'Vista Mall General Trias',
                'Santiago', 'SM City General Trias', 'Greengate Homes', 'Malagasang 1-G'];
  check(nbList.map(s => s.name).sort().join('|') === NINE.slice().sort().join('|'),
    'they are the nine stops between Biclatan and New Imus City Hall', nbList.map(s => s.name).join(', '));
  check(nbList.every((s, i) => i === 0 || s.km >= nbList[i - 1].km) && nbList[0].km > nb.busKm,
    'listed in the order a northbound bus meets them, nearest first', nbList[0] && nbList[0].name);
  check(nbList[nbList.length - 1].name === 'Malagasang 1-G', 'and the last is the one just before yours',
    nbList[nbList.length - 1].name);

  // Southbound runs the chain the other way, so the same stretch reads in
  // reverse: the next stop is the one nearest the bus, not the lowest km.
  const sbMe = kmOf('Biclatan');
  const sb = S.approachInfo([bus('south', 'New Imus City Hall')], sbMe, KMS, 'all');
  const sbList = S.stopsBetween(sb, sbMe, NAMED);
  check(sbList.length === sb.stops, 'southbound: one dot per stop it counted', `${sbList.length} vs ${sb.stops}`);
  check(sbList.every((s, i) => i === 0 || s.km <= sbList[i - 1].km) && sbList[0].name === 'Malagasang 1-G',
    'read the other way: its next stop is the far end of the same list', sbList[0] && sbList[0].name);

  const adj = S.approachInfo([bus('north', 'Ospital ng Imus')], kmOf('Alapan 2-B'), KMS, 'all');
  check(S.stopsBetween(adj, kmOf('Alapan 2-B'), NAMED).length === 0, 'consecutive stops: no dots, no next-stop name');
  check(S.stopsBetween(null, me, NAMED).length === 0 && S.stopsBetween(nb, null, NAMED).length === 0,
    'no bus or no stop: an empty line, not a throw');
}

console.log('\n=== 9. Malapit na, Sakay na: louder, never sooner than true ===');
// The card raises its voice twice: two stops or fewer is Malapit na, yours
// being next with the bus inside 2 km is Sakay na. Both are counts, like
// the rest of the card. Neither is a time.
{
  check(S.rideState(null) === '', 'no bus: nothing to say');
  check(S.rideState({ stops: 0, km: 1.2 }) === 'here', 'next stop is yours and it is close: Sakay na');
  check(S.rideState({ stops: 0, km: 3.4 }) === 'near', 'next stop is yours but it is still a way off: only Malapit na');
  check(S.rideState({ stops: 2, km: 5 }) === 'near', 'two stops before yours: Malapit na');
  check(S.rideState({ stops: 3, km: 2 }) === '', 'three stops: the card stays quiet, however close in km');
  // Real buses, real stops: a bus one stop short of the reader really does say Malapit na.
  const me = kmOf('New Imus City Hall');
  const one = S.approachInfo([bus('north', 'Malagasang 1-G')], me, KMS, 'all');
  check(S.rideState(one) !== '', 'a bus at the stop before yours is never quiet', `stops ${one.stops}, ${one.km.toFixed(1)} km`);

  // Everything renderMyStop prints is assembled from string literals in its
  // own body. None of them may learn to say minutes or arrival either.
  // Comment lines go first: an apostrophe in one ("a phone's width") would
  // throw the quote matching out of step for the rest of the function.
  const body = html.slice(html.indexOf('function renderMyStop('), html.indexOf('function openStopPicker('))
    .replace(/^\s*\/\/.*$/gm, '');
  const literals = body.match(/'(?:[^'\\]|\\.)*'/g) || [];
  const bad = literals.filter(l => /\bmin|\bETA|arriv|\bsoon\b|on time/i.test(l));
  // And the strings it is known to print are among those read, so a quote
  // matcher that has lost its place cannot pass by reading nothing.
  const seen = ['Sakay na!', 'Malapit na!', 'Your stop', 'two stops away'].every(w => literals.some(l => l.includes(w)));
  check(seen && bad.length === 0, 'no string the card can print promises a time',
    bad.length ? bad.join(' ') : literals.length + ' strings read');
  // The buzz is one more thing a page could quietly start remembering.
  check(/sessionStorage\.setItem\('wt-buzz'/.test(html) && !/localStorage\.\w+\(\s*'wt-buzz'/.test(html),
    'the buzz switch lasts the visit only, so it is not a fourth thing kept between visits');
}

console.log('\n=== 10. on the bus already: your own bus, to where you get off ===');
// Waiting asks "which bus reaches me"; riding asks "how far is MY bus from
// my stop". The nearest coming bus is the wrong answer on board, so the
// riding card follows one bus only: the one this phone is sharing, or the
// one its reader said they are on.
{
  const me = kmOf('New Imus City Hall');
  // Two northbound buses short of the stop: one running ahead, one behind.
  const ahead = { id: 'ahead', direction: 'north', ts: 1, km: kmOf('SM City General Trias'), members: ['ahead'] };
  const mine = { id: 'mine', direction: 'north', ts: 1, km: kmOf('Biclatan'), members: ['mine', 'other'] };
  const waiting = S.approachInfo([ahead, mine], me, KMS, 'all');
  check(waiting.id === 'ahead', 'waiting at the stop, the bus running ahead is the one coming', waiting.id);

  check(S.aboardBus([ahead, { ...mine, self: true }], null).id === 'mine',
    'a sharer\'s bus is the one the server flagged as theirs, with nothing asked of them');
  check(S.aboardBus([ahead, mine], 'other').id === 'mine',
    'a rider\'s pick is found by any id in the cluster, because clusters reorder');
  check(S.aboardBus([ahead, { ...mine, self: true }], 'ahead').id === 'mine',
    'and while sharing, the server\'s answer wins over a pick');
  check(S.aboardBus([ahead], 'gone') === null && S.aboardBus([], 'mine') === null && S.aboardBus([ahead, mine], null) === null,
    'a bus that has left the map, or no pick at all, is no bus rather than the nearest one');

  const on = S.aboardInfo(mine, me, KMS);
  check(!on.passed && on.id === 'mine' && on.stops === 9,
    'riding, the card counts down on your own bus, not the one ahead of it', `${on.stops} stops, ${on.km.toFixed(1)} km`);
  check(S.stopsBetween(on, me, S.namedStopKms(STOPS, CP, CHAIN)).length === on.stops,
    'and draws the same stops as dots, through the same stopsBetween()');
  check(S.aboardWords(on) === '▲ Northbound · on your bus · 13 km to go · about 9 stops before yours',
    'its sentence says it is your bus and how far is left', `"${S.aboardWords(on)}"`);

  const last = S.aboardInfo({ id: 'm', direction: 'north', ts: 1, km: kmOf('Malagasang 1-G') }, me, KMS);
  check(S.rideState(last) !== '', 'one stop out, the card speaks up, as it does at the roadside');
  const at = S.aboardInfo({ id: 'm', direction: 'north', ts: 1, km: me + 0.2 }, me, KMS);
  check(!at.passed && at.km === 0 && S.rideState(at) === 'here',
    'a fix just past the sign is still at your stop, not behind it', 'phones wobble and buses pull in beyond the sign');
  const gone = S.aboardInfo({ id: 'm', direction: 'north', ts: 1, km: kmOf('Ospital ng Imus') }, me, KMS);
  check(gone.passed && S.aboardWords(gone) === '▲ Northbound · your stop is behind this bus',
    'past it, it says so rather than counting backwards', `"${S.aboardWords(gone)}"`);
  // Southbound runs the chain the other way, so "to go" inverts with it.
  const sbOn = S.aboardInfo({ id: 's', direction: 'south', ts: 1, km: kmOf('New Imus City Hall') }, kmOf('Biclatan'), KMS);
  check(!sbOn.passed && sbOn.stops === 9, 'southbound counts down the other way along the chain', `${sbOn.stops} stops`);
  check(S.aboardInfo({ id: 's', direction: 'south', ts: 1, km: kmOf('Biclatan') }, me, KMS).passed,
    'and a southbound bus below your stop has passed it');

  check(S.aboardInfo(null, me, KMS) === null && S.aboardInfo(mine, null, KMS) === null &&
        S.aboardInfo({ id: 'x', direction: 'north', ts: 1, km: null }, me, KMS) === null && S.aboardWords(null) === null,
    'no bus, no stop, or a bus off the chain: nothing, never a throw');
  [on, last, at, gone, sbOn].forEach((i, n) => check(!/\bmin|\bETA|arriv|\bsoon\b/i.test(S.aboardWords(i)),
    `riding sentence ${n + 1} promises no arrival time`, S.aboardWords(i)));

  // The riding card's own strings are in the same functions section 9 read.
  const body = html.slice(html.indexOf('function renderMyStop('), html.indexOf('function openStopPicker('))
    .replace(/^\s*\/\/.*$/gm, '');
  check(['Bababa na!', 'Get ready to get off.', 'I got off', 'Your bus'].every(w => body.includes(w)),
    'the riding card says Bababa na and offers "I got off", from the region the time check reads');
  // Which bus you are on is about you, so it is held like the buzz: for the
  // visit, on this phone, and never sent.
  check(/sessionStorage\.setItem\('wt-aboard'/.test(html) && !/localStorage\.\w+\(\s*'wt-aboard'/.test(html),
    'the bus you said you are on lasts the visit only, so it is not a fifth thing kept between visits');
  check(!/rpc\([^)]*ABOARD/.test(html) && !/fetch\([^)]*ABOARD/.test(html),
    'and it is never put in a request');
}

console.log(fail ? `\n${fail} FAILED` : '\nALL PASS');
process.exit(fail ? 1 : 0);
