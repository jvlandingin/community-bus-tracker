#!/usr/bin/env node
'use strict';
/*
  Prints the map figure used by flyer.html and for-operators.html, drawn from
  the real coordinates in config.txt.

    node tools/make-route-figure.js > figure.html

  The flyer used to carry a hand-drawn squiggle standing in for the map. It was
  wrong twice over: the shape was invented, and this corridor is 3.6 times
  taller than it is wide, so the real route reads as a near-vertical line rather
  than the diagonal that had been drawn. Generating it instead means the picture
  is the actual route — every checkpoint and stop in config.txt, projected the
  way Leaflet projects them — and a fork gets its own route's shape for free.

  Where this figure is actually used: nowhere on the shipped pages, currently.
  flyer.html and for-operators.html show a REAL SCREENSHOT of this route's
  map, on screen and in print alike (embedded as a data URI, so the page
  still loads nothing over the network), because a generated road read as a
  drawing next to real tiles and the whole point of the mock is to look like
  the product. That photo ties itself to Cavite the way this file's output
  never has to: a fork running elsewhere must crop a fresh screenshot of
  their own route and recompute the four badge positions from the checkpoint
  pixels the same way — see the comment above the crop parameters wherever
  the photo was produced (not tracked by this script).

  This generator stays in the repo as the option for a fork that would rather
  not photograph anything: run it, drop the output where the photo currently
  sits, remove the "photo" class from that wrapper. No screenshot, no
  per-fork photography, at the cost of looking like a diagram rather than the
  product.

  Web Mercator, the same projection Leaflet uses, so the shape is the shape a
  reader will actually see when they open the tracker.
*/

const fs = require('fs');
const path = require('path');

const CONFIG = path.join(__dirname, '..', 'config.txt');

// ---- config.txt ---------------------------------------------------------
// The STOP list is grouped under headers like "# ---- Imus ----", one per
// town. That grouping already carries the labels a real basemap prints
// (CAVITE CITY, IMUS, DASMARIÑAS...) tied to real coordinates, so town labels
// are read off it rather than invented or hand-plotted.
function parseConfig(src){
  const stops = [], checkpoints = [];
  let section = null;
  src.split(/\r?\n/).forEach(function(line){
    const t = line.trim();
    const heading = t.match(/^#\s*-{2,}\s*(.+?)\s*-{2,}\s*$/);
    if (heading) { section = heading[1]; return; }
    if (t.startsWith('#') || t.indexOf('=') === -1) return;
    const key = t.slice(0, t.indexOf('=')).trim();
    const parts = t.slice(t.indexOf('=') + 1).split('|').map(s => s.trim());
    if (key === 'STOP' && parts.length >= 3)
      stops.push({ name: parts[0], lat: +parts[1], lng: +parts[2], section: section });
    else if (key === 'CHECKPOINT' && parts.length >= 4)
      checkpoints.push({ name: parts[0], short: parts[1], lat: +parts[2], lng: +parts[3] });
  });
  return { stops, checkpoints };
}

// ---- Web Mercator, as Leaflet does it ----------------------------------
function project(lat, lng){
  return { x: lng, y: (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) };
}

// A point a given fraction along the straight leg between two checkpoints,
// which is how busPlace() in index.html places a bus on the progress strip.
function alongLeg(a, b, t){
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

// ---- Layout ------------------------------------------------------------
// The viewBox is the panel, and the route is fitted inside it at its true
// proportions. Nothing is stretched to fill: a squashed map is the one thing
// that makes a drawing of a map look like a drawing.
const VB_W = 320, VB_H = 200, PAD_Y = 14, PAD_X = 12;

// `focus` is what the frame is fitted to, the way the live map fits its bounds
// to the buses that are sharing rather than to the whole line. The route then
// runs off the top and bottom of the panel, which is both what the app looks
// like and what stops a 3.6:1 corridor from rendering as a hairline.
function layout(focus){
  const pts = focus.map(s => project(s.lat, s.lng));
  const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x));
  const minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y));
  // One scale for both axes, so the shape is preserved.
  const scale = Math.min((VB_W - PAD_X * 2) / (maxX - minX || 1e-9), (VB_H - PAD_Y * 2) / (maxY - minY || 1e-9));
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return function(lat, lng){
    const p = project(lat, lng);
    return {
      // y is flipped: Mercator grows north, SVG grows down.
      x: VB_W / 2 + (p.x - cx) * scale,
      y: VB_H / 2 - (p.y - cy) * scale,
    };
  };
}

const cfg = parseConfig(fs.readFileSync(CONFIG, 'utf8'));
if (cfg.stops.length < 2) { console.error('config.txt has no stops to draw'); process.exit(1); }

// The four buses, at the positions the chips beside the figure describe. Kept
// in one place so the drawing and the chip text cannot disagree.
const BUSES = [
  { label: '98018', dir: 'nb', from: 'IMUS',   to: 'KAWIT', t: 0.41 },
  { label: '98104', dir: 'nb', from: 'AMADEO', to: 'AMADEO', t: 0 },
  { label: null,    dir: 'sb', from: 'TGY',    to: 'TGY',    t: 0 },
  { label: '98077', dir: 'sb', from: 'KAWIT',  to: 'PITX',  t: 0.53 },
];
const byShort = {};
cfg.checkpoints.forEach(c => { byShort[c.short] = c; });
const busAt = BUSES.map(function(b){
  const a = byShort[b.from], c = byShort[b.to];
  if (!a || !c) { console.error('unknown checkpoint in BUSES: ' + b.from + '/' + b.to); process.exit(1); }
  return alongLeg(a, c, b.t);
});

const at = layout(busAt);
const r = n => Math.round(n * 10) / 10;

// The road, as a smooth curve through the checkpoints.
//
// Joining the stops in file order was the obvious thing and it looked wrong:
// config.txt groups them by town rather than strictly along the carriageway,
// so the line doubled back on itself and came out as a zigzag. The checkpoints
// are the ordered spine of the route, so the road is drawn through those and
// the stops are left as dots beside it — which is also how a real basemap
// looks, stops sitting on and just off the highway.
//
// Catmull-Rom through the points, converted to cubic beziers, so the curve
// passes through every checkpoint instead of merely being pulled toward it.
function smoothPath(pts){
  if (pts.length < 2) return '';
  let d = 'M' + r(pts[0].x) + ' ' + r(pts[0].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += 'C' + r(c1.x) + ' ' + r(c1.y) + ',' + r(c2.x) + ' ' + r(c2.y) + ',' + r(p2.x) + ' ' + r(p2.y);
  }
  return d;
}
const road = smoothPath(cfg.checkpoints.map(c => at(c.lat, c.lng)));

// Stops, at their real positions, thinned so they do not pile up.
//
// All 71 are inside the frame at this zoom and drawing every one turned the
// road into a bead necklace. Real map renderers drop markers that collide at
// the current zoom rather than stacking them, so the same rule applies here:
// keep a stop only if it is at least MIN_GAP from one already kept. Nothing is
// invented and nothing is moved — some are simply not drawn, exactly as the
// live map does when it is zoomed out.
const MIN_GAP = 11;
const kept = [];
cfg.stops.forEach(function(s){
  const p = at(s.lat, s.lng);
  if (p.x < -10 || p.x > VB_W + 10 || p.y < -10 || p.y > VB_H + 10) return;
  const clash = kept.some(q => Math.hypot(q.x - p.x, q.y - p.y) < MIN_GAP);
  if (!clash) kept.push(p);
});
const dots = kept.map(p => '<circle cx="' + r(p.x) + '" cy="' + r(p.y) + '" r="2.4"/>').join('');

// Town labels, positioned at the centroid of each town's stops that fall
// inside the frame — the same real screenshot showed "IMUS", "DASMARIÑAS",
// "CAVITE CITY" sitting beside the road, not on it, which this reproduces by
// nudging each label clear of the line rather than pinning it to one stop.
const groups = {};
cfg.stops.forEach(function(s){
  if (!s.section) return;
  const p = at(s.lat, s.lng);
  if (p.x < 0 || p.x > VB_W || p.y < 0 || p.y > VB_H) return;
  (groups[s.section] = groups[s.section] || []).push(p);
});
const LABEL_GAP = 22, EDGE_X = 6, EDGE_Y = 10, BADGE_CLEAR = 16;
const busPx = busAt.map(p => at(p.lat, p.lng));
const labels = Object.keys(groups).map(function(name){
  const pts = groups[name];
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return { name: name.toUpperCase(), x: cx, y: cy };
}).sort((a, b) => a.y - b.y);
const placed = [];
labels.forEach(function(l){
  if (placed.some(p => Math.abs(p.y - l.y) < LABEL_GAP)) return;
  // Clear of the road: right of centre goes further right, left goes further
  // left, so the label reads beside the line the way a real map's does.
  const right = l.x >= VB_W / 2;
  let x = right ? Math.min(VB_W - EDGE_X, l.x + 14) : Math.max(EDGE_X, l.x - 14);
  const y = Math.min(VB_H - EDGE_Y, Math.max(EDGE_Y, l.y));
  // A bus badge sitting on top of a place name is unreadable either way, so
  // the label is pushed further out from the road rather than dropped —
  // dropping town names near a bus was the more common case at this zoom.
  busPx.forEach(function(b){
    if (Math.abs(b.y - y) < BADGE_CLEAR && Math.abs(b.x - x) < BADGE_CLEAR)
      x = right ? Math.min(VB_W - EDGE_X, x + BADGE_CLEAR) : Math.max(EDGE_X, x - BADGE_CLEAR);
  });
  // The zoom control and the attribution strip are HTML overlaid on top of
  // the panel, not part of the SVG, so a label can sit under them with
  // nothing here to detect it. Carved out by hand instead, sized to the CSS
  // footprint of each (see .demo-zoom / .demo-attr in flyer.html and
  // for-operators.html) and converted from the panel's rendered pixel size
  // to viewBox units.
  let y2 = y;
  if (x > VB_W - 135 && y > VB_H - 26) y2 = VB_H - 30;   // attribution, bottom-right
  if (x < 40 && y < 40) y2 = Math.max(y2, 46);           // zoom control, top-left
  placed.push({ name: l.name, x: x, y: y2, anchor: right ? 'start' : 'end' });
});
const labelSvg = placed.map(function(l){
  return '<text x="' + r(l.x) + '" y="' + r(l.y) + '" text-anchor="' + l.anchor + '">' + l.name + '</text>';
}).join('');

const badges = BUSES.map(function(b, i){
  const p = at(busAt[i].lat, busAt[i].lng);
  return '        <span class="demo-badge ' + b.dir + '" style="left:' + r(p.x / VB_W * 100) +
         '%; top:' + r(p.y / VB_H * 100) + '%">🚌</span>';
}).join('\n');

process.stdout.write(
`      <div class="demo-map">
        <!-- The route as it really runs, generated from config.txt by
             tools/make-route-figure.js. Web Mercator, the same projection the
             live map uses, fitted at true proportions — this corridor is over
             three times taller than it is wide, which is why the road runs
             nearly vertically. The road follows the checkpoints; the dots are
             the real stops. Re-run the tool after editing either. -->
        <svg viewBox="0 0 ${VB_W} ${VB_H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <path class="road-case" d="${road}"/>
          <path class="road" d="${road}"/>
          <g class="stp">${dots}</g>
          <g class="lbl">${labelSvg}</g>
        </svg>
${badges}
        <span class="demo-attr">Leaflet | © OpenStreetMap © CARTO</span>
        <span class="demo-zoom"><b>+</b><b>−</b></span>
      </div>
`);
console.error(`route: ${kept.length} of ${cfg.stops.length} stops drawn, ${cfg.checkpoints.length} checkpoints, viewBox ${VB_W}x${VB_H}`);
