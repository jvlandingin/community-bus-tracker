// Checks the dot-matrix route board as shipped: its letters, what it does
// with a character it has no dots for, the picture it draws, the words it
// must leave in the page, the boards drawn into the pages that cannot draw
// their own, and the mark that goes with it.
//
// The renderer is pulled out of index.html by its comment markers, like the
// other suites, and tools/make-pictures.js runs the same block, so a pass
// here cannot drift from either. Keep the markers intact.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = read('index.html');
const tool = require(path.join(ROOT, 'tools', 'make-pictures.js'));
const S = tool.renderer();

let fail = 0;
const check = (c, label, note) => {
  console.log((c ? 'PASS  ' : 'FAIL  ') + label + (note ? '   ' + note : ''));
  if (!c) fail++;
};
const ones = g => g.join('').split('').filter(b => b === '1').length;

console.log('=== 1. the letters ===');
const font = S.SIGN_FONT;
const bad = Object.keys(font).filter(k => {
  const rows = font[k].split(' ');
  return rows.length !== 7 || rows.some(r => r.length !== rows[0].length || /[^01]/.test(r));
});
check(!bad.length, 'every character is seven rows of one width, dots lit or not', bad.join(' ') || Object.keys(font).length + ' characters');
const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
check([...AZ].every(c => font[c]), 'every letter and digit has its dots');
check([...AZ].filter(c => !'I1'.includes(c)).every(c => font[c].split(' ')[0].length === 5), 'letters are five dots wide, bar the narrow I and 1');
check(font['Ñ'] && font['Ñ'] !== font['N'], 'Ñ is its own letter, not an N', 'Parañaque is not Paranaque');
check(['⇄', '/', '·', '-', '&', "'"].every(c => font[c]), 'and the marks a route name uses: ⇄ / · - & \'');
const seen = new Map(); const dupes = [];
for (const [k, v] of Object.entries(font)) { if (seen.has(v)) dupes.push(seen.get(v) + '=' + k); seen.set(v, k); }
check(!dupes.length, 'no two characters share a picture', dupes.join(' '));

console.log('\n=== 2. what it does with any character ===');
check(JSON.stringify(S.signGlyph('É')) === JSON.stringify(S.signGlyph('E')), 'an accented letter draws as its plain letter, as real boards do');
check(JSON.stringify(S.signGlyph('Ü')) === JSON.stringify(S.signGlyph('U')), 'and so does Ü');
check(JSON.stringify(S.signLayout(['parañaque'])) === JSON.stringify(S.signLayout(['PARAÑAQUE'])), 'lower case is drawn in capitals, ñ included');
for (const odd of ['中山', 'BUS 😀', 'TO €5', 'A\u0000B']) {
  check(S.signLayout([odd]) === null && S.signboardSvg([odd]) === '', `"${odd.replace('\u0000', '\\0')}" cannot be drawn, so nothing is`,
    'the lettered board stays rather than a board with a hole in it');
}
check(S.signboardSvg(['']) === '', 'and an empty board is not drawn at all');

console.log('\n=== 3. the picture ===');
const one = S.signLayout(['E']);
check(one.cols === 5 + 4 && one.rows === 7 + 4, 'a margin of two unlit dots all round', one.cols + 'x' + one.rows);
check(one.dots.length === ones(font.E.split(' ')), 'one lit dot for every lit dot of the letter', one.dots.length + ' dots');
const two = S.signLayout(['IE', 'E']);
check(two.cols === 4 + 3 + 1 + 5 && two.rows === 4 + 7 + 2 + 7, 'one dot between letters, two between lines', two.cols + 'x' + two.rows);
const centred = S.signLayout(['EEE', 'E'], { center: true });
const lineTwo = centred.dots.filter(d => d[1] >= 2 + 9);
check(Math.min(...lineTwo.map(d => d[0])) === 2 + 6, 'a centred line is centred on the longest', 'starts at ' + Math.min(...lineTwo.map(d => d[0])));
const svg = S.signboardSvg(['Mendez / Tagaytay', '⇄ One Ayala'], { id: 'x', pitch: 2 });
const lay = S.signLayout(['Mendez / Tagaytay', '⇄ One Ayala']);
check(/^<svg class="dmsvg"/.test(svg) && / aria-hidden="true"/.test(svg), 'it is a picture, hidden from screen readers');
check((svg.match(/h0/g) || []).length === lay.dots.length, 'one drawn dot per lit dot', lay.dots.length + ' dots');
check(svg.includes(`width="${lay.cols * 2}"`) && svg.includes(`height="${lay.rows * 2}"`), 'sized at the pitch it is asked for');
check(svg.includes('id="x-off"') && svg.includes('id="x-glow"') && svg.includes('id="x-on"') && !/id="sign-/.test(svg),
  'every id carries the board\'s own name, so two boards on a page do not share one');
check(svg.length < 6000, 'and a two-line board stays a few kilobytes', svg.length + ' bytes');

console.log('\n=== 4. the header keeps its words ===');
// The board is a picture of words that are still in the page. A screen
// reader, a search engine and a person copying the route read .led, so it
// must be there in the markup and hidden from sight only, never removed.
const route = (html.match(/<div class="route"><span class="led">([\s\S]*?)<\/span><\/div>/) || [])[1] || '';
const words = route.split('<span class="ln">').slice(1).map(s => s.replace(/<[^>]*>/g, '').trim());
check(words.length === 2 && words.join(' ').includes('Ayala'), 'the route name is text in the header\'s markup', words.join(' / '));
check(S.signboardSvg(words) !== '', 'and the board can draw every character of it');
check(/drawSignboard\(\);/.test(html.slice(html.indexOf('// ---- END SIGNBOARD'))), 'the header board is drawn when the page loads');
const hide = (html.match(/header \.route\.dm \.led\{([^}]*)\}/) || [])[1] || '';
check(/clip-path:inset\(50%\)/.test(hide) && !/display:\s*none|visibility:\s*hidden/.test(hide),
  'under the board the words are moved out of sight, not taken out of the page', hide.trim());
check(/if \(!svg\) return;/.test(html), 'a board that cannot be drawn leaves the lettered one alone');

console.log('\n=== 5. the boards drawn into other pages are current ===');
// tools/make-pictures.js draws these with the same renderer. If the words
// beside a board change, or the renderer does, the picture is out of date
// until the tool is run again.
const expect = { 'how-to.html': 1, 'flyer.html': 2, 'for-operators.html': 1, 'tools/app-icons.html': 1 };
for (const f of tool.FILES) {
  const src = read(f);
  const bs = tool.boards(src, S);
  check(bs.length === (expect[f] || 0), `${f}: has its ${expect[f]} board${expect[f] === 1 ? '' : 's'}`, bs.map(b => b.lines.join(' / ')).join(' | '));
  const stale = bs.filter(b => b.current !== b.wanted);
  check(!stale.length, `${f}: every board shows the words beside it`,
    stale.length ? 'stale: ' + stale.map(b => b.lines.join(' / ')).join(' | ') + ' (run node tools/make-pictures.js)' : 'current');
  check(bs.every(b => b.lines.join(' ').includes('Ayala')), `${f}: and the words are the route's`);
}

console.log('\n=== 6. the mark ===');
// One coach, everywhere it stands for the app: the map's badges, the icon on
// a home screen, the favicon in a tab. A second drawing of it is how a mark
// stops being one.
const icon = page => (read(page).match(/<link rel="icon" href="([^"]*)">/) || [])[1] || '';
const fav = icon('index.html');
const coachBody = (html.match(/<symbol id="i-coach"[^>]*>([\s\S]*?)<\/symbol>/) || [])[1] || '';
const bodyPath = (coachBody.match(/fill-rule="evenodd" d="([^"]+)"/) || [])[1] || '';
check(bodyPath && fav.includes(bodyPath), 'the favicon is the coach the map draws', fav.length + ' bytes');
check(fav.includes('fill=\'%237a1f2b\'') && fav.includes('fill=\'%23e39a1c\'') && fav.includes('fill=\'%23ffb22e\''),
  'on maroon, with the gold trim and the signboard lit');
for (const p of ['how-to.html', 'flyer.html', 'for-operators.html']) check(icon(p) === fav, `${p}: carries the same favicon`);
const adm = icon('admin.html');
check(adm !== fav && adm.replace('%232b2320', '%237a1f2b') === fav, 'admin.html: the same coach on ink, so its tab is told apart');
const src = read('tools/app-icons.html');
const theirs = (src.match(/<symbol id="i-coach"[\s\S]*?<\/symbol>/) || [])[0];
const ours = (html.match(/<symbol id="i-coach"[\s\S]*?<\/symbol>/) || [])[0];
check(theirs && theirs === ours, 'tools/app-icons.html draws the icons and the preview with the same coach');
check(!/🚌/.test(src.replace(/<!--[\s\S]*?-->/g, '')), 'and no emoji stands in for it');

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
