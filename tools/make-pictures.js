#!/usr/bin/env node
// Draws the tracker's pictures into the pages that cannot draw their own: the
// dot-matrix route board, and the view from the ridge that covers the guide,
// the flyer and the briefing.
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
    'S.COACH_SIDE=COACH_SIDE;S.SCENE_TIMES=SCENE_TIMES;S.sceneSvg=sceneSvg;S.MARKS=MARKS;S.markSvg=markSvg;')(S);
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

// The file as it should be, with every picture redrawn.
function redraw(src, S) {
  const all = boards(src, S).map(b => Object.assign({ close: '<!-- /signboard -->' }, b)).concat(scenes(src, S))
    .sort((a, b) => a.start - b.start);
  let res = '', at = 0;
  for (const p of all) {
    res += src.slice(at, p.start) + p.open + p.wanted + p.close;
    at = p.end;
  }
  return res + src.slice(at);
}

module.exports = { renderer, boards, scenes, redraw, FILES, ROOT };

if (require.main === module) {
  const S = renderer();
  for (const f of FILES) {
    const file = path.join(ROOT, f);
    const src = fs.readFileSync(file, 'utf8');
    const n = boards(src, S).length + scenes(src, S).length;
    const next = redraw(src, S);
    if (next === src) { console.log(`${f}: ${n} picture${n === 1 ? '' : 's'}, already current`); continue; }
    fs.writeFileSync(file, next);
    console.log(`${f}: drew ${n} picture${n === 1 ? '' : 's'}`);
  }
}
