// Checks the dot-matrix route board as shipped: its letters, what it does
// with a character it has no dots for, the picture it draws, the words it
// must leave in the page, the boards drawn into the pages that cannot draw
// their own, and the icon and the small mark that go with it, drawn into
// tools/app-icons.html, every page's favicon and the Android app.
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
// The icon page's two are the link preview's and Google Play's feature graphic's.
const expect = { 'how-to.html': 1, 'flyer.html': 2, 'for-operators.html': 1, 'testers.html': 1, 'poster.html': 1, 'tools/app-icons.html': 2 };
for (const f of tool.FILES) {
  const src = read(f);
  const bs = tool.boards(src, S);
  check(bs.length === (expect[f] || 0), `${f}: has its ${expect[f]} board${expect[f] === 1 ? '' : 's'}`, bs.map(b => b.lines.join(' / ')).join(' | '));
  const stale = bs.filter(b => b.current !== b.wanted);
  check(!stale.length, `${f}: every board shows the words beside it`,
    stale.length ? 'stale: ' + stale.map(b => b.lines.join(' / ')).join(' | ') + ' (run node tools/make-pictures.js)' : 'current');
  check(bs.every(b => b.lines.join(' ').includes('Ayala')), `${f}: and the words are the route's`);
}

console.log('\n=== 6. the icon and the mark ===');
// One icon and one small mark, everywhere they stand for the app: the
// tickets on a home screen, in Play and in a link preview; the ticket
// punched in the coach's shape in a tab, the status bar and a themed
// launcher. A second drawing of either is how a mark stops being one, so
// every copy is drawn by tools/make-pictures.js, and the coach in the icon is
// the one the tracker draws.
const src = read('tools/app-icons.html');
const icons = tool.appicons(src, S);
const byId = Object.fromEntries(icons.map(i => [i.id, i]));
const stale = icons.filter(i => i.current !== i.wanted);
check(icons.length === 9 && !stale.length, 'tools/app-icons.html: its nine icons are as make-pictures.js draws them',
  stale.length ? 'stale: ' + stale.map(i => i.id).join(' ') + ' (run node tools/make-pictures.js)' : icons.map(i => i.id).join(' '));
const drawn = icons.filter(i => i.id !== 'bg');
check(drawn.every(i => i.wanted.includes(S.COACH_SIDE) && i.wanted.includes(S.SCENE_TIMES.dawn.coach)),
  'and every one of them is the tracker\'s own coach, in the dawn scene\'s colours');
const APP = ['store', 'fg', 'legacy', 'round', 'fgtile'], SITE = ['web', 'mask', 'pvtile'];
check(APP.every(k => byId[k] && />FIBI</.test(byId[k].wanted)), 'the app\'s icons say FIBI: Play\'s, the launcher\'s, the feature graphic\'s', APP.join(' '));
check(SITE.every(k => byId[k] && !/FIBI/.test(byId[k].wanted)), 'and the website\'s, which is Bus Tracker, does not', SITE.join(' '));
check(icons.every(i => /SALAMAT/.test(i.wanted) || i.id === 'bg'), 'every one is stamped SALAMAT');

const icon = page => (read(page).match(/<link rel="icon" href="([^"]*)">/) || [])[1] || '';
const mark = tool.markPath();
for (const [p, tile] of Object.entries(tool.FAVICONS)) {
  check(icon(p) === tool.faviconHref(tile), `${p}: its favicon is the mark on ${tile === 'ink' ? 'ink, so the admin tab is told apart' : 'the icon\'s coral'}`,
    icon(p) === tool.faviconHref(tile) ? icon(p).length + ' bytes' : 'run node tools/make-pictures.js');
}
check(decodeURIComponent(icon('index.html')).includes(mark), 'and the favicon is the mark the app draws in the status bar');
const RES = 'mobile/android/app/src/main/res/';
for (const [f, xml] of Object.entries(tool.markDrawables())) {
  check(fs.existsSync(path.join(ROOT, f)) && read(f) === xml, `${f.slice(RES.length)}: the same mark, as make-pictures.js draws it`);
  check(xml.includes('android:pathData="' + mark + '"') && xml.includes('android:fillType="evenOdd"'), `${f.slice(RES.length)}: one path, its holes cut by the even-odd rule`);
}
for (const f of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
  const x = read(RES + 'mipmap-anydpi-v26/' + f);
  check(x.includes('@mipmap/ic_launcher_background') && x.includes('@mipmap/ic_launcher_foreground') && x.includes('<monochrome android:drawable="@drawable/ic_launcher_monochrome"/>'),
    `mipmap-anydpi-v26/${f}: the coral, the tickets, and the mark for themed icons`);
}
const style = read(RES + 'values/styles.xml');
check(/windowSplashScreenAnimatedIcon">@drawable\/splash_icon</.test(style) && /windowSplashScreenBackground">@color\/splashBackground</.test(style)
  && /name="splashBackground">#EB9B76</.test(read(RES + 'values/colors.xml')), 'the splash screen is the tickets on the icon\'s coral');
const resFiles = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? resFiles(d + e.name + '/') : [d + e.name]);
const stock = resFiles(RES).filter(f => f.endsWith('.xml') && read(f).includes('M4,16c0,0.88 0.39,1.67 1,2.22'));
check(!stock.length && !fs.existsSync(path.join(ROOT, RES + 'drawable/ic_launcher_fg.xml')), 'and the stock Material bus is gone from the app', stock.join(' '));

const theirs = (src.match(/<symbol id="i-coach"[\s\S]*?<\/symbol>/) || [])[0];
const ours = (html.match(/<symbol id="i-coach"[\s\S]*?<\/symbol>/) || [])[0];
check(theirs && theirs === ours, 'tools/app-icons.html: the route strips\' buses are the map\'s badge');
check(!/🚌/.test(src.replace(/<!--[\s\S]*?-->/g, '')), 'and no emoji stands in for any of it');

console.log('\n=== 7. the pictures rendered from it ===');
// tools/render-icons.sh screenshots tools/app-icons.html into these. Their
// pixels need a browser to check, but their sizes do not, and the wrong size
// is how a render goes wrong: a viewport cut short, a window never resized.
const png = f => {
  const b = fs.readFileSync(path.join(ROOT, f));
  return b.slice(1, 4).toString() === 'PNG' ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20), alpha: b[25] === 6 } : null;
};
const want = { 'assets/icons/icon-192.png': 192, 'assets/icons/icon-512.png': 512, 'assets/icons/icon-maskable-512.png': 512,
  'assets/icons/apple-touch-icon.png': 180, 'assets/icons/preview.png': [1200, 630],
  'mobile/store/play-icon-512.png': 512, 'mobile/store/feature-graphic.png': [1024, 500], [RES + 'drawable-xxxhdpi/splash_icon.png']: 1152 };
[['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]].forEach(([d, x]) => {
  want[RES + 'mipmap-' + d + '/ic_launcher_foreground.png'] = 108 * x;
  want[RES + 'mipmap-' + d + '/ic_launcher_background.png'] = 108 * x;
  want[RES + 'mipmap-' + d + '/ic_launcher.png'] = 48 * x;
  want[RES + 'mipmap-' + d + '/ic_launcher_round.png'] = 48 * x;
});
const wrong = Object.entries(want).filter(([f, s]) => {
  const p = fs.existsSync(path.join(ROOT, f)) && png(f), [w, h] = [].concat(s, s);
  return !p || p.w !== w || p.h !== h;
});
check(!wrong.length, `all ${Object.keys(want).length} are there, each its own size`, wrong.map(w => w[0]).join(' '));
const manifest = JSON.parse(read('manifest.webmanifest'));
check(manifest.icons.every(i => { const p = png(i.src); return p && i.sizes === p.w + 'x' + p.h; }), 'manifest.webmanifest: each icon the size it says');
check(png('mobile/store/play-icon-512.png').alpha && !png('mobile/store/feature-graphic.png').alpha,
  'Play\'s icon keeps an alpha channel, and its feature graphic has none, as Play asks');
check(png(RES + 'mipmap-xxxhdpi/ic_launcher_foreground.png').alpha && png(RES + 'mipmap-xxxhdpi/ic_launcher_round.png').alpha && png(RES + 'drawable-xxxhdpi/splash_icon.png').alpha,
  'and the launcher\'s foreground, Android 7\'s round icon and the splash are drawn on nothing');

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
