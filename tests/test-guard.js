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

console.log(all ? '\nALL PASS' : '\nSOME FAILED');
process.exit(all ? 0 : 1);
