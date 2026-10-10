// Checks the pictures as shipped: the coach and the view from the ridge on
// the empty map, which of them the map shows when, the marks beside a
// checkpoint's line and on the ticket's stops, the checkpoint lines in
// config.txt that choose them, and the copies drawn into the other pages.
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

console.log('\n=== 6. the copies in other pages are current ===');
const expect = { 'how-to.html': 1, 'flyer.html': 1, 'for-operators.html': 1, 'tools/app-icons.html': 0 };
for (const f of tool.FILES) {
  const src = read(f);
  const sc = tool.scenes(src, S);
  check(sc.length === expect[f], `${f}: has its ${expect[f]} cover scene${expect[f] === 1 ? '' : 's'}`, sc.map(x => x.time).join(' '));
  const stale = sc.filter(x => x.current !== x.wanted);
  check(!stale.length, `${f}: drawn by the tracker's own code, as it is now`,
    stale.length ? 'stale (run node tools/make-pictures.js)' : 'current');
}
// The guide redraws the ticket by hand, and its stops carry marks: each must
// be the drawing config.txt gives that stop.
const guide = read('how-to.html');
const cfg = Object.fromEntries(read('config.txt').split(/\r?\n/).filter(l => l.trim().startsWith('CHECKPOINT ='))
  .map(l => S.parseCheckpoint(l.split('=')[1])).map(c => [c.short, c.mark]));
const stops = [...guide.matchAll(/<span(?: class="on")?>(<svg class="mark"[^]*?<\/svg>)<b>([^<]+)<\/b><\/span>/g)];
const wrong = stops.filter(m => m[1] !== S.markSvg(cfg[m[2]]));
check(stops.length === Object.keys(cfg).length && !wrong.length, 'how-to.html: the ticket\'s stops carry the marks config.txt gives them',
  wrong.length ? 'wrong: ' + wrong.map(m => m[2]).join(' ') : stops.length + ' stops');

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
