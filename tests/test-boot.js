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
  // The adoption pages are in this scan for a reason of their own: the flyer's
  // whole purpose is one call to action, and a filter list that hides it
  // leaves a poster-shaped page with no way to reach the tracker. Same silent
  // failure as the start button, with nobody on the page to report it.
  for (const page of ['index.html', 'admin.html', 'flyer.html', 'for-operators.html']) {
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
  for (const page of ['flyer.html', 'for-operators.html']) {
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

    // The flyer's QR code is the one thing on a printed poster that cannot be
    // typed around if it is wrong, and nothing about it is readable by eye.
    // It is drawn as an inline path, so at least assert it is still drawn
    // rather than quietly replaced by a hotlinked image generator.
    if (page === 'flyer.html') {
      check(/aria-label="QR code[^"]*"/.test(src) && /<path fill="#000" d="M[\d ]/.test(src),
        `${page}: the QR code is still an inline path, not a loaded image`);
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

  for (const page of ['index.html', 'admin.html', 'how-to.html', 'flyer.html', 'for-operators.html']) {
    const copies = darkCopies(fs.readFileSync(path.join(APP, page), 'utf8'));
    check(copies.length === 2 && copies[0] === copies[1] && copies[0].length > 0,
      `${page}: both statements of the dark palette are identical`,
      copies.length !== 2 ? `found ${copies.length}, expected 2` :
        (copies[0] === copies[1] ? `${copies[0].split(';').length} tokens` : 'THEY HAVE DRIFTED'));
  }

  // Section 7's lesson, a different filter list: blockers hide live-chat and
  // help widgets by name too, so the link must not be named like one.
  for (const page of ['index.html', 'how-to.html', 'flyer.html', 'for-operators.html']) {
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
  for (const page of ['index.html', 'admin.html', 'how-to.html', 'flyer.html', 'for-operators.html']) {
    const found = (fs.readFileSync(path.join(APP, page), 'utf8')
      .match(/(?:id|class|onclick)="[^"]*(?:like|fav|thumb|heart|vote|social|clap)[^"]*"/gi) || []);
    check(found.length === 0, `${page}: nothing reads as a like or social widget`,
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

  // The panel is the promise and the code is only the implementation. This is
  // that rule made mechanical: every key the app writes to localStorage has to
  // be one the panel has told the reader about. A fourth remembered thing
  // fails here until the paragraph is rewritten in the same commit.
  const appSrc = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const keys = [...new Set([...appSrc.matchAll(/localStorage\.(?:setItem|removeItem)\(\s*'([^']+)'/g)]
    .map(m => m[1]))].sort();
  check(keys.join(',') === 'wt-guide-seen,wt-mystop,wt-theme',
    'the app keeps exactly the three things the privacy panel names', keys.join(',') || 'none');
  const panel = ok.d.getElementById('privModal').textContent.replace(/\s+/g, ' ');
  check(/Three small things are remembered on your own device/.test(panel),
    'and the panel counts them out loud, so a fourth cannot slip in quietly');
  check(/the stop you saved/i.test(panel), 'naming the saved stop among them');
  // The old panel promised the app never asks for location while watching.
  // That is no longer true, so the promise had to move rather than be dropped.
  check(!/never asks for your location\./.test(panel),
    'the superseded "never asks for your location" promise is gone');
  check(/never transmitted, never stored on our side/i.test(panel),
    'replaced by the one that is still true: it does not leave the phone');

  // Opting the dot on is a per-visit decision, so it must not be remembered.
  check(!/localStorage\.[a-zA-Z]+\([^)]*myloc/i.test(appSrc),
    'whether the location dot is on is never written to localStorage');

  console.log(fail ? `\n${fail} FAILED` : '\nALL PASS');
  process.exit(fail ? 1 : 0);
})();
