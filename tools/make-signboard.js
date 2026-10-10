#!/usr/bin/env node
// Draws the dot-matrix route board into the pages that cannot draw their own.
//
// The tracker draws its header board at load (drawSignboard in index.html).
// The guide, the flyer and the briefing load nothing and the flyer and the
// briefing run no script, and the link-preview picture is a screenshot, so
// their boards are drawn here instead and written into the files. The code
// that draws them is not a copy: it is the SIGNBOARD block of index.html,
// taken out by its markers and run, like the test suites do.
//
// Each board sits between two comments, after the words it shows:
//
//   <span class="led"><span class="ln">Mendez / Tagaytay</span> ...</span>
//   <!-- signboard id=hdrsign pitch=2.4 -->  ...the picture...  <!-- /signboard -->
//
// The words are the nearest .led span before the opening comment, one line
// per .ln span. Options: id (unique on the page), pitch (CSS pixels per
// dot), lines=1 (run the lines together), center, cls (a class to add).
// Change the words, then run:
//
//   node tools/make-signboard.js
//
// tests/test-signboard.js fails while any board is out of date with its words.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = ['how-to.html', 'flyer.html', 'for-operators.html', 'tools/app-icons.html'];

function renderer() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const a = html.indexOf('// ---- THE SIGNBOARD (unit tested)');
  const b = html.indexOf('// ---- END SIGNBOARD');
  if (a < 0 || b < a) throw new Error('index.html has no SIGNBOARD block between its markers');
  const S = {};
  new Function('S', html.slice(a, b) +
    'S.SIGN_FONT=SIGN_FONT;S.signGlyph=signGlyph;S.signLayout=signLayout;S.signboardSvg=signboardSvg;')(S);
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

// The file as it should be, with every board redrawn.
function redraw(src, S) {
  let res = '', at = 0;
  for (const b of boards(src, S)) {
    res += src.slice(at, b.start) + b.open + b.wanted + '<!-- /signboard -->';
    at = b.end;
  }
  return res + src.slice(at);
}

module.exports = { renderer, boards, redraw, FILES, ROOT };

if (require.main === module) {
  const S = renderer();
  for (const f of FILES) {
    const file = path.join(ROOT, f);
    const src = fs.readFileSync(file, 'utf8');
    const n = boards(src, S).length;
    const next = redraw(src, S);
    if (next === src) { console.log(`${f}: ${n} board${n === 1 ? '' : 's'}, already current`); continue; }
    fs.writeFileSync(file, next);
    console.log(`${f}: drew ${n} board${n === 1 ? '' : 's'}`);
  }
}
