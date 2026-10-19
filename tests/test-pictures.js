// Checks the pictures as shipped: the coach and the view from the ridge on
// the empty map, which of them the map shows when, the marks beside a
// checkpoint's line and on the ticket's stops, the checkpoint lines in
// config.txt that choose them, the picture of a trip's two ends on its
// ticket, and the copies drawn into the other pages.
//
// The code under test is pulled out of index.html by its comment markers,
// like the other suites, and tools/make-pictures.js runs the same blocks, so
// a pass here cannot drift from either. Keep the markers intact.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = read('index.html');
const tool = require(path.join(ROOT, 'tools', 'make-pictures.js'));
const S = tool.renderer();
const slice = (a, b) => html.slice(html.indexOf(a), html.indexOf(b));
new Function('S', slice('// ---- CHECKPOINT LINES (unit tested)', '// ---- END CHECKPOINT LINES') +
  slice('function mapNoteKind(', '// Closed, the card is a picture') +
  'S.parseCheckpoint=parseCheckpoint;S.mapNoteKind=mapNoteKind;')(S);

let fail = 0;
const check = (c, label, note) => {
  console.log((c ? 'PASS  ' : 'FAIL  ') + label + (note ? '   ' + note : ''));
  if (!c) fail++;
};

console.log('=== 1. a checkpoint line ===');
const four = S.parseCheckpoint('Mendez Crossing | MENDEZ | 14.0997 | 120.9145');
check(four && four.short === 'MENDEZ' && four.about === '' && four.mark === '', 'four fields: a place, no line, no mark, as it always was');
const five = S.parseCheckpoint('Amadeo | AMADEO | 14.17 | 120.92 | the coffee capital of the Philippines');
check(five && five.about === 'the coffee capital of the Philippines' && five.mark === '', 'five: a line about it, and still no mark');
const six = S.parseCheckpoint('Amadeo | AMADEO | 14.17 | 120.92 | the coffee capital | Coffee');
check(six && six.about === 'the coffee capital' && six.mark === 'coffee', 'six: and a mark, whatever its capitals');
const blank = S.parseCheckpoint('Mendez Crossing | MENDEZ | 14.0997 | 120.9145 | | crossing');
check(blank && blank.about === '' && blank.mark === 'crossing', 'an empty line with a mark: a picture and nothing to say');
check(S.parseCheckpoint('Nowhere | X | 14.1') === null && S.parseCheckpoint('a|b|1|2|c|d|e') === null, 'too few or too many fields: not a checkpoint');
for (const file of ['config.txt', 'config-template.txt']) {
  const cps = read(file).split(/\r?\n/).filter(l => l.trim().startsWith('CHECKPOINT =')).map(l => S.parseCheckpoint(l.split('=')[1]));
  const unknown = cps.filter(c => !c || (c.mark && !(c.mark in S.MARKS)));
  check(cps.length > 0 && !unknown.length, `${file}: every checkpoint parses, and every mark it names is one that is drawn`,
    unknown.length ? 'unknown: ' + unknown.map(c => c ? c.short + '=' + c.mark : 'unparsed').join(' ') : cps.map(c => c.short + ':' + (c.mark || '-')).join(' '));
}

console.log('\n=== 2. the marks ===');
const names = Object.keys(S.MARKS);
check(names.length >= 8, 'a mark for each kind of place the route passes', names.join(' '));
// The content-blocker rule from CLAUDE.md, for names that end up in class
// lists and markup: a mark called "heart" or "like" would vanish.
const banned = /share|help|support|chat|widget|like|fav|thumb|heart|vote|social|clap/;
check(!names.some(n => banned.test(n)), 'no mark is named like a social widget');
for (const n of names) {
  const svg = S.markSvg(n);
  check(/^<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"/.test(svg) && /stroke="currentColor"/.test(svg),
    `${n}: drawn in the text's colour, hidden from screen readers`);
}
check(S.markSvg('nothing-like-it') === '' && S.markSvg('') === '' && S.markSvg(undefined) === '', 'an unknown or missing mark draws nothing');
check(S.markSvg('COFFEE') === S.markSvg('coffee'), 'and the name is not fussy about capitals');
check(!/<text|https?:/.test(Object.values(S.MARKS).join('')), 'marks are lines, with no words in them and nothing loaded');

console.log('\n=== 3. the scenes ===');
for (const t of ['night', 'dawn', 'day']) {
  const svg = S.sceneSvg(t, 'x');
  check(/^<svg class="scene" viewBox="0 110 640 190" aria-hidden="true"/.test(svg), `${t}: a picture of the ridge, hidden from screen readers`);
  check(svg.includes('viewBox="0 0 364 136">' + S.COACH_SIDE + '</svg>'), `${t}: with the coach in it`);
  const ids = [...svg.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  check(ids.length > 0 && ids.every(i => i.startsWith('x-')), `${t}: every id is the scene's own, so two on a page do not collide`, ids.join(' '));
}
check(S.sceneSvg('noon') === '' && S.sceneSvg() === '', 'an unknown time of day draws nothing');
check(/<text/.test(S.sceneSvg('night')) && !/<text/.test(S.sceneSvg('dawn') + S.sceneSvg('day')), 'the only words in any of them are the night\'s z z Z');
check(!/https?:|href="(?!#)/.test(S.sceneSvg('night') + S.sceneSvg('dawn') + S.sceneSvg('day')), 'and nothing is loaded by any of them');
// Not the operator's look: the coach is painted in the app's own palette,
// from custom properties, and carries no lettering.
check(!/<text/.test(S.COACH_SIDE) && /var\(--c-band\)/.test(S.COACH_SIDE), 'the coach has no lettering and takes its colours from the scene');
const palette = ['#7a1f2b', '#e39a1c'];
check(palette.every(c => S.SCENE_TIMES.dawn.coach.includes(c)), 'by day its band and trim are the app\'s maroon and gold');

console.log('\n=== 4. which one the empty map shows ===');
const M = (h, m) => h * 60 + (m || 0);
const first = (wait) => ({ wait, label: 'x' });
check(S.mapNoteKind(M(23), 'closed', first(300)) === 'night', '11 at night: tulog pa');
check(S.mapNoteKind(M(2), 'closed', first(120)) === 'night', '2 in the morning, two hours out: still asleep');
check(S.mapNoteKind(M(3, 30), 'closed', first(30)) === 'dawn', 'half an hour before the first trip: gising na');
check(S.mapNoteKind(M(3), 'closed', first(60)) === 'dawn', 'an hour before: gising na, at the edge');
check(S.mapNoteKind(M(13), 'closed', first(160)) === 'midday', '1 in the afternoon, between the windows: the midday break');
check(S.mapNoteKind(M(15, 10), 'closed', first(30)) === 'midday', 'and half an hour before the afternoon trips it is still day, not dawn');
check(S.mapNoteKind(M(18, 30), 'closed', first(570)) === 'night', 'half past six in the evening: night');
check(S.mapNoteKind(M(9), 'open', null) === 'open' && S.mapNoteKind(M(21), 'enroute', null) === 'open', 'inside hours, or buses still out: the plain card with a way to share');
check(S.mapNoteKind(M(23), 'closed', null) === 'night', 'no hours set anywhere: it does not claim a dawn');
const note = slice('function renderMapNote(', '// ---- Follow my bus');
check(/sceneSvg\(time, 'mapscene'\)/.test(note) && /kind === 'midday' \? 'day' : kind/.test(note), 'and the map draws the scene for it');
check(/const first = firstNextTrip\(m\);/.test(note), 'from the earliest trip of either direction');

console.log('\n=== 5. where the marks are drawn ===');
const story = html.slice(html.indexOf('function storyFor('), html.indexOf('const DIRGUARD'));
check(/mark: cp\.mark \|\| ''/.test(story), 'the popup\'s line about a place carries the place\'s mark');
check(/'<div class="kw">'\+markSvg\(story\.mark\)\+/.test(html), 'and draws it beside the words');
const tkt = html.slice(html.indexOf('function showTicket('), html.indexOf('// ---- Trip mode'));
check(/markSvg\(c\.mark\)/.test(tkt), 'every stop on the ticket carries its mark');
check(/class="tkt-row"><div class="tkt-dur">[\s\S]*stamp\(0\)/.test(tkt) && /tkt-greet">[\s\S]*stamp\(1\)/.test(tkt),
  'and its stamps sit beside the time and the goodbye, not over the words');
check(!/tkt-stamps/.test(html), 'the old stamp box that sat over the words is gone');

console.log('\n=== 6. the picture on a ticket ===');
// The two ends of the trip as roadside signs carrying their marks, the coach
// between them heading for the second, under the sky the stamps give. Two
// different trips are two different pictures, which is what makes kept
// tickets a collection rather than a pile of the same card.
for (const sky of Object.keys(S.TICKET_SKIES)) {
  const svg = S.ticketArtSvg({ from: 'volcano', to: 'towers', sky });
  check(/^<svg class="tktart" viewBox="0 0 300 84" aria-hidden="true"/.test(svg), `${sky}: a picture, hidden from screen readers`);
  check(svg.includes(S.MARKS.volcano) && svg.includes(S.MARKS.towers), `${sky}: carrying the marks of both ends`);
  check(svg.includes('viewBox="0 0 364 136">' + S.COACH_SIDE + '</svg>'), `${sky}: with the coach on the road between them`);
  check(!/ id="/.test(svg), `${sky}: and no ids, so a page of kept tickets never collides`);
  check(!/<text|https?:|href=/.test(svg), `${sky}: no words in it and nothing loaded`);
}
check(Object.keys(S.TICKET_SKIES).join(',') === 'day,dawn,night', 'three skies, the stamps\' times of day');
check(S.ticketArtSvg({ from: 'volcano', to: 'towers', sky: 'noon' }) === S.ticketArtSvg({ from: 'volcano', to: 'towers', sky: 'day' }) &&
      S.ticketArtSvg() === S.ticketArtSvg({ sky: 'day' }), 'a sky it does not know is daytime');
{
  const at = (svg, mark) => {
    const m = new RegExp('<svg x="([\\d.]+)" y="17"[^>]*>' + S.MARKS[mark].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).exec(svg);
    return m ? +m[1] : -1;
  };
  const ab = S.ticketArtSvg({ from: 'coffee', to: 'shrine', sky: 'day' });
  check(at(ab, 'coffee') >= 0 && at(ab, 'coffee') < at(ab, 'shrine'), 'read like the ticket: where it was boarded on the left, left on the right',
    at(ab, 'coffee') + ' < ' + at(ab, 'shrine'));
  const ba = S.ticketArtSvg({ from: 'shrine', to: 'coffee', sky: 'day' });
  const ac = S.ticketArtSvg({ from: 'coffee', to: 'terminal', sky: 'day' });
  check(ab !== ba && ab !== ac && ab !== S.ticketArtSvg({ from: 'coffee', to: 'shrine', sky: 'night' }),
    'so the other way round, another end or another sky is another picture');
  const signs = svg => (svg.match(/r="22"/g) || []).length;
  check(signs(ab) === 2 && signs(S.ticketArtSvg({ from: 'coffee', to: 'coffee', sky: 'day', one: true })) === 1,
    'a trip that began and ended by the same place gets one sign, not two of the same');
  const plain = S.ticketArtSvg({ from: '', to: 'nothing-like-it', sky: 'day' });
  check(signs(plain) === 2 && (plain.match(/r="7" fill="none"/g) || []).length === 2,
    'a place with no mark gets the strip\'s plain station ring, not a hole');
  check(!/<text/.test(Object.values(S.TICKET_SKIES).map(t => t.coach).join('')) &&
        S.TICKET_SKIES.day.coach === S.SCENE_TIMES.day.coach && /--c-glass:#f3c56b/.test(S.TICKET_SKIES.night.coach),
    'the coach is the app\'s own, by day as on the empty map, and at night with its windows lit');
}
// Behind the coach, the view at the trip's destination: Taal Lake for a
// trip that ends at Tagaytay, towers for one that ends in the city. One for
// every kind of place a mark can name, chosen by the same field of config.txt,
// so a fork's places get views without a line of code naming a town.
{
  const kinds = Object.keys(S.MARKS).sort();
  check(Object.keys(S.TICKET_VIEWS).sort().join(',') === kinds.join(','), 'a view for every kind of place the marks can name',
    Object.keys(S.TICKET_VIEWS).sort().join(' '));
  const viewOf = (kind, sky) => S.TICKET_VIEWS[kind](S.TICKET_SKIES[sky]);
  const all = [];
  for (const kind of kinds) for (const sky of Object.keys(S.TICKET_SKIES)) all.push({ kind, sky, v: viewOf(kind, sky) });
  check(all.every(x => S.ticketArtSvg({ from: 'crossing', to: x.kind, sky: x.sky }).includes(x.v)),
    'and the picture of a trip draws the view of the place it ended at, under its sky');
  const toTowers = S.ticketArtSvg({ from: 'volcano', to: 'towers', sky: 'day' });
  check(toTowers.includes(viewOf('towers', 'day')) && !toTowers.includes(viewOf('volcano', 'day')),
    'the view is the destination\'s, never the place it was boarded at');
  const nowhere = S.ticketArtSvg({ from: 'volcano', to: '', sky: 'day' });
  check(!all.some(x => nowhere.includes(x.v)), 'an end with no mark gets the plain hills, not somebody else\'s view');
  check(S.ticketArtSvg({ from: 'coffee', to: 'coffee', sky: 'night', one: true }).includes(viewOf('coffee', 'night')),
    'and a trip that began and ended by the same place shows that place');
  check(all.every(x => {
    const svg = S.ticketArtSvg({ from: 'church', to: x.kind, sky: x.sky });
    const at = svg.indexOf(x.v);
    return at > 0 && at < svg.indexOf('r="22"') && at < svg.indexOf('viewBox="0 0 364 136"');
  }), 'drawn behind the signs and the coach, so it never covers a mark or the bus');
  check(all.every(x => !/ id="|<text|https?:|href=|r="22"|r="7" fill="none"/.test(x.v)),
    'with no ids, no words and nothing loaded, and nothing that could be taken for a sign');
  const byDay = kinds.map(k => viewOf(k, 'day'));
  check(new Set(byDay).size === kinds.length, 'every kind of place is its own picture');
  const lit = ['towers', 'terminal', 'church', 'shrine', 'crossing'];
  check(S.TICKET_SKIES.night.win === '#f3c56b' && lit.every(k => viewOf(k, 'night').includes('#f3c56b') && !viewOf(k, 'day').includes('#f3c56b')),
    'and at night the buildings have their lights on, like the coach', lit.join(' '));
  // The flag of the Philippines is flown with the blue on top in time of
  // peace; red on top means a state of war. The view that flies it must
  // never be the second, and the triangle belongs at the hoist.
  const flag = viewOf('flag', 'day');
  const yOf = fill => { const m = new RegExp('<rect x="([\\d.]+)" y="([\\d.]+)" width="([\\d.]+)" height="([\\d.]+)" fill="' + fill + '"').exec(flag); return m ? m.slice(1).map(Number) : null; };
  const blue = yOf('#0038a8'), red = yOf('#ce1126');
  const tri = /<path d="M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)Z" fill="#fff"\/>/.exec(flag);
  check(!!blue && !!red && blue[1] < red[1] && blue[0] === red[0] && blue[2] === red[2] && blue[3] === red[3],
    'the flag flies blue above red, as in time of peace', blue && red ? `blue y ${blue[1]}, red y ${red[1]}` : 'not found');
  check(!!tri && !!blue && +tri[1] === blue[0] && +tri[5] === blue[0] && +tri[3] > blue[0] && blue[2] === 2 * (blue[3] + red[3]),
    'with the white triangle at the hoist, on a flag twice as long as it is high');
}
const tktCode = slice('function showTicket(', '// ---- Trip mode');
check(/tktArt\(fromIdx, toIdx, TKT_KEEP\) \+ tktGrid\(fromIdx, toIdx\)/.test(tktCode),
  'the ticket at Stop draws it above its punched stops');
check(/tktArt\(a, b, e\) \+ tktGrid\(a, b\)/.test(tktCode) && /tktArt\(a, b, e\) \+\s*'<span class="tm-date">/.test(tktCode),
  'and so do a kept ticket and its card in the album, from what was kept');
check(/sky:ticketSky\(e\.st\)/.test(tktCode) && /mark\(fromIdx\), to:mark\(toIdx\)/.test(tktCode) && /look:look \}/.test(tktCode),
  'from the marks config.txt gives the two ends, the sky the stamps give, and the ticket\'s luck');

console.log('\n=== 6b. a ticket\'s luck, drawn ===');
// What ticketLook (the album block, tested in test-thanks.js) chooses, this
// block draws: the sights in their places, the moon of the night, gold for a
// rare one, and each sight on its own as the album's sticker.
{
  const keys = Object.keys(S.TICKET_SIGHTS);
  const plain = { from: 'volcano', to: 'towers', sky: 'day' };
  check(S.ticketArtSvg(plain) === S.ticketArtSvg(Object.assign({ look: null }, plain)),
    'with no luck the picture is the plain one, as it always was');
  const lookWith = (o) => Object.assign({ paper: 'cream', punch: 'round', road: '', air: '', weather: '', season: '', moon: -1, rare: false, meteor: false, sights: [] }, o);
  const where = { road: ['jeepney', 'tricycle', 'carabao', 'sorbetes', 'stall'], air: ['kites', 'birds'], weather: ['rain', 'fog', 'rainbow', 'double'],
                  season: ['parol', 'banderitas', 'flags'] };
  const drawn = [];
  for (const [field, names] of Object.entries(where)) for (const k of names) {
    const sky = k === 'parol' ? 'night' : 'day';
    const svg = S.ticketArtSvg(Object.assign({ look: lookWith({ [field]: k }) }, plain, { sky }));
    const c = k === 'rain' ? Object.assign({}, S.TICKET_SKIES.day, { sky: '#d3dde3' }) : S.TICKET_SKIES[sky];
    if (svg.includes(S.TICKET_SIGHTS[k].draw(c, sky)) && svg !== S.ticketArtSvg(Object.assign({}, plain, { sky }))) drawn.push(k);
  }
  const meteor = S.ticketArtSvg(Object.assign({ look: lookWith({ meteor: true, moon: 2 }) }, plain, { sky: 'night' }));
  if (meteor.includes(S.TICKET_SIGHTS.meteor.draw(S.TICKET_SKIES.night, 'night'))) drawn.push('meteor');
  const full = S.ticketArtSvg(Object.assign({ look: lookWith({ moon: 4 }) }, plain, { sky: 'night' }));
  if (full.includes(S.moonSvg(4, S.TICKET_SKIES.night))) drawn.push('fullmoon');
  check(drawn.sort().join(',') === keys.slice().sort().join(','), 'every sight is drawn into the picture when its ticket has it', drawn.length + ' of ' + keys.length);
  const moons = [0, 1, 2, 3, 4, 5, 6, 7].map(p => S.moonSvg(p, S.TICKET_SKIES.night));
  check(moons[0] === '' && new Set(moons).size === 8 && /<circle cx="112" cy="15" r="8"/.test(moons[4]),
    'the moon has its eight shapes: none at the new moon, round at the full');
  const gold = S.ticketArtSvg(Object.assign({ look: lookWith({ rare: true }) }, plain));
  check(/stroke="#d4a017"/.test(gold) && !/stroke="#d4a017"/.test(S.ticketArtSvg(Object.assign({ look: lookWith({}) }, plain))),
    'a rare ticket has a gold edge, and no other does');
  const lucky = Object.keys(where).flatMap(f => where[f].map(k => S.ticketArtSvg(Object.assign({ look: lookWith({ [f]: k, rare: true, moon: 3 }) }, plain, { sky: 'night' }))));
  check(lucky.every(v => !/ id="|<text|https?:|href=/.test(v)), 'with luck too, no ids, no words and nothing loaded');
  const tiles = keys.map(k => S.sightTile(k));
  check(tiles.every(t => /^<svg class="sight" viewBox="[\d. ]+" aria-hidden="true"/.test(t) && !/ id="|<text|https?:|href=/.test(t)),
    'each sight has its sticker, hidden from screen readers, with no ids, words or links');
  check(tiles.every((t, i) => { const b = S.TICKET_SIGHTS[keys[i]].box.split(' ').map(Number); return Math.abs(b[2] / b[3] - 5 / 3) < .01; }),
    'all cut to the same shape, so the album\'s stickers line up');
  check(S.sightTile('nothing-like-it') === '', 'and an unknown sight draws nothing');
  // The coach flies two flags on the flag days. Held to the same rules as
  // the monument's: blue above red, the triangle at the hoist, 2:1.
  const flags = S.TICKET_SIGHTS.flags.draw();
  const pairs = [...flags.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="(#0038a8|#ce1126)"\/>/g)].map(m => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4], c: m[5] }));
  const tris = [...flags.matchAll(/<path d="M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)Z" fill="#fff"\/>/g)].map(m => m.slice(1).map(Number));
  const ok = pairs.length === 4 && tris.length === 2 && [0, 2].every((i, j) => {
    const blue = pairs[i], red = pairs[i + 1], t = tris[j], hoist = blue.x + blue.w;
    return blue.c === '#0038a8' && red.c === '#ce1126' && blue.y < red.y && blue.w === 2 * (blue.h + red.h) &&
      t[0] === hoist && t[4] === hoist && t[2] < hoist;
  });
  check(ok, 'the flags on the coach fly blue above red, the triangle at the hoist, twice as long as high');
}

console.log('\n=== 7. the copies in other pages are current ===');
const expect = { 'how-to.html': 1, 'flyer.html': 1, 'for-operators.html': 1, 'testers.html': 1, 'tools/app-icons.html': 0 };
for (const f of tool.FILES) {
  const src = read(f);
  const sc = tool.scenes(src, S);
  check(sc.length === expect[f], `${f}: has its ${expect[f]} cover scene${expect[f] === 1 ? '' : 's'}`, sc.map(x => x.time).join(' '));
  const stale = sc.filter(x => x.current !== x.wanted);
  check(!stale.length, `${f}: drawn by the tracker's own code, as it is now`,
    stale.length ? 'stale (run node tools/make-pictures.js)' : 'current');
}
// The guide redraws the ticket by hand, and its stops carry marks: each must
// be the drawing config.txt gives that stop. Its picture is drawn into it by
// the tool, and must show the two stops the ticket punches, under the sky its
// stamps give.
const guide = read('how-to.html');
const cfg = Object.fromEntries(read('config.txt').split(/\r?\n/).filter(l => l.trim().startsWith('CHECKPOINT ='))
  .map(l => S.parseCheckpoint(l.split('=')[1])).map(c => [c.short, c.mark]));
const stops = [...guide.matchAll(/<span(?: class="on")?>(<svg class="mark"[^]*?<\/svg>)<b>([^<]+)<\/b><\/span>/g)];
const wrong = stops.filter(m => m[1] !== S.markSvg(cfg[m[2]]));
check(stops.length === Object.keys(cfg).length && !wrong.length, 'how-to.html: the ticket\'s stops carry the marks config.txt gives them',
  wrong.length ? 'wrong: ' + wrong.map(m => m[2]).join(' ') : stops.length + ' stops');
const art = tool.arts(guide, S);
check(art.length === 1 && art[0].current === art[0].wanted, 'how-to.html: its ticket\'s picture is drawn by the tracker\'s own code, as it is now',
  art.length !== 1 ? art.length + ' pictures' : art[0].current === art[0].wanted ? 'current' : 'stale (run node tools/make-pictures.js)');
const punched = stops.filter(m => /^<span class="on">/.test(guide.slice(m.index, m.index + 18))).map(m => cfg[m[2]]);
const guideStamps = [...guide.matchAll(/<span class="stamp [a-z]+ s\d" aria-hidden="true">([^<]+)</g)].map(m => m[1]);
const skyFor = guideStamps.includes('Madaling araw') ? 'dawn' : guideStamps.includes('Gabi na') ? 'night' : 'day';
check(art.length === 1 && punched.join(',') === [art[0].from, art[0].to].join(',') && art[0].sky === skyFor,
  'and it shows the two stops the ticket punches, under the sky its stamps give', art.length ? `${art[0].from} → ${art[0].to}, ${art[0].sky}` : '');

// The guide's pictures of your bus are busSvg() itself, drawn in by the tool:
// one with what sharing earns, one dressed from the shop in a paint.
const bus = tool.buses(guide, S);
const busStale = bus.filter(b => b.current !== b.wanted);
check(bus.length === 2 && !busStale.length && bus.every(b => b.keys.length > 0),
  'how-to.html: its pictures of your bus are drawn by the tracker\'s own code, as it is now',
  bus.length !== 2 ? bus.length + ' pictures' : busStale.length ? 'stale (run node tools/make-pictures.js)' : bus.map(b => b.paint + ': ' + b.keys.join(' ')).join(' / '));
check(bus.some(b => b.paint !== 'klasiko' && b.keys.some(k => /^(dice|antenna|visor|mirror|exhaust|flames|underglow|goldrims)$/.test(k))),
  'and one of them is painted and wears something from the shop, as "Dress it up" says');
// And its popup's picture is rideSvg(), on the road through the town its line
// names, plain because that sharer has not chosen to show their bus.
const ride = tool.rides(guide, S);
const popupMark = (/<div class="kw">(<svg class="mark"[^]*?<\/svg>)/.exec(guide) || [])[1];
check(ride.length === 1 && ride[0].current === ride[0].wanted,
  'how-to.html: its popup\'s bus on the road is drawn by the tracker\'s own code, as it is now',
  ride.length !== 1 ? ride.length + ' pictures' : ride[0].current === ride[0].wanted ? 'current' : 'stale (run node tools/make-pictures.js)');
check(ride.length === 1 && ride[0].views.length === 1 && popupMark === S.markSvg(ride[0].views[0]) &&
  ride[0].keys.length === 0 && ride[0].paint === 'klasiko' && ride[0].wanted.startsWith('<svg class="rideart" viewBox="' + S.RIDE_FRAMES.popup + '"'),
  'and it passes the place its town line is about, as a plain bus, framed as the popup frames it',
  ride.length ? ride[0].views.join(',') + ', ' + ride[0].paint : '');
// The saved stop's picture, in the guide (waiting, and on board in the
// sharing tab) and in the poster's and the briefing's example screen, which
// are the same screen with the same numbers.
const views = {};
for (const f of ['how-to.html', 'flyer.html', 'for-operators.html']) views[f] = tool.stopviews(read(f), S);
const viewStale = Object.keys(views).filter(f => views[f].some(v => v.current !== v.wanted));
check(views['how-to.html'].length === 2 && views['flyer.html'].length === 1 && views['for-operators.html'].length === 1 && !viewStale.length,
  'the saved stop\'s picture in the guide, the poster and the briefing is drawn by the tracker\'s own code, as it is now',
  viewStale.length ? 'stale in ' + viewStale.join(', ') + ' (run node tools/make-pictures.js)' : Object.keys(views).map(f => f + ' ' + views[f].length).join(', '));
check(views['how-to.html'].map(v => v.aboard).join(',') === 'false,true' && views['flyer.html'][0].f === views['for-operators.html'][0].f &&
      !views['flyer.html'][0].aboard && !views['for-operators.html'][0].aboard,
  'the guide draws it waiting and on board, and the poster and the briefing the same moment');

console.log('\n=== 8. the ride ===');
// The ride's moving parts, as the stylesheet runs them. The page works out
// where in its loop each part is from RIDE_LOOPS, so the two must agree, and
// every loop must end where it began or the picture jumps once a lap.
const rideCss = src => {
  const out = {};
  for (const [cls, name] of [['rr', 'road'], ['rp', 'posts'], ['rb', 'bush'], ['rw', 'wheel'], ['rk', 'rock']]) {
    const rule = new RegExp('\\.rideart \\.' + cls + '\\{[^}]*animation:(ride\\w+) ([\\d.]+)s').exec(src);
    const kf = rule && new RegExp('@keyframes ' + rule[1] + '\\{([^@]*?)\\}\\}').exec(src);
    out[name] = rule ? { secs: +rule[2], frames: kf ? kf[1] : '' } : null;
  }
  return out;
};
const css = rideCss(html);
check(Object.keys(S.RIDE_LOOPS).every(k => css[k] && css[k].secs === S.RIDE_LOOPS[k]),
  'each moving part runs for the time RIDE_LOOPS says, so a redrawn popup carries on where it was',
  Object.keys(S.RIDE_LOOPS).map(k => k + ' ' + (css[k] && css[k].secs) + '/' + S.RIDE_LOOPS[k]).join(', '));
const shift = k => -Number((/translateX\((-?[\d.]+)px\)/.exec(css[k].frames) || [])[1]);
const turn = Number((/rotate\(([\d.]+)deg\)/.exec(css.wheel.frames) || [])[1]);
const road = S.rideSvg({ sky: 'day' });
const dash = (/class="rr"[^>]*stroke-dasharray="([\d.]+) ([\d.]+)"/.exec(road) || []).slice(1).map(Number);
const roadEnd = Number((/class="rr"[^>]*d="M0 68\.5H([\d.]+)"/.exec(road) || [])[1]);
const postXs = [...((/class="rp"[^>]*d="([^"]*)"/.exec(road) || [])[1] || '').matchAll(/M([\d.]+) /g)].map(m => +m[1]);
const bushXs = [...((/class="rb"[^>]*>(.*?)<\/g>/.exec(road) || [])[1] || '').matchAll(/cx="([\d.]+)"/g)].map(m => +m[1]);
const postGap = postXs[1] - postXs[0];
check(dash.length === 2 && shift('road') % (dash[0] + dash[1]) === 0 && shift('posts') % postGap === 0 && shift('bush') % 150 === 0 && turn % 90 === 0,
  'every loop ends where it began: whole dashes, whole gaps between posts and bushes, whole quarter turns of the four spokes',
  `road ${shift('road')} by ${dash[0] + dash[1]}, posts ${shift('posts')} by ${postGap}, bushes ${shift('bush')}, wheels ${turn}°`);
// Posts and bushes come in a repeating pattern with gaps, so what matters
// is where the next one that is not drawn would be: past the frame's right
// edge even at the end of a lap.
const nextPost = Math.max(...postXs) + postGap, nextBush = bushXs[0] + 150 * (bushXs.length / 5);
check(roadEnd - shift('road') >= 300 && nextPost - shift('posts') > 306 && nextBush - shift('bush') > 306,
  'and nothing runs out of road before the loop starts again', `road to ${roadEnd}, next post at ${nextPost}, next bushes at ${nextBush}`);
// Speeds in the scene's own units a second. The wheel is 14.5 of the coach's
// 364 units, drawn 88 wide, so a turn covers 2 pi 14.5 88/364 of road.
const roadSpeed = shift('road') / css.road.secs, postSpeed = shift('posts') / css.posts.secs, bushSpeed = shift('bush') / css.bush.secs;
const wheelSpeed = turn / 360 * 2 * Math.PI * 14.5 * 88 / 364 / css.wheel.secs;
check(Math.abs(roadSpeed - 60) <= 3 && Math.abs(postSpeed - roadSpeed) <= 3 && Math.abs(wheelSpeed - roadSpeed) / roadSpeed <= .1 && bushSpeed < roadSpeed,
  'the road, the posts and the wheels all go at about 60 a second, the maintainer\'s 60 km/h, and the bushes behind go slower',
  `road ${roadSpeed.toFixed(0)}, posts ${postSpeed.toFixed(0)}, wheels ${wheelSpeed.toFixed(0)}, bushes ${bushSpeed.toFixed(0)}`);
const guideCss = rideCss(guide);
check(JSON.stringify(guideCss) === JSON.stringify(css), 'and the guide\'s copy moves the same way');

// A bus waiting at the terminal stands still on the road: worked out from
// its own reports, one place and one time per bus, and never from a speed.
const R = {};
new Function('R', slice('// ---- THE PICTURES (unit tested)', '// ---- END PICTURES') +
  'R.rideStand=rideStand;R.STAND_M=STAND_M;R.STAND_MS=STAND_MS;')(R);
const t0 = Date.UTC(2026, 9, 16, 21, 0, 0);
// Reports from Mendez every 21 seconds, the heartbeat's pace, wandering
// about 30 m the way a phone's GPS does when nothing is moving.
const report = (secs, north) => ({ lat: 14.0997 + (north || 0), lng: 120.9145, ts: t0 + secs * 1000 });
let stand = null;
const early = [0, 21, 42, 63, 84, 105].map((s, i) => (stand = R.rideStand(stand, report(s, i % 2 ? 0.0003 : 0))));
check(early.every(x => !x.still && x.ts === t0), 'first seen, and reporting from one place for under two minutes: it still drives on',
  early.map(x => x.still).join(','));
stand = R.rideStand(stand, report(126, 0.0002));
check(R.STAND_M === 150 && R.STAND_MS === 120000 && stand.still && stand.ts === t0 && stand.lat === 14.0997,
  'two minutes of its reports within 150 m of one place: it stands still, counted from the first of them');
check(Object.keys(stand).sort().join(',') === 'lat,lng,still,ts', 'one place, one time and a yes or no per bus: nothing that could grow into a trail',
  Object.keys(stand).join(','));
const moved = R.rideStand(stand, report(147, 0.0018));
check(!moved.still && moved.ts === t0 + 147000 && moved.lat === 14.0997 + 0.0018,
  'one report 200 m on and it drives again at once, counting afresh from there');
const quiet = R.rideStand(R.rideStand(null, report(300)), report(300));
check(!quiet.still, 'the same report read again is no time standing: a bus that stops reporting is left to its freshness');
const back = R.rideStand(stand, report(-30));
check(!back.still && back.ts === t0 - 30000, 'and a report from before that place was first seen starts the count again rather than running it backwards');
// A morning's crawl, stops and all, a poll every 6 seconds: the place it
// remembers is here, since then, and never one the bus has left behind.
let far = 0, crawl = null;
for (let i = 0, lat = 14.0997; i < 600; i++) {
  if (i % 60 < 45) lat += i % 7 === 0 ? 0.0012 : 0.0001;
  crawl = R.rideStand(crawl, { lat, lng: 120.9145, ts: t0 + i * 6000 });
  far = Math.max(far, Math.abs(crawl.lat - lat) * 110574);
}
check(far <= R.STAND_M, 'what it remembers is never more than 150 m from where the bus is now', far.toFixed(0) + ' m at most');
const popupFn = (/function popupRide\([^]*?\n\}/.exec(html) || [''])[0];
const pollFn = (/async function pollPositions\([^]*?\n\}/.exec(html) || [''])[0];
const clusterFn = (/function clusterBuses\([^]*?\n\}/.exec(html) || [''])[0];
check(/still: fresh === 'delayed' \|\| !!b\.standing/.test(popupFn) && !/speed/.test(popupFn + R.rideStand.toString()),
  'a bus\'s popup stands it still when it has gone quiet or is standing, and nothing in either reads a speed');
check(/rideStand\(STANDS\[b\.pub_id\], b\)/.test(pollFn) && /const stands = Object\.create\(null\);/.test(pollFn) && /STANDS = stands;/.test(pollFn) &&
      /target\.standing=!!b\.standing/.test(clusterFn) && /standing:!!b\.standing/.test(clusterFn),
  'worked out afresh at every poll for the buses on the map alone, and a bus two phones share stands by its freshest report');
// Standing is for the picture alone. Printed anywhere, "standing for 12
// minutes" would be a driver's breaks timed on every rider's screen.
const readers = html.split(/\n(?=(?:async )?function )/).filter(f => /\.standing\b/.test(f)).map(f => (/function (\w+)/.exec(f) || [])[1]).sort();
const cardFn = (/function rideCardHtml\([^]*?\n\}/.exec(html) || [''])[0];
check(readers.join(',') === 'clusterBuses,pollPositions,popupRide,rideCardHtml' && (cardFn.match(/\.standing\b/g) || []).length === 1 &&
      /still: freshness\(info\.ts\) === 'delayed' \|\| !!\(bus && bus\.standing\)/.test(cardFn),
  'and it goes from the poll through the clustering to the two pictures, the popup\'s and the saved stop\'s, and nowhere else, so it is never put into words', readers.join(','));

console.log('\n=== 9. the saved stop\'s picture ===');
// stopViewSvg: the bus coming down the road to the shed, or on board your
// stop coming up to the windscreen. Waiting, f is stopsAway()'s and there
// is a post for every stop between; test-mystop.js holds that n stops
// between is the step from just over n to n + 1, so n + .5 stands for n.
// On board the road is drawn at its own length, in km.
{
  const mid = n => n + .5;
  const plates = svg => (svg.match(/height="6\.72" rx="1\.44" fill="#(?:e39a1c|efe7da)"/g) || []).length;
  const golds = svg => (svg.match(/height="6\.72" rx="1\.44" fill="#e39a1c"/g) || []).length;
  // Every thing placed on the road: its depth now, the depth it glides from
  // if it does, whether it is fading, and what it is.
  const things = svg => svg.split('<g class="sv-k').slice(1).map(g => {
    const own = g.split('</g>')[0];
    const k = (/^[^"]*" style="transform:translate\([\d.]+px,[\d.]+px\) scale\(([\d.]+)\)/.exec(g) || [])[1];
    const k0 = (/--from:translate\([\d.]+px,[\d.]+px\) scale\(([\d.]+)\)/.exec(g.slice(0, g.indexOf('>'))) || [])[1];
    return { k: +k, k0: k0 === undefined ? null : +k0, gone: /^[^"]*\bsv-gone\b/.test(g), glide: (/^[^"]*/.exec(g) || [''])[0].trim(),
      what: /#4f46b8/.test(own) ? 'sign' : /<svg/.test(own) ? 'bus' : /height="6\.72"/.test(own) ? 'post' : 'dash' };
  });
  // Your stop's pin, drawn on its own: the depth its place is at, now and
  // before, read back from where it is put.
  const pin = svg => {
    const m = /<g class="sv-pin([^"]*)" style="transform:translate\(([\d.]+)px,([\d.]+)px\)(?:;--from:translate\(([\d.]+)px,([\d.]+)px\))?/.exec(svg);
    const P = S.SV_ABOARD, kOf = y => (y - P.h) / (P.k - 48 * .8);
    return m ? { k: kOf(+m[3]), k0: m[5] === undefined ? null : kOf(+m[5]), glide: m[1].trim() } : null;
  };
  const slack = (P, ...ks) => ks.reduce((a, k) => a + .0005 / (k * k), 1e-6) / P.dz;

  // ---- Waiting.
  {
    const P = S.SV_WAIT;
    const counts = [0, 1, 2, 5, 6, 7, 12, 23, 47, 70].map(n => [n, plates(S.stopViewSvg({ f: mid(n) }))]);
    check(counts.every(([n, got]) => got === n) && plates(S.stopViewSvg({ f: 0 })) === 0,
      'waiting: a post for every stop still between, as many as the card counts, however many', counts.map(c => c[1]).join(','));
    check([1, 2, 5, 23, 47].every(n => golds(S.stopViewSvg({ f: mid(n) })) === 1) && golds(S.stopViewSvg({ f: mid(0) })) === 0,
      'waiting: one of them gold, the bus\'s next stop, and none when the next is yours');
    const bus = f => things(S.stopViewSvg({ f })).filter(x => x.what === 'bus')[0].k;
    const near = [60, 47, 40, 23, 12, 6, 5, 3, 2, 1.5, 1, .5, 0].map(bus);
    check(near.every((k, i) => i === 0 || k > near[i - 1]), 'waiting: the bus grows at every step nearer, from as far off as the route goes',
      near.map(k => k.toFixed(3)).join(' '));
    // The fault this was drawn to fix: forty stops off looked like six.
    check(bus(40) < bus(6) / 3 && bus(6) < bus(2) / 2, 'waiting: forty stops off is a speck, six is small and two is close, so the picture and the count agree',
      `40: ${bus(40).toFixed(3)}, 6: ${bus(6).toFixed(3)}, 2: ${bus(2).toFixed(3)}`);
    // Each stop one even step of depth, as along a real road. Depth is 1 / k,
    // and k is drawn to three places, so far off it is known less exactly.
    const posts = things(S.stopViewSvg({ f: 9.5 })).filter(x => x.what === 'post').map(x => x.k);
    const even = posts.slice(1).every((k, i) => Math.abs(Math.abs(1 / k - 1 / posts[i]) - P.dz) <= slack(P, k, posts[i]) * P.dz);
    check(posts.length === 9 && even, 'waiting: the posts stand an even step of depth apart',
      posts.slice(1).map((k, i) => Math.abs(1 / k - 1 / posts[i]).toFixed(3)).join(' '));
    const g = S.stopViewSvg({ f: 2.5, from: 3.5, ago: 400 }), same = S.stopViewSvg({ f: 2.5, from: 2.5 });
    check(/class="sv-k sv-glide" style="transform:[^;]+;--from:translate\([^;]+\);animation-delay:-0\.40s"/.test(g) &&
          !/sv-glide/.test(same) && !/sv-glide/.test(S.stopViewSvg({ f: 2.5 })) &&
          /animation-delay:-1\.00s/.test(S.stopViewSvg({ f: 2.5, from: 3.5, ago: 99999 })),
      'waiting: it glides from where it was, only when it was elsewhere, and a redraw carries the glide on');
    // The road stands still: only the bus comes on, and a stop it has just
    // passed fades as it goes by, on the glide's own clock.
    const moving = things(S.stopViewSvg({ f: 1.6, from: 3.4, ago: 300 }));
    check(moving.filter(x => x.k0 !== null).map(x => x.what).join(',') === 'bus' && moving.filter(x => x.gone).length === 2 &&
          moving.filter(x => x.gone).every(x => x.what === 'post' && x.k0 === null),
      'waiting: when a position arrives only the bus moves, and the two stops it passed fade behind it',
      moving.map(x => x.what + (x.gone ? '-' : x.k0 !== null ? '>' : '')).join(' '));
    check(!/sv-gone/.test(S.stopViewSvg({ f: 1.6 })) && !/sv-gone/.test(S.stopViewSvg({ f: 1.6, from: 1.9, ago: 300 })),
      'and none fade when none were passed');
    check([null, undefined, NaN, 'x', -3, 1e9].every(f => plates(S.stopViewSvg({ f })) === (f === -3 ? 0 : S.STOP_VIEW_MOST - 1)),
      'waiting: a bus it cannot place is as far as the picture goes, and one past your stop is at it');
  }

  // ---- On board: the road at its own length, in km. These are how far
  // back from S&R Kawit its stops are, as stopsBack() has them.
  {
    const P = S.SV_ABOARD, gOf = k => (1 / k - P.z) / P.dz;
    const BACK = [.109, .471, .973, 1.4, 2.548, 3.116, 3.562, 4.02, 5.6, 7.9, 11.2];
    const view = (km, more) => S.stopViewSvg(Object.assign({ aboard: true, km, stops: BACK }, more));
    const inSight = km => BACK.filter(w => km - w > 0 && km - w <= S.SV_SEEN);
    const off = [.05, .3, .9, 1.6, 3.4, 12].map(km => {
      const posts = things(view(km)).filter(x => x.what === 'post'), want = inSight(km);
      const placed = posts.length === want.length && posts.every((x, i) => Math.abs(gOf(x.k) - (km - want[i])) <= slack(P, x.k));
      return placed ? '' : km + ' km: ' + posts.length + ' of ' + want.length;
    }).filter(Boolean);
    check(!off.length && S.SV_SEEN > .9 && S.SV_SEEN < 2,
      'on board: a post for every stop in sight, each as far up the road as its stop is, and none over the horizon', off.join('; ') || 'as far as ' + S.SV_SEEN + ' km');
    check([.3, .9, 1.6, 3.4].every(km => golds(view(km)) === (BACK.some(w => w < km && km - w <= S.SV_SEEN && w === Math.max(...BACK.filter(v => v < km))) ? 1 : 0)) &&
          golds(view(.05)) === 0,
      'on board: the bus\'s next stop in gold when it is in sight, and none when the next is yours');
    // Your stop: the sign once it is in sight, and its pin, never too small
    // to see, at the end of the road while it is not.
    const far = view(40), mid_ = view(.9), close = view(.05);
    check(!things(far).some(x => x.what === 'sign') && pin(far) && Math.abs(pin(far).k - 1 / (P.z + P.dz * S.SV_SEEN)) < .002,
      'on board: your stop further than the eye reaches is its pin on the horizon');
    check(things(mid_).some(x => x.what === 'sign') && pin(mid_) && Math.abs(pin(mid_).k - things(mid_).filter(x => x.what === 'sign')[0].k) < .002,
      'in sight but small, the pin rides on its sign until the sign\'s own is as big');
    check(things(close).some(x => x.what === 'sign') && !pin(close) && 9.6 * things(close).filter(x => x.what === 'sign')[0].k >= S.SV_PIN,
      'and close, the sign alone');
    const seen = km => { const sg = things(view(km)).filter(x => x.what === 'sign')[0]; return sg ? sg.k : pin(view(km)).k; };
    const nearer = [40, 5, 1.2, 1, .7, .4, .2, .1, .05, 0].map(seen);
    check(nearer.every((k, i) => i === 0 || k >= nearer[i - 1]) && nearer.slice(2).every((k, i) => k > nearer[i + 1]),
      'on board: your stop comes nearer at every step, and grows once it is in sight', nearer.map(k => k.toFixed(3)).join(' '));
    // The road's dashes are on it like the posts. A new position moves
    // them all, your stop and its pin with them, by the distance the bus
    // went, at an even pace for a poll's length; one the bus passes goes
    // by the glass, and between positions nothing moves.
    const still = things(view(.62));
    check(still.filter(x => x.what === 'dash').length >= 4 && still.every(x => x.k0 === null) && !/sv-ride|sv-glide|infinite/.test(view(.62)),
      'on board: the dashes are on the road, and nothing moves between positions', still.filter(x => x.what === 'dash').length + ' dashes');
    const ride = view(.57, { from: .62, ago: 1500 }), moving = things(ride);
    const kept = moving.filter(x => x.k < S.SV_GONE && x.k0 !== null && x.k0 < S.SV_GONE);
    const wrong = kept.filter(x => Math.abs(gOf(x.k0) - gOf(x.k) - .05) > slack(P, x.k0, x.k));
    check(kept.length >= 6 && ['dash', 'post', 'sign'].every(w => kept.some(x => x.what === w)) && !wrong.length &&
          kept.every(x => x.glide === 'sv-ride') && pin(ride) && pin(ride).k0 !== null && pin(ride).glide === 'sv-ride',
      'when a position arrives, the dashes, the posts, your stop and its pin all come on by the 50 m the bus went',
      kept.length + ' things' + (wrong.length ? ', ' + wrong.map(x => x.what + ' by ' + (gOf(x.k0) - gOf(x.k)).toFixed(3)).join(' ') : ''));
    const passing = things(view(.1, { from: .13, ago: 0 }));
    check(passing.some(x => x.what === 'post' && x.k === S.SV_GONE && x.k0 < S.SV_GONE),
      'a stop the bus passes goes by the glass rather than vanishing');
    check(/animation-delay:-1\.50s/.test(ride) && /animation-delay:-6\.00s/.test(view(.57, { from: .62, ago: 99999 })),
      'and a redraw carries the move on, never longer than a poll');
    check(!/sv-ride/.test(view(.1, { from: .9, ago: 100 })),
      'a jump further than the dashes reach is drawn at once, not driven');
    check(things(view(0)).filter(x => x.what === 'sign')[0].k > 1, 'and your own stop is never passed: at it, it is at the glass');
    const a = view(.4, { sky: 'night', worn: ['dice'], paint: 'dagat', here: true });
    check(a === view(.4, { sky: 'night', worn: ['dice'], paint: 'dagat', here: true }) &&
          a.startsWith('<svg class="stopview" viewBox="0 0 330 160" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">') &&
          !/\sid="|<text|https?:|url\(/.test(a),
      'on board: the same drawing for the same state, hidden from screen readers, with no ids, no words and nothing loaded');
    check(/^<svg class="stopview still"/.test(view(.4, { still: true })), 'on board: and what hangs there stands still when the bus does');
    check([null, undefined, NaN, 'x'].every(km => { const v = S.stopViewSvg({ aboard: true, km, stops: BACK }); return plates(v) === 0 && pin(v); }) &&
          plates(S.stopViewSvg({ aboard: true, km: .3 })) === 0,
      'on board: a bus it cannot place leaves your stop on the horizon, and with no stops given there are no posts');
  }
  // Sakay na, Bababa na: your sign lit; waiting, you wave the bus down.
  const lit = svg => /r="20\.8" fill="#4f46b8" opacity="\.28"/.test(svg) || /r="19\.2" fill="#4f46b8" opacity="\.28"/.test(svg);
  check(lit(S.stopViewSvg({ f: .3, here: true })) && !lit(S.stopViewSvg({ f: .3 })) && lit(S.stopViewSvg({ aboard: true, km: .05, here: true })),
    'at the next stop your sign is lit', 'never before rideState() says so');
  const arm = svg => (/M[\d.]+ [\d.]+V[\d.]+M[\d.]+ [\d.]+V[\d.]+(M[^"]+)" stroke="#3a2e2a" stroke-width="4\.2"/.exec(svg) || [])[1] || '';
  check(arm(S.stopViewSvg({ f: .3, here: true })) !== arm(S.stopViewSvg({ f: .3 })) && arm(S.stopViewSvg({ f: .3 })) !== '',
    'and waiting, you wave it down');
  // Dressed only as its sharer chose, which the card decides (busLookOf):
  // this draws what it is given and nothing when given nothing.
  const dice = { wait: 'x="60.5" y="44" width="7"', aboard: 'x="150" y="48" width="12"' };
  check(S.stopViewSvg({ f: 3.5, worn: ['dice'] }).includes(dice.wait) && !S.stopViewSvg({ f: 3.5 }).includes(dice.wait) &&
        S.stopViewSvg({ aboard: true, km: 1, worn: ['dice'] }).includes(dice.aboard) && !S.stopViewSvg({ aboard: true, km: 1 }).includes(dice.aboard),
    'the bus wears what it is given, from the front waiting and inside on board, and nothing when plain');
  check(S.stopViewSvg({ f: 3.5, paint: 'dagat' }).includes('fill="' + S.BUS_PAINTS.dagat[3] + '"') &&
        S.stopViewSvg({ aboard: true, km: 1, paint: 'dagat' }).includes('stroke="' + S.BUS_PAINTS.dagat[3] + '"') &&
        S.stopViewSvg({ f: 3.5, paint: 'nonsense' }) === S.stopViewSvg({ f: 3.5 }),
    'in its paint, outside waiting and on the dashboard on board, and an unknown paint is the plain one');
  // The stylesheet runs the moving parts, so it must agree with the code.
  const rule = cls => (new RegExp('\\.stopview \\.' + cls + '\\{([^}]*)\\}').exec(html) || [])[1] || '';
  const glideS = +((/animation:stopglide ([\d.]+)s var\(--ease-move\) both/.exec(rule('sv-glide')) || [])[1]);
  const rideS = +((/animation:stopglide ([\d.]+)s linear both/.exec(rule('sv-ride')) || [])[1]);
  const goneS = +((/animation:stopgone ([\d.]+)s/.exec(rule('sv-gone')) || [])[1]);
  check(glideS * 1000 === S.STOP_GLIDE_MS && goneS * 1000 === S.STOP_GLIDE_MS && rideS * 1000 === S.STOP_RIDE_MS && /setInterval\(pollPositions, 6000\)/.test(html) && S.STOP_RIDE_MS === 6000,
    'waiting glides in a second, and on board the view moves at an even pace for one poll\'s length', `glide ${glideS}s, ride ${rideS}s, fade ${goneS}s`);
  // Nothing on the road runs on its own: what loops is the coach idling
  // and the charm swinging from the mirror.
  const loops = [...html.matchAll(/\.stopview \.([\w-]+)\{[^}]*infinite/g)].map(m => m[1]).sort();
  check(loops.join(',') === 'sv-rock,sv-swing' && !/@keyframes stoproad/.test(html) && /transform-origin:165px 26px/.test(rule('sv-swing')),
    'nothing on the road moves on its own: what loops is the coach idling and the charm swinging from the mirror', loops.join(','));
  check(/still \.sv-rock, \.stopview\.still \.sv-swing\{animation-play-state:paused;\}/.test(html),
    'and both stop for a bus standing still');
}

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
