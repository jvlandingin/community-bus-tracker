// Holds the tracker and the admin page to their design tokens: seven text
// sizes, three corners, three heights, three speeds and two typefaces, all
// defined once in index.html's :root block and drawn in tools/styleguide.html.
//
// It fails on a new literal. Values that are close but not the same (a 13px
// beside a 14px, a 10px corner beside a 12px one) read as careless even when
// nobody can say why, and before this existed the tracker had grown 21 text
// sizes, 19 corners and 40 shadows that way, one reasonable edit at a time.
//
// Reads the shipped files and nothing else; needs nothing installed.
// Every CSS declaration of the properties below is checked, wherever it is
// written: in the <style> block, in a style attribute, or in a string a
// script builds markup from.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let fail = 0;
const check = (c, label, note) => {
  console.log((c ? 'PASS  ' : 'FAIL  ') + label + (note ? '   ' + note : ''));
  if (!c) fail++;
};

// The pages held to the system strictly. The guide, the flyer and the
// briefing redraw the app at other scales and on paper, so their sizes are
// the drawing's, not the app's; test-boot.js holds their copies of the token
// values in step instead.
const PAGES = ['index.html', 'admin.html'];

// Literals allowed on purpose, each with its reason. Adding one is the
// deliberate conversation, not a way to quiet this file, and an entry that
// no longer matches anything fails too, so the list cannot rot.
const EXCEPTIONS = {
  'index.html': {
    'font-size:min(20.8px, 5.2vw)':
      'the signboard fallback: sized to the band so the two-line route name fits a 320px phone',
  },
  'admin.html': {},
};

// Comments are prose and may quote old values; they are not declarations.
// Blanked rather than removed so the reported line numbers stay right.
const blank = m => m.replace(/[^\n]/g, ' ');
const stripComments = src => src
  .replace(/<!--[\s\S]*?-->/g, blank)
  .replace(/\/\*[\s\S]*?\*\//g, blank)
  .replace(/^[ \t]*\/\/.*$/gm, blank);

// :root{...} without nested braces, which a token block never has.
const tokensIn = body => {
  const out = {};
  (body.match(/--[a-z0-9-]+\s*:\s*[^;]+/g) || []).forEach(d => {
    const i = d.indexOf(':');
    out[d.slice(0, i).trim()] = d.slice(i + 1).replace(/\s+/g, ' ').trim();
  });
  return out;
};
const rootTokens = src => {
  const i = src.indexOf(':root{');
  return i < 0 ? {} : tokensIn(src.slice(i, src.indexOf('}', i)));
};
const darkTokens = src => {
  const m = /:root\[data-theme="dark"\]\s*\{([^}]*)\}/.exec(src);
  return m ? tokensIn(m[1]) : {};
};

const SYSTEM = /^--(?:fs-|r-|sh-|dur-|ease|font-)/;
const app = read('index.html');
const appRoot = rootTokens(app);
const system = Object.keys(appRoot).filter(k => SYSTEM.test(k));

console.log('=== 1. the system is defined once, and copied faithfully ===');
const names = p => system.filter(k => k.startsWith(p)).map(k => k.slice(p.length)).join(' ');
check(names('--fs-') === 'cap label small body title headline number', 'seven text sizes', names('--fs-'));
check(names('--r-') === 's m l', 'three corners', names('--r-'));
check(names('--sh-') === '1 2 3', 'three heights', names('--sh-'));
check(names('--dur-') === '1 2 3', 'three speeds', names('--dur-'));
check(['--ease', '--ease-pop', '--ease-move'].every(k => k in appRoot), 'three curves');
check(['--font-ui', '--font-text'].every(k => k in appRoot), 'and two typefaces');
// A size is only a size if the scale climbs: two tokens with the same value
// would be the near-duplicates this file exists to stop.
const px = k => parseFloat(appRoot[k]);
const fsOrder = ['cap', 'label', 'small', 'body', 'title', 'headline', 'number'].map(n => px('--fs-' + n));
check(fsOrder.every((v, i) => i === 0 || v > fsOrder[i - 1]), 'the text sizes climb, none repeated', fsOrder.join(' < '));

// Every other page carries its own copy, so each survives being opened on its
// own; test-boot.js compares the values the copies share, and this adds that
// none of the system may be missing from one.
const COPIES = ['admin.html', 'how-to.html', 'flyer.html', 'for-operators.html'];
for (const page of COPIES) {
  const src = read(page);
  const root = rootTokens(src), dark = darkTokens(src), appDark = darkTokens(app);
  const missing = system.filter(k => !(k in root));
  const drifted = system.filter(k => k in root && root[k] !== appRoot[k]);
  check(!missing.length && !drifted.length, `${page}: carries every system token, with the app's values`,
    missing.length ? 'missing ' + missing.join(' ') : drifted.length ? 'drifted ' + drifted.join(' ') : system.length + ' tokens');
  const darkSys = Object.keys(appDark).filter(k => SYSTEM.test(k));
  const darkDrift = darkSys.filter(k => dark[k] !== appDark[k]);
  check(darkSys.length > 0 && !darkDrift.length, `${page}: and the same dark heights`,
    darkDrift.length ? darkDrift.join(' ') : darkSys.join(' '));
}
// Retired when the system arrived. A page still defining one is a page that
// was not moved over, and would quietly draw the old card.
for (const page of ['index.html', 'admin.html', 'how-to.html', 'flyer.html', 'for-operators.html']) {
  const src = read(page);
  const old = ['--shadow', '--radius'].filter(k => new RegExp(k + '\\s*:').test(src) || src.includes('var(' + k + ')'));
  check(!old.length, `${page}: no retired token is defined or used`, old.join(' ') || 'clean');
}

// ---- the declarations -------------------------------------------------
const PROPS = /(?<![\w-])(font-size|font-family|font|border-radius|border-(?:top|bottom)-(?:left|right)-radius|box-shadow|transition(?:-duration|-timing-function|-delay)?|animation(?:-duration|-timing-function|-delay)?)\s*:\s*([^;{}"'<>]*)/g;

// Top-level commas only: a shadow's rgba() has commas of its own.
const layers = v => {
  const out = []; let depth = 0, cur = '';
  for (const ch of v) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
};
// Removes var(...) including nested ones, so what is left is the literal part.
const unvar = v => { let p; do { p = v; v = v.replace(/var\([^()]*\)/g, ' '); } while (v !== p); return v; };
const varsIn = v => [...v.matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1]);

const MONO = 'ui-monospace,Menlo,Consolas,monospace';
const rules = {
  'font-size': v => /^var\(--fs-[a-z]+\)$/.test(v) || /^var\(--[a-z-]+,\s*var\(--fs-[a-z]+\)\)$/.test(v) || v === 'inherit'
    ? '' : 'not one of the seven sizes',
  'font': v => {
    if (v === 'inherit') return '';
    if (!/var\(--fs-[a-z]+\)/.test(v)) return 'a font shorthand with no size token';
    if (/\d(?:px|em|rem|pt|vw)/.test(unvar(v).replace(/\/\s*[\d.]+(?:px|em|rem|%)?/g, ''))) return 'a literal size beside the token';
    if (!/var\(--font-(?:ui|text)\)/.test(v) && !/\binherit\b/.test(v)) return 'a font shorthand naming its own typeface';
    return '';
  },
  'font-family': v => ['var(--font-ui)', 'var(--font-text)', 'inherit', MONO].includes(v.replace(/\s*,\s*/g, ','))
    ? '' : 'a typeface outside the two (and the ticket\'s monospace numbers)',
  'border-radius': v => v.split(/[\s/]+/).every(p => /^var\(--r-[sml]\)$/.test(p) || ['0', '50%', '999px', 'inherit'].includes(p))
    ? '' : 'not one of the three corners, a circle or a pill',
  'box-shadow': v => {
    const bad = layers(v).filter(l => !(
      l === 'none' || /^var\(--sh-[123]\)$/.test(l) ||
      /^inset\b/.test(l) ||               // inner light and trim lines are drawing, not height
      /^0 0 /.test(l) ||                  // rings and glows: no offset, so nothing is lifted
      /^0 -?1px 0 /.test(l)));            // a one-pixel edge with no blur is a line, not a height
    return bad.length ? 'a new height: ' + bad.join(' | ') : '';
  },
  timing: (v, prop) => {
    // A delay is choreography, not a speed: the boot screen's three ghost
    // chips breathe a fifth of a second apart, and that gap is the drawing.
    if (/-delay$/.test(prop) || v === 'none') return '';
    for (const l of layers(v)) {
      const lit = unvar(l);
      if (/cubic-bezier\(/.test(lit)) return 'a curve of its own; curves are tokens';
      // In a shorthand the first time is the duration and a second one is
      // the delay, which is free for the reason above.
      const times = [...lit.matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g)].map(m => parseFloat(m[1]) / (m[2] === 'ms' ? 1000 : 1));
      const tokenDur = /var\(--dur-/.test(l);
      const dur = /-duration$/.test(prop) ? times : tokenDur ? [] : times.slice(0, 1);
      // .001ms is the reduced-motion override; a second or near it is a
      // moment (a beep, a breathing badge, the parol's sway), which states
      // its own length on purpose. Anything between is a transition.
      const bad = dur.filter(t => t > 0.0001 && t < 0.8);
      if (bad.length) return 'a speed of its own (' + bad.map(t => t + 's').join(', ') + ')';
      if (tokenDur && !/-duration$/.test(prop) && !/var\(--ease/.test(l))
        return 'a token speed with no curve named, which falls back to the browser\'s';
      if (!dur.length && /\b(?:ease|ease-in|ease-out|ease-in-out|linear)\b/.test(lit))
        return 'a keyword curve on a transition; curves are tokens';
    }
    return '';
  },
};
rules['border-top-left-radius'] = rules['border-top-right-radius'] =
  rules['border-bottom-left-radius'] = rules['border-bottom-right-radius'] = rules['border-radius'];

for (const page of PAGES) {
  console.log(`\n=== 2. ${page}: every size, corner, height and speed is a token ===`);
  const src = read(page);
  const defined = new Set([...Object.keys(rootTokens(src)), ...Object.keys(darkTokens(src))]);
  // @font-face names the family it defines; that is not a use of one.
  const body = stripComments(src).replace(/@font-face\{[^}]*\}/g, blank);
  const exceptions = EXCEPTIONS[page] || {};
  const used = new Set();
  const counts = {}, problems = [];
  for (const m of body.matchAll(PROPS)) {
    const prop = m[1];
    const value = m[2].replace(/\s*!important\s*$/, '').replace(/\s+/g, ' ').trim();
    const line = body.slice(0, m.index).split('\n').length;
    const key = prop + ':' + value;
    const kind = /^(?:transition|animation)/.test(prop) ? 'timing' : prop;
    const group = /radius$/.test(prop) ? 'border-radius' : kind;
    counts[group] = (counts[group] || 0) + 1;
    if (key in exceptions) { used.add(key); continue; }
    let why = value === '' ? 'set from a script; put it through a token' : rules[kind](value, prop);
    // A token that is not defined on this page silently falls back to the
    // browser default, which is a literal nobody chose.
    const undef = varsIn(value).filter(n => SYSTEM.test(n) && !defined.has(n));
    if (!why && undef.length) why = 'uses ' + undef.join(' ') + ', which this page does not define';
    if (why) problems.push({ group, text: `${page}:${line}  ${key}  (${why})` });
  }
  const groups = [
    ['font-size', 'text sizes'], ['font', 'font shorthands'], ['font-family', 'typefaces'],
    ['border-radius', 'corners'], ['box-shadow', 'shadows'], ['timing', 'transitions and animations'],
  ];
  for (const [group, label] of groups) {
    const mine = problems.filter(p => p.group === group).map(p => p.text);
    check(!mine.length, `${label} (${counts[group] || 0} declarations)`, mine.length ? '\n        ' + mine.join('\n        ') : '');
  }
  const stale = Object.keys(exceptions).filter(k => !used.has(k));
  check(!stale.length, 'every listed exception is still in use', stale.join(' | ') || Object.keys(exceptions).length + ' listed');
}

console.log('\n=== 3. the other pages draw with the app\'s own letters and icons ===');
// The tracker names its font files in its @font-face rules. The admin page
// links the same files; the three pages that load nothing carry them inline
// (tools/embed-fonts.js), and an inline copy is only a copy while its bytes
// are the file's. A stale one would draw the old letters with no error.
const faces = [...app.matchAll(/@font-face\{font-family:'([^']+)';[^}]*font-weight:(\d+);[^}]*src:url\(([^)]+)\)/g)]
  .map(m => ({ family: m[1], weight: m[2], file: m[3] }));
check(faces.length === 5 && faces.every(f => fs.existsSync(path.join(ROOT, f.file))),
  'the tracker names five font files, and all five are in the repository', faces.map(f => f.file.split('/').pop()).join(' '));
const adminSrc = read('admin.html');
check(faces.every(f => adminSrc.includes(`src:url(${f.file})`)), 'admin.html links the same five');
for (const page of ['how-to.html', 'flyer.html', 'for-operators.html']) {
  const src = read(page);
  const inline = [...src.matchAll(/@font-face\{font-family:'([^']+)';[^}]*font-weight:(\d+);[^}]*src:url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/g)];
  const stale = faces.filter(f => {
    const m = inline.find(x => x[1] === f.family && x[2] === f.weight);
    return !m || !Buffer.from(m[3], 'base64').equals(fs.readFileSync(path.join(ROOT, f.file)));
  });
  check(inline.length === faces.length && !stale.length, `${page}: carries the same five, byte for byte`,
    stale.length ? 'stale or missing: ' + stale.map(f => f.family + ' ' + f.weight).join(', ') + ' (run node tools/embed-fonts.js)' : inline.length + ' faces');
  check(!/src:url\((?!data:)/.test(src.replace(/<!--[\s\S]*?-->/g, '')), `${page}: and loads none of them`);
}
// The icons are copied the same way, symbol by symbol, from the sprite at the
// top of index.html's body. A redrawn copy is a second icon with the same
// name, which is how a family stops being one.
const symbolsOf = src => Object.fromEntries([...src.matchAll(/<symbol id="(i-[a-z0-9-]+)"[\s\S]*?<\/symbol>/g)].map(m => [m[1], m[0]]));
const appSymbols = symbolsOf(app);
check(Object.keys(appSymbols).length >= 15, 'the tracker\'s sprite is there to copy from', Object.keys(appSymbols).length + ' icons');
for (const page of ['index.html', ...COPIES]) {
  const mine = symbolsOf(read(page));
  const ids = Object.keys(mine);
  const bad = ids.filter(id => mine[id] !== appSymbols[id]);
  if (page !== 'index.html') check(ids.length > 0 && !bad.length, `${page}: its icons are the app's, unchanged`,
    bad.length ? 'differs or unknown: ' + bad.join(' ') : ids.join(' '));
  // And every one it uses is one it carries.
  const used = [...new Set([...read(page).matchAll(/<use href="#(i-[a-z0-9-]+)"/g)].map(m => m[1]))];
  const absent = used.filter(id => !(id in mine));
  check(!absent.length, `${page}: every icon it draws is in its own sprite`, absent.join(' ') || used.length + ' used');
}

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
