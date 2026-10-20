#!/usr/bin/env node
// Draws the tracker's pictures into the pages that cannot draw their own: the
// dot-matrix route board, the view from the ridge that covers the guide, the
// flyer, the briefing and the tester page, the picture on the guide's salamat
// ticket, the guide's pictures of your bus, standing and on the road, the
// saved stop's picture in the guide, the flyer and the briefing, and the
// app's icon and small mark wherever they appear.
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
// And the saved stop's picture, as the card draws it (stopViewSvg): waiting,
// how many stops away the bus is (f, from stopsAway); on board (aboard=1),
// the saved stop and the checkpoint the bus is at, by its short name, from
// which config.txt and the tracker's own code give how far the stop is and
// where every stop before it stands; here=1 for Sakay na or Bababa na, its
// sky, and keys and paint for a bus shown as dressed. A + in a name is a
// space:
//
//   <!-- stopview f=0.42 sky=day here=1 -->  ...  <!-- /stopview -->
//   <!-- stopview aboard=1 stop=New+Imus+City+Hall at=GEN.T sky=day -->  ...  <!-- /stopview -->
//
// And the app's icon, in tools/app-icons.html, with an id unique on the page,
// name=fibi for the app's (the website's has no name), and the options
// appIconSvg below describes:
//
//   <!-- appicon id=store name=fibi alpha=1 -->  ...  <!-- /appicon -->
//
// The small mark has no comments to sit between: it is each page's
// <link rel="icon">, and two of the Android app's drawables, written whole.
//
// Change the words, or the drawing in index.html or here, then run:
//
//   node tools/make-pictures.js
//
// tests/test-signboard.js and tests/test-pictures.js fail while any picture
// is out of date.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = ['how-to.html', 'flyer.html', 'for-operators.html', 'testers.html', 'tools/app-icons.html'];

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
    'S.stopViewSvg=stopViewSvg;S.STOP_VIEW_MOST=STOP_VIEW_MOST;S.STOP_GLIDE_MS=STOP_GLIDE_MS;S.STOP_RIDE_MS=STOP_RIDE_MS;' +
    'S.SV_WAIT=SV_WAIT;S.SV_ABOARD=SV_ABOARD;S.SV_SEEN=SV_SEEN;S.SV_PIN=SV_PIN;S.SV_PAST=SV_PAST;S.svKmSign=svKmSign;S.SV_FASTEST=SV_FASTEST;S.svReach=svReach;' +
    'S.SV_POLE=SV_POLE;S.SV_MARK=SV_MARK;S.SV_DASH=SV_DASH;S.SV_DASH_LONG=SV_DASH_LONG;S.SV_JOINT=SV_JOINT;S.SV_NEAR=SV_NEAR;S.svStrip=svStrip;S.svDashes=svDashes;S.svJoints=svJoints;S.svTufts=svTufts;S.SV_TUFT=SV_TUFT;S.SV_POLE_X=SV_POLE_X;S.svPole=svPole;S.svPlace=svPlace;S.svStopKm=svStopKm;S.svOnRoad=svOnRoad;S.svPinAt=svPinAt;')(S);
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

// The route as config.txt has it, measured by the tracker's own code: where
// a stop or a checkpoint is along the chain, and the riding card's numbers
// for a bus at a checkpoint going to a stop.
let ROUTE = null;
function route() {
  if (ROUTE) return ROUTE;
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const R = {};
  new Function('R', block(html, 'function haversineKm(a,b){', 'function timeAgo(ts){') +
    block(html, '// ---- ROUTE PROGRESS + WRONG-DIRECTION GUARD', '// ---- END ROUTE PROGRESS') +
    block(html, "// ---- THE READER'S OWN STOP (unit tested)", '// ---- END MY STOP') +
    'R.buildRouteChain=buildRouteChain;R.routeProgressKm=routeProgressKm;R.stopChainKms=stopChainKms;R.aboardInfo=aboardInfo;R.stopsBack=stopsBack;')(R);
  const lines = fs.readFileSync(path.join(ROOT, 'config.txt'), 'utf8').split(/\r?\n/);
  const field = (l, n) => l.split('=').slice(1).join('=').split('|').map(x => x.trim())[n];
  const cps = lines.filter(l => /^CHECKPOINT\s*=/.test(l.trim())).map(l => ({ short: field(l, 1), lat: +field(l, 2), lng: +field(l, 3) }));
  const stops = lines.filter(l => /^STOP\s*=/.test(l.trim())).map(l => ({ name: field(l, 0), lat: +field(l, 1), lng: +field(l, 2) }));
  const chain = R.buildRouteChain(cps), kms = R.stopChainKms(stops, cps, chain);
  const kmOf = p => R.routeProgressKm(p, cps, chain);
  ROUTE = {
    riding(stopName, at, dir) {
      const stop = stops.find(s => s.name === stopName), cp = cps.find(c => c.short === at);
      if (!stop) throw new Error('config.txt has no stop called ' + stopName);
      if (!cp) throw new Error('config.txt has no checkpoint called ' + at);
      const myKm = kmOf(stop), info = R.aboardInfo({ id: 'b', direction: dir, ts: 1, km: kmOf(cp) }, myKm, kms);
      if (!info || info.passed) throw new Error('a bus at ' + at + ' going ' + dir + ' has passed ' + stopName);
      return { km: info.km, stops: R.stopsBack(info, myKm, kms), between: info.stops };
    }
  };
  return ROUTE;
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
    const aboard = opts.aboard === '1', { keys, paint } = dressOf(opts, S);
    let f = null, ride = null;
    if (aboard) ride = route().riding((opts.stop || '').replace(/\+/g, ' '), opts.at, opts.dir || 'north');
    else {
      f = Number(opts.f);
      if (!(f >= 0 && f <= S.STOP_VIEW_MOST)) throw new Error('a stopview needs f, how many stops away the bus is, not ' + opts.f);
    }
    const svg = S.stopViewSvg({ aboard, f, km: ride && ride.km, stops: ride && ride.stops, place: aboard ? (opts.stop || '').replace(/\+/g, ' ') : '',
      here: opts.here === '1', sky: opts.sky, worn: keys, paint, still: opts.still === '1' });
    out.push({ start: m.index, end: m.index + m[0].length, open: '<!-- stopview' + m[1] + ' -->', close: '<!-- /stopview -->',
      f, ride, aboard, here: opts.here === '1', sky: opts.sky, keys, paint, current: m[2], wanted: svg });
  }
  return out;
}

// ---- The app's icon ---------------------------------------------------------
// Three tickets fanned on a morning coral. The front one is printed FIBI for
// the app, or a line of print for the website, which is called Bus Tracker,
// and the coach drives out through its picture of Taal at dawn; the two
// behind it are other trips, the lake by day and the city; SALAMAT is
// stamped across two. Drawn on the 512 square a launcher shows, with the
// coral running on over the 768 of Android's adaptive layers. The coach is
// index.html's COACH_SIDE in the dawn scene's colours, and the paper, the
// print, the gold band and the stamp's red are the salamat ticket's (.tkt).
const TKT = { cream: '#fbf4e4', yellow: '#fbf0c6', pink: '#f9e4e3', ink: '#6d1a25', gold: '#e39a1c', red: '#b0281c' };
// Android shows the middle 72 of a layer's 108 and keeps a circle of 66
// clear of its masks: a radius of 234.7 on this 512. The web's maskable
// icons keep 80% (204.8), so theirs is drawn smaller by the difference, and
// Android 7's own icons are a 44 shape on a 48 square.
const ICON_SAFE = 256 * 66 / 72;
const ICON_FITS = { maskable: 204.8 / ICON_SAFE };
const ICON_SHAPES = { square: 44 / 48, circle: 44 / 48 };
// Two decimals are plenty at 512, and keep the files readable.
const tidy = (s, places) => s.replace(/-?\d*\.\d{3,}/g, v => String(+(+v).toFixed(places || 2)));

const lin = (id, stops, y1, y2) => '<linearGradient id="' + id + '" x1="0" y1="' + y1 + '" x2="0" y2="' + y2 + '" gradientUnits="userSpaceOnUse">' +
  stops.map(s => '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"/>').join('') + '</linearGradient>';
const blur = (id, sd) => '<filter id="' + id + '" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="' + sd + '"/></filter>';
const disc = (cx, cy, r) => 'M' + (cx - r) + ' ' + cy + 'A' + r + ' ' + r + ' 0 1 0 ' + (cx + r) + ' ' + cy + 'A' + r + ' ' + r + ' 0 1 0 ' + (cx - r) + ' ' + cy + 'Z';

// A ticket's outline, its top and bottom edges bitten as the app's ticket's
// are; band, if given, is only the strip that deep along the top.
function bitten(x, y, w, h, r, n, band) {
  const step = w / n;
  let d = 'M' + x + ' ' + y;
  for (let i = 0; i < n; i++) { const c = x + step * (i + .5); d += 'L' + (c - r) + ' ' + y + 'A' + r + ' ' + r + ' 0 0 0 ' + (c + r) + ' ' + y; }
  if (band) return d + 'L' + (x + w) + ' ' + y + 'V' + (y + band) + 'H' + x + 'Z';
  d += 'L' + (x + w) + ' ' + y + 'L' + (x + w) + ' ' + (y + h);
  for (let i = n - 1; i >= 0; i--) { const c = x + step * (i + .5); d += 'L' + (c + r) + ' ' + (y + h) + 'A' + r + ' ' + r + ' 0 0 0 ' + (c - r) + ' ' + (y + h); }
  return d + 'L' + x + ' ' + (y + h) + 'Z';
}
const print = (x, y, w, op, th) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + (th || 4) + '" rx="' + (th || 4) / 2 + '" fill="' + TKT.ink + '" opacity="' + op + '"/>';
const tear = (x1, y, x2) => '<path d="M' + x1 + ' ' + y + 'H' + x2 + '" stroke="' + TKT.ink + '" stroke-width="2.5" stroke-dasharray="7 6" opacity=".45"/>';
const word = (x, y, s, size, fill) => '<text x="' + x + '" y="' + y + '" font-family="Barlow Semi Condensed" font-weight="700" font-size="' + size + '" letter-spacing="' + size * .16 + '" fill="' + (fill || TKT.ink) + '">' + s + '</text>';

// The coach, nose to the right, its wheels' foot at (x, foot) and s times the
// drawing's 364 by 136: in the dawn scene's colours, or in one colour
// throughout, without its own shadow, to be the shadow it casts.
function iconCoach(S, x, foot, s, colour) {
  const dawn = S.SCENE_TIMES.dawn.coach;
  let body = S.COACH_SIDE, style = dawn;
  if (colour) {
    body = body.replace('fill="rgba(0,0,0,.2)"', 'fill="none"').replace(/stroke="rgba\(0,0,0,\.1[48]\)"/g, 'stroke="none"');
    style = dawn.match(/--c-[a-z]+/g).map(k => k + ':' + colour).join(';');
  }
  return '<svg x="' + x + '" y="' + (foot - 136 * s) + '" width="' + 364 * s + '" height="' + 136 * s + '" viewBox="0 0 364 136" overflow="visible" style="' + style + '">' + body + '</svg>';
}

// The front ticket's picture: Taal from the ridge at dawn, the volcano's peak
// lifted clear of the coach that drives across it.
function iconPicture(id, x, y, w, h) {
  const hz = y + h * .5, road = y + h * .9, up = h * .15;
  const a = hz - h * .2 - up, peak = [[.58, hz - h * .31 - up], [.61, hz - h * .29 - up], [.64, hz - h * .32 - up]];
  return '<defs>' + lin(id + '-sky', [[0, '#f4ad78'], [1, '#fde2c0']], y, hz) +
    '<clipPath id="' + id + '-c"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="10"/></clipPath></defs>' +
    '<g clip-path="url(#' + id + '-c)">' +
    '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="url(#' + id + '-sky)"/>' +
    '<circle cx="' + (x + w * .3) + '" cy="' + (y + h * .2) + '" r="' + Math.min(h * .1, 13) + '" fill="#fff4d6"/>' +
    '<path d="M' + (x + w * .46) + ' ' + (a + h * .06) + peak.map(p => 'L' + (x + w * p[0]) + ' ' + p[1]).join('') + 'L' + (x + w * .78) + ' ' + (a + h * .06) + 'Z" fill="#a98a95"/>' +
    '<path d="M' + x + ' ' + (hz - h * .03) + 'C' + (x + w * .3) + ' ' + (hz - h * .08) + ' ' + (x + w * .6) + ' ' + (hz - h * .02) + ' ' + (x + w) + ' ' + (hz - h * .06) + 'V' + (hz + 4) + 'H' + x + 'Z" fill="#d8b3a4"/>' +
    '<rect x="' + x + '" y="' + hz + '" width="' + w + '" height="' + (road - hz) + '" fill="#cdb6b8"/>' +
    '<rect x="' + x + '" y="' + (road - h * .05) + '" width="' + w + '" height="' + h * .3 + '" fill="#d9b996"/>' +
    '<rect x="' + x + '" y="' + (road - h * .015) + '" width="' + w + '" height="' + h * .07 + '" fill="#86706a"/></g>';
}

// A ticket behind: its print and a smaller picture, the lake or the city.
function iconBackPrint(id, x, y, w, kind) {
  const pw = w - 32, ph = 90, px = x + 16, py = y + 72;
  const sky = kind === 'lake' ? ['#a9d6ec', '#e8f4f8'] : ['#f6c7a1', '#fde7cc'];
  const P = (fx, fy) => (px + pw * fx) + ' ' + (py + ph * fy);
  return print(x + 18, y + 34, 46, .5, 7) + print(x + w - 70, y + 32, 50, .35) + print(x + w - 70, y + 42, 32, .35) + tear(x + 12, y + 60, x + w - 12) +
    '<defs>' + lin(id + '-s', [[0, sky[0]], [1, sky[1]]], py, py + ph) + '<clipPath id="' + id + '-pc"><rect x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph + '" rx="8"/></clipPath></defs>' +
    '<g clip-path="url(#' + id + '-pc)"><rect x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph + '" fill="url(#' + id + '-s)"/>' +
    (kind === 'lake'
      ? '<rect x="' + px + '" y="' + (py + ph * .55) + '" width="' + pw + '" height="' + ph * .45 + '" fill="#86bcd6"/>' +
        '<path d="M' + P(.2, .62) + 'C' + P(.32, .52) + ' ' + P(.4, .36) + ' ' + P(.46, .26) + 'L' + P(.5, .3) + 'L' + P(.54, .24) + 'L' + P(.58, .3) + 'C' + P(.66, .42) + ' ' + P(.74, .54) + ' ' + P(.86, .62) + 'Z" fill="#7f9c86"/>'
      : '<path d="M' + P(0, 1) + 'V' + (py + ph * .5) + 'h' + pw * .12 + 'v-' + ph * .2 + 'h' + pw * .1 + 'v' + ph * .12 + 'h' + pw * .14 + 'v-' + ph * .34 + 'h' + pw * .12 + 'v' + ph * .26 +
        'h' + pw * .16 + 'v-' + ph * .14 + 'h' + pw * .1 + 'v' + ph * .2 + 'h' + pw * .26 + 'V' + (py + ph) + 'Z" fill="#e3cdb8"/>' +
        '<rect x="' + px + '" y="' + (py + ph * .85) + '" width="' + pw + '" height="' + ph * .15 + '" fill="#a99282"/>') +
    '</g>' + print(x + 18, y + 176, 120, .3) + print(x + 18, y + 188, 90, .3);
}

// The rubber stamp, inked: a double border and the word, pressed into the paper.
function iconStamp(id, st) {
  const { cx, cy, w, h, rot } = st, fs = h * .52;
  return '<g transform="rotate(' + rot + ' ' + cx + ' ' + cy + ')" filter="url(#' + id + '-ink)" style="mix-blend-mode:multiply">' +
    '<rect x="' + (cx - w / 2) + '" y="' + (cy - h / 2) + '" width="' + w + '" height="' + h + '" rx="' + h * .12 + '" fill="none" stroke="' + TKT.red + '" stroke-width="' + h * .085 + '"/>' +
    '<rect x="' + (cx - w / 2 + h * .12) + '" y="' + (cy - h / 2 + h * .12) + '" width="' + (w - h * .24) + '" height="' + h * .76 + '" rx="' + h * .07 + '" fill="none" stroke="' + TKT.red + '" stroke-width="' + h * .04 + '"/>' +
    '<text x="' + cx + '" y="' + (cy + fs * .36) + '" text-anchor="middle" font-family="Barlow Semi Condensed" font-weight="700" font-size="' + fs + '" letter-spacing="' + fs * .09 + '" fill="' + TKT.red + '">SALAMAT</text></g>';
}

// The icon as an <svg>. layer=fg or layer=bg is one of Android's adaptive
// layers on its 768 square; otherwise both, on the 512, with fit shrinking
// the tickets about the middle and shape cutting the whole to a rounded
// square or a circle. name=fibi prints the app's name; alpha=1 leaves one
// corner pixel a step short of opaque, for a picture that must keep its alpha
// channel (Chromium writes an opaque one without it).
function appIconSvg(S, o) {
  const id = 'ic-' + o.id;
  const w = 200, h = 300, cx = 256, base = 412, x = cx - w / 2, y = base - h, pivot = base - 30, drop = 26;
  const px = x + 10, py = y + 68, pw = w - 20, ph = h - 172;
  const st = { cx: 284, cy: 350, w: 206, h: 72, rot: -12 };
  const tickets = [{ paper: 'yellow', rot: -17, back: 'lake' }, { paper: 'pink', rot: 15, back: 'city', stamp: true }, { paper: 'cream', rot: -1, stamp: true }];
  let defs = '';
  const bg = () => {
    defs += lin(id + '-bg', [[0, '#e4876a'], [.55, '#eda27a'], [1, '#f2b88a']], -128, 640) +
      '<radialGradient id="' + id + '-vig" cx="256" cy="250" r="380" gradientUnits="userSpaceOnUse"><stop offset=".55" stop-color="#7a2a1c" stop-opacity="0"/><stop offset="1" stop-color="#7a2a1c" stop-opacity=".22"/></radialGradient>' +
      blur(id + '-glow', 40);
    return '<rect x="-128" y="-128" width="768" height="768" fill="url(#' + id + '-bg)"/>' +
      '<circle cx="330" cy="140" r="150" fill="#ffe9cf" opacity=".5" filter="url(#' + id + '-glow)"/>' +
      '<rect x="-128" y="-128" width="768" height="768" fill="url(#' + id + '-vig)"/>';
  };
  const fg = () => {
    defs += blur(id + '-sh', 9) + blur(id + '-soft', 5) + blur(id + '-lamp', 5) +
      '<filter id="' + id + '-ink" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="9" result="n"/>' +
      '<feColorMatrix in="n" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.3 0 0 0 2.35" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/></filter>';
    let out = '<g transform="translate(0 -14) translate(256 262) scale(1.12) translate(-256 -262)">';
    tickets.forEach((t, i) => {
      const k = id + '-t' + i, p = bitten(x, y, w, t.back ? h - 56 : h, 6, 10);
      const turn = 'rotate(' + t.rot + ' ' + cx + ' ' + pivot + ')' + (t.back ? ' translate(0 ' + drop + ')' : '');
      const unturn = (t.back ? 'translate(0 ' + -drop + ') ' : '') + 'rotate(' + -t.rot + ' ' + cx + ' ' + pivot + ')';
      out += '<g transform="' + turn + '">' +
        '<path d="' + p + '" fill="#5e2414" opacity=".3" filter="url(#' + id + '-sh)" transform="translate(0 8)"/>' +
        '<path d="' + p + '" fill="' + TKT[t.paper] + '"/>' +
        '<clipPath id="' + k + '"><path d="' + p + '"/></clipPath>' +
        '<g clip-path="url(#' + k + ')"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="12" fill="' + TKT.gold + '"/></g>';
      if (t.back) out += iconBackPrint(k + '-b', x, y, w, t.back);
      else out += (o.name === 'fibi' ? word(x + 18, y + 46, 'FIBI', 22) : print(x + 18, y + 34, 56, .7, 9)) +
        '<circle cx="' + (x + w - 32) + '" cy="' + (y + 38) + '" r="11" fill="#3a2a26"/>' +
        '<path d="M' + (x + w - 41) + ' ' + (y + 34) + 'A11 11 0 0 1 ' + (x + w - 23) + ' ' + (y + 34) + '" fill="none" stroke="#000" stroke-width="3" opacity=".45"/>' +
        tear(x + 12, y + 60, x + w - 12) + iconPicture(k + '-a', px, py, pw, ph) +
        '<rect x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph + '" rx="10" fill="none" stroke="#fffaf0" stroke-width="5"/>';
      if (t.stamp) out += '<g clip-path="url(#' + k + ')"><g transform="' + unturn + '">' + iconStamp(id, st) + '</g></g>';
      if (!t.back) {
        // Out of the frame: inside the picture, and past its right edge over
        // the paper, where it casts a shadow.
        const s = .82, bx = px + pw + 74 - 361 * s, foot = py + ph - 6, edge = px + pw;
        const beyond = '<rect x="' + edge + '" y="' + (py - 60) + '" width="200" height="' + (ph + 120) + '"/>';
        out += '<defs><clipPath id="' + id + '-out"><rect x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph + '" rx="10"/>' + beyond + '</clipPath>' +
          '<clipPath id="' + id + '-past">' + beyond + '</clipPath></defs>' +
          '<g clip-path="url(#' + id + '-past)" opacity=".42"><g filter="url(#' + id + '-soft)" transform="translate(7 9)">' + iconCoach(S, bx, foot, s, '#4a1d10') + '</g></g>' +
          '<g clip-path="url(#' + id + '-out)">' + iconCoach(S, bx, foot, s) +
          '<ellipse cx="' + (bx + 352 * s) + '" cy="' + (foot - 32 * s) + '" rx="' + 15 * s + '" ry="' + 8 * s + '" fill="#fff3c4" filter="url(#' + id + '-lamp)"/></g>';
      }
      out += '</g>';
    });
    return out + '</g>';
  };
  const about = f => '<g transform="translate(256 256) scale(' + f + ') translate(-256 -256)">';
  let view = '0 0 512 512', body;
  if (o.layer === 'fg' || o.layer === 'bg') { view = '-128 -128 768 768'; body = o.layer === 'fg' ? fg() : bg(); }
  else if (o.shape) {
    const f = ICON_SHAPES[o.shape], r = 256 * f, at = 256 - r;
    defs += '<clipPath id="' + id + '-shape">' + (o.shape === 'circle' ? '<circle cx="256" cy="256" r="' + r + '"/>'
      : '<rect x="' + at + '" y="' + at + '" width="' + 2 * r + '" height="' + 2 * r + '" rx="' + 2 * r * .2 + '"/>') + '</clipPath>';
    body = '<g clip-path="url(#' + id + '-shape)">' + about(f) + bg() + fg() + '</g></g>';
  } else body = bg() + (o.fit ? about(ICON_FITS[o.fit]) + fg() + '</g>' : fg());
  if (o.alpha === '1') {
    defs += '<mask id="' + id + '-a" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512"><rect width="512" height="512" fill="#fff"/><rect width="1" height="1" fill="#fefefe"/></mask>';
    body = '<g mask="url(#' + id + '-a)">' + body + '</g>';
  }
  return tidy('<svg viewBox="' + view + '" aria-hidden="true" focusable="false"><defs>' + defs + '</defs>' + body + '</svg>');
}

// Every drawing of the icon in one file, the same way as the pictures above.
function appicons(src, S) {
  const out = [];
  const re = /<!-- appicon([^>]*?) -->([\s\S]*?)<!-- \/appicon -->/g;
  let m;
  while ((m = re.exec(src))) {
    const opts = {};
    for (const part of m[1].trim().split(/\s+/).filter(Boolean)) { const [k, v] = part.split('='); opts[k] = v; }
    if (!opts.id) throw new Error('an appicon needs an id unique on the page');
    if (opts.layer && opts.layer !== 'fg' && opts.layer !== 'bg') throw new Error('no icon layer called ' + opts.layer);
    if (opts.fit && !(opts.fit in ICON_FITS)) throw new Error('no icon fit called ' + opts.fit);
    if (opts.shape && !(opts.shape in ICON_SHAPES)) throw new Error('no icon shape called ' + opts.shape);
    out.push({ start: m.index, end: m.index + m[0].length, open: '<!-- appicon' + m[1] + ' -->', close: '<!-- /appicon -->',
      id: opts.id, name: opts.name || '', current: m[2], wanted: appIconSvg(S, opts) });
  }
  return out;
}

// ---- The small mark ---------------------------------------------------------
// Butas, the ticket punched through in the coach's shape, for where the icon
// is too small to read: a browser tab, the status bar, Android's one-colour
// icon. On a 48 grid, as one path whose holes the even-odd rule cuts, so
// anything that can fill a path draws it in one colour.
const MARK = { x: 8, y: 5, w: 32, h: 38, bite: 1.6, bites: 6, band: 4.4, tilt: -7,
  coach: { x: 10.1, y: 19.4, s: .72 }, punch: { cx: 33.5, cy: 12.6, r: 2.6 } };
// The coach it punches, nose to the right, 38.5 by 21.2: its body and wheels
// are the hole, and its windows and hubs are left standing in it.
const MARK_COACH = {
  hole: 'M3 0H32Q36 0 37 4L38.5 11V15Q38.5 17 36.5 17H33.7A4.2 4.2 0 0 1 25.3 17H12.2A4.2 4.2 0 0 1 3.8 17H2Q0 17 0 15V3Q0 0 3 0Z',
  left: 'M3.5 3.5H9.5V9.5H3.5ZM11.5 3.5H17.5V9.5H11.5ZM19.5 3.5H25.5V9.5H19.5ZM27.5 3.5H33Q34.3 3.5 34.7 5L36 9.5H27.5Z' + disc(8, 17, 1.5) + disc(29.5, 17, 1.5)
};
// A path moved to (x, y) and drawn s times its size. Absolute commands only.
function place(d, x, y, s) {
  return d.replace(/([MLHVQAZ])([^MLHVQAZ]*)/g, (all, c, args) => {
    const v = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
    if (c === 'H') return 'H' + v.map(a => x + a * s).join(' ');
    if (c === 'V') return 'V' + v.map(a => y + a * s).join(' ');
    if (c === 'A') return 'A' + v.map((a, i) => [a * s, a * s, a, a, a, x + a * s, y + a * s][i % 7]).join(' ');
    return c + v.map((a, i) => i % 2 ? y + a * s : x + a * s).join(' ');
  });
}
function markPath() {
  const m = MARK, c = m.coach;
  return tidy(bitten(m.x, m.y, m.w, m.h, m.bite, m.bites) + place(MARK_COACH.hole + MARK_COACH.left, c.x, c.y, c.s) + disc(m.punch.cx, m.punch.cy, m.punch.r), 3);
}
// The mark on its tile, as a tab shows it: on the icon's coral for the site,
// and on ink for the admin page, so its tab is told apart.
const MARK_TILES = { coral: ['#e4876a', '#f2b88a'], ink: ['#3a302c', '#2b2320'] };
function markTileSvg(tile) {
  const t = MARK_TILES[tile], p = markPath();
  return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'>" +
    "<linearGradient id='t' x2='0' y2='1'><stop offset='0' stop-color='" + t[0] + "'/><stop offset='1' stop-color='" + t[1] + "'/></linearGradient>" +
    "<rect width='48' height='48' rx='11' fill='url(#t)'/><g transform='rotate(" + MARK.tilt + " 24 24)' fill-rule='evenodd'>" +
    "<path d='" + p + "' fill='#000' opacity='.16' transform='translate(.6 1.2)'/><path d='" + p + "' fill='" + TKT.cream + "'/>" +
    "<path d='" + tidy(bitten(MARK.x, MARK.y, MARK.w, MARK.h, MARK.bite, MARK.bites, MARK.band), 3) + "' fill='" + TKT.gold + "'/></g></svg>";
}
const faviconHref = tile => 'data:image/svg+xml,' + markTileSvg(tile).replace(/%/g, '%25').replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E');
const FAVICONS = { 'index.html': 'coral', 'how-to.html': 'coral', 'flyer.html': 'coral', 'for-operators.html': 'coral', 'testers.html': 'coral', 'admin.html': 'ink' };

// The Android app's two drawings of the mark, written whole: the status
// bar's while a bus is shared, upright and in white, as Android wants a
// notification's icon; and the one-colour icon Android 13 tints to the
// wallpaper, tilted as the tab's is, in the middle of the adaptive icon's 108.
const ANDROID_RES = 'mobile/android/app/src/main/res/';
function markDrawables() {
  const head = (about, size, viewport) => '<?xml version="1.0" encoding="utf-8"?>\n<!-- ' + about +
    '\n     Drawn by tools/make-pictures.js: change the mark there and re-run it. -->\n' +
    '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n    android:width="' + size + 'dp"\n    android:height="' + size + 'dp"\n' +
    '    android:viewportWidth="' + viewport + '"\n    android:viewportHeight="' + viewport + '">\n';
  const path = indent => indent + '<path\n' + indent + '    android:fillColor="#FFFFFFFF"\n' + indent + '    android:fillType="evenOdd"\n' +
    indent + '    android:pathData="' + markPath() + '" />\n';
  const s = 72 * .66 / 48, t = tidy(String(54 - 24 * s));
  return {
    [ANDROID_RES + 'drawable/ic_tracking.xml']: head('The status bar\'s icon while a bus is being shared: the small mark, a ticket\n     punched through in the coach\'s shape, in white on transparency, as\n     Android requires of a notification icon.', 24, 48) +
      path('    ') + '</vector>\n',
    [ANDROID_RES + 'drawable/ic_launcher_monochrome.xml']: head('The launcher icon\'s one-colour layer, which Android 13 and later tint to\n     the wallpaper when themed icons are on: the small mark, tilted as the\n     browser tab\'s is, inside the 66dp the launcher never crops.', 108, 108) +
      '    <group\n        android:translateX="' + t + '"\n        android:translateY="' + t + '"\n        android:scaleX="' + tidy(String(s)) + '"\n        android:scaleY="' + tidy(String(s)) + '">\n' +
      '        <group\n            android:pivotX="24"\n            android:pivotY="24"\n            android:rotation="' + MARK.tilt + '">\n' +
      path('            ') + '        </group>\n    </group>\n</vector>\n'
  };
}

// The file as it should be, with every picture redrawn.
function redraw(src, S) {
  const all = boards(src, S).map(b => Object.assign({ close: '<!-- /signboard -->' }, b)).concat(scenes(src, S), arts(src, S), buses(src, S), rides(src, S), stopviews(src, S), appicons(src, S))
    .sort((a, b) => a.start - b.start);
  let res = '', at = 0;
  for (const p of all) {
    res += src.slice(at, p.start) + p.open + p.wanted + p.close;
    at = p.end;
  }
  return res + src.slice(at);
}

module.exports = { renderer, boards, scenes, arts, buses, rides, stopviews, appicons, appIconSvg, redraw, FILES, ROOT,
  MARK, markPath, faviconHref, FAVICONS, markDrawables, TKT };

if (require.main === module) {
  const S = renderer();
  for (const f of FILES) {
    const file = path.join(ROOT, f);
    const src = fs.readFileSync(file, 'utf8');
    const n = boards(src, S).length + scenes(src, S).length + arts(src, S).length + buses(src, S).length + rides(src, S).length + stopviews(src, S).length + appicons(src, S).length;
    const next = redraw(src, S);
    if (next === src) { console.log(`${f}: ${n} picture${n === 1 ? '' : 's'}, already current`); continue; }
    fs.writeFileSync(file, next);
    console.log(`${f}: drew ${n} picture${n === 1 ? '' : 's'}`);
  }
  // The mark, as each page's favicon and as the Android app's two drawables.
  for (const [f, tile] of Object.entries(FAVICONS)) {
    const file = path.join(ROOT, f);
    const src = fs.readFileSync(file, 'utf8');
    if (!/<link rel="icon" href="[^"]*">/.test(src)) throw new Error(f + ' has no <link rel="icon"> to draw the mark into');
    const next = src.replace(/<link rel="icon" href="[^"]*">/, () => '<link rel="icon" href="' + faviconHref(tile) + '">');
    if (next !== src) fs.writeFileSync(file, next);
    console.log(`${f}: favicon ${next === src ? 'already current' : 'drawn'}`);
  }
  for (const [f, xml] of Object.entries(markDrawables())) {
    const file = path.join(ROOT, f);
    const was = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (was !== xml) fs.writeFileSync(file, xml);
    console.log(`${f}: ${was === xml ? 'already current' : 'drawn'}`);
  }
}
