// Runs the code EXACTLY as shipped: the block is cut out of index.html by its
// markers and evaluated here, so a passing test cannot drift from the app.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const shipped = html.slice(html.indexOf('// ---- ROUTE PROGRESS + WRONG-DIRECTION GUARD'),
                           html.indexOf('// ---- END ROUTE PROGRESS'));
const hav = html.slice(html.indexOf('function haversineKm(a,b){'), html.indexOf('function timeAgo(ts){'));
const S = {};
new Function('S', hav + shipped +
  'S.buildRouteChain=buildRouteChain;S.routeProgressKm=routeProgressKm;S.makeDirGuard=makeDirGuard;' +
  'S.dirGuardUpdate=dirGuardUpdate;S.DIRGUARD=DIRGUARD;S.haversineKm=haversineKm;S.chainPosition=chainPosition;S.busPlace=busPlace;')(S);
const H = S.haversineKm;

const txt = fs.readFileSync(path.join(ROOT, 'config-template.txt'), 'utf8').split(/\r?\n/);
const pick = (tag, li, ln) => txt.filter(l => l.trim().startsWith(tag)).map(l => {
  const p = l.split('=')[1].split('|').map(x => x.trim());
  return { name: p[0], lat: +p[li], lng: +p[ln] };
});
const STOPS = pick('STOP =', 1, 2);
const CP = pick('CHECKPOINT =', 2, 3);
const CHAIN = S.buildRouteChain(CP);

function densify(stops, step) {
  const pts = [];
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i], n = Math.max(1, Math.round(H(a, b) / step));
    for (let k = 0; k < n; k++) { const f = k / n; pts.push({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f }); }
  }
  pts.push(stops[stops.length - 1]); return pts;
}
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const jitter = (p, m) => ({ lat: p.lat + (rnd() - .5) * m / 111320,
                            lng: p.lng + (rnd() - .5) * m / (111320 * Math.cos(p.lat * Math.PI / 180)) });

function run(track, dir, kmh, label, expectFire) {
  const g = S.makeDirGuard();
  let t = 0, travelled = 0, fired = null;
  for (let i = 0; i < track.length; i++) {
    const seg = i > 0 ? H(track[i - 1], track[i]) : 0;
    travelled += seg;
    const dwell = Math.max(2, Math.round(seg / kmh * 3600));
    for (let sec = 0; sec < dwell; sec += 2) {
      t += 2000;
      const hit = S.dirGuardUpdate(g, jitter(track[i], 15), t, dir, CP, CHAIN);
      if (hit && !fired) fired = { km: hit.km, min: t / 60000, tk: travelled };
    }
  }
  const ok = expectFire ? !!fired : !fired;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: ` + (fired
    ? `fired after ${fired.tk.toFixed(1)} km driven / ${fired.min.toFixed(0)} min` : 'never fired'));
  return ok;
}

const north = densify(STOPS, 0.15), south = north.slice().reverse();
let all = true;
console.log(`checkpoint chain ${CHAIN[CHAIN.length - 1].toFixed(1)} km, stop path ${
  north.reduce((a, p, i) => i ? a + H(north[i - 1], p) : 0, 0).toFixed(1)} km, threshold ${S.DIRGUARD.MIN_KM} km\n`);

console.log('--- correct direction: must never interrupt ---');
[[25, 'open road'], [15, 'moderate traffic'], [8, 'heavy traffic'], [5, 'crawling']].forEach(([v, d]) => {
  all &= run(north, 'north', v, `full northbound, ${d} (${v} km/h)`, false);
  all &= run(south, 'south', v, `full southbound, ${d} (${v} km/h)`, false);
});
all &= run(north.slice(400), 'north', 25, 'northbound joined mid route', false);
all &= run(south.slice(0, 120), 'south', 15, 'southbound Makati leg only', false);
all &= run(north.slice(60, 140), 'north', 20, 'northbound Tagaytay ridge hook only', false);
all &= run(north.slice(280, 400), 'north', 20, 'northbound Imus and Kawit zigzag only', false);

console.log('\n--- wrong direction: must be caught ---');
[[25, 'open road'], [15, 'moderate traffic'], [8, 'heavy traffic']].forEach(([v, d]) => {
  all &= run(south, 'north', v, `going south, declared NORTH, ${d}`, true);
  all &= run(north, 'south', v, `going north, declared SOUTH, ${d}`, true);
});
all &= run(south.slice(0, 200), 'north', 20, 'wrong direction, Makati leg only', true);
all &= run(north.concat(south.slice(0, 300)), 'north', 25, 'kept sharing into the return trip', true);

console.log('\n--- a parked bus must not be accused of anything ---');
const parked = Array(1200).fill(STOPS[30]);
all &= run(parked, 'north', 25, 'stationary 40 min mid route', false);
all &= run(Array(1200).fill(CP[6]), 'south', 25, 'stationary 40 min at One Ayala, declared south', false);
all &= run(Array(1200).fill(CP[0]), 'north', 25, 'stationary 40 min at Mendez, declared north', false);


// The admin page's "doesn't look like a bus" (November 2026): far from the
// line the route's stops trace, or not moving for half an hour away from
// both ends. Cut out of admin.html by its markers, like the guard above.
console.log('\n--- the admin page: doesn\'t look like a bus ---');
{
  const admin = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
  const blk = admin.slice(admin.indexOf("// ---- DOESN'T LOOK LIKE A BUS (unit tested)"),
                          admin.indexOf("// ---- END DOESN'T LOOK LIKE A BUS"));
  const A = {};
  new Function('A', blk + 'A.oddRouteLine=oddRouteLine;A.oddKmFromLine=oddKmFromLine;A.oddStill=oddStill;' +
    'A.oddWords=oddWords;A.oddKm=oddKm;A.ODD_FAR_KM=ODD_FAR_KM;A.ODD_STILL_M=ODD_STILL_M;A.ODD_STILL_MIN=ODD_STILL_MIN;A.ODD_END_KM=ODD_END_KM;')(A);
  const ok = (c, label, note) => { console.log((c ? 'PASS  ' : 'FAIL  ') + label + (note ? '   ' + note : '')); all &= !!c; };
  const line = A.oddRouteLine(CP, STOPS), ends = [CP[0], CP[CP.length - 1]];
  const t0 = Date.parse('2026-11-07T05:00:00Z');
  const row = (p, mins) => ({ lat: p.lat, lng: p.lng, updated_at: new Date(t0 + mins * 60000).toISOString() });
  const after = (track) => {          // a list of [place, minutes] seen by the page, poll by poll
    let still = null, words = [];
    track.forEach(([p, m]) => { const r = row(p, m); still = A.oddStill(still, r); words = A.oddWords(r, line, ends, still); });
    return words;
  };
  ok(A.ODD_FAR_KM === 2 && A.ODD_STILL_M === 150 && A.ODD_STILL_MIN === 30 && A.ODD_END_KM === 1.5,
    'far is 2 km from the route, not moving is 150 m for 30 minutes, an end is within 1.5 km');
  ok(line.length === CP.length + STOPS.length && line.every((p, i) => !i || p.km >= line[i - 1].km),
    'the route line is every checkpoint and stop, in order along the chain');
  // Every place a real bus can be, along the stops and with GPS jitter, is near it.
  let worst = 0;
  north.forEach(p => { worst = Math.max(worst, A.oddKmFromLine(jitter(p, 60), line)); });
  ok(worst < A.ODD_FAR_KM / 2, 'no point along the route comes near being called far', 'worst ' + worst.toFixed(2) + ' km');
  ok(north.every((p, i) => !A.oddWords(row(jitter(p, 60), i * 0.05), line, ends, null).length),
    'so a bus driving the route, start to end, is never flagged');
  const east = (p, km) => ({ lat: p.lat, lng: p.lng + km / (111.32 * Math.cos(p.lat * Math.PI / 180)) });
  ok(A.oddWords(row(east(STOPS[30], 5), 0), line, ends, null).join() === 'far from the route' &&
     A.oddWords(row(east(STOPS[10], -4), 0), line, ends, null).join() === 'far from the route',
    'a phone 4 or 5 km off the road the stops trace is far from the route');
  ok(!A.oddWords(row(east(STOPS[30], 1), 0), line, ends, null).length, 'one a kilometre off it is not');
  // Not moving: half an hour within 150 m of one place, away from both ends.
  const mid = STOPS[30], wobble = m => jitter(mid, 120);
  ok(after(Array.from({ length: 32 }, (_, m) => [wobble(m), m])).join() === 'not moving',
    'half an hour mid-route within 150 m of one place is not moving');
  ok(!after(Array.from({ length: 29 }, (_, m) => [wobble(m), m])).length, 'a few minutes under it is nothing');
  ok(!after(Array.from({ length: 40 }, (_, m) => [CP[0], m])).length && !after(Array.from({ length: 40 }, (_, m) => [CP[CP.length - 1], m])).length,
    'nor is any wait at either end, where buses stand to leave');
  ok(!after(Array.from({ length: 40 }, (_, m) => [m === 20 ? east(mid, 0.4) : mid, m])).length,
    'moving off the spot starts it again: twenty minutes, a move, twenty more is nothing');
  ok(after(Array.from({ length: 35 }, (_, m) => [east(mid, 6), m])).join() === 'far from the route,not moving',
    'a phone far off the route that never moves gets both');
  ok(after([[mid, 0], [mid, 40]]).includes('not moving') && A.oddStill(null, { lat: NaN, lng: 1, updated_at: '' }) === null,
    'measured by the bus\'s own report times, and nothing for a row it cannot place');
  // In words, never minutes, and nothing kept.
  const words = new Set();
  [[east(mid, 6), 35], [mid, 31]].forEach(([p, m]) => after(Array.from({ length: m + 1 }, (_, k) => [p, k])).forEach(x => words.add(x)));
  ok([...words].every(x => x === 'far from the route' || x === 'not moving'), 'it says one of two things and never a time', [...words].join(' | '));
  const code = blk.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  const quoted = [...new Set([...code.matchAll(/'([^']*)'/g)].map(m => m[1]))].sort();
  ok(!/localStorage|sessionStorage|rpc\(|fetch\(/.test(blk) && quoted.join('|') === 'far from the route|not moving',
    'it sends nothing, keeps nothing, and the only words in it are those two', quoted.join(' | '));
}

console.log(all ? '\nALL PASS' : '\nSOME FAILED');
process.exit(all ? 0 : 1);
