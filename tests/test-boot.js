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
  '/how-to.html': [fs.readFileSync(path.join(APP, 'how-to.html')), 'text/html'],
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

function run(page, include, label, configText, setup) {
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
          if (setup) setup(window);
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
      // For the guide it is the app's link being filled in from config.txt,
      // the one thing its script does that a test can see happen.
      const settled = s => {
        if (s.errText !== '') return true;
        if (page === '/index.html' || page === '/index.html#privacy') {
          const ticks = s.d.getElementById('ticks');
          return !!(ticks && ticks.innerHTML.trim() !== '');
        }
        if (page === '/how-to.html') {
          const where = s.d.getElementById('appWhere');
          return !!where && !where.hidden;
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
  // The adoption pages are in this scan for a reason of their own: the flyer's
  // whole purpose is one call to action, and a filter list that hides it
  // leaves a poster-shaped page with no way to reach the tracker. Same silent
  // failure as the start button, with nobody on the page to report it.
  for (const page of ['index.html', 'admin.html', 'flyer.html', 'for-operators.html', 'testers.html', 'poster.html']) {
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

  // The two adoption pages — the rider flyer and the operator briefing — are
  // built the same way and carry the same liability. Each one redraws the
  // tracker's screen in HTML and CSS rather than photographing it, so each
  // one is a hand-maintained copy of a UI that moves, and each one keeps its
  // own copy of the token block so it survives being opened on its own or
  // printed. Everything the guide is held to above, they are held to too:
  // load nothing, link back to the map, and stay in step with the app.
  // The closed test's tester page draws no screen, but it is built the same
  // way for the same reasons, so it is held to the same three, and so is the
  // showcase poster.
  for (const page of ['flyer.html', 'for-operators.html', 'testers.html', 'poster.html']) {
    const p = path.join(APP, page);
    check(fs.existsSync(p), `${page} is in the repository`);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8');

    const loads = [...new Set((src.match(/(?:src|poster)="([^"]+)"/g) || [])
      .map(m => m.slice(m.indexOf('"') + 1, -1)))]
      .filter(u => !u.startsWith('data:'));
    check(loads.length === 0,
      `${page}: draws its figures rather than loading any`,
      loads.length ? 'loads: ' + loads.join(' ') : 'nothing to drop from a deploy');

    check(/href="index\.html"/.test(src), `${page}: links back to the map`);

    const t = tokensOf(src);
    const sh = Object.keys(appTokens).filter(k => k in t);
    const dr = sh.filter(k => appTokens[k] !== t[k]);
    check(sh.length > 6 && dr.length === 0,
      `${page}: design tokens still match the app's (${sh.length} shared)`,
      dr.length
        ? dr.map(k => `${k}: app ${appTokens[k]} vs page ${t[k]}`).join('; ')
        : 'in step');

    // The flyer moves only as the app moves: every animation it declares is
    // one index.html declares, with the same keyframes, copied like its icons.
    if (page === 'flyer.html') {
      const frames = text => {
        const out = {};
        for (const m of text.matchAll(/@keyframes ([\w-]+)\s*\{/g)) {
          let depth = 1, i = m.index + m[0].length;
          while (depth && i < text.length) { if (text[i] === '{') depth++; else if (text[i] === '}') depth--; i++; }
          out[m[1]] = text.slice(m.index + m[0].length, i - 1).replace(/\s+/g, '');
        }
        return out;
      };
      const mine = frames(src), app = frames(fs.readFileSync(path.join(APP, 'index.html'), 'utf8'));
      const odd = Object.keys(mine).filter(k => mine[k] !== app[k]);
      check(Object.keys(mine).length > 0 && !odd.length, `${page}: its motion is the app's, keyframe for keyframe`,
        odd.length ? 'differs or unknown: ' + odd.join(' ') : Object.keys(mine).join(' '));
    }

    // The flyer's QR code is the one thing on a printed poster that cannot be
    // typed around if it is wrong, and nothing about it is readable by eye.
    // It is drawn as an inline path, so at least assert it is still drawn
    // rather than quietly replaced by a hotlinked image generator.
    if (page === 'flyer.html') {
      check(/aria-label="QR code[^"]*"/.test(src) && /<path fill="#000" d="M[\d ]/.test(src),
        `${page}: the QR code is still an inline path, not a loaded image`);
    }

    // The poster's two QR codes are its whole point, and the flyer carries
    // the same two, and nobody can read one by eye, so each must be exactly
    // what tools/make-qr.js draws for the address its label names: the
    // tracker, and the Android app where config.txt says it is. When
    // ANDROID_APP_URL moves from the tester page to the Play listing, this
    // fails until both pages' second code moves with it.
    if (page === 'poster.html' || page === 'flyer.html') {
      const codes = [...src.matchAll(/<svg viewBox="0 0 \d+ \d+" role="img" aria-label="QR code for ([^"]+)">\s*<rect[^>]*\/>\s*<path fill="#000" d="([^"]+)"\/>/g)]
        .map(m => ({ label: m[1], d: m[2] }));
      const drawn = codes.filter(c => {
        const out = require('child_process').execFileSync(process.execPath, [path.join(APP, 'tools', 'make-qr.js'), 'https://' + c.label], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        return out.includes(' d="' + c.d + '"');
      });
      check(codes.length === 2 && drawn.length === 2, `${page}: two QR codes, each the one make-qr.js draws for the address it names`,
        codes.map(c => c.label + (drawn.includes(c) ? '' : ' (STALE)')).join(', '));
      const appUrl = (/^ANDROID_APP_URL\s*=\s*(\S*)/m.exec(fs.readFileSync(path.join(APP, 'config.txt'), 'utf8')) || [])[1] || '';
      check(codes.some(c => !c.label.includes('/')) && (!appUrl || codes.some(c => 'https://' + c.label === appUrl)),
        `${page}: one for the tracker and one for the app, where config.txt says the app is`, appUrl || 'no app in config.txt');
    }

    // Google's "Get it on Google Play" badge, wherever a page carries one, is
    // Google's own artwork byte for byte (en_badge_web_generic.png, from the
    // badge page play.google.com/intl/en_us/badges redirects to), linking to
    // the app's listing, with Google's attribution line on the same page:
    // the badge is Google's to change, never this repository's, and the bare
    // Google Play logo is not for sending people to download at all.
    {
      const shown = (src.match(/alt="Get it on Google Play"/g) || []).length;
      if (shown) {
        const pkg = JSON.parse(fs.readFileSync(path.join(APP, 'mobile', 'capacitor.config.json'), 'utf8')).appId;
        const badges = [...src.matchAll(/<a class="playbadge[^"]*" href="([^"]+)"><img src="data:image\/png;base64,([A-Za-z0-9+/=]+)" width="646" height="250" alt="Get it on Google Play"><\/a>/g)];
        const sha = b => require('crypto').createHash('sha256').update(Buffer.from(b, 'base64')).digest('hex');
        const ok = badges.filter(m => sha(m[2]) === 'f72611e2df8e88204009fd896d05d5e8e83c77009c63943bbffa169559934849' &&
          m[1] === 'https://play.google.com/store/apps/details?id=' + pkg);
        check(badges.length === shown && ok.length === shown, `${page}: Google's badge, unaltered, linking to the app's listing`,
          shown + ' shown, ' + ok.length + ' as Google made it and linked');
        check(src.includes('Google Play and the Google Play logo are trademarks of Google LLC.'),
          `${page}: and Google's attribution line beside it`);
      }
    }

    // The tester page is three buttons a rider taps in order. It runs no
    // script, so nothing a blocker or an old phone does to one can leave a
    // page of buttons that do nothing. And Play opens the test only for the
    // package it knows, which is the one the Android app is built with: a
    // link naming any other leads a tester to "App not available" for good.
    if (page === 'testers.html') {
      check(!/<script/i.test(src), `${page}: runs no script at all`);
      const appId = JSON.parse(fs.readFileSync(path.join(APP, 'mobile', 'capacitor.config.json'), 'utf8')).appId;
      const play = src.match(/href="https:\/\/play\.google\.com\/[^"]+"/g) || [];
      check(play.length >= 2 && play.every(h => h.includes('=' + appId + '"') || h.endsWith('/' + appId + '"')),
        `${page}: every Play link names the app's package`, play.length + ' links, ' + appId);
      check(/href="https:\/\/groups\.google\.com\/g\/[\w-]+"/.test(src) &&
            /href="https:\/\/play\.google\.com\/apps\/testing\//.test(src) &&
            /href="https:\/\/play\.google\.com\/store\/apps\/details\?id=/.test(src),
        `${page}: all three steps are there: the group, becoming a tester, the listing`);
    }
  }

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
  // The guide's map figure is a real screenshot, and the bus badge on it is
  // positioned as a percentage of .mapinner — a wrapper sized to the image
  // rather than to the figure box, whose shape changes with the viewport.
  // Drop the wrapper and the badge silently drifts off the road it marks.
  check(/class="mapinner"/.test(guideSrc),
    'the guide map keeps the .mapinner wrapper its bus badge is measured against');

  for (const id of ['sightingsGuide', 'stripRing', 'stripRingNote']) {
    check(guideSrc.includes(`id="${id}"`),
      `the guide still carries #${id}, which its own script hides`);
  }
  check(!/<script[^>]+src=/i.test(guideSrc),
    'and it asks about the setting with fetch, not by loading a library');

  for (const page of ['index.html', 'admin.html', 'how-to.html', 'flyer.html', 'for-operators.html', 'testers.html', 'poster.html']) {
    const copies = darkCopies(fs.readFileSync(path.join(APP, page), 'utf8'));
    check(copies.length === 2 && copies[0] === copies[1] && copies[0].length > 0,
      `${page}: both statements of the dark palette are identical`,
      copies.length !== 2 ? `found ${copies.length}, expected 2` :
        (copies[0] === copies[1] ? `${copies[0].split(';').length} tokens` : 'THEY HAVE DRIFTED'));
  }

  // Section 7's lesson, a different filter list: blockers hide live-chat and
  // help widgets by name too, so the link must not be named like one.
  for (const page of ['index.html', 'how-to.html', 'flyer.html', 'for-operators.html', 'testers.html', 'poster.html']) {
    const found = (fs.readFileSync(path.join(APP, page), 'utf8')
      .match(/(?:id|class)="[^"]*(?:help|support|chat|widget)[^"]*"/gi) || []);
    check(found.length === 0, `${page}: nothing reads as a help or chat widget`,
      found.join(' ') || 'clean');
  }
  // And the third list, added with the salamat button: the filters written to
  // kill Facebook Like buttons are the oldest and broadest cosmetic rules
  // there are, and they match on names like this one's. This scan is the
  // reason the button is class="tybtn" rather than anything a person would
  // reach for first. It covers onclick as well as id and class, because a
  // filter can match an attribute's value as readily as its name, and the
  // control is drawn from a JS string that a DOM scan would never see.
  // "star" is deliberately absent: it is a substring of "start", which this
  // page is full of, and a scan that cries wolf on onbusStartBtn is a scan
  // somebody eventually deletes. Filter rules for it are written against
  // star-rating widgets, which nothing here will ever be.
  for (const page of ['index.html', 'admin.html', 'how-to.html', 'flyer.html', 'for-operators.html', 'testers.html', 'poster.html']) {
    const found = (fs.readFileSync(path.join(APP, page), 'utf8')
      .match(/(?:id|class|onclick)="[^"]*(?:like|fav|thumb|heart|vote|social|clap)[^"]*"/gi) || []);
    check(found.length === 0, `${page}: nothing reads as a like or social widget`,
      found.join(' ') || 'clean');
  }
  // And the fourth, added with the line that offers the Android app. Fanboy's
  // Mobile Notifications List, the one behind Brave's "open in app" blocking,
  // hides "get our app" banners by name: .mobile-app-banner, #bannerInstallApp,
  // .headerGetApp and dozens more. Its rules are exact names, so this asks for
  // something broader than any one of them: no name that puts "app" next to
  // banner, install, download, get, open or promo. In October 2026 that caught
  // 38 of the 41 such names on the list, and nothing on these pages. The line
  // itself is #gpsAppLine, named for the hint it sits in, and its link has no
  // name at all.
  for (const page of ['index.html', 'admin.html', 'how-to.html', 'flyer.html', 'for-operators.html', 'testers.html', 'poster.html']) {
    const found = (fs.readFileSync(path.join(APP, page), 'utf8')
      .match(/(?:id|class|onclick)="[^"]*(?:app[\w-]*(?:banner|bnr|install|instl|download|down|open|promo|cta)|(?:banner|bnr|install|instl|download|promo|get|open|link|webto)[\w-]{0,4}app|smart[-_]?(?:banner|bnr))[^"]*"/gi) || []);
    check(found.length === 0, `${page}: nothing reads as a "get our app" banner`,
      found.join(' ') || 'clean');
  }

  console.log('\n=== 9. the progress strip on the sharing tab ===');
  // A sharer's own tab reads "Sharing live" whether or not anything ever
  // reached anybody, so the strip is the only evidence on it that the trip is
  // really on everyone's map. Two strips ship now and one function draws
  // both, which is the part that can rot quietly: ids cannot be duplicated,
  // so everything renderStrip() writes into is found by class, and a rename
  // on one strip would otherwise just leave the other blank.
  const stripCard = ok.d.getElementById('onbusStripCard');
  check(!!stripCard && stripCard.className.includes('hidden'),
    'the strip card starts hidden: it belongs to a live trip, not to the tab');

  const trackTicks = [...ok.d.querySelectorAll('#trackStrip .tick')];
  const onbusTicks = [...ok.d.querySelectorAll('#onbusStrip .tick')];
  check(onbusTicks.length > 1 && onbusTicks.length === trackTicks.length,
    'both strips are built with the same checkpoint ticks',
    `${onbusTicks.length} on the sharing tab, ${trackTicks.length} on the tracker`);
  check(onbusTicks.every(t => t.getAttribute('data-i') !== null),
    'every tick still names its checkpoint with data-i, which is what marks it "near"');
  for (const sel of ['#onbusStrip .pills.nb', '#onbusStrip .pills.sb', '#onbusStrip .ticks']) {
    check(!!ok.d.querySelector(sel), `renderStrip has somewhere to draw: ${sel}`);
  }

  // Point the shipped drawing function at the sharing tab's strip and check a
  // bus actually lands on it, on the rail its direction belongs to.
  const cps = CONFIG.split(/\r?\n/)
    .filter(l => l.trim().startsWith('CHECKPOINT ='))
    .map(l => l.split('=')[1].split('|').map(x => x.trim()));
  const mid = cps[Math.floor(cps.length / 2)];
  ok.w.renderStrip(ok.d.getElementById('onbusStrip'),
    [{ id: 'test', lat: +mid[2], lng: +mid[3], direction: 'north', ts: Date.now() }], []);
  check(!!ok.d.querySelector('#onbusStrip .pills.nb .buspill'),
    'a northbound bus draws a pill on the sharing tab\'s northbound rail');
  check(!ok.d.querySelector('#onbusStrip .pills.sb .buspill'),
    'and nothing on the southbound one');
  const nearTick = ok.d.querySelector('#onbusStrip .tick.near');
  check(!!nearTick && nearTick.getAttribute('data-i') === String(cps.indexOf(mid)),
    'and the checkpoint it is sitting on is the one highlighted',
    nearTick ? `${nearTick.textContent.trim()} (data-i ${nearTick.getAttribute('data-i')})` : 'none highlighted');

  // Which pill is yours comes from the server (is_self, sql/04), not from
  // comparing coordinates, so two buses in the same place cannot swap it.
  const first = cps[0], second = cps[1];
  ok.w.renderStrip(ok.d.getElementById('onbusStrip'), [
    { id: 'mine', lat: +first[2], lng: +first[3], direction: 'north', ts: Date.now(), self: true },
    { id: 'theirs', lat: +second[2], lng: +second[3], direction: 'north', ts: Date.now() }
  ], []);
  const ringed = [...ok.d.querySelectorAll('#onbusStrip .pills.nb .buspill')]
    .filter(p => p.className.includes('me'));
  check(ringed.length === 1, 'exactly one pill is marked as yours when the feed says so',
    `${ringed.length} of ${ok.d.querySelectorAll('#onbusStrip .pills.nb .buspill').length} marked`);
  check(!!ringed[0] && ringed[0].getAttribute('style').includes('left:0'),
    'and it is the bus the feed flagged, not the other one',
    ringed[0] && ringed[0].getAttribute('style'));
  // The two strips are drawn by one function but are not the same control:
  // on the tracker a pill is a button that flies the map to its bus (and so
  // to the popup, where the salamat button lives); on the sharing tab the
  // map is on the other tab, so a tappable pill there would do something
  // invisible. The fourth argument is what separates them.
  check([...ok.d.querySelectorAll('#onbusStrip .buspill')]
      .every(pl => pl.tagName === 'DIV'),
    'the sharing tab\'s pills are inert, because the map is not on that tab');
  ok.w.renderStrip(ok.d.getElementById('trackStrip'), [
    { id: 'abc123-def', lat: +first[2], lng: +first[3], direction: 'north', ts: Date.now() }
  ], [], true);
  const tapPill = ok.d.querySelector('#trackStrip .pills.nb .buspill');
  check(!!tapPill && tapPill.tagName === 'BUTTON'
      && (tapPill.getAttribute('onclick') || '').includes("focusBus('abc123-def')"),
    'the tracker\'s pills are buttons that focus their bus on the map',
    tapPill ? tapPill.outerHTML.slice(0, 90) : 'no pill drawn');
  ok.w.renderStrip(ok.d.getElementById('trackStrip'), [
    { id: 'abc\'); alert(1); (\'', lat: +first[2], lng: +first[3], direction: 'north', ts: Date.now() }
  ], [], true);
  const oddPill = ok.d.querySelector('#trackStrip .pills.nb .buspill');
  check(!!oddPill && oddPill.tagName === 'DIV' && !oddPill.getAttribute('onclick'),
    'an id that is not plain hex draws a plain pill rather than reaching a handler');

  // The ring means "the bus you are sharing", so the CSS has to be able to
  // find it and the legend line that explains it has to exist.
  check(/\.buspill\.me\{/.test(fs.readFileSync(path.join(APP, 'index.html'), 'utf8')),
    'index.html styles .buspill.me, the class renderStrip writes');
  const legend = ok.d.getElementById('selfLegend');
  check(!!legend && legend.className.includes('hidden'),
    'the legend line for the ring is hidden while nobody on this phone is sharing');
  check(!!legend && /green ring/i.test(legend.textContent),
    'and it says in words what the colour means', legend && legend.textContent.trim());

  // Revealed by starting a trip, taken away by stopping one.
  ok.w.switchTab('share');
  ok.w.setShareUI('on', 'Sharing live');
  check(!stripCard.className.includes('hidden'), 'starting a trip puts the strip on screen');
  check(!legend.className.includes('hidden'), 'and explains the ring on the tracker tab too');
  ok.w.setShareUI('off', 'Not sharing');
  check(stripCard.className.includes('hidden'),
    'stopping takes it away again, rather than leaving other buses under a heading about yours');
  check(legend.className.includes('hidden'), 'and the legend line goes with it');

  console.log('\n=== 10. the reader\'s own saved stop ===');
  // A watcher's location is the one thing this system has never held, so the
  // feature that finally mentions one has to be provably local. The maths is
  // covered by test-mystop.js; what is checked here is the part that can only
  // be seen in a real page — that it draws, that it persists in the one place
  // it claims to, and that the privacy panel still describes it truthfully.
  const stopBar = ok.d.getElementById('myStop');
  const stopLegend = ok.d.getElementById('myStopLegend');
  check(!!stopBar, 'the tracker has somewhere to put the saved stop');
  check(!!stopBar && /Set your stop/i.test(stopBar.textContent),
    'with nothing saved it offers to save one', stopBar && stopBar.textContent.trim().slice(0, 52));
  check(!!stopLegend && stopLegend.className.includes('hidden'),
    'and the legend line for the pin stays hidden until there is a pin');

  const cpAt = i => ({ lat: +cps[i][2], lng: +cps[i][3], short: cps[i][1] });
  const myCp = cpAt(4), busCp = cpAt(1);
  ok.w.setMyStop('Test Stop', myCp.lat, myCp.lng);
  check(ok.w.localStorage.getItem('wt-mystop') !== null,
    'saving a stop puts it in localStorage, on this device');
  check(!stopLegend.className.includes('hidden'), 'and the legend line for the pin appears');
  {
    const saved = JSON.parse(ok.w.localStorage.getItem('wt-mystop'));
    check(saved.name === 'Test Stop' && Math.abs(saved.lat - myCp.lat) < 1e-9,
      'what is stored is the stop itself, and nothing else',
      Object.keys(saved).sort().join(','));
  }

  // A northbound bus three checkpoints short of it is coming; the same bus
  // three checkpoints beyond it is not.
  ok.w.renderMyStop([{ id: 'b1', lat: busCp.lat, lng: busCp.lng, direction: 'north', ts: Date.now() }]);
  check(/▲ Northbound · [\d.]+ km away · (about \d+ stops? before yours|yours is the next stop)/
    .test(stopBar.textContent),
    'a bus still short of your stop is reported with distance and stops',
    stopBar.textContent.replace(/\s+/g, ' ').trim().slice(0, 72));
  ok.w.renderMyStop([{ id: 'b2', lat: cpAt(6).lat, lng: cpAt(6).lng, direction: 'north', ts: Date.now() }]);
  check(/not?[a-z ]*heading your way/i.test(stopBar.textContent),
    'a bus that has already passed says so rather than reporting itself as near',
    stopBar.textContent.replace(/\s+/g, ' ').trim().slice(0, 72));
  ok.w.renderMyStop([]);
  check(/Nobody is sharing/i.test(stopBar.textContent),
    'and with nothing on the map it falls back to the page\'s own wording');

  // The picker rewrites its list on every keystroke, so the click handling is
  // delegated rather than inline. Two of this route's own stops are exactly
  // the ones an inline onclick would have had to survive: an ampersand and an
  // apostrophe. Drive the real list and click a real button.
  ok.w.openStopPicker();
  const search = ok.d.getElementById('stopSearch');
  search.value = 'kawit';
  ok.w.renderStopList();
  const kawit = [...ok.d.querySelectorAll('#stopList button')]
    .find(b => b.getAttribute('data-name') === 'S&R Kawit');
  check(!!kawit, 'searching the picker narrows it to matching stops',
    [...ok.d.querySelectorAll('#stopList button')].map(b => b.getAttribute('data-name')).join(', '));
  if (kawit) {
    kawit.click();
    const saved = JSON.parse(ok.w.localStorage.getItem('wt-mystop') || '{}');
    check(saved.name === 'S&R Kawit',
      'clicking a stop whose name contains "&" saves that exact name', JSON.stringify(saved.name));
  }
  search.value = "shakey";
  ok.w.renderStopList();
  const apos = ok.d.querySelector('#stopList button[data-name*="Shakey"]');
  if (apos) {
    apos.click();
    check(JSON.parse(ok.w.localStorage.getItem('wt-mystop')).name === "Salaban (Shakey's Bypass)",
      'and one containing an apostrophe survives too');
  } else {
    check(false, 'the apostrophe stop is still in the picker');
  }
  search.value = 'zzzz';
  ok.w.renderStopList();
  check(/No stop here matches/.test(ok.d.getElementById('stopList').textContent),
    'a search matching nothing says so instead of going blank');

  ok.w.clearMyStop();
  check(ok.w.localStorage.getItem('wt-mystop') === null,
    'removing the stop deletes it rather than blanking it');
  check(stopLegend.className.includes('hidden'), 'and takes its legend line away again');
  check(/Set your stop/i.test(stopBar.textContent), 'leaving the offer to set one');

  // Already on the bus. A rider says so from the bus's popup; a sharer never
  // has to, because the server flags their row. Either way the card follows
  // that one bus to the stop, and the sharing tab carries the card too.
  {
    const tripBox = ok.d.getElementById('tripStop');
    check(!!tripBox && tripBox.className.includes('hidden'),
      'the sharing tab has a copy of the stop card, hidden while nobody here is sharing');
    const pop = b => { const div = ok.d.createElement('div'); div.innerHTML = ok.w.busPopupHtml(b); return div; };
    const near = { id: 'aaa111', lat: cpAt(3).lat, lng: cpAt(3).lng, direction: 'north', ts: Date.now(), members: ['aaa111'] };
    const mineBus = { id: 'bbb222', lat: busCp.lat, lng: busCp.lng, direction: 'north', ts: Date.now(), members: ['bbb222', 'ccc333'], label: '98018' };
    const offer = [...pop(mineBus).querySelectorAll('button')].find(b => /on this bus/.test(b.textContent));
    check(!!offer && (offer.getAttribute('onclick') || '').includes("boardBus('bbb222')"),
      'a bus\'s popup offers "I\'m on this bus"', offer && offer.textContent);
    check(![...pop({ ...mineBus, self: true }).querySelectorAll('button')].some(b => /on this bus/.test(b.textContent)),
      'but not on the bus this phone is sharing, which is already known to be theirs');
    check(![...pop({ ...mineBus, id: 'x\'); alert(1); (\'' }).querySelectorAll('button')].some(b => /on this bus/.test(b.textContent)),
      'and not on an id that is not plain, which would otherwise reach a handler');

    ok.w.setMyStop('Test Stop', myCp.lat, myCp.lng);
    ok.w.renderMyStop([near, mineBus]);
    check(/before yours|stop is yours/.test(stopBar.textContent) && !/your bus/i.test(stopBar.textContent) &&
          !!stopBar.querySelector('.ride-art svg.stopview') && !stopBar.querySelector('.ride-art svg.stopview [class~="sv-swing"]'),
      'waiting, the card counts down on whichever bus is nearest, drawn coming down the road');
    // The picture moves when a position does: the bus glides from where it
    // was drawn, and a redraw before it gets there carries the same glide on
    // rather than starting it again or jumping to the end.
    {
      const toward = f => ({ ...near, lat: near.lat + (myCp.lat - near.lat) * f, lng: near.lng + (myCp.lng - near.lng) * f });
      ok.w.renderMyStop([toward(.8), mineBus]);
      ok.w.renderMyStop([toward(.9), mineBus]);
      const g1 = stopBar.querySelector('.sv-glide');
      ok.w.renderMyStop([toward(.9), mineBus]);
      const g2 = stopBar.querySelector('.sv-glide');
      const fromOf = g => ((g && g.getAttribute('style')) || '').split('--from:')[1] || '';
      check(!!g1 && !!g2 && fromOf(g1) && fromOf(g1).split(';')[0] === fromOf(g2).split(';')[0],
        'a new position glides the bus on from where it was, and a redraw on the way carries that glide on', fromOf(g2));
      ok.w.renderMyStop([near, mineBus]);
    }
    ok.w.boardBus('ccc333');
    check(ok.w.sessionStorage.getItem('wt-aboard') === 'ccc333',
      'tapping it keeps the bus\'s public id for this visit, in sessionStorage');
    ok.w.renderMyStop([near, mineBus]);
    const said = stopBar.textContent.replace(/\s+/g, ' ');
    check(/on your bus · [\d.]+ km to go/.test(said) && /· your bus 98018 ·/.test(said) && !!stopBar.querySelector('.ride-art svg.stopview .sv-swing'),
      'and the card now follows that bus, not the one nearer the stop, seen from inside it', said.slice(0, 90));
    check(/I got off this bus/.test(pop(mineBus).textContent), 'its popup now offers "I got off this bus" instead');
    // On board the view keeps to the road: a few metres either way is the
    // GPS and moves nothing, a real move goes by over a poll, and a long way
    // back starts the view again where the bus is, drawn at once.
    {
      const along = f => ({ ...mineBus, lat: busCp.lat + (myCp.lat - busCp.lat) * f, lng: busCp.lng + (myCp.lng - busCp.lng) * f });
      const ride = () => ok.w.eval('STOPVIEW.at > 0 && Math.abs(STOPVIEW.from - STOPVIEW.to) > .0005');
      ok.w.renderMyStop([near, along(.3)]);
      const jumped = !ride();
      ok.w.renderMyStop([near, along(.30005)]);
      const held = !ride();
      ok.w.renderMyStop([near, along(.303)]);
      const moved = ride() && !stopBar.querySelector('.ride-art svg.stopview .sv-glide') && !!stopBar.querySelector('.ride-art svg.stopview .sv-road');
      ok.w.renderMyStop([near, along(.29)]);
      const back = !ride();
      check(jumped && held && moved && back,
        'on board, a jump is drawn at once, the GPS wobbling moves nothing, a real move goes by, and going back starts again',
        [jumped, held, moved, back].join(','));
      ok.w.renderMyStop([near, mineBus]);
    }
    ok.w.renderMyStop([near]);
    check(/isn.t on the map right now/.test(stopBar.textContent) && /I got off/.test(stopBar.textContent),
      'if that bus leaves the map the card says so, rather than falling back to another bus');
    ok.w.leaveBus();
    check(ok.w.sessionStorage.getItem('wt-aboard') === null, '"I got off" forgets it');
    ok.w.renderMyStop([near, mineBus]);
    check(!/on your bus/.test(stopBar.textContent), 'and the card is back to waiting');

    // Sharing. `sharing` is a top-level let, so it is reached through eval
    // rather than as a property of window.
    const tab = ok.d.getElementById('tabOnbus');
    check(!tab.className.includes('live'), 'the sharing tab carries no live dot while nothing is shared');
    ok.w.boardBus('bbb222');
    ok.w.eval('sharing = true');
    ok.w.switchTab('track');
    ok.w.setShareUI('on', 'Sharing live');
    check(tab.className.includes('live') && /sharing now/.test(tab.textContent),
      'while sharing, the tab says so from the tracker, in a dot and in words for screen readers');
    // The dots say live by breathing, for half a minute and then held still:
    // breathing all trip kept the phone repainting for all of it, the most a
    // sharer's screen cost, and slower would have cost the same.
    {
      const css = [...ok.d.querySelectorAll('style')].map(st => st.textContent).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
      const dots = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m => /statusdot|tablive/.test(m[1]) && /animation/.test(m[2]));
      const breath = dots.map(m => /animation:breathe ([\d.]+)s ease-in-out (\d+);/.exec(m[2])).filter(Boolean);
      check(dots.length === 1 && breath.length === 1 && +breath[0][1] * +breath[0][2] <= 32 &&
            /:root:not\(\.trip-on\) \.tab\.live \.tablive/.test(dots[0][1]),
        'the live dots breathe for half a minute and then hold still, the tab\'s only while the sharer is on the other tab',
        dots.map(m => m[1].trim() + '{' + m[2] + '}').join(' | '));
      // The rest of the trip screen rests too: one thing moving keeps the
      // whole screen redrawing. The strip's pills for about half a minute,
      // as long as their own loops say; the glows, drawn again every poll,
      // and the parol, which never leaves the screen, not at all.
      const secs = re => +((re.exec(css) || [])[1]);
      const rock = secs(/\.buspill\.live svg, \.busmk\.live svg\{animation:idle ([\d.]+)s/), breathe = secs(/\.buspill\.live:not\(\.me\)\{animation:breathe-nb ([\d.]+)s/);
      const times = secs(/#onbusStrip \.buspill\.live svg\{animation-iteration-count:(\d+);\}/) * rock;
      const breaths = secs(/#onbusStrip \.buspill\.live:not\(\.me\)\{animation-iteration-count:(\d+);\}/) * breathe;
      check(times > 25 && times <= 32 && breaths > 25 && breaths <= 32 &&
            /#onbusStrip \.sightband\{animation:none;\}/.test(css) && /:root\.trip-on #parol\{animation:none;\}/.test(css),
        'and so does the rest of the trip screen: the strip\'s pills after half a minute, its glows and the parol from the start',
        'rocking ' + times.toFixed(1) + ' s, breathing ' + breaths.toFixed(1) + ' s');
    }
    check(ok.w.sessionStorage.getItem('wt-aboard') === null,
      'and a bus picked from a popup is superseded, so it cannot come back after Stop');
    ok.w.renderMyStop([near, { ...mineBus, self: true }]);
    check(/on your bus/.test(stopBar.textContent) && !tripBox.className.includes('hidden') && /on your bus/.test(tripBox.textContent),
      'the sharer\'s own bus drives the card, on the tracker and on the sharing tab both');
    // On the sharing tab the road is folded away until asked for, then open
    // for the rest of the visit only: a sharer's screen stays on all trip,
    // and the road going by kept it redrawing. The tracker's copy shows it.
    {
      const lsKeys = () => { const k = []; for (let i = 0; i < ok.w.localStorage.length; i++) k.push(ok.w.localStorage.key(i)); return k.sort().join(','); };
      // A tap draws the card again from the page's own buses; these are the
      // test's, so it is drawn again from them.
      const before = lsKeys(), fold = () => tripBox.querySelector('.ride-fold'), mine = () => ok.w.renderMyStop([near, { ...mineBus, self: true }]);
      mine();
      const folded = !tripBox.classList.contains('road') && !!fold() && !!tripBox.querySelector('svg.stopview') && fold().getAttribute('aria-expanded') === 'false';
      fold().click(); mine();
      const opened = tripBox.classList.contains('road') && ok.w.sessionStorage.getItem('wt-road') === '1' && fold().getAttribute('aria-expanded') === 'true';
      ok.w.eval('WALK = {}');
      ok.w.toggleRoad();
      const walked = tripBox.classList.contains('road');
      ok.w.eval('WALK = null');
      fold().click(); mine();
      const closed = !tripBox.classList.contains('road') && ok.w.sessionStorage.getItem('wt-road') === null;
      const css = [...ok.d.querySelectorAll('style')].map(st => st.textContent).join('\n');
      const rules = /\.ride-fold\{display:none;\}/.test(css) && /#tripStop:not\(\.road\) \.stopview\{display:none;\}/.test(css) &&
        !/#myStop[^{]*\.stopview\{display:none/.test(css);
      check(folded && opened && walked && closed && rules && lsKeys() === before,
        'on the sharing tab the road is folded until asked for, then open for this visit only, and never during a tour',
        [folded, opened, walked, closed, rules].join(','));
    }
    // Positions come every poll on the tracker but every SLOW_FEED_MS on the
    // sharing tab, and on board the view shows the bus a lag behind, the
    // feed and a poll more, reaching each position that long after the bus
    // was there by the report's own time. So the view never stands while the
    // bus goes on, and a report that comes later than the others makes a
    // shorter glide rather than a slower one: the pace stays the bus's.
    {
      const mine = (f, late) => ({ ...mineBus, self: true, ts: Date.now() - (late || 0),
        lat: busCp.lat + (myCp.lat - busCp.lat) * f, lng: busCp.lng + (myCp.lng - busCp.lng) * f });
      const length = () => ok.w.eval('STOPVIEW.at > 0') ? ok.w.eval('STOPVIEW.span') / 1000 : 'still';
      ok.w.renderMyStop([near, mine(.3)]);
      ok.w.renderMyStop([near, mine(.303)]);
      const tracker = length();
      ok.w.switchTab('share');
      ok.w.renderMyStop([near, mine(.306)]);
      const shareTab = length();
      ok.w.renderMyStop([near, mine(.309, 3000)]);
      const late = length();
      ok.w.switchTab('track');
      const slowMs = +((/const SLOW_FEED_MS = (\d+);/.exec(fs.readFileSync(path.join(APP, 'index.html'), 'utf8')) || [])[1]);
      check(Math.abs(tracker - 12) < .5 && slowMs > 6000 && Math.abs(shareTab - (slowMs + 6000) / 1000) < .5 && Math.abs(late - (shareTab - 3)) < .5,
        'on board the view runs the feed and a poll behind the report\'s own time: 12 s on the tracker, 24 on the sharing tab, a late report a shorter glide',
        [tracker, shareTab, late].map(x => typeof x === 'number' ? x.toFixed(2) + 's' : x).join(', '));
      // The card moves the road itself, frame by frame: halfway through a
      // glide every thing on the open road is where the picture's own sum
      // puts it for the bus halfway, and nothing moves on a folded one.
      ok.w.switchTab('share');
      ok.w.toggleRoad();
      ok.w.renderMyStop([near, mine(.312)]);
      const half = ok.w.eval('STOPVIEW.at + STOPVIEW.span / 2'), v = ok.w.eval('(STOPVIEW.from + STOPVIEW.to) / 2');
      const placed = ok.w.ridePlace(half);
      const onRoad = [...tripBox.querySelectorAll('.sv-road .sv-k')], at = g => +g.getAttribute('data-w');
      // This glide is longer than the eye reaches, as a bus on the highway
      // goes between positions on this tab: what is further up the road
      // than that waits out of sight, and comes into view as the bus nears.
      const seenKm = ok.w.eval('SV_SEEN'), long = ok.w.eval('STOPVIEW.from - STOPVIEW.to'), far = g => v - at(g) > seenKm;
      const exact = onRoad.length > 20 && onRoad.every(g => far(g) ? g.style.display === 'none' : g.style.display === '' && g.style.transform === ok.w.svOnRoad(v, at(g)));
      // and what is painted on it, the middle line, the joints and the
      // grass, drawn again for the bus halfway.
      const painted = [['.sv-dashes', 'svDashes'], ['.sv-joints', 'svJoints'], ['.sv-tufts', 'svTufts']].every(([sel, fn]) => {
        const path = tripBox.querySelector('.sv-road ' + sel);
        return !!path && path.getAttribute('d') === ok.w[fn](v) && path.getAttribute('d') !== ok.w[fn](ok.w.eval('STOPVIEW.to'));
      });
      const waiting = onRoad.filter(far).length, end = ok.w.eval('STOPVIEW.to');
      ok.w.ridePlace(ok.w.eval('STOPVIEW.at + STOPVIEW.span'));
      const arrived = onRoad.every(g => g.style.display === '' && g.style.transform === ok.w.svOnRoad(end, at(g)));
      ok.w.toggleRoad();
      ok.w.renderMyStop([near, mine(.315)]);
      const before = [...tripBox.querySelectorAll('.sv-road .sv-k')].map(g => g.style.transform).join('|');
      const folded = !ok.w.ridePlace(ok.w.eval('STOPVIEW.at + STOPVIEW.span / 2')) &&
        [...tripBox.querySelectorAll('.sv-road .sv-k')].map(g => g.style.transform).join('|') === before;
      ok.w.switchTab('track');
      check(placed && exact && painted && folded,
        'and the card moves the open road frame by frame, each thing where the picture\'s own sum puts it, its paint drawn again, and leaves a folded one be',
        [placed, exact, painted, folded].join(',') + (exact ? '' : ' ' + (onRoad[0] ? onRoad[0].style.transform + ' vs ' + ok.w.svOnRoad(v, at(onRoad[0])) : 'nothing on the road')));
      check(long > seenKm && waiting > 5 && arrived,
        'and on a way longer than the eye reaches, what is further off waits out of sight until the bus nears it',
        long.toFixed(3) + ' km, ' + waiting + ' of ' + onRoad.length + ' things waiting halfway, ' + (arrived ? 'all in place at the end' : 'not all in place at the end'));
      ok.w.renderMyStop([near, { ...mineBus, self: true }]);
    }
    check(!/I got off/.test(tripBox.textContent), 'with no "I got off": a sharer gets off by tapping Stop');
    check(!/on this bus/.test(pop(near).textContent), 'and no "I\'m on this bus" on any popup while sharing');
    check(ok.d.querySelectorAll('[id="buzzBox"]').length === 0,
      'the card written twice repeats no id');
    ok.w.renderMyStop([near, { ...mineBus, self: true, lat: cpAt(6).lat, lng: cpAt(6).lng }]);
    check(/passed your stop/.test(tripBox.textContent),
      'a sharer heading away from their saved stop is asked for the one they get off at');
    ok.w.eval('sharing = false');
    ok.w.setShareUI('off', 'Not sharing');
    check(!tab.className.includes('live') && tripBox.className.includes('hidden'),
      'stopping takes the dot and the sharing tab\'s card away');
    ok.w.clearMyStop();
  }

  // The panel is the promise and the code is only the implementation. This is
  // that rule made mechanical: every key the app writes to localStorage has to
  // be one the panel has told the reader about. A seventh remembered thing
  // fails here until the paragraph is rewritten in the same commit, as the
  // fifth and sixth, your bus and the trip in progress, were.
  const appSrc = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const keys = [...new Set([...appSrc.matchAll(/localStorage\.(?:setItem|removeItem)\(\s*'([^']+)'/g)]
    .map(m => m[1]))].sort();
  check(keys.join(',') === 'wt-bus,wt-guide-seen,wt-key,wt-mystop,wt-theme,wt-tickets,wt-trip',
    'the app keeps exactly the six things the privacy panel names, and the Android app\'s seventh', keys.join(',') || 'none');
  // supabase-js sends a request only when something asks for its answer, so
  // an rpc() nobody awaits or .then()s never leaves the phone. The wrong-way
  // pause's clear_bus_position was one, and had never gone out.
  const bare = appSrc.split('\n').filter(l => /\brpc\(/.test(l) && !/await rpc\(|= rpc\(|return rpc\(|const rpc = |\)\.then\(/.test(l));
  check(bare.length === 0, 'every request the page makes is one something waits for, so it is really sent', bare.join(' | ').trim());
  const panel = ok.d.getElementById('privModal').textContent.replace(/\s+/g, ' ');
  check(/Six small things are remembered on your own device/.test(panel),
    'and the panel counts them out loud, so a seventh cannot slip in quietly');
  check(/The Android app keeps a seventh: the key or PIN you entered to share/.test(panel) &&
        /deleted when it stops working/.test(panel),
    'the seventh, the app\'s remembered key, is named too, with when it goes');
  // Only the app writes it there: a browser may be a shared one.
  const keyWrites = [...appSrc.matchAll(/localStorage\.setItem\(\s*'wt-key'[^\n]*/g)].map(m => m[0]);
  check(keyWrites.length === 1 && /if \(inApp\(\)\)\{ try\{ localStorage\.setItem\('wt-key'/.test(appSrc),
    'and only the app writes it, never a browser', keyWrites.join(' | '));
  check(/your bus, if you have shared or finished a tour, and the trip you are sharing, while you share it/.test(panel) &&
        /Totals, never a list: no clock times and no bus numbers/.test(panel) && /deleted the moment the trip ends/.test(panel),
    'naming your bus as totals only, never a list of times, and the trip in progress as gone when it ends');
  check(/Showing your bus to riders<\/b> is off unless you switch it on/.test(panel.replace(/<[^b\/][^>]*>/g, '')) || /Showing your bus to riders is off unless you switch it on/.test(panel),
    'and showing the bus to riders as off unless switched on, with what it costs', '');
  check(/tell it is yours from one trip to the next/.test(panel) && /never bought with money, never sent/.test(panel) && /The app never sends it anywhere/.test(panel),
    'saying riders can recognise a shown bus, parts are never money, and a backup is never sent');
  check(/the stop you saved/i.test(panel), 'naming the saved stop among them');
  check(/the tickets you chose to keep/i.test(panel) && /Start from scratch.{0,4} in My tickets deletes every copy/.test(panel),
    'and the kept tickets, with the way to delete them');
  check(/Nothing is ever kept unless you tap Keep/.test(panel) && /leaves out the times, how long the trip took, the bus number and how many riders thanked you/.test(panel),
    'saying a ticket is kept only on a tap, and what a kept one leaves out');
  // The old panel promised the app never asks for location while watching.
  // That is no longer true, so the promise had to move rather than be dropped.
  check(!/never asks for your location\./.test(panel),
    'the superseded "never asks for your location" promise is gone');
  check(/never transmitted, never stored on our side/i.test(panel),
    'replaced by the one that is still true: it does not leave the phone');

  // Opting the dot on is a per-visit decision, so it must not be remembered.
  check(!/localStorage\.[a-zA-Z]+\([^)]*myloc/i.test(appSrc),
    'whether the location dot is on is never written to localStorage');

  console.log('\n=== 12. My tickets: kept only when asked, and only the souvenir ===');
  // The ticket at Stop is gone when it is closed unless Keep is tapped. Drive
  // the real page: a ticket shown and closed keeps nothing, Keep keeps six
  // things and no stopwatch, the album opens on what was kept, and Remove
  // takes it away again, key and all.
  {
    const w = ok.w, d = ok.d;
    const row = d.getElementById('albumRow'), modal = d.getElementById('tktModal'), album = d.getElementById('albumModal');
    const keepBtn = d.getElementById('tktKeep'), dropBtn = d.getElementById('tktDrop');
    const hidden = el => !el || el.className.includes('hidden');
    w.localStorage.removeItem('wt-tickets');
    w.syncAlbumRow();
    w.localStorage.removeItem('wt-bus');
    w.syncAlbumRow();
    // Its name and nothing else (October 2026): the counts are inside, so
    // there is no number on the tab to be a zero.
    check(!hidden(row) && row.textContent.replace(/\s+/g, ' ').trim() === 'My tickets',
      'with nothing kept or earned, the sharing tab still offers My tickets, by its name alone', row.textContent.replace(/\s+/g, ' ').trim());
    w.openAlbum();
    const empty = d.getElementById('albumBody');
    check(/starts with your first trip/.test(empty.textContent) && empty.querySelectorAll('.alb-trophies li').length === 23 &&
          empty.querySelectorAll('.alb-shop li').length === 8 && empty.querySelectorAll('.alb-shop [data-buy][disabled]').length === 8 &&
          empty.querySelectorAll('.alb-decor li.on').length === 0 && empty.querySelectorAll('.alb-sight.yet').length === 16 &&
          !!empty.querySelector('.alb-ride svg.rideart') && !empty.querySelector('.lookq') &&
          empty.querySelectorAll('.alb-stamp.yet').length === 4 && !/×0|\b0 of\b|\b0 tickets?\b/.test(empty.textContent) &&
          hidden(d.getElementById('albumClear')),
      'and opened, it shows the plain bus on the road, every trophy, shop item, stamp and sight still to come, no zero, nothing to remove and nothing to ask');
    w.closeModal('albumModal');

    // Your progress: a backup copied as text (this DOM has no clipboard, so
    // the text is shown to be copied by hand), Start from scratch, and a
    // restore, which asks twice before replacing progress already here.
    w.localStorage.setItem('wt-bus', JSON.stringify({ n: 2, c: 15, places: ['MENDEZ', 'TGY'], paid: ['sampaguita'], own: ['dice'] }));
    w.localStorage.setItem('wt-tickets', JSON.stringify([{ d: '2026-10-09', dir: 'n', from: 'MENDEZ', to: 'TGY', st: [], ty: false }]));
    w.openAlbum();
    await w.copyBackup();
    const bkText = d.getElementById('bkText'), bkMsg = () => d.getElementById('bkMsg').textContent, bkGo = d.getElementById('bkGo');
    const copied = bkText.value;
    check(!!w.backupRead(copied) && JSON.parse(copied).tickets.length === 1 && JSON.parse(copied).bus.own.join(',') === 'dice' &&
          /Copy the text/.test(bkMsg()), 'a backup holds the tickets and the bus, shown to be copied where there is no clipboard', bkMsg());
    const clearBtn = d.getElementById('albumClear');
    check(!hidden(clearBtn) && /Start from scratch/.test(clearBtn.textContent), 'Start from scratch is offered when there is something to delete');
    clearBtn.click();
    check(/Tap again to delete 1 ticket and your bus/.test(clearBtn.textContent) && w.localStorage.getItem('wt-bus') !== null,
      'the first tap says what goes, and deletes nothing', clearBtn.textContent);
    clearBtn.click();
    check(w.localStorage.getItem('wt-bus') === null && w.localStorage.getItem('wt-tickets') === null && hidden(d.getElementById('albumModal')),
      'the second deletes everything My tickets held');
    w.openAlbum();
    w.openRestore();
    bkText.value = '{"hello":1}';
    await w.restoreBackup();
    check(/not a Bus Tracker backup/.test(bkMsg()) && w.localStorage.getItem('wt-bus') === null, 'something that is not a backup restores nothing');
    bkText.value = copied;
    await w.restoreBackup();
    check(JSON.parse(w.localStorage.getItem('wt-tickets') || '[]').length === 1 && JSON.parse(w.localStorage.getItem('wt-bus') || '{}').own.join(',') === 'dice' &&
          /Restored: 1 ticket and your bus/.test(bkMsg()), 'a restore on an empty phone puts it all back at once', bkMsg());
    w.openRestore();
    bkText.value = copied;
    await w.restoreBackup();
    check(/Tap again: this replaces/.test(bkGo.textContent), 'over progress already here it asks first', bkGo.textContent);
    await w.restoreBackup();
    check(/Restored/.test(bkMsg()), 'and restores on the second tap');
    w.closeModal('albumModal');
    w.localStorage.removeItem('wt-bus');
    w.localStorage.removeItem('wt-tickets');
    w.syncAlbumRow();
    w.switchTab('share');
    w.pickDir('north');
    d.getElementById('busLabel').value = '98019';
    // A whole-route trip of 2 h 51 min, thanked three times.
    const first = cps[0], last = cps[cps.length - 1];
    const trip = () => ({ start: Date.now() - 171 * 60000, startKm: 0, others: 2, writes: 5, maxThanks: 3, polled: true });
    const end = { latitude: +last[2], longitude: +last[3] };
    w.showTicket(trip(), end);
    check(!hidden(modal) && !!d.querySelector('#tktCard svg.tktart'), 'Stop shows the ticket, with the picture of its two ends');
    check(!hidden(keepBtn) && hidden(dropBtn), 'and Keep under it, not Remove');
    check(w.localStorage.getItem('wt-tickets') === null, 'showing it keeps nothing');
    w.closeTicket();
    check(w.localStorage.getItem('wt-tickets') === null, 'and closing it without Keep leaves nothing behind');

    w.showTicket(trip(), end);
    keepBtn.click();
    const raw = w.localStorage.getItem('wt-tickets');
    const kept = JSON.parse(raw || '[]');
    check(kept.length === 1 && Object.keys(kept[0]).sort().join(',') === 'd,dir,from,st,to,ty',
      'Keep keeps one ticket, of six things', raw);
    check(kept.length === 1 && kept[0].from === first[1] && kept[0].to === last[1] && kept[0].dir === 'n' && kept[0].st.includes('full') && kept[0].ty === true,
      'the ends it was punched for, the direction, its stamps and the flower');
    check(!!raw && !/98019|\d:\d\d|171|"3"|:3[,}]/.test(raw), 'and not the bus number, a clock time, the minutes or the count', raw);
    check(/Kept/.test(keepBtn.textContent) && !hidden(row) && row.textContent.replace(/\s+/g, ' ').trim() === 'My tickets',
      'the button says so, and the sharing tab offers My tickets, still with no count beside it', row.textContent.replace(/\s+/g, ' ').trim());
    keepBtn.click();
    check(hidden(modal) && !hidden(album), 'tapped again, the button opens the album');
    const minis = d.querySelectorAll('#albumBody .tktmini');
    check(minis.length === 1 && !!minis[0].querySelector('svg.tktart'), 'which holds the kept ticket, with its picture');
    check(/1\s*ticket/.test(d.getElementById('albumBody').textContent) && !/×0/.test(d.getElementById('albumBody').textContent),
      'counts it, and prints no zero for the stamps still to collect');
    minis[0].click();
    check(!hidden(modal) && hidden(keepBtn) && !hidden(dropBtn), 'opening it shows the kept copy, with Remove where Keep was');
    const keptText = d.getElementById('tktCard').textContent.replace(/\s+/g, ' ');
    check(!/\d:\d\d|BUS 98019|\bmin\b/.test(keptText) && /Someone said salamat/.test(keptText) && !/3 riders/.test(keptText),
      'with no times, no bus number and no minutes, and a flower with no count', keptText.slice(0, 90));
    dropBtn.click();
    check(w.localStorage.getItem('wt-tickets') !== null && /again/.test(dropBtn.textContent), 'Remove asks twice');
    dropBtn.click();
    check(w.localStorage.getItem('wt-tickets') === null, 'and the second tap removes it, leaving no key behind');
    check(/No tickets yet/.test(d.getElementById('albumBody').textContent) && hidden(modal),
      'with the album back to what there is still to collect');
    w.closeModal('albumModal');
  }

  console.log('\n=== 13. the tour: a practice run on the real page ===');
  // test-tour.js reads the steps and the words; this runs both tours on the
  // booted page with every request counted, and checks the three promises a
  // practice run makes: the reader sees a practice bus and nothing real is
  // mixed in, nothing is sent but the reads the map makes anyway, and the
  // reader's own stop, filter and tab come back exactly as they were.
  {
    const w = ok.w, d = ok.d;
    const hidden = el => !el || el.className.includes('hidden');
    const walking = () => w.eval('WALK ? WALK.name + "/" + WALK.steps[WALK.i].id : null');
    w.switchTab('track'); w.pickDir(null); d.getElementById('busLabel').value = '';
    const sent = [];
    w.__sent = sent;
    w.eval('window.__sbWas = sb; sb = { rpc: function(fn){ window.__sent.push(fn); return Promise.resolve({ data: [], error: null }); } }');
    const own = cpAt(5);
    w.setMyStop('My own stop', own.lat, own.lng);
    w.setFilter('south');
    const storedStop = w.localStorage.getItem('wt-mystop');
    const storedKeys = () => Object.keys(w.localStorage).sort().join(',');
    const keysBefore = storedKeys();

    w.startWalk('watch');
    check(!hidden(d.getElementById('walk')) && walking() === 'watch/hello', 'the map tour opens over the page', walking());
    check(/PRACTICE/.test(d.getElementById('walkBubble').textContent), 'every bubble says PRACTICE');
    const chips = d.getElementById('busList').textContent.replace(/\s+/g, ' ').trim();
    check(/Practice/.test(chips) && d.querySelectorAll('#busList .buschip').length === 1, 'the list holds the practice bus and nothing else', chips);
    check(d.querySelectorAll('#trackStrip .buspill').length === 1, 'and so does the strip');
    check(w.eval('dirFilter') === 'all', 'with the reader\'s filter set aside, so the bus can be seen');
    check(w.eval('MYSTOP.name') !== 'My own stop' && /Malapit na/i.test(d.getElementById('myStop').textContent),
      'the card waits at the practice stop, and has something true to say about it', d.getElementById('myStop').textContent.replace(/\s+/g, ' ').trim().slice(0, 60));
    check(w.localStorage.getItem('wt-mystop') === storedStop, 'while the reader\'s own stop stays saved as it was');

    // Every step, forwards, by whatever the step offers: the patch where it
    // asks for a tap, Next everywhere else.
    const seen = [];
    for (let i = 0; i < 12 && walking() && walking().startsWith('watch/'); i++) {
      seen.push(walking().split('/')[1]);
      const patch = d.getElementById('walkPatch');
      // The patch is placed by measuring the page, which jsdom cannot do, so
      // its click is made here the way the button's own onclick would be.
      if (/^(bus|tab|dir)$/.test(seen[seen.length - 1]) && patch) w.walkGo(1);
      else d.getElementById('walkNext').click();
      if (walking() === 'watch/popup'){
        // Whatever reaches the popup cannot send: a salamat and a link both refuse.
        w.sayThanks(w.eval('WALK_ID'));
        w.sendBusLink(w.eval('WALK_ID'));
        w.boardBus(w.eval('WALK_ID'));
      }
    }
    check(seen.join(' ') === w.eval('walkSteps("watch", !!map).map(function(s){ return s.id; }).join(" ")'),
      'it steps through every step of the map tour in order', seen.join(' '));
    check(walking() === null && hidden(d.getElementById('walk')), 'and Done on the last one closes it');
    // Finished, the tour hangs the bell on the reader's bus, once, and says
    // where the bus is.
    const busNew = d.getElementById('busNewModal');
    const busRec = () => JSON.parse(w.localStorage.getItem('wt-bus') || 'null');
    check(!hidden(busNew) && /Kampanilya/.test(busNew.textContent) && /See my bus/.test(busNew.textContent) &&
          !!busNew.querySelector('svg.decor-art') && busRec() && busRec().tw === 1 && busRec().n === 0,
      'and finishing it puts the bell on the reader\'s bus, shown with the bus and a button to it', busNew.textContent.replace(/\s+/g, ' ').trim().slice(0, 120));
    w.closeModal('busNewModal');
    check(w.eval('MYSTOP && MYSTOP.name') === 'My own stop' && w.eval('dirFilter') === 'south',
      'the reader\'s own stop and filter are back');
    check(!/Practice/.test(d.getElementById('busList').textContent) && !d.querySelector('#trackStrip .buspill'),
      'and the practice bus is gone from the list and the strip');
    check(w.eval('ABOARD') === null && !w.sessionStorage.getItem('wt-aboard'), '"I\'m on this bus" on the practice bus chose nothing');

    // The sharing tour, ended from its ticket with the close button.
    w.startWalk('share');
    for (let i = 0; i < 10 && walking() !== 'share/ticket'; i++) {
      if (/\/(tab|dir)$/.test(walking())) w.walkGo(1); else d.getElementById('walkNext').click();
    }
    check(walking() === 'share/ticket' && !hidden(d.getElementById('tktModal')), 'the sharing tour shows the ticket a trip ends with');
    check(/PRACTICE TICKET/.test(d.getElementById('tktCard').textContent), 'named a practice one on its face');
    check(w.eval('sharing') === false && !hidden(d.getElementById('onbusSetup')), 'and nothing was started to get there');
    w.keepTicket();
    check(w.localStorage.getItem('wt-tickets') === null, 'Keep on a practice ticket keeps nothing');
    d.querySelector('#walk .walk-x').click();
    check(walking() === null && hidden(d.getElementById('tktModal')), 'the close button ends the tour and the ticket goes with it');
    check(!hidden(d.getElementById('trackView')) && w.eval('shareDir') === null && d.getElementById('busLabel').value === '',
      'back on the map tab, with no direction picked and no bus number left in the field');

    check(hidden(busNew) && busRec().ts === 0, 'a tour closed before its last step earns nothing');

    // The sharing tour to its last step: the route board, then nothing more
    // for taking it again.
    w.startWalk('share');
    for (let i = 0; i < 12 && walking(); i++) {
      if (/\/(tab|dir)$/.test(walking())) w.walkGo(1); else d.getElementById('walkNext').click();
    }
    check(walking() === null && !hidden(busNew) && /Plaka ng ruta/.test(busNew.textContent) && busRec().ts === 1,
      'finishing the sharing tour puts the route board up');
    w.closeModal('busNewModal');
    w.startWalk('watch');
    for (let i = 0; i < 14 && walking(); i++) {
      if (/^watch\/(bus|tab|dir)$/.test(walking())) w.walkGo(1); else d.getElementById('walkNext').click();
    }
    check(walking() === null && hidden(busNew), 'and a tour taken again adds nothing and says nothing');
    w.switchTab('track'); w.pickDir(null); d.getElementById('busLabel').value = '';

    check(sent.every(f => /^get_/.test(f)), 'the only requests made were the reads the map makes anyway',
      [...new Set(sent)].join(' ') || 'none');
    const added = storedKeys().split(',').filter(k => k && !keysBefore.split(',').includes(k));
    check(added.every(k => k === 'wt-guide-seen' || k === 'wt-bus') && w.localStorage.getItem('wt-mystop') === storedStop &&
          busRec().n === 0 && Object.keys(busRec()).every(k => !/time|date|when/.test(k)),
      'and nothing was kept but the guide\'s "shown around" flag and the two tours finished on the bus, no trip counted', added.join(' ') || 'nothing new');
    w.localStorage.removeItem('wt-bus');

    // The first visit's note: shown once, answered once, kept under the
    // guide's own key so the privacy panel's four things stay four.
    w.localStorage.removeItem('wt-guide-seen');
    d.getElementById('guideLink').classList.remove('seen');
    w.showWalkNew();
    check(!hidden(d.getElementById('walkNew')), 'a first visit is offered the tour');
    d.querySelector('#walkNew .x').click();
    check(hidden(d.getElementById('walkNew')) && w.localStorage.getItem('wt-guide-seen') === '1' &&
      d.getElementById('guideLink').classList.contains('seen'), 'No thanks puts it away, and the guide\'s dot with it');
    w.showWalkNew();
    check(hidden(d.getElementById('walkNew')), 'and it is not offered again');
    w.eval('sharing = true');
    w.startWalk('watch');
    check(walking() === null, 'no tour starts over a live share');
    w.eval('sharing = false');

    w.clearMyStop();
    w.setFilter('all');
    w.eval('sb = window.__sbWas');
  }

  console.log('\n=== 11. inside the Android app ===');
  // mobile/ loads this same page in a Capacitor shell, whose bridge puts the
  // native plugins on window.Capacitor.Plugins before the page's own script
  // runs. Stand in for that bridge and check the page hands the trip's GPS
  // to the background service instead of the browser, and that in a plain
  // browser nothing about sharing has changed.
  // Said once a trip is on, in its first window, since October 2026: never
  // before Start, where it was a line nobody had a reason to read yet.
  check(!ok.d.getElementById('gpsSetupHint') && !ok.d.getElementById('publicNote'),
    'nothing is said about the screen or the map before Start');
  ok.w.openTripNote(null);
  const browserHint = ok.d.getElementById('tripScreenTitle').textContent + '. ' + ok.d.getElementById('tripScreenWords').textContent;
  check(!ok.d.getElementById('tripModal').classList.contains('hidden') &&
        /^Keep the screen on\. Locking it or closing the browser stops sharing\.$/.test(browserHint) &&
        !!ok.d.querySelector('#tripArtScreen svg.tripsvg'),
    'in a browser, the trip\'s first window tells the sharer to keep the screen on, with its picture', browserHint);
  ok.w.closeModal('tripModal');

  const native = { watchers: [], removed: [], notePerms: 0, browserWatch: 0, wakeLocks: 0,
                   listeners: {}, minimized: 0, files: [], sheets: [] };
  const inApp = await run('/index.html#k=TESTKEY', () => true, 'app', null, window => {
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        BackgroundGeolocation: {
          addWatcher(opts, cb){ native.watchers.push({ opts, cb }); return 'w' + native.watchers.length; },
          removeWatcher(o){ native.removed.push(o.id); return Promise.resolve(); }
        },
        LocalNotifications: {
          requestPermissions(){ native.notePerms++; return Promise.resolve({ display: 'granted' }); },
          schedule(){ return Promise.resolve(); },
          cancel(){ return Promise.resolve(); }
        },
        App: {
          addListener(ev, fn){ native.listeners[ev] = fn; return Promise.resolve({ remove(){} }); },
          minimizeApp(){ native.minimized++; return Promise.resolve(); },
          exitApp(){ native.exited = true; return Promise.resolve(); }
        },
        Filesystem: {
          writeFile(o){ native.files.push(o); return Promise.resolve({ uri: 'file:///cache/' + o.path }); }
        },
        Share: {
          share(o){ native.sheets.push(o); return Promise.resolve({}); }
        }
      }
    };
    const fix = { coords: { latitude: 14.2912, longitude: 120.9068, speed: 0, accuracy: 8 } };
    Object.defineProperty(window.navigator, 'geolocation', { value: {
      getCurrentPosition(ok){ setTimeout(() => ok(fix), 0); },
      watchPosition(){ native.browserWatch++; return 1; },
      clearWatch(){}
    } });
    Object.defineProperty(window.navigator, 'wakeLock', { value: {
      request(){ native.wakeLocks++; return Promise.resolve({ addEventListener(){}, release(){} }); }
    } });
  });
  // Android empties sessionStorage whenever it closes the app, and in the
  // app the group chat's link opens the browser, so the app keeps the key.
  check(inApp.w.localStorage.getItem('wt-key') === 'TESTKEY' && ok.w.localStorage.getItem('wt-key') === null,
    'the app keeps the share key on the phone; a browser does not');
  inApp.w.sessionStorage.removeItem('wt-key');
  inApp.w.history.replaceState(null, '', '/index.html');
  inApp.w.eval('accessKey = null');
  check(inApp.w.resolveKey() === true && inApp.w.eval('accessKey') === 'TESTKEY',
    'so after Android closes the app, the key is still there without a link or a PIN');
  inApp.w.pickDir('north');
  inApp.w.startSharing();
  const until = Date.now() + 10000;
  while (!native.watchers.length && Date.now() < until) await new Promise(r => setTimeout(r, 50));
  check(native.watchers.length === 1, 'starting a trip adds one background GPS watcher');
  check(native.browserWatch === 0, 'and does not also start the browser\'s watchPosition');
  check(native.wakeLocks === 0, 'no screen wake lock is taken: keeping the screen on is what the app saves');
  check(native.notePerms === 1, 'notification permission is asked for, or Android 13 hides the sharing notification');
  check(!inApp.d.getElementById('tripModal').classList.contains('hidden') &&
        /^Lock the screen anytime\. Swiping the app away stops sharing\.$/.test(inApp.d.getElementById('tripScreenTitle').textContent + '. ' + inApp.d.getElementById('tripScreenWords').textContent) &&
        !!inApp.d.querySelector('#tripArtScreen svg.tripsvg') && /a4\.5 4\.5 0 0 1 9 0/.test(inApp.d.getElementById('tripArtScreen').innerHTML),
    'the trip\'s first window says the screen can lock, with the locked phone', inApp.d.getElementById('tripScreenTitle').textContent);
  check(inApp.d.getElementById('gpsAppLine').classList.contains('hidden'), 'and offers no app inside the app');
  native.listeners.backButton();
  check(inApp.d.getElementById('tripModal').classList.contains('hidden') && native.minimized === 0,
    'back closes the window, and only the window');
  check(inApp.w.sessionStorage.getItem('wt-gps') === 'w1', 'the watcher is noted for the visit, in case the page goes mid-trip');
  const w0 = native.watchers[0] && native.watchers[0].opts;
  check(!!w0 && typeof w0.backgroundMessage === 'string' && w0.backgroundMessage.length > 0,
    'the watcher carries a notification message, which is what makes it a foreground service');
  await inApp.w.stopSharing();
  check(native.removed.length === 1 && native.removed[0] === 'w1', 'Stop sharing removes that watcher',
    native.removed.join(',') || 'none removed');
  check(inApp.w.sessionStorage.getItem('wt-gps') === null, 'and stops noting it');
  inApp.w.forgetKey();
  check(inApp.w.localStorage.getItem('wt-key') === null, 'and a key the server refuses is forgotten on the phone too');

  // The back button (October 2026). Without a handler the App plugin only
  // steps back through pages, and with no plugin Android 11 and older closed
  // the app on back, which stopped a trip.
  const back = native.listeners.backButton;
  const shown = id => !inApp.d.getElementById(id).classList.contains('hidden');
  check(typeof back === 'function', 'the page answers the back button itself');
  inApp.w.openModal('privModal');
  back();
  check(!shown('privModal') && native.minimized === 0, 'back closes what is open, and only that');
  // Layers stack in page order, so the album draws over the privacy panel.
  inApp.w.openModal('privModal');
  inApp.w.openModal('albumModal');
  back();
  check(!shown('albumModal') && shown('privModal'), 'one layer at a time, the top one first');
  back();
  check(!shown('privModal'), 'then the one under it');
  inApp.w.startWalk('watch');
  back();
  check(inApp.w.eval('WALK') === null, 'back ends a tour, putting everything back');
  back();
  check(native.minimized === 1 && !native.exited, 'with nothing open it puts the app in the background, never closes it, so a trip goes on');
  inApp.w.openModal('askModal');
  back();
  check(shown('askModal') && native.minimized === 2, 'a trip question is never backed out of: it waits for its answer');
  inApp.w.closeModal('askModal');

  // A backup, and a link to a bus, go through the phone's share sheet: a
  // WebView drops a download without a word and has no navigator.share.
  await inApp.w.saveBackup();
  const saved = native.files[0], sheet = native.sheets[0];
  check(native.files.length === 1 && /^bus-tracker-backup-\d{4}-\d{2}-\d{2}\.json$/.test(saved.path) && saved.directory === 'CACHE' &&
        /"kind"\s*:\s*"bus-tracker-backup"|bus-tracker-backup|tickets/.test(saved.data),
    'the app writes the backup file to its own cache', saved && saved.path);
  check(!!sheet && sheet.files && sheet.files[0] === 'file:///cache/' + saved.path &&
        /Backup saved/.test(inApp.d.getElementById('bkMsg').textContent),
    'and hands that file to the share sheet');
  const fsPlugin = inApp.w.Capacitor.Plugins.Filesystem;
  delete inApp.w.Capacitor.Plugins.Filesystem;
  await inApp.w.saveBackup();
  check(native.files.length === 1 && native.sheets.length === 1 &&
        /cannot save a file\. Use Copy as text/.test(inApp.d.getElementById('bkMsg').textContent),
    'an older app with no way to save a file says so, instead of a "Saved" that never happened');
  inApp.w.Capacitor.Plugins.Filesystem = fsPlugin;
  const shareOk = inApp.w.Capacitor.Plugins.Share.share;
  inApp.w.Capacitor.Plugins.Share.share = () => Promise.reject(new Error('Share canceled'));
  inApp.w.bkSay('');
  await inApp.w.saveBackup();
  check(inApp.d.getElementById('bkMsg').textContent === '', 'closing the share sheet says nothing, as a choice not an error');
  inApp.w.Capacitor.Plugins.Share.share = () => Promise.reject(new Error('No app can take it'));
  await inApp.w.saveBackup();
  check(/Could not save the file\. Use Copy as text/.test(inApp.d.getElementById('bkMsg').textContent),
    'and a sheet that fails says the file was not saved');
  inApp.w.Capacitor.Plugins.Share.share = shareOk;
  await inApp.w.sendBusLink('ab'.repeat(16));
  const linkSheet = native.sheets[native.sheets.length - 1];
  check(native.sheets.length === 2 && /#b=(ab){16}$/.test(linkSheet.url) && !linkSheet.files,
    'a link to a bus opens the share sheet too');
  inApp.w.close();

  // A page left mid-trip inside the app (the guide is a tap away) leaves the
  // plugin's watcher running, notification and all, for a page that has
  // gone. The next page to open lets it go.
  const orphan = { removed: [] };
  const back2 = await run('/index.html', () => true, 'app-again', null, window => {
    window.Capacitor = { isNativePlatform: () => true, Plugins: {
      BackgroundGeolocation: { addWatcher(){ return 'w1'; }, removeWatcher(o){ orphan.removed.push(o.id); return Promise.resolve(); } }
    } };
    window.sessionStorage.setItem('wt-gps', 'w7');
  });
  check(orphan.removed.join(',') === 'w7' && back2.w.sessionStorage.getItem('wt-gps') === null,
    'a watcher left running by a page that went mid-trip is let go when the next one opens', orphan.removed.join(',') || 'none');
  back2.w.close();

  console.log('\n=== 14. a trip: what it sends, what it shows, and every way it ends ===');
  // The real sharing code, driven with a stand-in for the GPS and for
  // Supabase, and held to what a review in October 2026 found: speed was
  // sent though nothing used it; every GPS fix was a read; a failed write
  // swapped Stop for Start, and that Start leaked a GPS watch Stop never
  // ended; a changed key was retried for ever; the session id, and so the
  // bus's public id, outlived the trip; and one row with no position stopped
  // the bus list drawing for everybody.
  {
    const sim = { calls: [], reply: {}, watches: [], cleared: [] };
    const here = { coords: { latitude: 14.2912, longitude: 120.9068, speed: 12.3, accuracy: 8 } };
    const pause = ms => new Promise(r => setTimeout(r, ms));
    const waitFor = async (f, ms = 5000) => {
      const end = Date.now() + ms;
      while (!f() && Date.now() < end) await pause(20);
      return f();
    };
    const json = (body, status) => new Response(JSON.stringify(body),
      { status: status || 200, headers: { 'content-type': 'application/json' } });
    sim.reply.get_settings = () => ({ data: { settings: {}, notice: null } });
    sim.reply.get_positions = () => ({ data: [] });
    sim.reply.get_sightings = () => ({ data: [] });
    const t = await run('/index.html#k=TESTKEY', () => true, 'trip', null, window => {
      const passOn = window.fetch;
      window.fetch = function(u, o){
        const m = String(u).match(/\/rest\/v1\/rpc\/([a-z_]+)/);
        if (!m) return passOn(u, o);
        let args = {};
        try { args = JSON.parse((o && o.body) || '{}'); } catch (e) {}
        sim.calls.push({ fn: m[1], args });
        // A call held back, like a request at the end of the line that has
        // not been answered yet; let go with sim.hold[fn].forEach(f => f()).
        if (sim.hold && sim.hold[m[1]]) return new Promise(r => sim.hold[m[1]].push(() => r(new Response(null, { status: 204 }))));
        const r = sim.reply[m[1]] ? sim.reply[m[1]](args) : null;
        if (r && r.error) return Promise.resolve(json({ code: 'P0001', message: r.error, details: null, hint: null }, 400));
        return Promise.resolve(r && 'data' in r ? json(r.data) : new Response(null, { status: 204 }));
      };
      Object.defineProperty(window.navigator, 'geolocation', { value: {
        getCurrentPosition(ok){ setTimeout(() => ok(here), 0); },
        watchPosition(onPos, onErr){ sim.watches.push({ onPos, onErr }); return sim.watches.length; },
        clearWatch(id){ sim.cleared.push(id); }
      } });
      Object.defineProperty(window.navigator, 'wakeLock', { value: {
        request(){ return Promise.resolve({ addEventListener(){}, release(){} }); }
      } });
    });
    const { w, d } = t;
    const of = fn => sim.calls.filter(c => c.fn === fn);
    const isHidden = id => d.getElementById(id).classList.contains('hidden');
    const status = () => d.getElementById('onbusStatusText').textContent;
    const watchesOpen = () => sim.watches.length - sim.cleared.length;
    // A trip: Start, then wait for the first write to land.
    const startTrip = async () => {
      const before = of('set_keyed_position').length;
      w.startSharing();
      await waitFor(() => of('set_keyed_position').length > before);
      await pause(60);
      return of('set_keyed_position')[before];
    };
    // A fix that is written straight away, rather than after the 5 seconds
    // the page waits between writes.
    const writeNow = async () => {
      const before = of('set_keyed_position').length;
      w.eval('lastWrite = 0');
      sim.watches[sim.watches.length - 1].onPos(here);
      await waitFor(() => of('set_keyed_position').length > before);
      await pause(60);
    };

    // An empty map inside hours says that and nothing else (October 2026):
    // its I'm on the bus button went, as its second line had before it.
    await waitFor(() => w.eval('positionsLoaded') === true);
    w.renderBuses();
    const emptyNote = d.getElementById('mapNote');
    check(!isHidden('mapNote') && emptyNote.textContent.replace(/\s+/g, ' ').trim() === 'Nobody is sharing right now' &&
          !emptyNote.querySelector('button, .s') && !emptyNote.classList.contains('scene'),
      'an empty map inside hours says only that nobody is sharing right now: no button, no second line',
      emptyNote.textContent.replace(/\s+/g, ' ').trim());

    w.pickDir('north');
    w.switchTab('share');
    const first = await startTrip();
    check(!!first && watchesOpen() === 1, 'a trip starts with one write and one GPS watch',
      `${of('set_keyed_position').length} writes, ${watchesOpen()} watches`);
    // Sent as null rather than left out: PostgREST finds the function by its
    // argument names, so a missing p_speed would match nothing.
    check(!!first && first.args.p_speed === null,
      'the GPS reported a speed, and none was sent', first && JSON.stringify(first.args.p_speed));

    // Every fix used to fetch get_positions, past the 18 second throttle.
    const readsBefore = of('get_positions').length;
    for (let i = 0; i < 10; i++) sim.watches[0].onPos(here);
    await pause(150);
    check(of('get_positions').length - readsBefore <= 1, 'ten GPS fixes cost no extra reads',
      `${of('get_positions').length - readsBefore} reads for 10 fixes`);

    // A write that fails mid-trip: an error to read, not the end of the trip.
    sim.reply.set_keyed_position = () => ({ error: 'upstream timed out' });
    await writeNow();
    check(w.eval('sharing') === true, 'a failed write does not end the trip');
    check(!isHidden('onbusActive') && isHidden('onbusSetup'),
      'and Stop stays on screen, with no Start beside it');
    check(/No connection/.test(status()), 'the status says the write failed', status());
    sim.watches[0].onPos(here);
    check(/No connection/.test(status()), 'and the next GPS fix does not paper over it with "Sharing live"', status());
    w.startSharing();
    await pause(80);
    check(watchesOpen() === 1 && sim.watches.length === 1, 'a second Start mid-trip opens no second GPS watch',
      `${sim.watches.length} started, ${sim.cleared.length} ended`);
    delete sim.reply.set_keyed_position;
    await writeNow();
    check(/^Sharing live: ▲ northbound$/.test(status()), 'the first write to land puts "Sharing live" back', status());

    // Stop: the watch ends, the bus is cleared, and the session goes with the trip.
    const trip1 = first.args.p_session;
    await w.stopSharing();
    check(watchesOpen() === 0, 'Stop ends the only GPS watch there was', `${watchesOpen()} still open`);
    check(of('clear_bus_position').some(c => c.args.p_session === trip1), 'and clears that trip\'s bus');
    check(w.sessionStorage.getItem('wt-session') === null, 'and forgets its session id');
    const second = await startTrip();
    check(!!second && second.args.p_session !== trip1,
      'so the next trip is a different session, and a different bus on the map');
    await w.stopSharing();

    // The trip's first window (October 2026): what were two lines under
    // Start, said once a trip is on, with a picture each, for a sharer's
    // first few trips. Its first line is true because of the saved stop's
    // guard: arriving at the stop asks, and sharing stops there.
    {
      const stopWords = () => d.getElementById('tripStopWords').textContent;
      w.localStorage.removeItem('wt-bus');
      await startTrip();
      check(!isHidden('tripModal') && /^Tap Stop when you get off/.test(d.querySelector('#tripModal .triptxt').textContent.trim()) &&
            /^Or set your stop, and sharing stops there by itself\.$/.test(stopWords()) && !isHidden('tripStopBtn') &&
            !!d.querySelector('#tripArtStop svg.tripsvg') && !!d.querySelector('#tripArtScreen svg.tripsvg'),
        'a new sharer\'s trip opens a window: tap Stop, or set your stop and sharing stops there, a picture each', stopWords());
      d.getElementById('tripStopBtn').click();
      check(isHidden('tripModal') && !isHidden('stopModal') && /Where do you get off\?/.test(d.getElementById('stopTitle').textContent),
        'its button opens the stop picker, which asks where you get off', d.getElementById('stopTitle').textContent);
      w.closeModal('stopModal');
      await w.stopSharing();
      check(/Where do you wait\?/.test((w.openStopPicker(), d.getElementById('stopTitle').textContent)),
        'and off the bus it asks where you wait again');
      w.closeModal('stopModal');

      // Monterey is 1.4 km up the road from here, northbound: well ahead.
      w.setMyStop('Monterey', 14.3040, 120.9100);
      await startTrip();
      check(!isHidden('tripModal') && stopWords() === 'Or sharing stops by itself at Monterey.' && isHidden('tripStopBtn'),
        'with a saved stop ahead, it says where sharing stops by itself, and asks for nothing', stopWords());
      w.closeModal('tripModal');
      const gps = sim.watches[sim.watches.length - 1];
      gps.onPos(here);
      check(isHidden('askModal'), 'nothing is asked on the way');
      gps.onPos({ coords: { latitude: 14.3040, longitude: 120.9100, speed: 0, accuracy: 8 } });
      check(!isHidden('askModal') && /^Getting off here\?$/.test(d.getElementById('askTitle').textContent) &&
            /^At Monterey\. Sharing stops in a minute\.$/.test(d.getElementById('askBody').textContent),
        'arriving at it asks, and says sharing stops in a minute', d.getElementById('askBody').textContent);
      const clears = of('clear_bus_position').length;
      w.askYes();
      await waitFor(() => of('clear_bus_position').length > clears);
      check(!w.eval('sharing') && watchesOpen() === 0 && isHidden('askModal'), 'and Stop sharing in it ends the trip there');
      w.clearMyStop();

      // A regular's Start goes straight to the road.
      w.localStorage.setItem('wt-bus', JSON.stringify({ n: 3 }));
      await startTrip();
      check(isHidden('tripModal') && w.eval('sharing') === true, 'from the fourth trip that counted, no window: Start is all it takes');
      await w.stopSharing();
      w.localStorage.removeItem('wt-bus');

      // Going for the app from the window ends this page's trip, so the app's
      // own trip is not a second bus beside it.
      const app = await startTrip();
      const gone = of('clear_bus_position').length;
      w.leaveForApp();
      await waitFor(() => of('clear_bus_position').length > gone && /Start it in the app/.test(status()));
      check(!w.eval('sharing') && isHidden('tripModal') && of('clear_bus_position').slice(gone).some(c => c.args.p_session === app.args.p_session) &&
            /^Not sharing here\. Start it in the app\.$/.test(status()),
        'going for the app ends this page\'s trip and takes its bus off the map, and says where to start it', status());
      w.closeTicket();
    }

    // Outside the route area the server keeps the bus for this phone alone
    // and answers 'private' (sql/14-off-route-private.sql). That is not a
    // failure: the trip goes on and the status line says who can see the
    // bus. It is how sharing works, and is reviewed, from anywhere. Nor is
    // it a bus on the map, so it is not counted towards a ticket.
    {
      sim.reply.set_keyed_position = () => ({ data: 'private' });
      await startTrip();
      check(w.eval('sharing') === true && /Only you can see this bus/.test(status()),
        'a bus kept for this phone alone is a trip, and says who can see it', status());
      check(d.getElementById('onbusDot').className.indexOf('err') < 0, 'not as an error');
      check(w.eval('TRIP.writes') === 0, 'and is not counted as a write that reached the map',
        String(w.eval('TRIP.writes')));
      sim.watches[sim.watches.length - 1].onPos(here);
      check(/Only you can see this bus/.test(status()), 'the next GPS fix does not say "Sharing live" over it', status());
      sim.reply.set_keyed_position = () => ({ data: null });
      await writeNow();
      check(/^Sharing live: ▲ northbound$/.test(status()) && w.eval('TRIP.writes') === 1,
        'inside the area the same trip is live, and counted', status());
      sim.reply.set_keyed_position = () => ({ data: 'private' });
      await writeNow();
      check(/Only you can see this bus/.test(status()), 'and outside it again, private again', status());
      await w.stopSharing();
      delete sim.reply.set_keyed_position;
      await startTrip();
      check(/^Sharing live/.test(status()), 'the next trip starts as any other', status());
      await w.stopSharing();
    }

    // Stop near the stop you get off at, with the buzz on. Found filming the
    // showcase video: the bus just left stayed in BUSES until the next poll,
    // so the card, back to waiting, counted it as one coming to that very
    // stop, said Sakay na! and buzzed. And a poll answered before the clear
    // lands brings the same bus back, no longer marked as this phone's.
    {
      // The card's buzz is a pattern; the trip's start is one short tick, not counted.
      const buzzes = [];
      Object.defineProperty(w.navigator, 'vibrate', { value: p => { if (Array.isArray(p)) buzzes.push(p); return true; }, configurable: true });
      w.sessionStorage.setItem('wt-buzz', '1');
      w.setMyStop('Monterey', 14.3040, 120.9100);
      await startTrip();
      const mineRow = selfFlag => ({ data: [{ pub_id: 'cd'.repeat(16), lat: 14.2912, lng: 120.9068, direction: 'north',
        bus_label: '', updated_at: new Date().toISOString(), is_self: selfFlag, thanks: 0, look: null }] });
      sim.reply.get_positions = () => mineRow(true);
      w.eval('lastPositionsAt = 0');
      await w.pollPositions();
      check(buzzes.length === 1 && /Bababa na!/.test(d.getElementById('tripStop').textContent),
        'riding to the next stop, the card says Bababa na! and buzzes once', buzzes.length + ' buzzes');
      await w.stopSharing();
      check(buzzes.length === 1, 'Stop buzzes nothing more', buzzes.length + ' buzzes');
      check(!/Sakay na!/.test(d.getElementById('myStop').textContent) && !w.eval('BUSES').some(b => b.self),
        'and the card does not count the bus just left as one coming', d.getElementById('myStop').textContent.slice(0, 80));
      sim.reply.get_positions = () => mineRow(false);
      w.eval('lastPositionsAt = 0');
      await w.pollPositions();
      check(buzzes.length === 1 && !w.eval('BUSES').some(b => b.pub_id === 'cd'.repeat(16)),
        'nor when a poll brings it back before the clear has landed', buzzes.length + ' buzzes');
      sim.reply.get_positions = () => ({ data: [] });
      w.clearMyStop();
      w.sessionStorage.removeItem('wt-buzz');
      delete w.navigator.vibrate;
    }

    // An organiser's Stop is the one end that keeps the session, because the
    // block is on it.
    // Stopped half an hour in, it is also the one end without a ticket.
    const blocked = await startTrip();
    w.eval('TRIP.start -= 30 * 60000');
    sim.reply.set_keyed_position = () => ({ error: 'session blocked' });
    w.eval('lastWrite = 0');
    sim.watches[sim.watches.length - 1].onPos(here);
    await waitFor(() => w.eval('sharing') === false);
    check(!w.eval('sharing') && watchesOpen() === 0, 'a blocked session ends the trip and its watch');
    check(isHidden('tktModal'), 'and draws no ticket, however long it was on the map: a bus an organizer took off is not thanked for it');
    check(w.sessionStorage.getItem('wt-session') === blocked.args.p_session,
      'and keeps its session id, so the block holds on this phone');
    const again = await startTrip();
    check(!!again && again.args.p_session === blocked.args.p_session, 'the next Start is still that session');
    await waitFor(() => w.eval('sharing') === false);

    // A route already full: the trip ends rather than failing every 5 seconds.
    sim.reply.set_keyed_position = () => ({ error: 'too many active sessions' });
    await startTrip();
    await waitFor(() => w.eval('sharing') === false);
    check(!w.eval('sharing') && watchesOpen() === 0 && isHidden('onbusActive') && !isHidden('onbusSetup'),
      'a full route ends the trip, and Start comes back for trying later');
    check(/Too many sharing/.test(status()), 'saying why', status());
    check(w.eval('accessKey') === 'TESTKEY', 'and the key is kept, since nothing is wrong with it');

    // A changed key: dropped everywhere it was kept, so the next Start asks.
    // Returned, not raised, as the server does, so the count of wrong PINs
    // is not rolled back with an error (sql/12-share-pin.sql).
    sim.reply.set_keyed_position = () => ({ data: 'invalid key' });
    await startTrip();
    await waitFor(() => w.eval('sharing') === false);
    check(!w.eval('sharing') && watchesOpen() === 0, 'a key the server has refused ends the trip');
    check(w.eval('accessKey') === null && w.sessionStorage.getItem('wt-key') === null && !/k=/.test(w.location.hash),
      'and is forgotten, from memory, the tab\'s storage and the address bar',
      `accessKey=${w.eval('accessKey')} hash=${w.location.hash}`);
    check(/key has changed/.test(status()), 'saying so', status());
    w.startSharing();
    check(!isHidden('gate'), 'the next Start asks for the new key');
    // The key only ever arrives inside a link, so a pasted link has to work.
    sim.reply.check_share_key = () => ({ data: 'ok' });
    d.getElementById('gateKey').value = 'https://community-bus-tracker.netlify.app/#k=NEW-KEY-456';
    await w.submitKey();
    check(of('check_share_key').slice(-1)[0].args.p_key === 'NEW-KEY-456' && w.eval('accessKey') === 'NEW-KEY-456',
      'and a whole pasted link is taken for the key in it', of('check_share_key').slice(-1)[0].args.p_key);
    check(of('check_share_key').slice(-1)[0].args.p_slug === w.eval('CFG.ROUTE_SLUG') && of('route_exists').length === 0,
      'checked with the route\'s slug, so a wrong PIN counts against it, and never by route_exists');

    // A PIN (sql/12-share-pin.sql): a number pad, a wrong one said in plain
    // words, and a route paused by somebody guessing ends the trip without
    // retrying, keeping the PIN.
    sim.reply.get_settings = () => ({ data: { settings: {}, share_pin: true, notice: null } });
    await w.pollSettings();
    check(d.getElementById('gateKey').getAttribute('inputmode') === 'numeric' && d.getElementById('gateKey').placeholder === 'PIN',
      'a route whose key is a PIN gets a number pad at the gate');
    sim.reply.check_share_key = () => ({ data: 'invalid key' });
    check(await w.tryKey('0000') === false && /not recognized/.test(d.getElementById('gateErr').textContent),
      'a wrong PIN is refused at the gate', d.getElementById('gateErr').textContent);
    sim.reply.check_share_key = () => ({ data: 'too many tries' });
    check(await w.tryKey('0001') === false && /paused/i.test(d.getElementById('gateErr').textContent),
      'and a paused route says so, rather than calling the PIN wrong', d.getElementById('gateErr').textContent);
    w.closeModal('gate');
    sim.reply.check_share_key = () => ({ data: 'ok' });
    sim.reply.set_keyed_position = () => ({ data: 'too many tries' });
    const pausedTrip = await startTrip();
    await waitFor(() => w.eval('sharing') === false);
    check(!!pausedTrip && pausedTrip.args.p_slug === w.eval('CFG.ROUTE_SLUG') && pausedTrip.args.p_key === 'NEW-KEY-456',
      'a keyed trip sends the slug with the key', pausedTrip && JSON.stringify(pausedTrip.args));
    check(!w.eval('sharing') && watchesOpen() === 0 && /paused/i.test(status()),
      'a paused route ends the trip and says why', status());
    check(w.eval('accessKey') === 'NEW-KEY-456', 'and keeps the PIN, since nothing is wrong with it');
    sim.reply.get_settings = () => ({ data: { settings: {}, share_pin: false, notice: null } });
    await w.pollSettings();
    check(d.getElementById('gateKey').getAttribute('inputmode') === 'text', 'a long key gets the keyboard back');
    delete sim.reply.set_keyed_position;

    // GPS that drops out is waited out, not obeyed: a timeout or no fix
    // leaves the trip running and says so, and the next fix puts it back.
    const lost = await startTrip();
    const clearsBefore = of('clear_bus_position').length;
    const clearedSince = () => of('clear_bus_position').slice(clearsBefore)
      .some(c => c.args.p_session === lost.args.p_session);
    sim.watches[sim.watches.length - 1].onErr({ code: 3 });
    await pause(60);
    check(w.eval('sharing') === true && watchesOpen() === 1 && !clearedSince(),
      'a GPS timeout does not end the trip or take the bus off the map');
    check(/GPS lost/.test(status()) && !isHidden('onbusActive'),
      'the status says the signal is lost, with Stop still on screen', status());
    check(w.eval('gpsLostAt') !== null, 'and the heartbeat holds back the old fix while it is lost');
    await writeNow();
    check(w.eval('gpsLostAt') === null && /^Sharing live/.test(status()),
      'the first fix back puts "Sharing live" back', status());

    // GPS that never comes back is waited out for as long as the server
    // would keep the bus anyway, then ends the trip the way Stop does: the
    // bus is cleared now, not left on everyone's map until it expires.
    w.eval('SET.bus_expiry_min = 0.002');
    sim.watches[sim.watches.length - 1].onErr({ code: 2 });
    await waitFor(clearedSince);
    await pause(60);
    check(clearedSince(), 'GPS that never comes back ends the trip and clears the bus from the map');
    check(!w.eval('sharing') && watchesOpen() === 0 && /No GPS signal/.test(status()),
      'ends the trip, and says why', status());
    check(w.sessionStorage.getItem('wt-session') === null, 'and the next trip gets a session of its own');
    check(isHidden('tktModal'), 'a trip that lost its GPS in its first minute gets no ticket: too short to have helped anyone');
    w.eval('SET.bus_expiry_min = 10');

    // Location switched off is the one GPS error that ends a trip at once.
    const off = await startTrip();
    const offCleared = of('clear_bus_position').length;
    sim.watches[sim.watches.length - 1].onErr({ code: 1 });
    await waitFor(() => of('clear_bus_position').slice(offCleared).some(c => c.args.p_session === off.args.p_session));
    await pause(60);
    check(!w.eval('sharing') && watchesOpen() === 0 && /Location is off/.test(status()),
      'location switched off ends the trip straight away, and says why', status());

    // A hidden page gets no GPS, and no error either: browsers hold every fix
    // back until the page is on screen again and pause the watch's timeout.
    // The heartbeat used to fill that silence with the last fix, so a bus that
    // had driven on looked live, standing where the screen went off.
    {
      await startTrip();
      const setHidden = hidden => {
        Object.defineProperty(d, 'hidden', { value: hidden, configurable: true });
        Object.defineProperty(d, 'visibilityState', { value: hidden ? 'hidden' : 'visible', configurable: true });
        d.dispatchEvent(new w.Event('visibilitychange'));
      };
      const writes = () => of('set_keyed_position').length;
      // The heartbeat, asked now rather than in 21 seconds: how many writes it sent.
      const beat = async () => {
        const before = writes();
        w.eval('lastWrite = 0');
        w.tripHeartbeat();
        await waitFor(() => writes() > before, 500);
        return writes() - before;
      };
      check(await beat() === 1, 'on screen, the heartbeat re-sends the last fix of a bus standing still');
      setHidden(true);
      check(await beat() === 0 && w.eval('sharing') === true,
        'hidden, it sends nothing, and the trip carries on: the last fix is no longer known to be true');
      setHidden(false);
      check(await beat() === 0, 'back on screen, it waits for a fresh fix');
      await writeNow();
      check(await beat() === 1, 'and carries on once one arrives');

      // Answering a trip question puts the bus back with the last fix, but
      // not with one from before the page was hidden.
      w.onWrongDirection({});
      setHidden(true);
      setHidden(false);
      const before = writes();
      w.askNo();
      await pause(150);
      check(writes() === before && w.eval('guardPaused') === false,
        'a question answered after the screen was off sends no old fix', `${writes() - before} writes`);
      await writeNow();
      check(writes() > before, 'the next fix puts the bus back');

      // The app's GPS keeps going with the screen locked, so there the last
      // fix stays good.
      w.Capacitor = { isNativePlatform: () => true, Plugins: { BackgroundGeolocation: {} } };
      setHidden(true);
      check(await beat() === 1, 'in the Android app, whose GPS runs with the screen locked, a hidden page changes nothing');
      setHidden(false);
      delete w.Capacitor;
      delete d.hidden; delete d.visibilityState;
      await w.stopSharing();
    }

    // Half an hour on the map without going anywhere, the bus waiting at the
    // terminal with sharing on, then Stop where it started: no ticket.
    await startTrip();
    w.eval('TRIP.start -= 30 * 60000');
    await w.stopSharing();
    check(isHidden('tktModal') && !w.eval('sharing'),
      'half an hour on the map that ends where it started gets no ticket: it went under a kilometre along the route');

    // Half an hour in and three kilometres down the road, it gets the ticket
    // Stop would have given, and does not wait for the network to give it:
    // at the end of the line the request that takes the bus off the map can
    // be slow to answer.
    await startTrip();
    w.eval('TRIP.start -= 30 * 60000; TRIP.startKm -= 3');
    sim.hold = { clear_bus_position: [] };
    sim.watches[sim.watches.length - 1].onErr({ code: 1 });
    await waitFor(() => !isHidden('tktModal') && sim.hold.clear_bus_position.length > 0);
    check(!isHidden('tktModal') && /map for\s*30 min/.test(d.getElementById('tktCard').textContent),
      'a half-hour trip whose GPS gave up gets its ticket', d.getElementById('tktCard').textContent.replace(/\s+/g, ' ').slice(0, 160));
    check(sim.hold.clear_bus_position.length === 1, 'drawn while the bus is still being taken off the map, not after');
    sim.hold.clear_bus_position.forEach(f => f());
    delete sim.hold;
    await waitFor(() => /Location is off/.test(status()));
    check(!w.eval('sharing') && /Location is off/.test(status()),
      'and under it, the status says why the trip ended', status());
    w.closeTicket();

    // The trip outlives its page. While it runs it is kept as wt-trip, and a
    // page opened again with one there carries on or hands over the ticket.
    {
      const live = await startTrip();
      const kept = JSON.parse(w.localStorage.getItem('wt-trip') || 'null');
      check(!!kept && kept.session === live.args.p_session && kept.dir === 'north' && kept.trip.writes >= 1 &&
            typeof kept.trip.lastKm === 'number' && !Array.isArray(kept.trip.lastKm),
        'a running trip is kept on the phone: its record, its session and its direction', JSON.stringify(kept));
      await w.stopSharing();
      check(w.localStorage.getItem('wt-trip') === null, 'and the record goes when the trip does');
      w.closeTicket();

      const askShown = () => !isHidden('askModal') && /Still on the bus/.test(d.getElementById('askTitle').textContent);
      const seed = (o) => {
        const rec = Object.assign({ session: 'reloaded-' + Math.random().toString(36).slice(2), dir: 'north', label: '98019',
          trip: { start: Date.now() - 30 * 60000, startKm: 0, others: 1, writes: 40, maxThanks: 2, polled: true,
                  lastAt: Date.now() - 60000, lastKm: 3 } }, o || {});
        w.localStorage.setItem('wt-trip', JSON.stringify(rec));
        return rec;
      };

      // Reloaded a minute ago, in this tab: asked, and Keep sharing carries
      // on as the same trip and the same bus.
      let rec = seed();
      w.sessionStorage.setItem('wt-session', rec.session); w.eval('sessionId = null');
      w.recoverTrip();
      check(askShown() && /minute ago/.test(d.getElementById('askBody').textContent),
        'a page opened on a trip whose bus is still on the map asks whether you are still on the bus', d.getElementById('askBody').textContent);
      const before = of('set_keyed_position').length;
      w.askYes();
      await waitFor(() => of('set_keyed_position').length > before);
      await pause(60);
      const resumed = of('set_keyed_position')[before];
      check(!!resumed && resumed.args.p_session === rec.session && w.eval('TRIP.start') === rec.trip.start,
        'Keep sharing goes on as the same trip, on the same bus', resumed && resumed.args.p_session);
      check(isHidden('tripModal'), 'and opens no window: it is not a new trip');
      check(w.eval('TRIP.writes') === 41 && w.eval('TRIP.maxThanks') === 2, 'with everything it had counted so far');
      await w.stopSharing();
      check(!isHidden('tktModal') && /map for\s*30 min/.test(d.getElementById('tktCard').textContent),
        'and its ticket at Stop counts from when it really started');
      // Your bus: a trip that went somewhere is counted, kept or not, and
      // its ticket says what that put on the bus.
      const bus = () => JSON.parse(w.localStorage.getItem('wt-bus') || 'null');
      check(!!bus() && bus().n === 1 && /New on your bus: Sampaguita/.test(d.getElementById('tktCard').textContent),
        'the first trip that went somewhere counts on your bus, and the ticket shows the garland it earned', JSON.stringify(bus()));
      check(!!d.querySelector('#tktCard .tkt-new svg.mybus') && !isHidden('albumRow'),
        'with the bus drawn beside it, and My tickets offered for it though nothing was kept');
      w.closeTicket();

      // I got off: the bus comes off the map, and the ticket is the trip as
      // it stood when the page closed.
      rec = seed({ trip: { start: Date.now() - 41 * 60000, startKm: 0, others: 0, writes: 30, maxThanks: 0, polled: true,
                           lastAt: Date.now() - 3 * 60000, lastKm: 3 } });
      w.sessionStorage.setItem('wt-session', rec.session); w.eval('sessionId = null');
      w.recoverTrip();
      check(askShown(), 'asked again for the next one');
      const clears = of('clear_bus_position').length;
      w.askNo();
      await waitFor(() => of('clear_bus_position').length > clears);
      check(of('clear_bus_position').slice(clears).some(c => c.args.p_session === rec.session),
        'I got off takes that bus off the map');
      const card = d.getElementById('tktCard').textContent;
      check(!isHidden('tktModal') && /map for\s*38 min/.test(card),
        'and hands over its ticket, ending when its last update landed', card.replace(/\s+/g, ' ').slice(0, 200));
      check(w.localStorage.getItem('wt-trip') === null && w.sessionStorage.getItem('wt-session') === null && !w.eval('sharing'),
        'leaving no record, no session and no trip behind');
      check(bus().n === 2 && !/New on your bus/.test(card), 'counted on your bus too, with nothing new to say');
      w.closeTicket();

      // Too old for its bus to be on the map: no question, just the ticket.
      rec = seed({ trip: { start: Date.now() - 5 * 3600000, startKm: 0, others: 0, writes: 90, maxThanks: 1, polled: true,
                           lastAt: Date.now() - 3 * 3600000, lastKm: 3 } });
      w.recoverTrip();
      check(isHidden('askModal') && !isHidden('tktModal') && w.localStorage.getItem('wt-trip') === null,
        'a trip whose bus has long left the map gets its ticket without a question');
      check(bus().n === 3 && /New on your bus: Mud flaps/.test(d.getElementById('tktCard').textContent), 'and the third trip puts the mud flaps on');
      const all = (d.querySelector('#tktCard .tkt-all') || {}).textContent || '';
      check(/^In all: \d+ h on the map · 3 salamat$/.test(all) && bus().ty === 3 && bus().mins > 0 && bus().streak === 1,
        'and the ticket says what the bus has gathered in all: time on the map and salamat, no streak of one', all);
      w.closeTicket();
      w.openAlbum();
      const albumText = d.getElementById('albumBody').textContent;
      check(/Your bus3 trips shared/.test(albumText) && d.querySelectorAll('#albumBody .alb-decor li.on').length === 2 &&
            /not yet/.test(albumText) && !/\b0 of\b|×0/.test(albumText) && /No tickets yet/.test(albumText),
        'My tickets shows the bus, what is on it and what is still to come, and no zeros, with nothing kept', albumText.slice(0, 120));
      w.closeModal('albumModal');

      // The garage (rules 17 to 19). Parts in hand, getting something takes two
      // taps; the bus already wears trophies, so My tickets asks whether to
      // show it, once; and a trip then carries its look.
      const shopBefore = bus();
      check(shopBefore.paid.join(',') === 'sampaguita,flaps' && shopBefore.c > 0,
        'trips that won trophies paid them as they ended', JSON.stringify({ paid: shopBefore.paid, c: shopBefore.c }));
      // As if the trophies had been won before there were parts.
      w.localStorage.setItem('wt-bus', JSON.stringify(Object.assign({}, shopBefore, { c: 40, paid: [] })));
      w.openAlbum();
      // Opening My tickets pays any trophy earned and not yet paid: here the
      // garland and the mud flaps, won before this visit.
      const cOpen = bus().c;
      check(cOpen === 40 + 10 + 10 && bus().paid.join(',') === 'sampaguita,flaps', 'opening My tickets pays the trophies not yet paid, once', String(cOpen));
      const buyDice = () => d.querySelector('#albumBody [data-buy="dice"]');
      buyDice().click();
      check(/Tap again/.test(buyDice().textContent) && bus().own.length === 0 && bus().c === cOpen, 'the first tap on Buy only asks');
      buyDice().click();
      check(bus().own.includes('dice') && bus().c === cOpen - 10 && !d.querySelector('#albumBody [data-buy="dice"]') &&
            /Take off/.test(d.querySelector('#albumBody .alb-shop li.on').textContent),
        'the second gets the dice, for 10 parts, and puts them on', JSON.stringify({ own: bus().own, c: bus().c }));
      const lookq = d.querySelector('#albumBody .lookq');
      check(!!lookq && lookq.querySelector('b').textContent === 'Show customized bus to riders?' &&
            lookq.textContent.replace(/Show it|Not now/g, '').trim() === 'Show customized bus to riders?',
        'with something on the bus and nothing asked yet, My tickets asks whether to show it, in one line and nothing more');
      lookq.querySelector('.lookq-yes').click();
      check(bus().show === 1 && bus().asked === 1 && !!d.querySelector('#albumBody .alb-show .alb-toggle.on') && !d.querySelector('#albumBody .lookq'),
        'Show it turns showing on, and a switch takes the question\'s place');
      w.closeModal('albumModal');
      const lookNow = w.eval('busLook(loadBus(), CHECKPOINTS)');
      const shown = await startTrip();
      check(!!shown && shown.args.p_look === lookNow && /^[0-9][A-Za-z]+$/.test(lookNow) && lookNow.includes('F'),
        'a trip then carries the bus\'s look with its position', shown && shown.args.p_look);
      w.setShowBus(0);
      await writeNow();
      const plainWrite = of('set_keyed_position').slice(-1)[0];
      check(!('p_look' in plainWrite.args), 'switched off, the next position goes without it');
      w.setShowBus(1);
      // A database from before sql/13-bus-look.sql: refused, sent again without.
      sim.reply.set_keyed_position = args => ('p_look' in args)
        ? { error: 'Could not find the function public.set_keyed_position(p_direction, p_key, p_label, p_lat, p_lng, p_look, p_session, p_slug, p_speed) in the schema cache' }
        : null;
      const n0 = of('set_keyed_position').length;
      w.eval('lastWrite = 0');
      sim.watches[sim.watches.length - 1].onPos(here);
      await waitFor(() => of('set_keyed_position').length >= n0 + 2);
      await pause(60);
      const pair = of('set_keyed_position').slice(n0);
      check(pair.length === 2 && 'p_look' in pair[0].args && !('p_look' in pair[1].args) && w.eval('LOOK_SENDS') === false &&
            /^Sharing live/.test(status()),
        'a database that does not know the look gets the same position again without it, and the trip goes on', status());
      await writeNow();
      check(!('p_look' in of('set_keyed_position').slice(-1)[0].args), 'and no look is sent for the rest of the visit');
      delete sim.reply.set_keyed_position;
      w.eval('LOOK_SENDS = true');
      await w.stopSharing();
      w.closeTicket();
      // A rider's popup draws a shown bus as it was dressed, and any other plain.
      const cpRide = CONFIG.split(/\r?\n/).filter(l => l.trim().startsWith('CHECKPOINT ='))[2].split('=')[1].split('|').map(x => x.trim());
      const popOf = look => w.busPopupHtml({ id: 'cd'.repeat(16), lat: +cpRide[2], lng: +cpRide[3], direction: 'north', label: '',
                                             ts: Date.now(), count: 1, self: false, look });
      const dressed = popOf('1Fc'), plain = popOf(''), junk = popOf('1<b>x</b>');
      check(/class="pride"><svg class="rideart/.test(dressed) && dressed.includes(w.eval('BUS_DECOR.dice')) && dressed.includes('--c-band:#1f5f9e'),
        'a bus shown by its sharer rides through its popup as they dressed it, paint and all');
      check(/class="pride"><svg class="rideart/.test(plain) && !plain.includes(w.eval('BUS_DECOR.dice')) && plain.includes('--c-band:#7a1f2b') &&
            !junk.includes('<b>x</b>') && junk.includes('--c-band:#7a1f2b'),
        'any other bus rides through plain, and a look that is not one is no look at all');
      check(!/class="rideart still"/.test(dressed) && /class="rideart still"/.test(w.busPopupHtml({ id: 'ef'.repeat(16), lat: +cpRide[2], lng: +cpRide[3],
              direction: 'north', label: '', ts: Date.now() - 10 * 60000, count: 1, self: false, look: '' })),
        'a bus heard from lately moves; one not heard from for minutes stands still');
      // The saved stop's picture draws the coming bus by the same rule.
      {
        const had = w.eval('MYSTOP ? JSON.stringify(MYSTOP) : ""');
        const cpStop = CONFIG.split(/\r?\n/).filter(l => l.trim().startsWith('CHECKPOINT ='))[4].split('=')[1].split('|').map(x => x.trim());
        w.setMyStop('Test Stop', +cpStop[2], +cpStop[3]);
        const cardOf = look => { w.renderMyStop([{ id: 'cd'.repeat(16), lat: +cpRide[2], lng: +cpRide[3], direction: 'north', label: '',
                                                   ts: Date.now(), count: 1, self: false, look }]); return d.getElementById('myStop').innerHTML; };
        const dice = 'x="60.5" y="44" width="7"';
        const shown = cardOf('1Fc'), plainCard = cardOf('');
        check(/<svg class="stopview/.test(shown) && shown.includes(dice) && shown.includes('fill="#1f5f9e"') &&
              !plainCard.includes(dice) && plainCard.includes('fill="#7a1f2b"'),
          'and the saved stop\'s card draws it coming the same way: as dressed if shown, plain if not');
        if (had){ const m = JSON.parse(had); w.setMyStop(m.name, m.lat, m.lng); } else w.clearMyStop();
      }
      // A bus waiting at the terminal, live all the while: reported again
      // and again from one place, it stands still once two minutes of its
      // own reports say so, and drives on at the first from further along.
      const waiting = (secsAgo, north) => ({ data: [{ pub_id: 'ab'.repeat(16), lat: +cpRide[2] + (north || 0), lng: +cpRide[3],
        direction: 'north', bus_label: '', updated_at: new Date(Date.now() - secsAgo * 1000).toISOString(), look: null, thanks: null }] });
      const pollWith = async r => { sim.reply.get_positions = () => r; w.eval('lastPositionsAt = 0'); await w.pollPositions(); };
      const waitPop = () => w.busPopupHtml(w.clusterBuses(w.eval('BUSES'))[0]);
      await pollWith(waiting(150));
      await pollWith(waiting(90, 0.0003));
      check(!/class="rideart still"/.test(waitPop()), 'a live bus reporting from one place for a minute still drives on');
      await pollWith(waiting(5));
      check(/class="rideart still"/.test(waitPop()) && /· live/.test(waitPop()),
        'two minutes of its reports from one place and it stands still on the road, live as it is');
      await pollWith(waiting(0, 0.003));
      check(!/class="rideart still"/.test(waitPop()), 'and the first report from 300 m on puts it back on the road');
      await pollWith({ data: [] });
      check(w.eval('BUSES').length === 0 && w.eval('Object.keys(STANDS).length') === 0, 'a bus gone from the map leaves nothing behind');
      // The maintainer's call (October 2026): an empty map no longer opens
      // the sightings board; it stays folded until the reader taps it.
      const sightFold = w.document.getElementById('sightFold');
      check(w.eval('sightingsOn()') && sightFold && !sightFold.open,
        'and an empty map leaves the sightings board folded until tapped');
      sim.reply.get_positions = () => ({ data: [] });

      // Another tab still sharing it: left alone.
      rec = seed({ trip: { start: Date.now() - 20 * 60000, startKm: 0, others: 0, writes: 12, maxThanks: 0, polled: true,
                           lastAt: Date.now() - 5000, lastKm: 3 } });
      w.recoverTrip();
      check(isHidden('askModal') && isHidden('tktModal') && w.localStorage.getItem('wt-trip') !== null,
        'a trip another tab is still saving is left to that tab');
      w.localStorage.removeItem('wt-trip');
    }

    // Open sharing (sql/11-open-sharing.sql): with the switch on, a page
    // with no key shares by the public slug, and one with the key still
    // uses it. Switched off under a keyless trip, the trip ends and the
    // next Start asks for the key again.
    check(w.eval('SET.open_sharing') === false, 'open sharing is off when the settings never mention it');
    sim.reply.get_settings = () => ({ data: { settings: { open_sharing: true }, notice: null } });
    await w.pollSettings();
    check(w.eval('SET.open_sharing') === true, 'and on once the organizer turns it on');
    const keyedOpen = await startTrip();
    check(!!keyedOpen && keyedOpen.args.p_key === 'NEW-KEY-456' && of('set_open_position').length === 0,
      'a page with the key still shares with it, not by the open path', keyedOpen && JSON.stringify(Object.keys(keyedOpen.args)));
    await w.stopSharing();
    w.forgetKey();
    const openBefore = of('set_open_position').length;
    w.startSharing();
    await waitFor(() => of('set_open_position').length > openBefore);
    await pause(60);
    const keyless = of('set_open_position')[openBefore];
    check(isHidden('gate') && !!keyless, 'a page with no key starts without asking for one');
    check(!!keyless && keyless.args.p_slug === w.eval('CFG.ROUTE_SLUG') && !('p_key' in keyless.args)
        && keyless.args.p_speed === null,
      'sending the route\'s public slug, no key and no speed', keyless && JSON.stringify(keyless.args));
    // Twenty minutes and three kilometres in.
    w.eval('TRIP.start -= 20 * 60000; TRIP.startKm -= 3');
    sim.reply.set_open_position = () => ({ error: 'open sharing is off' });
    const offBefore = of('set_open_position').length;
    w.eval('lastWrite = 0');
    sim.watches[sim.watches.length - 1].onPos(here);
    await waitFor(() => w.eval('sharing') === false);
    check(of('set_open_position').length > offBefore && !w.eval('sharing') && watchesOpen() === 0,
      'switched off mid-trip, the keyless trip ends');
    check(/needs the key/.test(status()), 'saying why', status());
    check(!isHidden('tktModal'), 'with the ticket for the twenty minutes it was on the map');
    w.closeTicket();
    sim.reply.get_settings = () => ({ data: { settings: {}, notice: null } });
    w.startSharing();
    check(!isHidden('gate'), 'and the next Start asks for the key, without waiting for the settings poll');
    w.closeModal('gate');
    delete sim.reply.set_open_position;

    // One row with no position stopped the whole list drawing.
    const cp = CONFIG.split(/\r?\n/).filter(l => l.trim().startsWith('CHECKPOINT ='))[2]
      .split('=')[1].split('|').map(x => x.trim());
    const row = (lat, lng, dir) => ({ pub_id: 'ab'.repeat(16), is_self: false, thanks: null,
      lat, lng, direction: dir, bus_label: '98019', updated_at: new Date().toISOString() });
    sim.reply.get_positions = () => ({ data: [
      Object.assign(row(null, null, null), { pub_id: 'cd'.repeat(16) }),
      Object.assign(row(+cp[2], null, 'south'), { pub_id: 'ef'.repeat(16) }),
      row(+cp[2], +cp[3], 'north')
    ] });
    w.switchTab('track');
    await waitFor(() => d.querySelectorAll('#busList .buschip').length > 0);
    check(w.eval('BUSES.length') === 1 && d.querySelectorAll('#busList .buschip').length === 1,
      'a row with no position is left out, and the real bus beside it is still drawn',
      `${w.eval('BUSES.length')} buses, ${d.querySelectorAll('#busList .buschip').length} chips`);
    w.close();

    // The admin page lists such a row instead of throwing on it, because it
    // is exactly the one an organiser needs a Stop button for.
    const adm = await run('/admin.html', () => true, 'admin rows', null, window => {
      const passOn = window.fetch;
      window.fetch = function(u, o){
        if (/\/rest\/v1\/rpc\/admin_key_status/.test(String(u))) return Promise.resolve(json([
          { is_pin: true, pin_length: 4, recent_failures: 0,
            paused_until: new Date(Date.now() + 6e5).toISOString(), last_paused: new Date().toISOString() }
        ]));
        if (!/\/rest\/v1\/rpc\/admin_list_sharers/.test(String(u))) return passOn(u, o);
        return Promise.resolve(json([
          { session_id: 'nullrow-0001', lat: null, lng: null, direction: null, bus_label: null,
            updated_at: new Date().toISOString() },
          { session_id: 'realrow-0002', lat: 14.4, lng: 120.9, direction: 'north', bus_label: '98019',
            updated_at: new Date().toISOString() }
        ]));
      };
    });
    adm.w.eval("adminKey = 'my-long-admin-key-42'");
    let threw = null;
    try { await adm.w.refreshSharers(); } catch (e) { threw = e.message; }
    const items = adm.d.querySelectorAll('#liveList .item');
    check(!threw && items.length === 2 && /no position/.test(items[0].textContent)
        && items[0].querySelector('button.btn-danger'),
      'the admin page lists a sharer with no position, with a Stop button for it',
      threw || `${items.length} listed`);

    // A PIN (sql/12-share-pin.sql): the admin page makes one of the length
    // chosen, says plainly how long it would last, and shows a pause.
    adm.d.getElementById('keyKind').value = 'pin';
    adm.d.getElementById('pinLen').value = '4';
    adm.w.syncKeyKind(); adm.w.genKey();
    check(/^[0-9]{4}$/.test(adm.d.getElementById('newAccessKey').value),
      'Generate makes a PIN of the length chosen', adm.d.getElementById('newAccessKey').value);
    check(/about 42 hours/.test(adm.d.getElementById('pinWarn').textContent),
      'and the page says how long a 4-digit one lasts against steady guessing', adm.d.getElementById('pinWarn').textContent);
    await adm.w.refreshKeyStatus();
    check(!adm.d.getElementById('keyAlert').classList.contains('hidden') && /20 wrong PINs/.test(adm.d.getElementById('keyAlert').textContent)
        && adm.d.querySelector('#keyState button'),
      'a pause shows above the live sharers, with a way to resume', adm.d.getElementById('keyAlert').textContent);
    adm.w.close();
  }

  console.log('\n=== 15. the app on Google Play: the line that offers it, and the privacy policy ===');
  // The trip's first window offers the Android app where it says keep the
  // screen on, and only where it helps: an Android phone, in a browser, once
  // config.txt says where the app is. Each run below takes one of those away.
  // Since October 2026 it is offered once a trip is on, never before Start,
  // with Google's own badge, and going for it ends this page's trip.
  {
    const PLAY = 'https://play.google.com/store/apps/details?id=org.communitybustracker.app';
    const TESTERS = 'https://community-bus-tracker.netlify.app/testers.html';
    const ANDROID = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
    const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
    const withApp = url => CONFIG + '\nANDROID_APP_URL = ' + url + '\n';
    const as = ua => window => { Object.defineProperty(window.navigator, 'userAgent', { value: ua }); };
    const lineOf = r => r.d.getElementById('gpsAppLine');
    const offered = r => !!lineOf(r) && !lineOf(r).classList.contains('hidden');
    const sha = b => require('crypto').createHash('sha256').update(Buffer.from(b, 'base64')).digest('hex');
    const GOOGLE = 'f72611e2df8e88204009fd896d05d5e8e83c77009c63943bbffa169559934849';

    const droid = await run('/index.html', () => true, 'android', withApp(PLAY), as(ANDROID));
    const a = lineOf(droid) && lineOf(droid).querySelector('a.playbadge');
    const img = a && a.querySelector('img');
    check(offered(droid) && !!a && a.getAttribute('href') === PLAY,
      'on an Android phone, in a browser, the app config.txt names is offered', a && a.getAttribute('href'));
    check(!!img && img.getAttribute('alt') === 'Get it on Google Play' && img.getAttribute('width') === '646' && img.getAttribute('height') === '250' &&
          sha((img.getAttribute('src') || '').replace(/^data:image\/png;base64,/, '')) === GOOGLE,
      'as Google\'s own badge, byte for byte, the bare Google Play logo never');
    check(/Google Play and the Google Play logo are trademarks of Google LLC\./.test(lineOf(droid).textContent),
      'with Google\'s attribution line under it');
    check(/^Get the app to share with the screen locked\.$/.test(lineOf(droid).querySelector('.gpsay').textContent.trim()),
      'and one line saying why', lineOf(droid).querySelector('.gpsay').textContent.trim());
    check(!!a && a.target === '_blank' && /noopener/.test(a.rel),
      'opening in a new tab, so the tracker stays open behind it');
    check(droid.d.getElementById('tripModal').contains(lineOf(droid)) && !droid.d.getElementById('trackView').contains(lineOf(droid)),
      'in the trip\'s first window only: watching never needs the app');
    droid.w.switchTab('share');
    check(droid.d.getElementById('tripModal').classList.contains('hidden'), 'and nothing offers it before Start');
    droid.w.pickDir('north');
    droid.w.eval('sharing = true');
    droid.w.openTripNote(null);
    check(!droid.d.getElementById('tripModal').classList.contains('hidden') && droid.w.getComputedStyle(lineOf(droid)).display !== 'none',
      'it comes with the trip, in its first window');
    check(/leaveForApp\(\)/.test(a.getAttribute('onclick') || ''), 'and going for it ends this page\'s trip (section 14 drives that)');
    droid.w.eval('sharing = false');
    droid.w.closeModal('tripModal');
    droid.w.close();

    // While the closed test runs, config.txt names the tester page, whose
    // last step is the badge to the listing; the badge here goes there.
    const test = await run('/index.html', () => true, 'android, closed test', withApp(TESTERS), as(ANDROID));
    const ta = lineOf(test) && lineOf(test).querySelector('a.playbadge');
    check(offered(test) && !!ta && ta.getAttribute('href') === TESTERS, 'during the closed test, the badge goes to the tester page', ta && ta.getAttribute('href'));
    test.w.close();
    // Any other address is not Google Play, so it gets no badge: words only.
    const apk = await run('/index.html', () => true, 'android, an APK', withApp('https://example.org/bus-tracker.apk'), as(ANDROID));
    const words = lineOf(apk);
    check(offered(apk) && !words.querySelector('.playbadge') && !/Google Play/.test(words.textContent) &&
          !!words.querySelector('a[href="https://example.org/bus-tracker.apk"]') && /^Get the app to share with the screen locked\.$/.test(words.textContent.trim()),
      'an address that is not on Google Play gets the words as a link and no badge', words && words.textContent.trim());
    apk.w.close();

    const none = await run('/index.html', () => true, 'android, no app', null, as(ANDROID));
    check(!offered(none), 'with ANDROID_APP_URL blank, as the template ships it, nothing is offered');
    none.w.close();
    const iphone = await run('/index.html', () => true, 'iphone', withApp(PLAY), as(IPHONE));
    check(!offered(iphone), 'nor on an iPhone, which has no app');
    iphone.w.close();
    const desk = await run('/index.html', () => true, 'desktop', withApp(PLAY));
    check(!offered(desk), 'nor on a computer');
    desk.w.close();
    const odd = await run('/index.html', () => true, 'not https', withApp('javascript:alert(1)'), as(ANDROID));
    check(!offered(odd), 'and an address that is not https never becomes a link');
    odd.w.close();
    const inside = await run('/index.html', () => true, 'in the app', withApp(PLAY), window => {
      as(ANDROID)(window);
      window.Capacitor = { isNativePlatform: () => true, Plugins: { BackgroundGeolocation: {
        addWatcher(){ return 'w1'; }, removeWatcher(){ return Promise.resolve(); } } } };
    });
    inside.w.openTripNote(null);
    check(!offered(inside) && /^Lock the screen anytime$/.test(inside.d.getElementById('tripScreenTitle').textContent),
      'inside the app itself nothing is offered, and the window says the screen can lock',
      inside.d.getElementById('tripScreenTitle').textContent);
    inside.w.close();

    // The guide reads the same line, so it can never send anyone elsewhere.
    // Without it (or without its script) it says to ask the organizer.
    const guideSrc = fs.readFileSync(path.join(APP, 'how-to.html'), 'utf8');
    check(/<span id="appAsk">Ask the organizer for it\.<\/span><span id="appWhere" hidden>/.test(guideSrc),
      'the guide says to ask the organizer until config.txt names the app');
    const guide = await run('/how-to.html', () => true, 'guide', withApp(PLAY));
    const where = guide.d.getElementById('appWhere'), ask = guide.d.getElementById('appAsk');
    check(!!where && !where.hidden && where.querySelector('a').getAttribute('href') === PLAY && !!ask && ask.hidden,
      'and links to the app config.txt names once it does', where && where.textContent.trim());
    guide.w.close();

    // #privacy is the address Google Play is given for the privacy policy. Play
    // asks that the policy says it is one, names the app, says how data is
    // kept safe and who it goes to; the panel is that policy for both.
    const pol = await run('/index.html#privacy', () => true, 'privacy');
    check(!pol.d.getElementById('privModal').classList.contains('hidden'),
      '#privacy opens the privacy panel');
    check(pol.w.location.hash === '', 'and leaves the address, so a reload is the map again', pol.w.location.hash || 'no hash');
    const said = pol.d.getElementById('privModal').textContent.replace(/\s+/g, ' ');
    // Play asks that the policy names the app as its listing does, or the
    // developer. The launcher's own name starts the listing's title.
    const launcher = (fs.readFileSync(path.join(APP, 'mobile/android/app/src/main/res/values/strings.xml'), 'utf8')
      .match(/<string name="app_name">([^<]+)<\/string>/) || [])[1];
    check(/Privacy policy for Bus Tracker, this website, and for its Android app on Google Play, Fibi: Bus Tracker PH\./.test(said) &&
          !!launcher && said.indexOf(launcher + ': Bus Tracker PH') >= 0,
      'the panel says it is the privacy policy, and names the site and the app as Google Play lists it', launcher);
    check(/What is sent travels encrypted, over HTTPS\./.test(said) && /Google knows your account installed it/.test(said),
      'and says how what is sent travels, and what Google learns from an install');
    pol.w.close();
    ok.w.location.hash = '#privacy';
    await new Promise(r => setTimeout(r, 100));
    check(!ok.d.getElementById('privModal').classList.contains('hidden'),
      'following a #privacy link on a page already open opens it too');
    ok.w.closeModal('privModal');
  }

  console.log('\n=== 16. saying a bus or a sighting is wrong ===');
  // "Not a real bus?" in a popup and "Wrong?" on the board tell the
  // organizers and nobody else (sql/15-say-wrong.sql). What is checked here is
  // what the page sends, that the button stops asking, and that a tap that
  // did not land gives the button back instead of saying it was sent.
  {
    const sim = { calls: [], sightings: [], fail: false, warned: [] };
    const pause = ms => new Promise(r => setTimeout(r, ms));
    const waitFor = async (f, ms = 3000) => {
      const end = Date.now() + ms;
      while (!f() && Date.now() < end) await pause(20);
      return f();
    };
    const json = (body, status) => new Response(JSON.stringify(body),
      { status: status || 200, headers: { 'content-type': 'application/json' } });
    const r = await run('/index.html', () => true, 'wrong', null, window => {
      const passOn = window.fetch;
      window.fetch = function(u, o){
        const m = String(u).match(/\/rest\/v1\/rpc\/([a-z_]+)/);
        if (!m) return passOn(u, o);
        let args = {};
        try { args = JSON.parse((o && o.body) || '{}'); } catch (e) {}
        sim.calls.push({ fn: m[1], args });
        if (m[1] === 'say_wrong' && sim.fail) return Promise.resolve(json({ code: 'PGRST202',
          message: 'Could not find the function public.say_wrong in the schema cache', details: null, hint: null }, 404));
        if (m[1] === 'get_settings') return Promise.resolve(json({ settings: {}, notice: null }));
        if (m[1] === 'get_positions') return Promise.resolve(json([]));
        if (m[1] === 'get_sightings') return Promise.resolve(json(sim.sightings));
        return Promise.resolve(new Response(null, { status: 204 }));
      };
      window.console.warn = function(m){ sim.warned.push(String(m)); };
    });
    const { w, d } = r;
    const sent = () => sim.calls.filter(c => c.fn === 'say_wrong');
    const PUB = 'a1'.repeat(16);
    const pop = b => { const div = d.createElement('div'); div.innerHTML = w.busPopupHtml(b); return div; };
    const bus = { id: PUB, lat: 14.29, lng: 120.91, direction: 'north', ts: Date.now(), members: [PUB] };
    const ask = el => [...el.querySelectorAll('button')].find(b => /Not a real bus\?/.test(b.textContent));

    const offer = ask(pop(bus));
    check(!!offer && offer.getAttribute('onclick') === "sayWrong('bus','" + PUB + "')",
      'a bus\'s popup offers "Not a real bus?", naming that bus', offer && offer.getAttribute('onclick'));
    check(!ask(pop({ ...bus, self: true })), 'but never on the bus this phone is sharing');
    check(!ask(pop({ ...bus, id: 'x\'); alert(1); (\'' })), 'nor on an id that is not plain, which would reach a handler');

    await w.sayWrong('bus', PUB);
    const one = sent()[0];
    check(sent().length === 1 && one.args.p_kind === 'bus' && one.args.p_target === PUB &&
          one.args.p_slug === 'wonderful-mendez-ayala' && one.args.p_watcher === w.sessionStorage.getItem('wt-watcher'),
      'a tap sends the bus\'s public id, the route and this tab\'s watcher id, and nothing else',
      one && Object.keys(one.args).sort().join(','));
    check(!ask(pop(bus)) && pop(bus).querySelector('.pwhere .wrongdone').textContent === 'Sent',
      'and the popup says it was sent instead of asking again');
    check(JSON.parse(w.sessionStorage.getItem('wt-wrong') || '[]').join() === 'b:' + PUB,
      'remembered for this visit, in sessionStorage');
    check(!/wrong/.test(Object.keys(w.localStorage).join()), 'and never between visits');

    // The board.
    const where = w.eval('CHECKPOINTS[2].name');
    sim.sightings = [
      { sid: 41, body: '▲ Northbound at ' + where, created_at: new Date().toISOString() },
      { sid: 42, body: '▼ Southbound at ' + where, created_at: new Date().toISOString() }
    ];
    w.eval('lastSightingsAt = 0');
    await w.pollSightings();
    const list = d.getElementById('sightingsList');
    const wrongs = [...list.querySelectorAll('button.wrongbtn')];
    check(wrongs.length === 2 && wrongs[0].textContent === 'Wrong?' && wrongs[0].getAttribute('onclick') === "sayWrong('sighting','41')",
      'every sighting on the board has its own "Wrong?", naming it', wrongs.map(b => b.getAttribute('onclick')).join(' '));
    await w.sayWrong('sighting', '41');
    const two = sent()[1];
    check(!!two && two.args.p_kind === 'sighting' && two.args.p_target === '41',
      'a tap on one sends that sighting\'s number', two && JSON.stringify(two.args));
    check(list.querySelectorAll('button.wrongbtn').length === 1 && /Sent/.test(list.querySelector('.sighting').textContent),
      'and that line says Sent at once, without waiting for the next poll');

    // A tap that does not land: the button comes back, and the console says
    // which migration is missing.
    sim.fail = true;
    await w.sayWrong('sighting', '42');
    await waitFor(() => sent().length === 3);
    await pause(50);
    check(list.querySelectorAll('button.wrongbtn').length === 1 &&
          !JSON.parse(w.sessionStorage.getItem('wt-wrong') || '[]').includes('s:42'),
      'a failed tap gives the button back rather than saying Sent');
    check(sim.warned.some(m => /15-say-wrong\.sql/.test(m)), 'and the console names the migration to run');
    check(!/[0-9]+ (riders|reports|people)/i.test(list.textContent + pop(bus).textContent),
      'no count is ever drawn for riders');
    w.close();
  }

  console.log(fail ? `\n${fail} FAILED` : '\nALL PASS');
  process.exit(fail ? 1 : 0);
})();
