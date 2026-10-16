#!/usr/bin/env node
// Draws the tracker's pictures into the pages that cannot draw their own: the
// dot-matrix route board, the view from the ridge that covers the guide, the
// flyer and the briefing, the picture on the guide's salamat ticket, the
// guide's pictures of your bus, standing and on the road, and the saved
// stop's picture in the guide, the flyer and the briefing.
//
// The tracker draws its board at load (drawSignboard in index.html) and its
// scenes on the empty map (renderMapNote). The guide, the flyer and the
// briefing load nothing and the flyer and the briefing run no script, and
// the link-preview picture is a screenshot, so theirs are drawn here instead
// and written into the files. The code that draws them is not a copy: it is
// the SIGNBOARD and PICTURES blocks of index.html, taken out by their markers
// and run, like the test suites do.
//
// Each board sits between two comments, after the words it shows:
//
//   <span class="led"><span class="ln">Mendez / Tagaytay</span> ...</span>
//   <!-- signboard id=hdrsign pitch=2.4 -->  ...the picture...  <!-- /signboard -->
//
// The words are the nearest .led span before the opening comment, one line
// per .ln span. Options: id (unique on the page), pitch (CSS pixels per
// dot), lines=1 (run the lines together), center, cls (a class to add).
// Each scene is the same, with the time of day and an id unique on the page:
//
//   <!-- scene time=dawn id=cover -->  ...the picture...  <!-- /scene -->
//
// And a ticket's picture, with the marks of the trip's two ends and its sky
// (one=1 for a trip that began and ended by the same place):
//
//   <!-- tktart from=crossing to=towers sky=dawn -->  ...  <!-- /tktart -->
//
// Your bus, wearing the decorations named and, if given, a paint job:
//
//   <!-- mybus keys=sampaguita,horns paint=dagat -->  ...  <!-- /mybus -->
//
// And a bus on the road through a place, as a bus's popup draws it, with the
// views of the places it passes (marks, comma-separated), its sky, a frame
// from RIDE_FRAMES (popup, close) or close=1, and keys and paint for a bus
// shown as dressed:
//
//   <!-- ride views=coffee sky=day frame=popup -->  ...  <!-- /ride -->
//
// And the saved stop's picture, as the card draws it (stopViewSvg): where
// the bus is along the last stops (p, from stopProgress), aboard=1 for the
// card that follows your own bus, here=1 for Sakay na or Bababa na, its sky,
// and keys and paint for a bus shown as dressed:
//
//   <!-- stopview p=0.93 sky=day here=1 -->  ...  <!-- /stopview -->
//
// Change the words, or the drawing in index.html, then run:
//
//   node tools/make-pictures.js
//
// tests/test-signboard.js and tests/test-pictures.js fail while any picture
// is out of date.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = ['how-to.html', 'flyer.html', 'for-operators.html', 'tools/app-icons.html'];

function block(html, start, end) {
  const a = html.indexOf(start), b = html.indexOf(end);
  if (a < 0 || b < a) throw new Error('index.html has no block between "' + start + '" and "' + end + '"');
  return html.slice(a, b);
}
function renderer() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const S = {};
  new Function('S', block(html, '// ---- THE SIGNBOARD (unit tested)', '// ---- END SIGNBOARD') +
    block(html, '// ---- THE PICTURES (unit tested)', '// ---- END PICTURES') +
    'S.SIGN_FONT=SIGN_FONT;S.signGlyph=signGlyph;S.signLayout=signLayout;S.signboardSvg=signboardSvg;' +
    'S.COACH_SIDE=COACH_SIDE;S.SCENE_TIMES=SCENE_TIMES;S.sceneSvg=sceneSvg;S.MARKS=MARKS;S.markSvg=markSvg;' +
    'S.TICKET_SKIES=TICKET_SKIES;S.TICKET_VIEWS=TICKET_VIEWS;S.ticketArtSvg=ticketArtSvg;' +
    'S.TICKET_SIGHTS=TICKET_SIGHTS;S.sightTile=sightTile;S.moonSvg=moonSvg;S.BUS_DECOR=BUS_DECOR;S.busSvg=busSvg;S.DECOR_BOX=DECOR_BOX;S.decorTile=decorTile;S.BUS_PAINTS=BUS_PAINTS;S.paintStyle=paintStyle;S.rideSvg=rideSvg;S.RIDE_LOOPS=RIDE_LOOPS;S.RIDE_FRAMES=RIDE_FRAMES;' +
    'S.stopViewSvg=stopViewSvg;S.STOP_VIEW_STOPS=STOP_VIEW_STOPS;S.STOP_GLIDE_MS=STOP_GLIDE_MS;S.STOP_ROAD_S=STOP_ROAD_S;')(S);
  return S;
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const textOf = s => s.replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/g, e => ENTITIES[e] || e).replace(/\s+/g, ' ').trim();

// Every board in one file: where it is, what it says, what it should be.
function boards(src, S) {
  const out = [];
  const re = /<!-- signboard([^>]*?) -->([\s\S]*?)<!-- \/signboard -->/g;
  let m;
  while ((m = re.exec(src))) {
    const opts = {};
    for (const part of m[1].trim().split(/\s+/).filter(Boolean)) {
      const [k, v] = part.split('=');
      opts[k] = v === undefined ? true : (k === 'pitch' || k === 'lines' ? Number(v) : v);
    }
    const led = src.lastIndexOf('<span class="led">', m.index);
    if (led < 0) throw new Error('a signboard comment with no .led words before it');
    // Up to the first comment after the words, so a second board in the same
    // place reads the words and not the first board's picture.
    const words = src.slice(led, src.indexOf('<!--', led)).split('<span class="ln">').slice(1).map(textOf).filter(Boolean);
    const lines = opts.lines === 1 ? [words.join(' ')] : words;
    const svg = S.signboardSvg(lines, opts);
    if (!svg) throw new Error('the board cannot draw "' + lines.join(' / ') + '": a character has no dots in SIGN_FONT');
    out.push({ start: m.index, end: m.index + m[0].length, open: '<!-- signboard' + m[1] + ' -->',
      lines, current: m[2], wanted: svg });
  }
  return out;
}

// Every scene in one file, the same way.
function scenes(src, S) {
  const out = [];
  const re = /<!-- scene([^>]*?) -->([\s\S]*?)<!-- \/scene -->/g;
  let m;
  while ((m = re.exec(src))) {
    const opts = {};
    for (const part of m[1].trim().split(/\s+/).filter(Boolean)) { const [k, v] = part.split('='); opts[k] = v; }
    const svg = S.sceneSvg(opts.time, opts.id);
    if (!svg) throw new Error('no scene for time=' + opts.time);
    out.push({ start: m.index, end: m.index + m[0].length, open: '<!-- scene' + m[1] + ' -->', close: '<!-- /scene -->',
      time: opts.time, current: m[2], wanted: svg });
  }
  return out;
}

// Every ticket picture in one file, the same way again.
function arts(src, S) {
  const out = [];
  const re = /<!-- tktart([^>]*?) -->([\s\S]*?)<!-- \/tktart -->/g;
  let m;
  while ((m = re.exec(src))) {
    const opts = {};
    for (const part of m[1].trim().split(/\s+/).filter(Boolean)) { const [k, v] = part.split('='); opts[k] = v; }
    if (!(opts.sky in S.TICKET_SKIES)) throw new Error('no ticket sky called ' + opts.sky);
    const svg = S.ticketArtSvg({ from: opts.from || '', to: opts.to || '', sky: opts.sky, one: opts.one === '1' });
    out.push({ start: m.index, end: m.index + m[0].length, open: '<!-- tktart' + m[1] + ' -->', close: '<!-- /tktart -->',
      from: opts.from || '', to: opts.to || '', sky: opts.sky, current: m[2], wanted: svg });
  }
  return out;
}

// The decorations and the paint a marker names, checked against the drawings.
function dressOf(opts, S) {
  const keys = (opts.keys || '').split(',').filter(Boolean);
  const unknown = keys.filter(k => !(k in S.BUS_DECOR));
  if (unknown.length) throw new Error('no decoration called ' + unknown.join(', '));
  const paint = opts.paint || 'klasiko';
  if (!(paint in S.BUS_PAINTS)) throw new Error('no paint called ' + paint);
  return { keys, paint };
}

// Every picture of your bus in one file, with the decorations its marker names.
function buses(src, S) {
  const out = [];
  const re = /<!-- mybus([^>]*?) -->([\s\S]*?)<!-- \/mybus -->/g;
  let m;
  while ((m = re.exec(src))) {
    const opts = {};
    for (const part of m[1].trim().split(/\s+/).filter(Boolean)) { const [k, v] = part.split('='); opts[k] = v; }
    const { keys, paint } = dressOf(opts, S);
    out.push({ start: m.index, end: m.index + m[0].length, open: '<!-- mybus' + m[1] + ' -->', close: '<!-- /mybus -->',
      keys, paint, current: m[2], wanted: S.busSvg(keys, paint) });
  }
  return out;
}

// Every bus on the road in one file, the same way.
function rides(src, S) {
  const out = [];
  const re = /<!-- ride([^>]*?) -->([\s\S]*?)<!-- \/ride -->/g;
  let m;
  while ((m = re.exec(src))) {
    const opts = {};
    for (const part of m[1].trim().split(/\s+/).filter(Boolean)) { const [k, v] = part.split('='); opts[k] = v; }
    if (!(opts.sky in S.TICKET_SKIES)) throw new Error('no ride sky called ' + opts.sky);
    if (opts.frame && !(opts.frame in S.RIDE_FRAMES)) throw new Error('no ride frame called ' + opts.frame);
    const views = (opts.views || '').split(',').filter(Boolean);
    const unknown = views.filter(v => !(v in S.TICKET_VIEWS));
    if (unknown.length) throw new Error('no view called ' + unknown.join(', '));
    const { keys, paint } = dressOf(opts, S);
    const svg = S.rideSvg({ views, sky: opts.sky, worn: keys, paint, frame: opts.frame, close: opts.close === '1', still: opts.still === '1', now: 0 });
    out.push({ start: m.index, end: m.index + m[0].length, open: '<!-- ride' + m[1] + ' -->', close: '<!-- /ride -->',
      views, sky: opts.sky, keys, paint, current: m[2], wanted: svg });
  }
  return out;
}

// Every saved stop's picture in one file, the same way.
function stopviews(src, S) {
  const out = [];
  const re = /<!-- stopview([^>]*?) -->([\s\S]*?)<!-- \/stopview -->/g;
  let m;
  while ((m = re.exec(src))) {
    const opts = {};
    for (const part of m[1].trim().split(/\s+/).filter(Boolean)) { const [k, v] = part.split('='); opts[k] = v; }
    if (!(opts.sky in S.TICKET_SKIES)) throw new Error('no stopview sky called ' + opts.sky);
    const p = Number(opts.p);
    if (!(p >= 0 && p <= 1)) throw new Error('a stopview needs p between 0 and 1, not ' + opts.p);
    const { keys, paint } = dressOf(opts, S);
    const svg = S.stopViewSvg({ aboard: opts.aboard === '1', p, here: opts.here === '1', sky: opts.sky, worn: keys, paint, still: opts.still === '1' });
    out.push({ start: m.index, end: m.index + m[0].length, open: '<!-- stopview' + m[1] + ' -->', close: '<!-- /stopview -->',
      p, aboard: opts.aboard === '1', here: opts.here === '1', sky: opts.sky, keys, paint, current: m[2], wanted: svg });
  }
  return out;
}

// The file as it should be, with every picture redrawn.
function redraw(src, S) {
  const all = boards(src, S).map(b => Object.assign({ close: '<!-- /signboard -->' }, b)).concat(scenes(src, S), arts(src, S), buses(src, S), rides(src, S), stopviews(src, S))
    .sort((a, b) => a.start - b.start);
  let res = '', at = 0;
  for (const p of all) {
    res += src.slice(at, p.start) + p.open + p.wanted + p.close;
    at = p.end;
  }
  return res + src.slice(at);
}

module.exports = { renderer, boards, scenes, arts, buses, rides, stopviews, redraw, FILES, ROOT };

if (require.main === module) {
  const S = renderer();
  for (const f of FILES) {
    const file = path.join(ROOT, f);
    const src = fs.readFileSync(file, 'utf8');
    const n = boards(src, S).length + scenes(src, S).length + arts(src, S).length + buses(src, S).length + rides(src, S).length + stopviews(src, S).length;
    const next = redraw(src, S);
    if (next === src) { console.log(`${f}: ${n} picture${n === 1 ? '' : 's'}, already current`); continue; }
    fs.writeFileSync(file, next);
    console.log(`${f}: drew ${n} picture${n === 1 ? '' : 's'}`);
  }
}
