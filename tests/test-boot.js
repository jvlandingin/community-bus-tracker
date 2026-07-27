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
const CONFIG = fs.readFileSync(path.join(APP, 'config-template.txt'), 'utf8')
  .replace('https://YOUR-PROJECT.supabase.co', 'https://example-project.supabase.co')
  .replace('YOUR-ANON-PUBLIC-KEY', 'test-anon-key')
  .replace('your-route-slug', 'wonderful-mendez-ayala')
  .replace('https://github.com/YOUR-NAME/community-bus-tracker', 'https://github.com/example/community-bus-tracker');

const files = {
  '/index.html': [fs.readFileSync(path.join(APP, 'index.html')), 'text/html'],
  '/admin.html': [fs.readFileSync(path.join(APP, 'admin.html')), 'text/html'],
  '/config.txt': [Buffer.from(CONFIG), 'text/plain'],
  '/assets/vendor/leaflet.js': [fs.readFileSync(path.join(VENDOR, 'assets/vendor/leaflet.js')), 'text/javascript'],
  '/assets/vendor/leaflet.css': [fs.readFileSync(path.join(VENDOR, 'assets/vendor/leaflet.css')), 'text/css'],
  '/assets/vendor/supabase.js': [fs.readFileSync(path.join(VENDOR, 'assets/vendor/supabase.js')), 'text/javascript'],
};

function serve(include) {
  return http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (!include(url) || !files[url]) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': files[url][1] });
    res.end(files[url][0]);
  });
}

function run(page, include, label) {
  return new Promise(resolve => {
    const server = serve(include);
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
      setTimeout(() => {
        // give the page a moment past config load
        const w = dom.window, d = w.document;
        const gate = d.getElementById('gate') || d.getElementById('loginGate');
        const err = d.getElementById('gateErr') || d.getElementById('loginErr');
        resolve({
          label, w, d,
          hasL: typeof w.L !== 'undefined',
          hasSb: typeof w.supabase !== 'undefined',
          gateVisible: gate && !gate.className.includes('hidden'),
          errText: (err && err.textContent || '').trim(),
          errors
        });
        server.close();
      }, 1500);
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

  console.log(fail ? `\n${fail} FAILED` : '\nALL PASS');
  process.exit(fail ? 1 : 0);
})();
