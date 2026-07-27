// Checks the progress strip maths as shipped: the pill's position, the tick
// highlighting, and the wording of the chip and headline.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const shipped = html.slice(html.indexOf('// ---- ROUTE PROGRESS + WRONG-DIRECTION GUARD'),
                           html.indexOf('// ---- END ROUTE PROGRESS'));
const hav = html.slice(html.indexOf('function haversineKm(a,b){'), html.indexOf('function timeAgo(ts){'));
const S = {};
new Function('S', hav + shipped +
  'S.buildRouteChain=buildRouteChain;S.chainPosition=chainPosition;S.busPlace=busPlace;S.haversineKm=haversineKm;')(S);

const txt = fs.readFileSync(path.join(ROOT, 'config-template.txt'), 'utf8').split(/\r?\n/);
const CP = txt.filter(l => l.trim().startsWith('CHECKPOINT =')).map(l => {
  const p = l.split('=')[1].split('|').map(x => x.trim());
  return { name: p[0], short: p[1], lat: +p[2], lng: +p[3] };
});
const CHAIN = S.buildRouteChain(CP);
const N = CP.length;
const tickPct = i => (i / (N - 1)) * 100;

let fail = 0;
const check = (c, label, note) => { console.log((c ? 'PASS  ' : 'FAIL  ') + label + (note ? '   ' + note : '')); if (!c) fail++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log('legs (km): ' + CP.map((c, i) => i ? c.short + ' ' + (CHAIN[i] - CHAIN[i - 1]).toFixed(1) : 'MENDEZ 0').join(', ') + '\n');

// 1. sitting exactly on a checkpoint lands exactly on its tick
CP.forEach((c, i) => {
  const pl = S.busPlace({ lat: c.lat, lng: c.lng, direction: 'north' }, CP, CHAIN);
  check(near(pl.pct, tickPct(i), 0.001) && pl.label === c.short,
    `at ${c.short}: pill on the ${c.short} tick`, `pct ${pl.pct.toFixed(1)}, label "${pl.label}"`);
});

// helper: a point a given distance along a leg
function alongLeg(i, km) {
  const a = CP[i], b = CP[i + 1], t = km / (CHAIN[i + 1] - CHAIN[i]);
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

// 2. the reported case: southbound, 3 km from PITX on the One Ayala side
{
  const iPITX = CP.findIndex(c => c.short === 'PITX');
  const legKm = CHAIN[iPITX + 1] - CHAIN[iPITX];
  const p = alongLeg(iPITX, legKm - 3);
  const pl = S.busPlace({ lat: p.lat, lng: p.lng, direction: 'south' }, CP, CHAIN);
  const lo = tickPct(iPITX), hi = tickPct(iPITX + 1);
  check(pl.pct > lo + 1 && pl.pct < hi - 1, 'reported case: pill sits between the PITX and AYALA ticks',
    `pct ${pl.pct.toFixed(1)} (PITX tick ${lo.toFixed(1)}, AYALA tick ${hi.toFixed(1)})`);
  check(pl.label === '3 km to PITX', 'reported case: chip reads "3 km to PITX"', `got "${pl.label}"`);
  check(pl.sentence === 'between One Ayala and PITX', 'reported case: headline names both ends',
    `got "${pl.sentence}"`);
  check(pl.ticks.length === 2, 'reported case: both ends of the leg are highlighted');
  console.log(`      PITX to One Ayala is ${legKm.toFixed(1)} km; the old code drew this bus at ` +
    `${lo.toFixed(1)}%, it now draws at ${pl.pct.toFixed(1)}%, about ` +
    `${Math.round((pl.pct - lo) / 100 * 488)} px further along a 488 px strip`);
}

// 3. same spot, northbound, points at the other end
{
  const iPITX = CP.findIndex(c => c.short === 'PITX');
  const p = alongLeg(iPITX, 3);
  const n = S.busPlace({ lat: p.lat, lng: p.lng, direction: 'north' }, CP, CHAIN);
  const s = S.busPlace({ lat: p.lat, lng: p.lng, direction: 'south' }, CP, CHAIN);
  check(n.label.indexOf('AYALA') > 0 && s.label.indexOf('PITX') > 0,
    'the distance shown is to the checkpoint the bus is heading for',
    `north "${n.label}", south "${s.label}"`);
  check(near(n.pct, s.pct, 0.0001), 'direction does not move the pill, only the wording');
}

// 4. within 1.5 km of a checkpoint it settles onto the name
{
  const p = alongLeg(4, 1.0);
  const pl = S.busPlace({ lat: p.lat, lng: p.lng, direction: 'north' }, CP, CHAIN);
  check(pl.label === 'IMUS' && pl.ticks.length === 1, 'within 1.5 km: shows the checkpoint name alone',
    `got "${pl.label}"`);
  const q = alongLeg(4, 2.5);
  const pq = S.busPlace({ lat: q.lat, lng: q.lng, direction: 'north' }, CP, CHAIN);
  check(pq.label.indexOf('km to') > 0, 'past 1.5 km: switches to a distance', `got "${pq.label}"`);
}

// 5. sweep every 100 m of the route: no misleading distance can ever appear
{
  const labels = new Set();
  for (let i = 0; i < N - 1; i++) {
    const legKm = CHAIN[i + 1] - CHAIN[i];
    for (let k = 0; k <= legKm * 10; k++) {
      const p = alongLeg(i, Math.min(k / 10, legKm));
      ['north', 'south'].forEach(d => labels.add(S.busPlace({ lat: p.lat, lng: p.lng, direction: d }, CP, CHAIN).label));
    }
  }
  const bad = [...labels].filter(l => /^0 km|^1 km/.test(l));
  check(bad.length === 0, 'no "0 km to" or "1 km to" label exists anywhere on the route',
    `${labels.size} distinct labels, smallest distance ${Math.min(...[...labels].filter(l => /km to/.test(l)).map(l => parseInt(l, 10)))} km`);
}

// 6. the pill only ever moves forward along a normal trip, and stays on the strip
{
  const track = [];
  for (let i = 1; i < N; i++) {
    const steps = Math.max(2, Math.round((CHAIN[i] - CHAIN[i - 1]) / 0.1));
    for (let k = 0; k < steps; k++) track.push(alongLeg(i - 1, (CHAIN[i] - CHAIN[i - 1]) * k / steps));
  }
  track.push({ lat: CP[N - 1].lat, lng: CP[N - 1].lng });
  let mono = true, inRange = true, prev = -1;
  track.forEach(p => {
    const pl = S.busPlace({ lat: p.lat, lng: p.lng, direction: 'north' }, CP, CHAIN);
    if (pl.pct < prev - 0.0001) mono = false;
    if (pl.pct < 0 || pl.pct > 100) inRange = false;
    prev = pl.pct;
  });
  check(mono, 'pill never slides backwards along a northbound run of the chain');
  check(inRange, 'pill always lands between 0 and 100 percent');
}

// 7. rubbish positions must not throw or overflow the strip
{
  const junk = [{ lat: 0, lng: 0 }, { lat: 14.6, lng: 121.4 }, { lat: 13.7, lng: 120.5 }, { lat: 90, lng: 180 }];
  let ok = true;
  junk.forEach(p => {
    const pl = S.busPlace({ lat: p.lat, lng: p.lng, direction: 'north' }, CP, CHAIN);
    if (!pl || pl.pct < 0 || pl.pct > 100 || !pl.label) ok = false;
  });
  check(ok, 'a position far off the route still produces a valid pill');
  check(S.busPlace({ lat: 14.5, lng: 121 }, [], []) === null, 'no checkpoints yet: returns null instead of throwing');
  check(S.busPlace({ lat: 14.5, lng: 121 }, CP, [0, 1]) === null, 'mismatched chain: returns null instead of throwing');
}

console.log(fail ? `\n${fail} FAILED` : '\nALL PASS');
process.exit(fail ? 1 : 0);
