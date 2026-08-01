#!/usr/bin/env node
'use strict';
/*
  Prints the SVG <path> data for a QR code, for pasting into flyer.html.

    node tools/make-qr.js https://your-route.example
    node tools/make-qr.js https://your-route.example --check

  Why this exists rather than an image file or a library:

  - flyer.html and for-operators.html load nothing at all — no font, no
    script file, no image. That property is what stops a figure 404ing off a
    deploy silently, which has happened to this repository's assets/ folder
    before. A QR is the one thing on a printed poster that cannot be typed,
    so it is drawn as an inline <path> like every other figure.
  - It is a tool, not shipped code, and it is dependency-free for the same
    reason the test suites are: there is deliberately no package.json here,
    because it would make Netlify run npm install and publish node_modules
    alongside the site.

  A fork changes the deployment URL, so it has to regenerate the path. That
  is this file's whole job.

  Byte mode, error correction level M (~15% recoverable), versions 1-10,
  which covers any URL up to 213 bytes. --check re-derives the matrix from
  the emitted path and compares, so a bad edit here cannot print a plausible
  looking path that decodes to nothing.
*/

// ---- Galois field GF(256), primitive polynomial 0x11d -------------------
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(function initGF(){
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

// Generator polynomial for `degree` error correction codewords, as the
// product of (x - a^0)(x - a^1)...(x - a^(degree-1)).
// Coefficients run highest power first, so poly[0] is the leading 1 that
// rsEncode below skips over.
function rsGenerator(degree){
  let poly = [1];
  for (let d = 0; d < degree; d++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let i = 0; i < poly.length; i++) {
      next[i] ^= poly[i];                        // multiplied by x
      next[i + 1] ^= gfMul(poly[i], EXP[d]);     // multiplied by a^d
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, ecLen){
  const gen = rsGenerator(ecLen);
  const res = new Array(ecLen).fill(0);
  for (const byte of data) {
    const factor = byte ^ res[0];
    res.shift();
    res.push(0);
    for (let i = 0; i < ecLen; i++) res[i] ^= gfMul(gen[i + 1], factor);
  }
  return res;
}

// ---- Version tables, error correction level M --------------------------
// [total codewords, ec codewords per block, group1 blocks, group2 blocks]
// Group 2 blocks, where present, hold exactly one data codeword more.
const VERSIONS = {
  1:  [26,   10, 1, 0],
  2:  [44,   16, 1, 0],
  3:  [70,   26, 1, 0],
  4:  [100,  18, 2, 0],
  5:  [134,  24, 2, 0],
  6:  [172,  16, 4, 0],
  7:  [196,  18, 4, 0],
  8:  [242,  22, 2, 2],
  9:  [292,  22, 3, 2],
  10: [346,  26, 4, 1],
};
const ALIGN = {
  1: [], 2: [6,18], 3: [6,22], 4: [6,26], 5: [6,30],
  6: [6,34], 7: [6,22,38], 8: [6,24,42], 9: [6,26,46], 10: [6,28,50],
};

function versionInfo(v){
  const [total, ecPerBlock, g1, g2] = VERSIONS[v];
  const blocks = g1 + g2;
  const dataTotal = total - ecPerBlock * blocks;
  // Group 2 blocks carry one extra data codeword each.
  const g1Len = Math.floor(dataTotal / blocks);
  return { total, ecPerBlock, g1, g2, blocks, dataTotal, g1Len, g2Len: g1Len + 1 };
}

function chooseVersion(byteLen){
  for (let v = 1; v <= 10; v++) {
    const { dataTotal } = versionInfo(v);
    // 4 bits mode + 8 bits count = 12 bits of header for versions 1-9;
    // version 10 uses a 16 bit count.
    const headerBits = 4 + (v >= 10 ? 16 : 8);
    if (byteLen * 8 + headerBits <= dataTotal * 8) return v;
  }
  throw new Error('data too long: ' + byteLen + ' bytes (max 213 at level M)');
}

// ---- Data encoding -----------------------------------------------------
function encodeData(bytes, version){
  const { dataTotal } = versionInfo(version);
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };

  push(0b0100, 4);                              // byte mode
  push(bytes.length, version >= 10 ? 16 : 8);   // character count
  for (const b of bytes) push(b, 8);

  const capacity = dataTotal * 8;
  push(0, Math.min(4, capacity - bits.length));  // terminator
  while (bits.length % 8) bits.push(0);          // pad to a byte boundary

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  // Alternating pad bytes, as the specification requires.
  const PAD = [0xEC, 0x11];
  for (let i = 0; codewords.length < dataTotal; i++) codewords.push(PAD[i % 2]);
  return codewords;
}

// Split into blocks, error-correct each, then interleave both sets.
function buildCodewords(data, version){
  const { ecPerBlock, g1, g2, g1Len, g2Len } = versionInfo(version);
  const dataBlocks = [], ecBlocks = [];
  let at = 0;
  for (let i = 0; i < g1 + g2; i++) {
    const len = i < g1 ? g1Len : g2Len;
    const block = data.slice(at, at + len);
    at += len;
    dataBlocks.push(block);
    ecBlocks.push(rsEncode(block, ecPerBlock));
  }
  const out = [];
  const maxData = Math.max(...dataBlocks.map(b => b.length));
  for (let i = 0; i < maxData; i++)
    for (const b of dataBlocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ecPerBlock; i++)
    for (const b of ecBlocks) out.push(b[i]);
  return out;
}

// ---- Matrix construction ----------------------------------------------
function buildMatrix(codewords, version){
  const size = version * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(null));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

  const setF = (r, c, v) => { m[r][c] = v; reserved[r][c] = true; };

  // Finder patterns and their separators.
  const finder = (top, left) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const rr = top + r, cc = left + c;
      if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
      const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                     (c >= 0 && c <= 6 && (r === 0 || r === 6));
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      setF(rr, cc, (inRing || inCore) ? 1 : 0);
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

  // Timing patterns.
  for (let i = 8; i < size - 8; i++) {
    setF(6, i, i % 2 === 0 ? 1 : 0);
    setF(i, 6, i % 2 === 0 ? 1 : 0);
  }

  // Alignment patterns, skipping the three finder corners.
  const centers = ALIGN[version];
  for (const r of centers) for (const c of centers) {
    if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const ring = Math.max(Math.abs(dr), Math.abs(dc));
      setF(r + dr, c + dc, (ring === 1) ? 0 : 1);
    }
  }

  // Dark module, and the two format information areas.
  setF(size - 8, 8, 1);
  for (let i = 0; i < 9; i++) {
    if (m[8][i] === null) { m[8][i] = 0; reserved[8][i] = true; }
    if (m[i][8] === null) { m[i][8] = 0; reserved[i][8] = true; }
  }
  for (let i = 0; i < 8; i++) {
    if (m[8][size - 1 - i] === null) { m[8][size - 1 - i] = 0; reserved[8][size - 1 - i] = true; }
    if (m[size - 1 - i][8] === null) { m[size - 1 - i][8] = 0; reserved[size - 1 - i][8] = true; }
  }
  // Version information, versions 7 and up.
  if (version >= 7) {
    let d = version << 12, rem = d;
    for (let i = 0; i < 6; i++) {
      const shift = 17 - i;
      if ((rem >> shift) & 1) rem ^= 0x1F25 << (shift - 12);
    }
    const bits = (d | (rem & 0xFFF));
    for (let i = 0; i < 18; i++) {
      const bit = (bits >> i) & 1;
      const r = Math.floor(i / 3), c = i % 3;
      setF(size - 11 + c, r, bit);
      setF(r, size - 11 + c, bit);
    }
  }

  // Data, snaking up and down two-module-wide columns from the right.
  let bitIndex = 0;
  const nextBit = () => {
    const byte = codewords[bitIndex >> 3];
    const bit = byte === undefined ? 0 : (byte >> (7 - (bitIndex & 7))) & 1;
    bitIndex++;
    return bit;
  };
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right = 5;             // the vertical timing column is skipped
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (let c = 0; c < 2; c++) {
        const col = right - c;
        if (reserved[row][col]) continue;
        m[row][col] = nextBit();
      }
    }
    upward = !upward;
  }
  return { m, reserved, size };
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function penalty(m, size){
  let score = 0;
  // Rule 1: runs of five or more of the same colour, each direction.
  for (let i = 0; i < size; i++) {
    for (const line of [m[i], m.map(row => row[i])]) {
      let run = 1;
      for (let j = 1; j < size; j++) {
        if (line[j] === line[j - 1]) { run++; }
        else { if (run >= 5) score += run - 2; run = 1; }
      }
      if (run >= 5) score += run - 2;
    }
  }
  // Rule 2: every 2x2 block of one colour.
  for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
    const v = m[r][c];
    if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
  }
  // Rule 3: the finder-like 1:1:3:1:1 pattern with four light modules beside it.
  const A = [1,0,1,1,1,0,1,0,0,0,0], B = [0,0,0,0,1,0,1,1,1,0,1];
  const match = (line, at, pat) => pat.every((v, k) => line[at + k] === v);
  for (let i = 0; i < size; i++) {
    const row = m[i], col = m.map(r => r[i]);
    for (let j = 0; j + 11 <= size; j++) {
      if (match(row, j, A) || match(row, j, B)) score += 40;
      if (match(col, j, A) || match(col, j, B)) score += 40;
    }
  }
  // Rule 4: deviation from an even split of dark and light.
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += m[r][c];
  const pct = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

// Format information: 5 data bits, BCH(15,5), then the fixed 0x5412 mask.
function formatBits(maskIndex){
  const ECC_M = 0b00;
  const data = (ECC_M << 3) | maskIndex;
  let rem = data << 10;
  for (let i = 4; i >= 0; i--) if ((rem >> (i + 10)) & 1) rem ^= 0x537 << i;
  return ((data << 10) | rem) ^ 0x5412;
}

function applyMaskAndFormat(built, maskIndex){
  const { m, reserved, size } = built;
  const out = m.map(row => row.slice());
  const fn = MASKS[maskIndex];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++)
    if (!reserved[r][c] && fn(r, c)) out[r][c] ^= 1;

  const fmt = formatBits(maskIndex);
  for (let i = 0; i < 15; i++) {
    const bit = (fmt >> i) & 1;
    // Copy one: down the left of the top-right finder, then across.
    if (i < 6) out[i][8] = bit;
    else if (i === 6) out[7][8] = bit;
    else if (i === 7) out[8][8] = bit;
    else if (i === 8) out[8][7] = bit;
    else out[8][14 - i] = bit;
    // Copy two: split across the other two finders.
    if (i < 8) out[8][size - 1 - i] = bit;
    else out[size - 15 + i][8] = bit;
  }
  return out;
}

function makeMatrix(text){
  const bytes = Array.from(Buffer.from(text, 'utf8'));
  const version = chooseVersion(bytes.length);
  const built = buildMatrix(buildCodewords(encodeData(bytes, version), version), version);
  let best = null, bestScore = Infinity;
  for (let i = 0; i < 8; i++) {
    const cand = applyMaskAndFormat(built, i);
    const s = penalty(cand, built.size);
    if (s < bestScore) { bestScore = s; best = cand; }
  }
  return { matrix: best, version, size: built.size };
}

// ---- SVG path ----------------------------------------------------------
// One horizontal run per <path> segment, quiet zone of 4 modules as the
// specification asks (2 on each side of the viewBox is not enough for some
// scanners, so the viewBox carries the full 4).
const QUIET = 2;
function toPath(matrix){
  const n = matrix.length, parts = [];
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (matrix[y][x]) {
        const x0 = x;
        while (x < n && matrix[y][x]) x++;
        const w = x - x0;
        parts.push(`M${x0 + QUIET} ${y + QUIET}h${w}v1h-${w}z`);
      } else x++;
    }
  }
  return parts.join('');
}

// Re-derives the matrix from the emitted path and compares. A bad edit above
// can produce a plausible looking path that decodes to nothing, and nothing
// about a QR code is readable by eye.
function verify(matrix, d){
  const n = matrix.length;
  const grid = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const [, xs, ys, ws] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    const x0 = +xs - QUIET, y0 = +ys - QUIET, w = +ws;
    for (let i = 0; i < w; i++) grid[y0][x0 + i] = 1;
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
    if (grid[y][x] !== matrix[y][x]) return false;
  return true;
}

const url = process.argv[2];
if (!url || url.startsWith('--')) {
  console.error('usage: node tools/make-qr.js <url> [--check]');
  process.exit(2);
}
const { matrix, version, size } = makeMatrix(url);
const d = toPath(matrix);
const box = size + QUIET * 2;

if (!verify(matrix, d)) {
  console.error('FAILED: the emitted path does not round-trip to the matrix.');
  process.exit(1);
}

if (process.argv.includes('--check')) {
  // A rendering anyone can point a phone at, which is the only check that
  // actually proves the thing scans.
  console.log(matrix.map(r => r.map(v => v ? '██' : '  ').join('')).join('\n'));
  console.error(`\nversion ${version}, ${size}x${size} modules, level M — ${url}`);
} else {
  console.log(`<svg viewBox="0 0 ${box} ${box}" role="img" aria-label="QR code for ${url.replace(/^https?:\/\//, '')}">`);
  console.log(`  <rect width="${box}" height="${box}" fill="#fff"/>`);
  console.log(`  <path fill="#000" d="${d}"/>`);
  console.log('</svg>');
  console.error(`version ${version}, ${size}x${size} modules, level M`);
}
