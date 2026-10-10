#!/usr/bin/env node
// Copies the app's typeface into the three pages that load nothing.
//
// The guide, the flyer and the operator briefing are built to stand on their
// own: opened from a saved file, printed to PDF, or served from a deploy that
// lost assets/, each still has to look like the app it describes. They load
// no file of any kind (test-boot.js fails if a src comes back), so the
// tracker's font files cannot simply be linked from them. Instead each page
// carries the same five files inline, as data URIs, between two marker
// comments in its <style> block, and this writes them there.
//
// The bytes are the ones in assets/fonts, unchanged, so the static pages and
// the tracker draw exactly the same letters. tests/test-tokens.js decodes
// each page's copy and fails if it differs from the file, so after replacing
// a font file (and renaming it, see the note on index.html's @font-face
// rules), run this again:
//
//   node tools/embed-fonts.js
//
// About 62 KB per page. That is the price of "loads nothing", paid on the
// three pages that are read once rather than opened every morning.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGES = ['how-to.html', 'flyer.html', 'for-operators.html'];
const FACES = [
  ['Barlow Semi Condensed', 500, 'barlow-semi-condensed-500.v1.woff2'],
  ['Barlow Semi Condensed', 600, 'barlow-semi-condensed-600.v1.woff2'],
  ['Barlow Semi Condensed', 700, 'barlow-semi-condensed-700.v1.woff2'],
  ['Barlow', 400, 'barlow-400.v1.woff2'],
  ['Barlow', 600, 'barlow-600.v1.woff2'],
];
const BEGIN = '/* ---- fonts: written by tools/embed-fonts.js from assets/fonts, do not edit by hand ---- */';
const END = '/* ---- end of fonts ---- */';

const rules = FACES.map(([family, weight, file]) => {
  const b64 = fs.readFileSync(path.join(ROOT, 'assets', 'fonts', file)).toString('base64');
  return `  @font-face{font-family:'${family}'; font-style:normal; font-weight:${weight}; font-display:swap; ` +
         `src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
}).join('\n');

let failed = false;
for (const page of PAGES) {
  const file = path.join(ROOT, page);
  const html = fs.readFileSync(file, 'utf8');
  const a = html.indexOf(BEGIN), b = html.indexOf(END);
  if (a < 0 || b < a) {
    console.error(`${page}: no font markers. Put these two lines at the top of its <style> block:\n  ${BEGIN}\n  ${END}`);
    failed = true;
    continue;
  }
  const next = html.slice(0, a + BEGIN.length) + '\n' + rules + '\n  ' + html.slice(b);
  if (next === html) { console.log(`${page}: already current`); continue; }
  fs.writeFileSync(file, next);
  console.log(`${page}: wrote ${FACES.length} faces`);
}
process.exit(failed ? 1 : 0);
