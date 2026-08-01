// Loads the actual index.html in a real DOM, serving the vendored assets and a
// fake config.txt, and checks the page gets past the point where it was failing.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const APP = path.join(__dirname, '..');
const VENDOR = path.join(__dirname, '..');

let fail = 0;
const check = (c, label, note) => {
  console.log((c ? 'PASS  ' : 'FAIL  ') + label + (note ? '   ' + note : ''));
  if (!c) fail++;
};

// A tiny static server so relative paths (assets/vendor/..., config.txt) resolve
const http = require('http');
// The template exactly as it ships, for the "user forgot to fill it in" case
const RAW_TEMPLATE = fs.readFileSync(path.join(APP, 'config-template.txt'), 'utf8');
const CONFIG = RAW_TEMPLATE
  .replace('https://YOUR-PROJECT.supabase.co', 'https://example-project.supabase.co')
  .replace('YOUR-ANON-PUBLIC-KEY', 'test-anon-key')
  .replace('your-route-slug', 'wonderful-mendez-ayala')
  .replace('https://github.com/YOUR-NAME/community-bus-tracker', 'https://github.com/example/community-bus-tracker');

const files = {
  '/index.html': [fs.readFileSync(path.join(APP, 'index.html')), 'text/html'],
  '/admin.html': [fs.readFileSync(path.join(APP, 'admin.html')), 'text/html'],
  // Netlify serves admin.html at the extensionless path too, and that is
  // where the sharer link used to come out wrong.
  '/admin': [fs.readFileSync(path.join(APP, 'admin.html')), 'text/html'],
  '/config.txt': [Buffer.from(CONFIG), 'text/plain'],
  '/assets/vendor/leaflet.js': [fs.readFileSync(path.join(VENDOR, 'assets/vendor/leaflet.js')), 'text/javascript'],
  '/assets/vendor/leaflet.css': [fs.readFileSync(path.join(VENDOR, 'assets/vendor/leaflet.css')), 'text/css'],
  '/assets/vendor/supabase.js': [fs.readFileSync(path.join(VENDOR, 'assets/vendor/supabase.js')), 'text/javascript'],
};

function serve(include, configText) {
  return http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (!include(url) || !files[url]) { res.writeHead(404); res.end('not found'); return; }
    if (url === '/config.txt' && configText) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(configText);
      return;
    }
    res.writeHead(200, { 'Content-Type': files[url][1] });
    res.end(files[url][0]);
  });
}

function run(page, include, label, configText) {
  return new Promise(resolve => {
    const server = serve(include, configText);
    server.listen(0, async () => {
      const port = server.address().port;
      const vc = new VirtualConsole();
      const errors = [];
      vc.on('jsdomError', e => errors.push(e.message));
      const dom = await JSDOM.fromURL(`http://127.0.0.1:${port}${page}`, {
        runScripts: 'dangerously', resources: 'usable', virtualConsole: vc, pretendToBeVisual: true,
        // jsdom has no fetch; browsers do. Shim it so config.txt loading is
        // exercised for real rather than failing for an environment reason.
        beforeParse(window){
          window.fetch = function(u, o){
            return fetch(new URL(u, `http://127.0.0.1:${port}/`), o);
          };
        }
      });
      // Wait for the page to actually finish booting rather than for a
      // fixed delay. A fixed 1.5s passed on an idle machine and failed on a
      // busy one, which is the worst way for a test to be wrong.
      const read = () => {
        const w = dom.window, d = w.document;
        const gate = d.getElementById('gate') || d.getElementById('loginGate');
        const err = d.getElementById('gateErr') || d.getElementById('loginErr');
        return {
          label, w, d,
          hasL: typeof w.L !== 'undefined',
          hasSb: typeof w.supabase !== 'undefined',
          gateVisible: gate && !gate.className.includes('hidden'),
          errText: (err && err.textContent || '').trim(),
          errors
        };
      };
      // Settled means the page has committed to an outcome: it said what was
      // wrong, or it got all the way through boot. For the tracker that is
      // start() having drawn the strip; for the admin page it is the login
      // gate or the panels being up. The app's own globals are no use here,
      // because `let` at the top level of a classic script does not become a
      // property of window.
      const settled = s => {
        if (s.errText !== '') return true;
        if (page === '/index.html') {
          const ticks = s.d.getElementById('ticks');
          return !!(ticks && ticks.innerHTML.trim() !== '');
        }
        const main = s.d.getElementById('main');
        return s.gateVisible || !!(main && !main.className.includes('hidden'));
      };

      const deadline = Date.now() + 10000;
      const poll = () => {
        const s = read();
        if (settled(s) || Date.now() > deadline) { resolve(s); server.close(); return; }
        setTimeout(poll, 50);
      };
      setTimeout(poll, 50);
    });
  });
}

(async () => {
  console.log('=== 1. with the assets folder present (the fixed deploy) ===');
  const ok = await run('/index.html', () => true);
  check(ok.hasL, 'leaflet.js loads and defines L', 'L.version=' + (ok.w.L && ok.w.L.version));
  check(ok.hasSb && typeof ok.w.supabase.createClient === 'function',
    'supabase.js loads and defines supabase.createClient');
  check(!/is not defined/.test(ok.errText), 'no "is not defined" error on the page',
    ok.errText ? 'page says: ' + ok.errText.slice(0, 90) : 'no error text');
  check(!ok.gateVisible, 'the tracker opens straight to the map, no key asked for');
  check(!/ROUTE_SLUG|placeholder/.test(ok.errText), 'config.txt parsed, including ROUTE_SLUG');
  // the client must actually construct against the config values
  let built = false;
  try { built = !!ok.w.supabase.createClient('https://example-project.supabase.co', 'test-anon-key'); } catch (e) {}
  check(built, 'a Supabase client constructs from config.txt values');
  check(typeof ok.w.L.circleMarker === 'function' && typeof ok.w.L.divIcon === 'function'
     && typeof ok.w.L.tileLayer === 'function',
    'the Leaflet API the app uses is present (circleMarker, divIcon, tileLayer)');
  const sl = ok.d.getElementById('sourceLink');
  const sh = ok.d.getElementById('sourceHead');
  check(sl && sl.getAttribute('href') === 'https://github.com/example/community-bus-tracker',
    'the source link points at SOURCE_URL from config.txt', sl && sl.getAttribute('href'));
  check(sh && !sh.className.includes('hidden'), 'the open source section is shown when SOURCE_URL is set');

  console.log('\n=== 2. with assets/ missing (what you hit) ===');
  const bad = await run('/index.html', u => !u.startsWith('/assets/'));
  check(bad.gateVisible, 'the setup screen appears');
  check(/assets folder/.test(bad.errText), 'the message now names the assets folder',
    'page says: ' + bad.errText.slice(0, 120));
  check(!/is not defined/.test(bad.errText), 'no raw "supabase is not defined" any more');

  console.log('\n=== 3. admin.html with assets/ missing ===');
  const badAdmin = await run('/admin.html', u => !u.startsWith('/assets/'));
  check(/assets folder/.test(badAdmin.errText), 'admin page names the assets folder too',
    'page says: ' + badAdmin.errText.slice(0, 120));

  console.log('\n=== 4. admin.html with assets present ===');
  const okAdmin = await run('/admin.html', () => true);
  check(okAdmin.hasSb, 'admin page loads supabase.js');
  check(!/assets folder|is not defined/.test(okAdmin.errText),
    'admin page shows no setup error', okAdmin.errText ? 'says: ' + okAdmin.errText.slice(0, 80) : 'clean');

  console.log('\n=== 5. config-template.txt copied but never filled in ===');
  // The guard used to look for a 'PASTE_' marker the template has never
  // contained, so an unedited copy sailed past it and failed later with a
  // raw Supabase error. Serve the template verbatim, as a user would.
  const raw = await run('/index.html', () => true, null, RAW_TEMPLATE);
  check(raw.gateVisible, 'the tracker shows the setup screen instead of loading');
  check(/placeholder/i.test(raw.errText), 'and says the config is still on placeholder values',
    'page says: ' + raw.errText.slice(0, 100));
  const rawAdmin = await run('/admin.html', () => true, null, RAW_TEMPLATE);
  check(/placeholder/i.test(rawAdmin.errText), 'the admin page says the same',
    'page says: ' + rawAdmin.errText.slice(0, 100));

  console.log('\n=== 6. the sharer link the admin page hands out ===');
  // This is the link that gets posted in the group chat. If it points at
  // the admin page, nobody can share and the key is on display.
  for (const at of ['/admin.html', '/admin']) {
    const a = await run(at, () => true);
    const base = typeof a.w.trackerBase === 'function' ? a.w.trackerBase() : '(missing)';
    const link = base + '#k=EXAMPLEKEY';
    check(/\/$/.test(base) && !/admin/.test(base),
      `served at ${at}: the link points at the tracker, not the admin page`, link);
    const u = new URL(link);
    check(u.hash === '#k=EXAMPLEKEY' && u.pathname === '/',
      `served at ${at}: it is a usable absolute link with the key in the fragment`);
  }

  console.log('\n=== 7. content blockers must not be able to hide the controls ===');
  // Reported from a real phone: on Brave, the whole "I'm on the bus" tab
  // rendered except the button, because Shields matched the id "shareBtn"
  // against a social-widget filter and injected display:none. The page
  // looked entirely normal, so the best report anyone could give was "it is
  // not there". Filter lists match attribute names, never visible text,
  // which is why "Start sharing my location" is fine and id="shareBtn" was
  // not. So the rule this guards is about names, on both pages, not about
  // the one element that happened to get caught.
  const shareNamedDom = d => {
    const bad = [];
    d.querySelectorAll('*').forEach(el => {
      if (/share/i.test(el.id || '')) bad.push('#' + el.id);
      const cls = typeof el.className === 'string' ? el.className : '';
      cls.split(/\s+/).forEach(c => { if (c && /share/i.test(c)) bad.push('.' + c); });
    });
    return [...new Set(bad)];
  };
  for (const [page, dom] of [['index.html', ok.d], ['admin.html', okAdmin.d]]) {
    const found = shareNamedDom(dom);
    check(found.length === 0, `${page}: no rendered id or class reads as a share widget`,
      found.join(' ') || 'clean');
  }
  // The DOM scan only sees what a page with no live data renders, so read
  // the source too: it catches markup built in JS strings as well.
  for (const page of ['index.html', 'admin.html']) {
    const found = (fs.readFileSync(path.join(APP, page), 'utf8')
      .match(/(?:id|class)="[^"]*share[^"]*"/gi) || []);
    check(found.length === 0, `${page}: none in the source either, including markup built in JS`,
      found.join(' ') || 'clean');
  }

  // Renaming only dodges the rules that exist today, so the page also has
  // to notice when the button has been hidden anyway and say so.
  const cb = await run('/index.html', () => true);
  const note = () => cb.d.getElementById('controlHiddenNote');
  const warned = () => !!note() && !note().className.includes('hidden');
  cb.w.switchTab('share');
  const startBtn = cb.d.getElementById('onbusStartBtn');
  check(!!startBtn && cb.w.getComputedStyle(startBtn).display !== 'none',
    'the start button is there and visible in a browser with no blocker');
  check(!warned(), 'and nothing warns about a blocker that is not there');

  const st = cb.d.createElement('style');          // exactly what Shields injects
  st.textContent = '#onbusStartBtn{display:none !important;}';
  cb.d.head.appendChild(st);
  cb.w.switchTab('track');
  cb.w.switchTab('share');                         // the path a sharer actually takes
  check(warned(), 'with the button filtered out, opening the tab explains why',
    note() && note().textContent.replace(/\s+/g, ' ').trim().slice(0, 64));

  // ...and must not cry wolf when the button is legitimately not showing.
  cb.w.switchTab('track');
  check(!warned(), 'no warning on the track tab, which has no start button');
  cb.w.switchTab('share');
  cb.w.setShareUI('on', 'Sharing live');
  check(!warned(), 'no warning while already sharing, when Stop is what is showing');
  cb.w.setShareUI('off', 'Not sharing');
  check(warned(), 'and it returns once the start button is meant to be back');

  console.log('\n=== 8. the guide link, and the guide standing on its own ===');
  // The (i) in the header opens a second page. That page used to pull in four
  // screenshots and two screen recordings, and this section checked that
  // every one of them was still in the repository, because assets/ has gone
  // missing from a deploy once already and a 404 on a screenshot is silent.
  //
  // The guide draws all of its figures in HTML and CSS now, from the same
  // tokens as the app, so that entire failure mode is gone rather than
  // guarded. What is worth defending is the property that replaced it: the
  // guide loads nothing. Hence the check below is inverted — it fails if a
  // src or poster ever comes back.
  const guide = ok.d.getElementById('guideLink');
  const guideHref = guide && guide.getAttribute('href');
  check(!!guide, 'the tracker renders a link to the guide');
  check(guideHref === 'how-to.html', 'it points at the guide page', guideHref || 'no href');
  // Relative, never absolute: the site has to work from a subdirectory and
  // from Netlify's extensionless URLs alike. Same trap as the sharer link.
  check(!!guideHref && !/^(?:[a-z]+:)?\/\//i.test(guideHref) && guideHref[0] !== '/',
    'and it is relative, so a subdirectory deploy still resolves it', guideHref);

  const guidePath = path.join(APP, 'how-to.html');
  check(fs.existsSync(guidePath), 'how-to.html is in the repository');
  const guideSrc = fs.existsSync(guidePath) ? fs.readFileSync(guidePath, 'utf8') : '';
  const refs = [...new Set((guideSrc.match(/(?:src|poster)="([^"]+)"/g) || [])
    .map(m => m.slice(m.indexOf('"') + 1, -1)))]
    .filter(u => !u.startsWith('data:'));
  check(refs.length === 0,
    'the guide draws its figures rather than loading any',
    refs.length ? 'loads: ' + refs.join(' ') : 'nothing to drop from a deploy');
  check(/href="index\.html"/.test(guideSrc), 'and the guide links back to the map');

  // The guide copies index.html's design tokens instead of importing them —
  // deliberately, so it survives being opened on its own (see the comment on
  // its :root block). Copies drift, and now that every figure on the guide is
  // drawn from these values rather than photographed, drift means a guide
  // that quietly stops looking like the app it describes. Compare the two.
  const tokensOf = src => {
    const root = src.slice(src.indexOf(':root{'), src.indexOf('}', src.indexOf(':root{')));
    const out = {};
    (root.match(/--[a-z-]+\s*:\s*[^;]+/g) || []).forEach(d => {
      const i = d.indexOf(':');
      out[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    });
    return out;
  };
  const appTokens = tokensOf(fs.readFileSync(path.join(APP, 'index.html'), 'utf8'));
  const guideTokens = tokensOf(guideSrc);
  const shared = Object.keys(appTokens).filter(k => k in guideTokens);
  const drifted = shared.filter(k => appTokens[k] !== guideTokens[k]);
  check(shared.length > 6 && drifted.length === 0,
    `the guide's design tokens still match the app's (${shared.length} shared)`,
    drifted.length
      ? drifted.map(k => `${k}: app ${appTokens[k]} vs guide ${guideTokens[k]}`).join('; ')
      : 'in step');

  // Each page states its dark palette twice: once under the media query for a
  // device asking for dark, once under [data-theme="dark"] for a reader who
  // picked it. One rule cannot cover both without light-dark(), which is too
  // new for the phones this runs on. The duplication is therefore deliberate,
  // and this is what stops it rotting into two different dark themes.
  const darkCopies = src => {
    const out = [];
    const re = /(?::root:not\(\[data-theme="light"\]\)|:root\[data-theme="dark"\])\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(src))) {
      const decls = (m[1].match(/--[a-z-]+\s*:\s*[^;]+/g) || [])
        .map(d => d.replace(/\s+/g, ' ').trim()).sort();
      out.push(decls.join('; '));
    }
    return out;
  };
  // The guide hides its sightings section when the route has the board
  // switched off, by id. Rename one of those ids and the guide silently goes
  // back to describing a feature the reader cannot find — the same quiet rot
  // the token check above exists for, so it is checked the same way.
  for (const id of ['sightingsGuide', 'stripRing', 'stripRingNote']) {
    check(guideSrc.includes(`id="${id}"`),
      `the guide still carries #${id}, which its own script hides`);
  }
  check(!/<script[^>]+src=/i.test(guideSrc),
    'and it asks about the setting with fetch, not by loading a library');

  for (const page of ['index.html', 'admin.html', 'how-to.html']) {
    const copies = darkCopies(fs.readFileSync(path.join(APP, page), 'utf8'));
    check(copies.length === 2 && copies[0] === copies[1] && copies[0].length > 0,
      `${page}: both statements of the dark palette are identical`,
      copies.length !== 2 ? `found ${copies.length}, expected 2` :
        (copies[0] === copies[1] ? `${copies[0].split(';').length} tokens` : 'THEY HAVE DRIFTED'));
  }

  // Section 7's lesson, a different filter list: blockers hide live-chat and
  // help widgets by name too, so the link must not be named like one.
  for (const page of ['index.html', 'how-to.html']) {
    const found = (fs.readFileSync(path.join(APP, page), 'utf8')
      .match(/(?:id|class)="[^"]*(?:help|support|chat|widget)[^"]*"/gi) || []);
    check(found.length === 0, `${page}: nothing reads as a help or chat widget`,
      found.join(' ') || 'clean');
  }

  console.log(fail ? `\n${fail} FAILED` : '\nALL PASS');
  process.exit(fail ? 1 : 0);
})();
