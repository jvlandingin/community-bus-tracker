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
  'S.buildRouteChain=buildRouteChain;S.chainPosition=chainPosition;S.busPlace=busPlace;S.haversineKm=haversineKm;' +
  'S.storyFor=storyFor;S.parseTravel=parseTravel;S.travelRowFor=travelRowFor;S.departedSpan=departedSpan;S.spanWords=spanWords;')(S);
// parseSighting lives with the board, not in the block; it reads CHECKPOINTS.
const sightSrc = html.slice(html.indexOf('const SIGHT_RE ='), html.indexOf('let SIGHTINGS = ['));
const P = {};
new Function('P', 'CHECKPOINTS', sightSrc + 'P.parseSighting=parseSighting;P.originName=originName;P.sightingTime=sightingTime;')(P, (function(){
  const t = fs.readFileSync(path.join(ROOT, 'config-template.txt'), 'utf8').split(/\r?\n/);
  return t.filter(l => l.trim().startsWith('CHECKPOINT =')).map(l => { const p = l.split('=')[1].split('|').map(x => x.trim()); return { name: p[0], short: p[1] }; });
})());

const txt = fs.readFileSync(path.join(ROOT, 'config-template.txt'), 'utf8').split(/\r?\n/);
const CP = txt.filter(l => l.trim().startsWith('CHECKPOINT =')).map(l => {
  const p = l.split('=')[1].split('|').map(x => x.trim());
  return { name: p[0], short: p[1], lat: +p[2], lng: +p[3], about: p[4] || '' };
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

// 8. Kwento ng ruta: the line a bus's popup tells about the place it is at,
//    or the one it is heading for. The place has to be the one the pill
//    names, or the popup and the strip above it would disagree.
{
  const at = n => CP.find(c => c.short === n);
  const placed = (p, dir) => S.busPlace({ lat: p.lat, lng: p.lng, direction: dir }, CP, CHAIN);
  const amadeo = S.storyFor(placed(at('AMADEO'), 'north'), 'north', CP);
  check(amadeo && amadeo.lead === 'Passing' && amadeo.name === 'Amadeo' && /coffee/.test(amadeo.about),
    'at a checkpoint: the popup tells that place', amadeo && `${amadeo.lead} ${amadeo.name}, ${amadeo.about}`);
  check(S.storyFor(placed(at('MENDEZ'), 'north'), 'north', CP) === null,
    'a checkpoint with no line in config says nothing, rather than an empty "Passing"');

  const iA = CP.findIndex(c => c.short === 'AMADEO');
  const mid = alongLeg(iA, (CHAIN[iA + 1] - CHAIN[iA]) / 2);
  const up = S.storyFor(placed(mid, 'north'), 'north', CP);
  const down = S.storyFor(placed(mid, 'south'), 'south', CP);
  check(up && up.lead === 'Next up' && up.name === CP[iA + 1].name,
    'between two checkpoints, northbound: the one it will reach next', up && up.name);
  check(down && down.lead === 'Next up' && down.name === CP[iA].name,
    'and southbound, the other end of the same leg', down && down.name);
  const plUp = placed(mid, 'north'), plDown = placed(mid, 'south');
  check(plUp.label.endsWith(' to ' + CP[iA + 1].short) && plDown.label.endsWith(' to ' + CP[iA].short),
    'each the same place its pill points at', plUp.label + ' / ' + plDown.label);

  check(S.storyFor(null, 'north', CP) === null && S.storyFor(placed(mid, 'north'), 'north', []) === null,
    'nothing placed, or no checkpoints: no story, and no throw');

  // The lines are read in a popup as "Passing Amadeo, <line>", so each must
  // read as the end of that sentence, and be short enough for a phone popup.
  for (const file of ['config.txt', 'config-template.txt']) {
    const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split(/\r?\n/)
      .filter(l => l.trim().startsWith('CHECKPOINT ='))
      .map(l => (l.split('=')[1].split('|')[4] || '').trim()).filter(Boolean);
    const bad = lines.filter(t => !/^[a-z]/.test(t) || /[.!]$/.test(t) || t.length > 60);
    check(lines.length > 0 && bad.length === 0, `${file}: every line continues the sentence and fits a popup`,
      bad.length ? 'BAD: ' + bad.join(' / ') : lines.length + ' lines');
  }
}

// 9. A departure report and the stretch the bus is probably on. The
// numbers below are the template's seven checkpoints with made-up minutes;
// the real rows live in config.txt and came from the riders' chat.
{
  const early = S.parseTravel('north | 00:00-10:59 | TGY 10-25 | AMADEO 21-46 | GEN.T 46-68 | IMUS 67-100');
  const late = S.parseTravel('north | 11:00-23:59 | TGY 14-36 | AMADEO 34-71 | GEN.T 54-107 | IMUS 83-142 | KAWIT 108-165 | PITX 134-198 | AYALA 208-231');
  check(early && early.direction === 'north' && early.from === 0 && early.to === 659 && early.cols.length === 4
     && early.cols[3].short === 'IMUS' && early.cols[3].lo === 67 && early.cols[3].hi === 100, 'a TRAVEL line parses');
  check(S.parseTravel('east | 00:00-10:59 | TGY 10-25') === null && S.parseTravel('north | morning | TGY 10-25') === null
     && S.parseTravel('north | 00:00-10:59') === null && S.parseTravel('north | 00:00-10:59 | TGY ten') === null,
     'a bad direction, time range, no columns or bad minutes: not a row');
  check(S.parseTravel('north | 00:00-10:59 | TGY 10-25 | AMADEO 8-46') === null && S.parseTravel('north | 00:00-10:59 | TGY 30-25') === null,
     'minutes that go backwards along the route, or max before min: not a row');
  check(S.travelRowFor([early, late], 'north', 4 * 60) === early && S.travelRowFor([early, late], 'north', 15 * 60 + 40) === late
     && S.travelRowFor([early, late], 'south', 4 * 60) === null, 'the row is picked by direction and departure time');

  const sp = (row, mins) => S.departedSpan(row, CP, mins);
  const z = sp(early, 0);
  check(z && z.from === 0 && z.to === 0, 'the moment it leaves, the stretch is the terminal itself');
  const a = sp(early, 30);
  check(a && near(a.from, 1 + (30 - 25) / (46 - 25), 1e-6) && near(a.to, 2 + (30 - 21) / (46 - 21), 1e-6),
     '30 min into an early run: the slowest trip is past Tagaytay, the fastest past Amadeo', a && `${a.from.toFixed(2)} .. ${a.to.toFixed(2)}`);
  check(S.spanWords(a, CP) === 'between Tagaytay and Gen. Trias', 'and the words name the places either side', S.spanWords(a, CP));
  const b = sp(early, 70);
  check(b && b.to === 4 && near(b.from, 3 + (70 - 68) / (100 - 68), 1e-6),
     '70 min: the fastest edge stops at Imus, the last checkpoint the row knows, rather than guessing on');
  check(S.spanWords(b, CP) === 'between Gen. Trias and Imus', 'words at the end of the table', S.spanWords(b, CP));
  check(sp(early, 100) !== null && sp(early, 101) === null, 'past the slowest trip\'s Imus the report is dropped, not stretched');
  check(sp(early, -5) === null && S.departedSpan(null, CP, 10) === null, 'nonsense elapsed or no row: nothing');
  const unknown = S.parseTravel('north | 00:00-23:59 | NOWHERE 10-20 | ELSEWHERE 30-40');
  check(S.departedSpan(unknown, CP, 15) === null, 'a row naming checkpoints this route does not have draws nothing');
  const late2 = sp(late, 220);
  check(late2 && late2.to === 6 && late2.from > 5 && late2.from < 6, 'an afternoon run at 220 min: between PITX and One Ayala by the slowest, arrived by the fastest');
  check(S.spanWords(late2, CP) === 'between PITX and One Ayala', 'words at the far end', S.spanWords(late2, CP));
  // Southbound mirrors: the origin is the last checkpoint and the indices run down.
  const south = S.parseTravel('south | 00:00-23:59 | PITX 20-40 | IMUS 60-90');
  const sS = sp(south, 50);
  check(sS && !sS.north && near(sS.from, 5 - (50 - 40) / (90 - 40), 1e-6) && near(sS.to, 5 - (50 - 20) / (60 - 20), 1e-6),
     'southbound: the stretch runs down the indices from One Ayala', sS && `${sS.from.toFixed(2)} .. ${sS.to.toFixed(2)}`);
  check(S.spanWords(sS, CP) === 'between PITX and Imus', 'southbound words put the place behind first', S.spanWords(sS, CP));
  // A plain sighting counts from the place it was seen, with the row's
  // minutes from there on; each leg is the shorter and the longer of the
  // two columns' differences, so the fastest edge stays ahead.
  const iAm = CP.findIndex(c => c.short === 'AMADEO');
  const s0 = S.departedSpan(early, CP, 0, iAm);
  check(s0 && s0.from === iAm && s0.to === iAm, 'seen at Amadeo just now: the stretch is Amadeo');
  const s20 = S.departedSpan(early, CP, 20, iAm);
  // Amadeo to Gen. Trias: lo column 21 to 46 (25 min), hi column 46 to 68 (22 min): 22 for the fastest, 25 for the slowest.
  check(s20 && near(s20.to, iAm + 20 / 22, 1e-6) && near(s20.from, iAm + 20 / 25, 1e-6) && s20.to > s20.from,
     '20 min after Amadeo: between Amadeo and Gen. Trias, fastest edge ahead', s20 && `${s20.from.toFixed(2)} .. ${s20.to.toFixed(2)}`);
  check(S.spanWords(s20, CP) === 'between Amadeo and Gen. Trias', 'and the words say so', S.spanWords(s20, CP));
  // Gen. Trias to Imus: lo 46 to 67 (21), hi 68 to 100 (32): fastest 21, slowest 32; cumulative lo 43, hi 57.
  const s50 = S.departedSpan(early, CP, 50, iAm);
  check(s50 && s50.to === iAm + 2 && near(s50.from, iAm + 1 + (50 - 25) / 32, 1e-6),
     '50 min after Amadeo: the fastest edge has reached Imus, the last place the row knows, and stops there; the slowest is past Gen. Trias', s50 && `${s50.from.toFixed(2)} .. ${s50.to.toFixed(2)}`);
  check(S.departedSpan(early, CP, 58, iAm) === null, 'past the slowest trip\'s Imus from Amadeo (57 min): dropped');
  const iPitx = CP.findIndex(c => c.short === 'PITX');
  check(S.departedSpan(early, CP, 5, iPitx) === null, 'seen at a place the row has no column for: nothing to count from');
  check(S.departedSpan(early, CP, 30, 0).to === sp(early, 30).to, 'from the terminal the columns are used exactly as measured');

  // Nothing here may ever turn into a time to come.
  const blk = html.slice(html.indexOf('// ---- A departure report'), html.indexOf('// ---- END ROUTE PROGRESS'));
  check(!/\b(eta|arriv\w+ in|minutes? (to|until|away)|mins? (to|until|away))\b/i.test(blk.replace(/\/\/.*$/gm, '')),
     'the span code never speaks of minutes to come');
  const dsAt = html.indexOf('function departedSentence(');
  check(dsAt > 0 && !/\d+ ?min/.test(html.slice(dsAt, html.indexOf('\n}\n', dsAt))),
     'nor does the sentence built from it');
  // The glow is a bell that widens and fades with uncertainty, and the guide says so.
  const strip = html.slice(html.indexOf('function renderStrip('), html.indexOf('function syncMineStation('));
  check(/const alpha = \(0\.72 - 0\.4 \* Math\.min\(1, \(hi - lo\) \/ 40\)\)/.test(strip) && /tail = \(hi - lo\) \* 0\.25/.test(strip),
     'the glow fades as the stretch widens and tails off a quarter beyond each end');
  check(/\.sightband\{[^}]*mask-image:linear-gradient\(90deg, transparent 0%/.test(html), 'and is masked to a bell');
  const guide = fs.readFileSync(path.join(ROOT, 'how-to.html'), 'utf8');
  check(/shaped like a bell/.test(guide) && /wider and\s+fainter/.test(guide) && /class="demo ages"/.test(guide),
     'the guide explains the bell and shows one sighting at three ages');
}

// 10. The two verbs a sighting can carry.
{
  const at = P.parseSighting('▲ Northbound at Amadeo · heavy traffic');
  check(at && at.direction === 'north' && at.kind === 'at' && CP[at.idx].short === 'AMADEO', 'a plain sighting reads as before, now with a kind');
  const left = P.parseSighting('▲ Northbound left Mendez Crossing');
  check(left && left.kind === 'left' && left.idx === 0, '"left Mendez Crossing" northbound is a departure');
  const leftS = P.parseSighting('▼ Southbound left One Ayala · 2nd trip');
  check(leftS && leftS.kind === 'left' && leftS.idx === CP.length - 1, '"left One Ayala" southbound is a departure');
  const notOrigin = P.parseSighting('▲ Northbound left Amadeo');
  check(notOrigin && notOrigin.kind === 'at' && CP[notOrigin.idx].short === 'AMADEO', '"left" a place that is not the terminal is a plain sighting there');
  const wrongEnd = P.parseSighting('▼ Southbound left Mendez Crossing');
  check(wrongEnd && wrongEnd.kind === 'at', 'nor is "left" the far terminal a departure');
  check(P.parseSighting('bus coming') === null && P.parseSighting('▲ Northbound left Nowhere') === null, 'free text and unknown places still do not place');
  check(P.originName('north') === 'Mendez Crossing' && P.originName('south') === 'One Ayala', 'the composer names the right terminal');
  check(at.at === null && left.at === null, 'without a stated time, none is read');
  const timed = P.parseSighting('▲ Northbound at Amadeo, 3:05 PM · heavy traffic');
  check(timed && timed.kind === 'at' && CP[timed.idx].short === 'AMADEO' && timed.at === 15 * 60 + 5, 'a stated time after the place is read as minutes of the day', timed && String(timed.at));
  const timedLeft = P.parseSighting('▲ Northbound left Mendez Crossing, 12:40 am');
  check(timedLeft && timedLeft.kind === 'left' && timedLeft.at === 40, 'a departure may carry one too; 12:40 am is forty minutes past midnight');
  const noon = P.parseSighting('▼ Southbound at PITX, 12:00 PM');
  check(noon && noon.at === 12 * 60, 'noon is 12:00 PM');
  check(P.parseSighting('▲ Northbound at Amadeo, 25:00 PM') === null || P.parseSighting('▲ Northbound at Amadeo, 25:00 PM').at === null, 'a time that is not a time is ignored, not a crash');
}

// 11. When a sighting happened: the stated time against the post's time.
{
  const day = new Date(2026, 9, 16, 15, 25).getTime();   // posted Friday 3:25 PM
  const M = (h, m) => h * 60 + m;
  check(P.sightingTime(day, null) === day, 'no stated time: the post time');
  check(P.sightingTime(day, M(15, 5)) === day - 20 * 60000, '3:05 PM stated at 3:25: twenty minutes back');
  check(P.sightingTime(day, M(14, 25)) === day - 60 * 60000, 'an hour back: allowed');
  check(P.sightingTime(day, M(12, 25)) === day - 180 * 60000, 'three hours back: allowed, a rider far down the road still gets the stretch');
  check(P.sightingTime(day, M(11, 25)) === day - 240 * 60000, 'four hours back, the length of a trip, is the limit and is allowed');
  check(P.sightingTime(day, M(11, 24)) === day, 'older than a whole trip: that bus has arrived, so the post time stands');
  // The limit is the trip's length, which the hours block owns.
  const enRoute = /const EN_ROUTE_MIN = (\d+);/.exec(html), back = /const SIGHT_BACK_MS = (\d+) \* 60000;/.exec(html);
  check(enRoute && back && enRoute[1] === back[1], 'and it is the same four hours the en-route allowance uses', (enRoute && enRoute[1]) + ' vs ' + (back && back[1]));
  check(P.sightingTime(day, M(16, 0)) === day, 'a time after the post: nobody saw a bus that has not left, the post time stands');
  check(P.sightingTime(day, M(15, 25)) === day && P.sightingTime(day, M(15, 26)) === day, 'the same minute, or the next, is now');
  const night = new Date(2026, 9, 17, 0, 10).getTime();  // posted 12:10 AM
  check(P.sightingTime(night, M(23, 55)) === night - 15 * 60000, 'just after midnight, 11:55 PM is last night, fifteen minutes back');
}

console.log(fail ? `\n${fail} FAILED` : '\nALL PASS');
process.exit(fail ? 1 : 0);
