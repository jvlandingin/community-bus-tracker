// Checks the tour as shipped: its steps, the words they say, the practice
// scene they say it over, where the words go on the screen, and the several
// things a practice run must never do — send anything, keep anything, or
// carry a name a content blocker hides.
//
// The code under test is pulled straight out of index.html by its comment
// markers, like the other suites, so a passing run here cannot drift from
// what the app does. Keep the markers intact when editing that region.
// test-boot.js drives a real run in a DOM; this suite needs nothing installed.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const guide = fs.readFileSync(path.join(ROOT, 'how-to.html'), 'utf8');

const between = (a, b) => {
  const i = html.indexOf(a), j = html.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error('marker missing: ' + (i < 0 ? a : b));
  return html.slice(i, j);
};
const walkSrc = between('// ---- THE TOUR (unit tested)', '// ---- END TOUR');
const prog = between('// ---- ROUTE PROGRESS + WRONG-DIRECTION GUARD', '// ---- END ROUTE PROGRESS');
const mine = between("// ---- THE READER'S OWN STOP (unit tested)", '// ---- END MY STOP');
const hav = between('function haversineKm(a,b){', 'function timeAgo(ts){');
const cpSrc = between('// ---- CHECKPOINT LINES (unit tested)', '// ---- END CHECKPOINT LINES');
const S = {};
new Function('S', hav + prog + mine + cpSrc + walkSrc +
  'S.WALKS=WALKS;S.WALK_ALT=WALK_ALT;S.walkSteps=walkSteps;S.walkWords=walkWords;S.walkPractice=walkPractice;' +
  'S.walkPlace=walkPlace;S.walkScroll=walkScroll;S.parseCheckpoint=parseCheckpoint;' +
  'S.buildRouteChain=buildRouteChain;S.routeProgressKm=routeProgressKm;S.stopChainKms=stopChainKms;' +
  'S.approachInfo=approachInfo;S.rideState=rideState;S.myStopWords=myStopWords;')(S);
// The rest of the page's tour code, which runs against the DOM.
const pageSrc = between('// ---- The tour on the page', '// ---- Trip mode');
const fn = name => {
  const a = html.indexOf('function ' + name + '(');
  return a < 0 ? '' : html.slice(a, html.indexOf('\n}', a) + 2);
};

let fail = 0;
const check = (c, label, note) => {
  console.log((c ? 'PASS  ' : 'FAIL  ') + label + (note ? '   ' + note : ''));
  if (!c) fail++;
};

const routeOf = file => {
  const txt = fs.readFileSync(path.join(ROOT, file), 'utf8').split(/\r?\n/);
  const cps = txt.filter(l => l.trim().startsWith('CHECKPOINT =')).map(l => S.parseCheckpoint(l.split('=')[1])).filter(Boolean);
  const stops = txt.filter(l => l.trim().startsWith('STOP =')).map(l => {
    const p = l.split('=')[1].split('|').map(x => x.trim());
    return { name: p[0], lat: +p[1], lng: +p[2] };
  });
  return { cps, stops, chain: S.buildRouteChain(cps) };
};

console.log('=== 1. two short tours, one per tab ===');
const names = Object.keys(S.WALKS);
check(names.join(',') === 'watch,share', 'a tour for the map and one for sharing', names.join(', '));
for (const n of names) {
  const steps = S.WALKS[n];
  // A minute each, as the guide and the first-visit note promise. Eight
  // short steps is about that; a ninth is a sign the tour is becoming the
  // guide again.
  check(steps.length >= 4 && steps.length <= 8, `${n}: four to eight steps`, steps.length + ' steps');
  check(steps[0].title && !steps[0].at, `${n}: it opens on a title, over the whole page`, steps[0].title);
  check(/practice/i.test(steps[0].words), `${n}: and its first words say this is a practice`, steps[0].words);
  const ids = steps.map(s => s.id);
  check(new Set(ids).size === ids.length, `${n}: every step has its own id`);
  const last = steps[steps.length - 1];
  check(last.alt && last.alt !== n && S.WALKS[last.alt] && S.WALK_ALT[last.alt],
    `${n}: its last step offers the other tour`, last.alt);
  check(steps.every(s => s.tab === 'track' || s.tab === 'share'), `${n}: every step names the tab it is on`);
}

console.log('\n=== 2. one thing per step, in few words ===');
// The guide was rewritten because it said too much. The tour is the place
// that must not: a bubble over the screen is read standing at a roadside.
const plain = t => t.replace(/<[^>]+>/g, '').replace(/\{(north|south)\}/g, 'One Ayala');
for (const n of names) {
  for (const s of S.WALKS[n]) {
    const words = plain(s.words).split(/\s+/).filter(Boolean).length;
    check(words <= 22, `${n}/${s.id}: ${words} words`, words > 22 ? plain(s.words) : '');
    // Distance and stops, never minutes: the same promise the card keeps.
    check(!/\bminutes?\b|\bETA\b|arriv(?:e|es|al) in/i.test(plain(s.words)), `${n}/${s.id}: promises no arrival time`);
    // Only <b> is written into the bubble as markup.
    check(!/<(?!\/?b>)/.test(s.words), `${n}/${s.id}: no markup but <b>`);
    if (s.tap) check(s.tap.split(/\s+/).length <= 5 && /^Tap /.test(s.tap), `${n}/${s.id}: its ask is a short "Tap ..."`, s.tap);
    // The words the Android app shows instead, held to the same rules.
    if (s.appWords){
      const aw = plain(s.appWords).split(/\s+/).filter(Boolean).length;
      check(aw <= 22 && !/<(?!\/?b>)/.test(s.appWords), `${n}/${s.id}: its words in the app are as short, and as plain`, plain(s.appWords));
      check(!/screen on/i.test(s.appWords), `${n}/${s.id}: and never tell an app user to keep the screen on`);
    }
  }
}
check(S.WALKS.share.some(s => /Keep the screen on/.test(s.words) && /lock the phone/.test(s.appWords || '')),
  'the sharing tour says "keep the screen on" in a browser and "lock the phone" in the app');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const filled = S.walkWords('The top line goes to {north}, the bottom line to {south}.', { north: 'One Ayala', south: 'Mendez <x>' }, esc);
check(filled === 'The top line goes to One Ayala, the bottom line to Mendez &lt;x&gt;.',
  'the route\'s own names go into the words, escaped', filled);
check(S.walkWords('{north}', null, esc) === '', 'and a missing name leaves nothing rather than a brace');

console.log('\n=== 3. every step points at something the page has ===');
const idOk = id => new RegExp('id="' + id + '"').test(html);
const classOk = c => new RegExp('class="[^"]*\\b' + c + '\\b').test(html) || new RegExp("className:'" + c + "'").test(html) || html.includes('.' + c + '{') || html.includes('.' + c + ' ');
const resolves = sel => sel === '@bus' || sel.split(/\s+/).every(part =>
  part.startsWith('#') ? idOk(part.slice(1)) : part.startsWith('.') ? classOk(part.slice(1)) : false);
for (const n of names) {
  for (const s of S.WALKS[n]) {
    if (s.at) check(resolves(s.at), `${n}/${s.id}: rings ${s.at}`);
    if (s.patch) check(resolves(s.patch), `${n}/${s.id}: and lays its patch on ${s.patch}`);
    if (s.patch) check(!!s.tap, `${n}/${s.id}: a patch only on a step that asks for a tap`);
  }
}
// Without the map, the steps that point into it go, and nothing else does.
for (const n of names) {
  const all = S.walkSteps(n, true), bare = S.walkSteps(n, false);
  const dropped = all.filter(s => !bare.includes(s)).map(s => s.id);
  check(dropped.every(id => all.find(s => s.id === id).need === 'map') &&
        bare.every(s => s.at !== '@bus' && !/leaflet/.test(s.at || '')),
    `${n}: a page with no map drops only the map's steps`, dropped.join(' ') || 'none');
}
check(S.walkSteps('nope', true).length === 0, 'an unknown tour has no steps');

console.log('\n=== 4. the practice scene says something true ===');
// The card under the map is the app's own: the practice bus and stop have
// to give it a real answer, or the step about it rings a card saying
// nothing is coming. Checked against this route and the template a fork
// starts from.
for (const file of ['config.txt', 'config-template.txt']) {
  const r = routeOf(file);
  const kmOf = p => S.routeProgressKm({ lat: p.lat, lng: p.lng }, r.cps, r.chain);
  const pr = S.walkPractice(r.cps, r.stops, kmOf);
  check(!!pr, `${file}: there is a practice scene`);
  if (!pr) continue;
  const busKm = kmOf(pr.bus), stopKm = kmOf(pr.stop);
  check(busKm > r.chain[1] && busKm < r.chain[2], `${file}: the bus is on the second leg of the route`,
    `${busKm.toFixed(1)} km, between ${r.cps[1].short} and ${r.cps[2].short}`);
  check(stopKm > busKm, `${file}: the stop is ahead of it`, `${pr.stop.name}, ${(stopKm - busKm).toFixed(1)} km on`);
  check(r.stops.some(s => s.name === pr.stop.name), `${file}: and is one of the route's own stops`, pr.stop.name);
  const kms = S.stopChainKms(r.stops, r.cps, r.chain);
  const info = S.approachInfo([{ id: 'practice', direction: 'north', label: 'Practice', ts: 1, km: busKm }], stopKm, kms, 'all');
  check(!!info && info.id === 'practice', `${file}: the card counts the practice bus as coming`,
    info ? S.myStopWords(info) : 'nothing coming');
  check(!!info && S.rideState(info) === 'near', `${file}: and flies Malapit na, which the step names`, info ? String(S.rideState(info)) : '');
}
check(S.walkPractice([{ lat: 1, lng: 1, name: 'A' }], [], () => 0) === null, 'a route of one checkpoint has no practice scene');
{
  const two = [{ name: 'A', lat: 14, lng: 121 }, { name: 'B', lat: 14.1, lng: 121 }];
  const pr = S.walkPractice(two, [], p => (p.lat - 14) * 100);
  check(pr && pr.stop.name === 'B', 'a route with no stops waits at the far checkpoint instead', pr && pr.stop.name);
}

console.log('\n=== 5. the words go where they can be read ===');
const V = { w: 390, h: 844, bw: 340, bh: 150 };
const box = (top, height, left = 16, width = 358) => ({ top, height, left, width, bottom: top + height, right: left + width });
let p = S.walkPlace(box(120, 100), V.w, V.h, V.bw, V.bh);
check(p.side === 'below' && p.top === 232, 'under a ring near the top', p.side + ' at ' + p.top);
p = S.walkPlace(box(620, 100), V.w, V.h, V.bw, V.bh);
check(p.side === 'above' && p.top + V.bh <= 620, 'over a ring near the foot', p.side + ' at ' + p.top);
p = S.walkPlace(box(20, 800), V.w, V.h, V.bw, V.bh);
check(p.side === 'foot' && p.top === V.h - V.bh - 12, 'along the foot of the screen when the ring fills it', p.side);
p = S.walkPlace(null, V.w, V.h, V.bw, V.bh);
check(p.side === 'middle' && Math.abs(p.top - (V.h - V.bh) / 2) < 1, 'in the middle when the step is about the whole page');
p = S.walkPlace(box(300, 30, 350, 30), V.w, V.h, V.bw, V.bh);
check(p.left >= 12 && p.left + V.bw <= V.w - 12, 'never off the side of the screen, even for a ring at its edge', 'left ' + p.left);
check(S.walkScroll(box(150, 100), V.h, V.bh) === 0, 'a ring already on screen with room for the words is not scrolled to');
check(S.walkScroll(box(1400, 100), V.h, V.bh) === 1384, 'one below the fold comes up to just under the top', String(S.walkScroll(box(1400, 100), V.h, V.bh)));
check(S.walkScroll(box(1400, 900), V.h, V.bh) === Math.round(1400 + 450 - V.h / 2), 'one too tall for that is centred');

console.log('\n=== 6. a practice run sends nothing and keeps nothing ===');
// The shade under the ring takes every tap, so none of these can be pressed
// during a run. They refuse anyway: a practice salamat reaching a stranger,
// or the practice stop replacing the reader's own, is the one thing this
// feature must not be able to do even by accident.
for (const name of ['sayThanks', 'sendBusLink', 'boardBus', 'leaveBus', 'persistMyStop', 'keepTicket', 'startSharing', 'addSighting']) {
  const body = fn(name);
  check(/^\s*if \(WALK\) return;/m.test(body.split('\n').slice(1, 3).join('\n')), `${name} refuses first thing while a run is on`);
}
check(/buzzOn\(\) && !BUZZED\[id\] && !WALK/.test(html), 'and the practice bus never buzzes the phone');
check(!/\brpc\(|\bfetch\(|sendBeacon|XMLHttpRequest/.test(walkSrc + pageSrc), 'the tour\'s own code makes no request');
check(!/sessionStorage/.test(walkSrc + pageSrc), 'and writes nothing to sessionStorage');
const lsKeys = [...(walkSrc + pageSrc).matchAll(/localStorage\.(?:setItem|removeItem|getItem)\('([^']+)'/g)].map(m => m[1]);
check(lsKeys.length > 0 && lsKeys.every(k => k === 'wt-guide-seen'),
  'and only ever touches the guide\'s own key, so the four things the privacy panel names are still four', [...new Set(lsKeys)].join(' '));
check(/const WALK_ID = '([^']+)'/.test(pageSrc) && !/^[0-9a-f]{32}$/.test(pageSrc.match(/const WALK_ID = '([^']+)'/)[1]),
  'the practice bus\'s id can never be a real bus\'s, which are 32 hex characters');
check(/bus_label:'Practice'/.test(pageSrc), 'and it is labelled Practice wherever a bus number would show');
check(/kick\.textContent = 'PRACTICE TICKET'/.test(pageSrc), 'its ticket says PRACTICE TICKET on its face');
check(/>PRACTICE</.test(html.slice(html.indexOf('id="walkBubble"'), html.indexOf('id="walkBubble"') + 600)),
  'and every bubble carries a PRACTICE tag');
// What is set aside on the way in is put back on the way out.
const save = fn('walkSave'), end = fn('endWalk');
for (const [k, v] of [['stop', 'MYSTOP'], ['aboard', 'ABOARD'], ['follow', 'FOLLOW'], ['filter', 'setFilter'], ['tab', 'switchTab'], ['dir', 'pickDir']]) {
  check(new RegExp('\\b' + k + ':').test(save) && new RegExp(v + '\\b').test(end), `the reader's ${k} is kept aside and put back`);
}
check(/function busesNow\(\)/.test(pageSrc) && /clusterBuses\(busesNow\(\)\)/.test(fn('renderBuses')) && /clusterBuses\(busesNow\(\)\)/.test(fn('focusBus')),
  'the map, strip, chips and card all draw the practice bus through one door');
check(/sightingsOn\(\) && !WALK \? SIGHTINGS/.test(fn('renderBuses')), 'and no real sighting is drawn beside it');

console.log('\n=== 7. it can be found, and a blocker cannot hide it ===');
// Filter lists carry rules for onboarding libraries by name, and a hidden
// bubble over a dimmed page is a page with no way out.
const names7 = [...html.matchAll(/(?:id|class|onclick)="([^"]*)"/g)].map(m => m[1]).join(' ');
const hunted = names7.match(/\S*(?:tour|tooltip|onboard|coachmark|walkthrough|introjs|shepherd|joyride)\S*/gi);
check(!hunted, 'nothing on the page is named tour, tooltip, onboard or after a tour library',
  hunted ? hunted.join(' ') : 'walk* instead');
check(/onclick="startWalk\('watch'\)"/.test(html) && /onclick="startWalk\('share'\)"/.test(html),
  'each tab has a quiet button that opens its tour');
check(/href="index\.html#tour"/.test(guide) && /href="index\.html#tour=share"/.test(guide), 'the guide opens both');
const re = new RegExp(fn('walkFromLink').match(/location\.hash\.match\((\/.*\/)\)/)[1].slice(1, -1));
check(re.test('#tour') && re.exec('#tour=share')[1] === 'share' && re.exec('#tour=watch')[1] === 'watch',
  'and the links it uses are the ones the map reads');
check(!re.test('#b=' + 'a'.repeat(32)) && !re.test('#k=secret'), 'which a followed bus or a share key is not');
check(/id="walkNew"/.test(html) && /function showWalkNew\(\)/.test(pageSrc) && /if \(seen \|\| WALK \|\| sharing\) return;/.test(fn('showWalkNew')),
  'a first visit is offered it once, never during a run or a share');

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
