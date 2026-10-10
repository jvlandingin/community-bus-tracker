#!/usr/bin/env node
// Renders the demo videos: the real tracker, played with made-up buses and
// recorded frame by frame, with captions, for the group chat and for the bus
// company.
//
//   node tools/render-demo.js                    both cuts, into assets/flyer/
//   node tools/render-demo.js riders             one cut
//   node tools/render-demo.js operators --out /tmp/demo --stills 6,21.5
//
// --stills saves PNGs of the given seconds instead of a video, which is how
// to look at a change in a minute rather than ten; --until stops early;
// --fps changes the frame rate. Each caption's start time is printed.
//
// Outputs, 1080x1920 portrait, H.264 at 30 frames a second, with no sound:
//   demo-riders.mp4      in the mix of Tagalog and English the group chat
//                        uses, with the flyer's own lines wherever the flyer
//                        has one: watching, saving a stop, saying salamat,
//                        sharing from the bus, the ticket at the end
//   demo-operators.mp4   in English, with the briefing's lines: sharing in
//                        one tap, what riders see, what is never recorded,
//                        and who to tell if the company wants it changed
//
// Nothing in a video is drawn by hand. The stage is a page made here, with
// the real index.html running in a phone-sized frame on it, so the videos
// show what the tracker ships today and re-rendering is how they are kept
// current: the same rule as the flyer's PDF and the icons. A change to the
// tracker's layout can break a step below (a tap on something that moved),
// and then the render stops and names the step rather than recording the
// wrong thing.
//
// The buses are made up, and every frame that shows the tracker says so, the
// way the flyer's example screen does: "Halimbawa · example screen" in the
// riders' video and "Example screen · made-up buses" in the operators'. That
// label is the one thing a demo of this app may never lose: a video of the
// tracker that could be mistaken for a recording of live buses is exactly
// what this project's rules would not forgive. Sped-up stretches say so too,
// and the buses are the flyer's example ones, at the flyer's example places.
//
// No request reaches the database. The page's calls to Supabase are answered
// by a stand-in inside the page (prelude(), below), anything else addressed
// to Supabase is refused, and the browser is told to block the host besides,
// so rendering can never put a bus on anybody's real map. The map tiles are
// real: they come from CARTO, as in the app, with CARTO_API_KEY taken from
// the environment the way the Netlify build takes it
// (tools/write-basemap-key.js). Without it the tiles carry CARTO's
// "API KEY REQUIRED" watermark, which is fine for a draft and not for a post.
//
// The clock is the page's own, replaced. Date, the timers and animation
// frames move only when the renderer advances them, one video frame at a
// time, and CSS animations are paused and placed by hand on every frame. That
// is what keeps the video smooth on a slow machine and the same on every run,
// and what lets a script skip two hours ahead for the ticket.
//
// The scripts (CUTS, below) name this route's stops, so a fork rewrites
// them. The boards, the link and its QR code come from index.html and
// flyer.html, so they follow those.
//
// Needs Chromium (chrome-headless-shell first, as in render-flyer.sh) and
// ffmpeg with libx264, and nothing installed: like the other tools it drives
// the browser directly over its debugging pipe, because there is
// deliberately no package.json in this repository. Both cuts take about ten
// minutes, nearly all of it screenshots.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { renderer } = require('./make-pictures.js');

const ROOT = path.join(__dirname, '..');
const W = 540, H = 960, SCALE = 2;          // CSS pixels, and the video is twice that

// ============================================================
// 1. Chromium, spoken to over a pipe
// ============================================================
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const inDir = (dir, re, rel) => {
    try {
      for (const d of fs.readdirSync(dir).filter(n => re.test(n)).sort().reverse()) {
        const p = path.join(dir, d, rel);
        if (fs.existsSync(p)) return p;
      }
    } catch (e) {}
    return null;
  };
  const onPath = name => {
    for (const d of (process.env.PATH || '').split(path.delimiter)) {
      if (d && fs.existsSync(path.join(d, name))) return path.join(d, name);
    }
    return null;
  };
  // chrome-headless-shell first, for the reason render-flyer.sh gives: full
  // Chrome's headless screenshots leave the bottom of the page unpainted.
  return inDir('/opt/pw-browsers', /^chromium_headless_shell-/, 'chrome-linux/headless_shell') ||
    onPath('chrome-headless-shell') ||
    inDir('/opt/pw-browsers', /^chromium-/, 'chrome-linux/chrome') ||
    onPath('chromium') || onPath('chromium-browser') || onPath('google-chrome');
}

// The DevTools protocol over --remote-debugging-pipe: JSON messages, each
// ended by a NUL byte, on file descriptors 3 (to Chromium) and 4 (from it).
class CDP {
  constructor(proc) {
    this.out = proc.stdio[3];
    this.seq = 0;
    this.waiting = new Map();
    this.listeners = [];
    let parts = [];
    proc.stdio[4].on('data', chunk => {
      let at;
      while ((at = chunk.indexOf(0)) >= 0) {
        parts.push(chunk.subarray(0, at));
        const msg = JSON.parse(Buffer.concat(parts).toString('utf8'));
        parts = [];
        chunk = chunk.subarray(at + 1);
        this.dispatch(msg);
      }
      if (chunk.length) parts.push(chunk);
    });
  }
  dispatch(msg) {
    if (msg.id === undefined) { for (const l of this.listeners) l(msg); return; }
    const w = this.waiting.get(msg.id);
    if (!w) return;
    this.waiting.delete(msg.id);
    if (msg.error) w.reject(new Error(w.method + ': ' + msg.error.message));
    else w.resolve(msg.result);
  }
  send(method, params, sessionId) {
    const id = ++this.seq;
    const msg = { id, method, params: params || {} };
    if (sessionId) msg.sessionId = sessionId;
    this.out.write(JSON.stringify(msg) + '\0');
    return new Promise((resolve, reject) => this.waiting.set(id, { resolve, reject, method }));
  }
}

function launch() {
  const chrome = findChrome();
  if (!chrome) throw new Error('No Chromium found. Set CHROME=/path/to/chrome and re-run.');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-chrome-'));
  // The flags that keep compositing on the main thread and finish every
  // frame before it is drawn are what --deterministic-mode would set, less
  // its begin-frame control: the clock below does that job instead.
  const proc = spawn(chrome, [
    '--headless', '--remote-debugging-pipe', '--no-sandbox', '--disable-gpu',
    '--hide-scrollbars', '--force-color-profile=srgb', '--mute-audio', '--no-first-run',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--disable-threaded-animation',
    '--disable-threaded-scrolling', '--disable-checker-imaging',
    '--run-all-compositor-stages-before-draw',
    '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  proc.stdio[2].resume();
  const cdp = new CDP(proc);
  cdp.chrome = chrome;
  cdp.close = () => {
    try { proc.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  };
  return cdp;
}

// ============================================================
// 2. The repository, served, and the stage beside it
// ============================================================
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon'
};
function serve(pages) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (pages[url]) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(pages[url]);
      return;
    }
    const file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
    if (!file.startsWith(ROOT + path.sep)) { res.writeHead(404); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

// ============================================================
// 3. What runs in each frame before the page's own scripts
// ============================================================
// A clock that moves only when told to, a stand-in for the database, and a
// GPS that reports wherever the script has put the bus. It is installed in
// the stage and again in the tracker's frame, which borrows the stage's
// clock, so the two move together. This function is sent to the browser as
// source text and runs there, not here.
function prelude(cfg) {
  if (window.__vclockWin === window) return;
  let C = null;
  try { if (window.parent !== window && window.parent.__vclock) C = window.parent.__vclock; } catch (e) {}
  if (!C) C = makeClock();
  window.__vclock = C;
  window.__vclockWin = window;
  window.__demo = C.demo;
  if (C.wins.indexOf(window) < 0) C.wins.push(window);
  install(window);

  function makeClock() {
    const real = {
      raf: window.requestAnimationFrame.bind(window),
      MessageChannel: window.MessageChannel,
      Date: window.Date
    };
    const K = {
      real, epoch: cfg.epoch, t: 0, at: 0, seq: 1,
      timers: new Map(), rafs: new Map(), wins: [], anims: new WeakMap(), errors: []
    };
    K.now = () => Math.floor(K.epoch + K.t);
    K.perf = () => 20000 + K.t;
    K.add = (win, fn, ms, args, every) => {
      const id = K.seq++;
      if (typeof fn !== 'function') return id;
      ms = Math.max(every ? 4 : 0, +ms || 0);
      K.timers.set(id, { id, at: K.t + ms, fn, args, every: every ? ms : 0, win });
      return id;
    };
    // One real task, which drains every microtask queued before it.
    K.yieldTask = () => new Promise(r => {
      const ch = new real.MessageChannel();
      ch.port1.onmessage = () => { ch.port1.close(); r(); };
      ch.port2.postMessage(0);
    });
    K.run = (fn, self, args) => {
      try { fn.apply(self, args || []); }
      catch (e) { K.errors.push(String((e && e.stack) || e)); }
    };
    // dt of video time, at rate times as fast for the page: timers and
    // Date follow the rate, CSS animations never do, so a sped-up stretch
    // still has its glides and pops at their own speed.
    K.advance = async (dt, rate) => {
      const end = K.t + dt * rate;
      for (let guard = 0; guard < 5000; guard++) {
        let next = null;
        for (const tm of K.timers.values()) {
          if (tm.at <= end && (!next || tm.at < next.at || (tm.at === next.at && tm.id < next.id))) next = tm;
        }
        if (!next) break;
        if (next.at > K.t) K.t = next.at;
        if (next.every) next.at += next.every; else K.timers.delete(next.id);
        K.run(next.fn, next.win, next.args);
        await K.yieldTask();
      }
      K.t = end;
      K.at += dt;
      const due = Array.from(K.rafs.values());
      K.rafs.clear();
      for (const r of due) K.run(r.fn, r.win, [K.perf()]);
      await K.yieldTask();
      K.stepAnimations();
    };
    // Hours pass at once, the way they do for a phone that was asleep:
    // every timer that came due fires once, in order, and repeating ones
    // carry on from now rather than catching up.
    K.skip = async ms => {
      const end = K.t + ms;
      const due = Array.from(K.timers.values()).filter(tm => tm.at <= end)
        .sort((a, b) => a.at - b.at || a.id - b.id);
      K.t = end;
      for (const tm of due) {
        if (!K.timers.has(tm.id)) continue;
        if (tm.every) tm.at = end + tm.every; else K.timers.delete(tm.id);
        K.run(tm.fn, tm.win, tm.args);
        await K.yieldTask();
      }
    };
    // CSS animations and transitions run on the compositor's own clock, so
    // each is paused when first seen and then placed by hand on every frame,
    // from how long this clock says it has been running.
    K.stepAnimations = () => {
      for (const win of K.wins) {
        let list = [];
        try { list = win.document.getAnimations(); } catch (e) { continue; }
        for (const a of list) {
          let s = K.anims.get(a);
          if (!s) { s = { start: K.at, done: false }; K.anims.set(a, s); try { a.pause(); } catch (e) {} }
          if (s.done) continue;
          const elapsed = K.at - s.start;
          let end = Infinity;
          try { end = a.effect.getComputedTiming().endTime; } catch (e) {}
          if (elapsed >= end) { s.done = true; try { a.finish(); } catch (e) {} }
          else { try { a.currentTime = elapsed; } catch (e) {} }
        }
      }
    };
    // Two real frames, so what this step changed has been painted.
    K.painted = () => new Promise(r => real.raf(() => real.raf(() => r())));
    K.demo = makeDemo(K);
    return K;
  }

  // The database, as far as the tracker can tell. It holds what the script
  // puts in it and answers the calls index.html makes; nothing is sent.
  function makeDemo(K) {
    const D = { settings: cfg.settings, notice: null, buses: [], me: null, myThanks: 0, gps: null };
    const iso = ms => new K.real.Date(ms).toISOString();
    // Rows past the route's expiry are left out, as get_positions does.
    D.positions = self => {
      const now = K.now();
      const rows = D.buses.filter(b => (b.age || 0) < (D.settings.bus_expiry_min || 10) * 60).map(b => ({
        pub_id: b.pub_id, lat: b.lat, lng: b.lng, speed: b.speed || 0,
        direction: b.direction, bus_label: b.bus_label || null,
        updated_at: iso(now - (b.age || 0) * 1000), is_self: false, thanks: null
      }));
      if (D.me) {
        const mine = !!self && self === D.me.session;
        rows.push({ pub_id: 'demo0000000000000000000000000me1', lat: D.me.lat, lng: D.me.lng,
          speed: D.me.speed, direction: D.me.direction, bus_label: D.me.label,
          updated_at: iso(D.me.at), is_self: mine, thanks: mine ? D.myThanks : null });
      }
      return rows;
    };
    D.rpc = (url, init) => {
      const fn = url.split('/rest/v1/rpc/')[1].split('?')[0];
      let a = {};
      try { a = JSON.parse((init && init.body) || '{}'); } catch (e) {}
      let data = null;
      if (fn === 'get_settings') data = { settings: D.settings, notice: D.notice };
      else if (fn === 'get_positions') data = D.positions(a.p_self);
      else if (fn === 'get_sightings') data = [];
      else if (fn === 'route_exists') data = true;
      else if (fn === 'set_bus_position') {
        D.me = { session: a.p_session, lat: a.p_lat, lng: a.p_lng, speed: a.p_speed,
                 direction: a.p_direction, label: a.p_label, at: K.now() };
      } else if (fn === 'clear_bus_position') { D.me = null; D.myThanks = 0; }
      return Promise.resolve(answer(JSON.stringify(data), 'application/json'));
    };
    return D;
  }

  // Enough of a Response for supabase-js and loadConfig(), settled at once,
  // so nothing the page does waits on a real task.
  function answer(body, type) {
    return {
      ok: true, status: 200, statusText: 'OK', url: '',
      headers: new Headers({ 'content-type': type }),
      text: () => Promise.resolve(body),
      json: () => Promise.resolve(JSON.parse(body)),
      clone() { return answer(body, type); }
    };
  }

  function install(win) {
    const C = win.__vclock;
    const RealDate = win.Date;
    function FakeDate(...a) {
      if (!new.target) return new RealDate(C.now()).toString();
      return a.length ? new RealDate(...a) : new RealDate(C.now());
    }
    FakeDate.prototype = RealDate.prototype;
    FakeDate.now = () => C.now();
    FakeDate.parse = RealDate.parse;
    FakeDate.UTC = RealDate.UTC;
    win.Date = FakeDate;
    win.performance.now = () => C.perf();
    win.setTimeout = (fn, ms, ...args) => C.add(win, fn, ms, args, false);
    win.setInterval = (fn, ms, ...args) => C.add(win, fn, ms, args, true);
    win.clearTimeout = win.clearInterval = id => { C.timers.delete(id); };
    win.requestAnimationFrame = fn => { const id = C.seq++; C.rafs.set(id, { fn, win }); return id; };
    win.cancelAnimationFrame = id => { C.rafs.delete(id); };
    // Seeded, so two renders of one script are the same video.
    let seed = 0x2f6b1e3d;
    win.Math.random = () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // Every database call is answered here; anything else for Supabase is
    // refused; config.txt is the one the renderer read, key and all.
    const realFetch = win.fetch.bind(win);
    win.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || String(input);
      if (/\/rest\/v1\/rpc\//.test(url)) return C.demo.rpc(url, init);
      if (/supabase\.(co|in)/.test(url)) return Promise.reject(new TypeError('the demo answers for the database'));
      if (/(^|\/)config\.txt(\?|$)/.test(url)) return Promise.resolve(answer(cfg.config, 'text/plain'));
      return realFetch(input, init);
    };
    try {
      const beacon = win.navigator.sendBeacon && win.navigator.sendBeacon.bind(win.navigator);
      win.navigator.sendBeacon = (url, data) => /supabase/.test(String(url)) ? true : (beacon ? beacon(url, data) : false);
    } catch (e) {}
    // The sharer's GPS, once a second, from wherever the script put the bus.
    const geo = {
      getCurrentPosition(ok, fail) {
        C.add(win, () => { const p = fix(); if (p) ok(p); else if (fail) fail({ code: 2 }); }, 600, [], false);
      },
      watchPosition(ok) { return C.add(win, () => { const p = fix(); if (p) ok(p); }, 1000, [], true); },
      clearWatch(id) { C.timers.delete(id); }
    };
    function fix() {
      const g = C.demo.gps;
      if (!g) return null;
      return { coords: { latitude: g.lat, longitude: g.lng, accuracy: 8, speed: g.speed || 0,
        altitude: null, altitudeAccuracy: null, heading: null }, timestamp: C.now() };
    }
    try { Object.defineProperty(win.Navigator.prototype, 'geolocation', { configurable: true, get: () => geo }); } catch (e) {}
  }
}

// ============================================================
// 4. The route, measured the way the tracker measures it
// ============================================================
// The checkpoint chain and the projection onto it are the tracker's own
// code, taken out of index.html by its markers as the test suites do, so a
// bus placed "3 km before S&R Kawit" here is 3 km before it on the card.
function routeKit() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const block = (a, b) => {
    const i = html.indexOf(a), j = html.indexOf(b);
    if (i < 0 || j < i) throw new Error('index.html has no block between "' + a + '" and "' + b + '"');
    return html.slice(i, j);
  };
  const hv = html.slice(html.indexOf('function haversineKm'), html.indexOf('\n}', html.indexOf('function haversineKm')) + 2);
  const K = {};
  new Function('K', hv + block('// ---- ROUTE PROGRESS + WRONG-DIRECTION GUARD (unit tested)', '// ---- END ROUTE PROGRESS') +
    'K.haversineKm=haversineKm;K.buildRouteChain=buildRouteChain;K.routeProgressKm=routeProgressKm;')(K);
  const cps = [], stops = [];
  for (const line of fs.readFileSync(path.join(ROOT, 'config.txt'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(CHECKPOINT|STOP)\s*=\s*(.*)$/);
    if (!m) continue;
    const p = m[2].split('|').map(s => s.trim());
    if (m[1] === 'CHECKPOINT') cps.push({ name: p[0], short: p[1], lat: +p[2], lng: +p[3] });
    else stops.push({ name: p[0], lat: +p[1], lng: +p[2] });
  }
  const cum = K.buildRouteChain(cps);
  const place = name => {
    const s = stops.find(x => x.name === name) || cps.find(x => x.name === name || x.short === name);
    if (!s) throw new Error('no stop or checkpoint called "' + name + '" in config.txt');
    return { lat: s.lat, lng: s.lng };
  };
  const km = p => K.routeProgressKm(p, cps, cum);
  // A road for a made-up bus: the named stops in order, joined by straight
  // lines. Points are found by where they project on the chain, so a script
  // can ask for "the point 38.26 km along" and get what the card will say.
  function road(names) {
    const pts = names.map(place);
    const seg = [0];
    for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + K.haversineKm(pts[i - 1], pts[i]));
    const at = d => {
      d = Math.max(0, Math.min(seg[seg.length - 1], d));
      let i = 1;
      while (i < seg.length - 1 && seg[i] < d) i++;
      const f = seg[i] === seg[i - 1] ? 0 : (d - seg[i - 1]) / (seg[i] - seg[i - 1]);
      return { lat: pts[i - 1].lat + f * (pts[i].lat - pts[i - 1].lat), lng: pts[i - 1].lng + f * (pts[i].lng - pts[i - 1].lng) };
    };
    const length = seg[seg.length - 1];
    // Where along this road the chain reads `target` km, by bisection: the
    // roads below are chosen to run one way along the chain.
    const find = target => {
      let lo = 0, hi = length;
      const up = km(at(length)) >= km(at(0));
      for (let n = 0; n < 60; n++) {
        const mid = (lo + hi) / 2;
        if ((km(at(mid)) < target) === up) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    };
    return { at, length, find };
  }
  return { place, road };
}

// ============================================================
// 5. The stage: the phone, the captions, the label, the cards
// ============================================================
function pieces() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const css = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));
  const faces = (css.match(/@font-face\{[^}]*\}/g) || []).map(s => s.replace(/url\(assets\//g, 'url(/assets/')).join('\n');
  const root = (css.match(/:root\{[\s\S]*?\n {2}\}/) || [''])[0];
  const a = html.indexOf('<svg width="0" height="0" style="position:absolute"');
  const sprite = html.slice(a, html.indexOf('</svg>', html.indexOf('</defs>', a)) + 6);
  const led = html.slice(html.indexOf('<span class="led">'), html.indexOf('</div>', html.indexOf('<span class="led">')));
  const text = s => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const words = led.split('<span class="ln">').slice(1).map(text).filter(Boolean);
  const flyer = fs.readFileSync(path.join(ROOT, 'flyer.html'), 'utf8');
  const qr = (flyer.match(/<div class="qr">\s*(<svg[\s\S]*?<\/svg>)/) || [])[1];
  const url = text((flyer.match(/<div class="url">([\s\S]*?)<\/div>/) || [])[1] || '');
  const cfg = fs.readFileSync(path.join(ROOT, 'config.txt'), 'utf8');
  const email = ((cfg.match(/^CONTACT_EMAIL\s*=\s*(.*)$/m) || [])[1] || '').trim();
  if (!root || !sprite || !qr || !url || words.length < 1) throw new Error('could not read the tokens, icons, route words, link or QR code out of index.html and flyer.html');
  const S = renderer();
  return { faces, root, sprite, words, qr, url, email, S };
}

const STAGE_CSS = `
  html,body{margin:0; width:${W}px; height:${H}px; overflow:hidden; background:var(--paper); color:var(--ink);
    font-family:var(--font-ui); -webkit-font-smoothing:antialiased;}
  .gi{display:inline-block; width:1.2em; height:1.2em; vertical-align:-.22em; flex:0 0 auto;}
  #cap{position:absolute; left:30px; right:30px; top:26px; height:150px;}
  #cap .c{position:absolute; left:0; right:0; top:0;}
  #cap .k{display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; letter-spacing:.14em;
    text-transform:uppercase; color:var(--gold-deep);}
  #cap .k b{display:inline-flex; align-items:center; justify-content:center; width:21px; height:21px; border-radius:50%;
    background:var(--maroon); color:#fff; font-size:12px; letter-spacing:0;}
  #cap .t{font-size:31px; font-weight:700; line-height:1.08; margin-top:8px; letter-spacing:-.005em;}
  #cap .t em{font-style:normal; color:var(--brand-ink);}
  #cap .b{font-family:var(--font-text); font-size:16.5px; line-height:1.38; color:var(--muted); margin-top:8px;}
  #cap .b b{color:var(--ink); font-weight:600;}
  #cap .c.in{animation:capin .5s var(--ease) .22s both;}
  #cap .c.out{animation:capout .22s var(--ease) both;}
  @keyframes capin{from{opacity:0; transform:translateY(12px);} to{opacity:1; transform:none;}}
  @keyframes capout{from{opacity:1;} to{opacity:0; transform:translateY(-8px);}}
  #eg{position:absolute; left:30px; right:30px; top:181px; display:flex; align-items:center; gap:10px;
    font-size:11px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); white-space:nowrap;}
  #eg:before, #eg:after{content:""; flex:1; height:1px; background:#dcd3c6;}
  #phone{position:absolute; left:56px; top:204px; width:428px; height:748px; border-radius:38px; background:#211a18;
    box-shadow:0 36px 60px -30px rgba(43,35,32,.6), inset 0 0 0 1.5px #3b312d;}
  #screen{position:absolute; left:8px; top:8px; width:412px; height:732px; border-radius:31px; overflow:hidden; background:var(--paper);}
  #addr{height:30px; display:flex; align-items:center; justify-content:center; gap:5px; background:#ece6dc;
    font-family:var(--font-text); font-size:12.5px; font-weight:600; color:#51463f;}
  #addr .gi{width:13px; height:13px;}
  #app{display:block; border:0; width:412px; height:702px; background:var(--paper);}
  #ff{position:absolute; right:30px; top:22px; height:22px; padding:0 9px 0 8px; border-radius:999px; z-index:12;
    background:var(--maroon); color:#fff; font-size:11px; font-weight:700; letter-spacing:.1em; text-transform:uppercase;
    display:flex; align-items:center; gap:5px; opacity:0; transition:opacity .3s var(--ease);}
  #ff.on{opacity:1;}
  #ff svg{width:13px; height:13px; fill:#fff;}
  #ring{position:absolute; border-radius:16px; border:3px solid var(--gold); z-index:15; pointer-events:none; opacity:0;
    box-shadow:0 0 0 5px rgba(227,154,28,.2), 0 0 26px rgba(227,154,28,.5);
    transition:opacity .35s var(--ease), left .45s var(--ease), top .45s var(--ease), width .45s var(--ease), height .45s var(--ease);}
  #ring.on{opacity:1;}
  .tap{position:absolute; width:52px; height:52px; margin:-26px 0 0 -26px; z-index:20; pointer-events:none;}
  .tap:before, .tap:after{content:""; position:absolute; inset:0; border-radius:50%;}
  .tap:before{background:rgba(255,255,255,.6); border:2px solid rgba(43,35,32,.55); animation:press .75s var(--ease) both;}
  .tap:after{border:2.5px solid rgba(43,35,32,.5); animation:spread .75s var(--ease) both;}
  @keyframes press{0%{transform:scale(.45); opacity:0;} 22%{transform:scale(.82); opacity:1;} 55%{transform:scale(.7); opacity:1;} 100%{transform:scale(.7); opacity:0;}}
  @keyframes spread{0%, 30%{transform:scale(.7); opacity:0;} 42%{opacity:.9;} 100%{transform:scale(1.75); opacity:0;}}

  #card{position:absolute; inset:0; z-index:30; pointer-events:none;}
  .cd{position:absolute; inset:0; background:var(--paper); overflow:hidden; display:flex; flex-direction:column;}
  .cd.in{animation:cdin .55s var(--ease) both;}
  .cd.out{animation:cdout .5s var(--ease) both;}
  @keyframes cdin{from{opacity:0;} to{opacity:1;}}
  @keyframes cdout{from{opacity:1;} to{opacity:0;}}
  .cd .rise{animation:rise .7s var(--ease) both;}
  .cd .rise.d1{animation-delay:.15s;} .cd .rise.d2{animation-delay:.35s;} .cd .rise.d3{animation-delay:.6s;}
  .cd .rise.d4{animation-delay:.9s;} .cd .rise.d5{animation-delay:1.2s;} .cd .rise.d6{animation-delay:1.6s;}
  @keyframes rise{from{opacity:0; transform:translateY(14px);} to{opacity:1; transform:none;}}
  /* The band every page of this project opens with: maroon, the gold trim
     a bus in this livery carries, and the route on its LED board. */
  .cd .band{flex:0 0 auto; background:linear-gradient(180deg,var(--maroon),var(--maroon-deep)); box-shadow:inset 0 -3px 0 var(--gold);
    color:#fff; padding:30px 24px 20px; text-align:center;}
  .cd .board{display:inline-block; padding:4px; border-radius:var(--r-s);
    background:radial-gradient(120% 140% at 30% 0%, #1d1513 0%, #0b0807 70%);
    box-shadow:inset 0 0 0 1px rgba(255,255,255,.07), inset 0 3px 10px rgba(0,0,0,.75), 0 1px 0 rgba(255,255,255,.08);}
  .cd .board svg{display:block;}
  .cd .sub{font-size:12px; font-weight:600; letter-spacing:.06em; opacity:.88; margin-top:12px;}
  .cd .pic{flex:0 0 auto; height:212px; position:relative; overflow:hidden;}
  .cd .pic.low{height:150px;}
  .cd .pic.low > svg{top:-40px;}
  .cd .pic > svg{position:absolute; left:50%; top:0; width:716px; height:auto; transform:translateX(-50%);}
  .cd .mid{flex:1 1 auto; display:flex; flex-direction:column; justify-content:center; padding:0 34px;}
  .cd .foot{flex:0 0 auto; padding:0 30px 30px; text-align:center;}
  .cd h1{font-size:62px; line-height:.98; font-weight:700; text-align:center; margin:0; letter-spacing:-.012em;}
  .cd h1.s{font-size:44px; line-height:1.04;}
  .cd h1 em, .cd h2 em{font-style:normal; color:var(--brand-ink);}
  .cd h2{font-size:40px; line-height:1.05; font-weight:700; margin:0; letter-spacing:-.006em;}
  .cd .lede{font-family:var(--font-text); font-size:20px; line-height:1.42; color:var(--muted); text-align:center; margin:20px 4px 0;}
  .cd .eg{font-size:12px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--muted);}
  .cd .kick{font-size:13px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--gold-deep); margin:0 0 12px;}
  .cd .kick.c{text-align:center;}
  .cd ul{list-style:none; margin:28px 0 0; padding:0;}
  .cd li{position:relative; font-family:var(--font-text); font-size:21.5px; line-height:1.42; color:var(--ink); padding:0 0 0 32px; margin:0 0 22px;}
  .cd li:before{content:""; position:absolute; left:2px; top:.45em; width:11px; height:11px; border-radius:50%; background:var(--maroon);}
  .cd li b{font-weight:600;}
  .cd .note{font-family:var(--font-text); font-size:19px; line-height:1.45; color:var(--ink); margin:18px 0 0;}
  .cd .url{font-size:31px; font-weight:700; color:var(--brand-ink); text-align:center; letter-spacing:-.005em;}
  .cd .qrbig{width:236px; height:236px; margin:24px auto 0; background:#fff; border-radius:var(--r-l); padding:13px; box-sizing:border-box;
    border:1px solid var(--line); box-shadow:var(--sh-1);}
  .cd .qrbig svg{display:block; width:100%; height:100%;}
  .cd .n{font-family:var(--font-text); font-size:16.5px; line-height:1.42; color:var(--muted); text-align:center; margin:16px 0 0;}
  .cd .pass{font-family:var(--font-text); font-size:19px; line-height:1.42; color:var(--ink); text-align:center; margin:26px 0 0;}
  .cd .pts{display:flex; justify-content:center; gap:8px; flex-wrap:wrap; margin:24px 0 0;}
  .cd .pts span{font-size:15px; font-weight:700; padding:8px 14px; border-radius:999px; background:var(--surface);
    border:1.5px solid var(--line); color:var(--ink);}
  .cd .cta{margin:28px 0 0; border-radius:var(--r-l); background:var(--maroon); color:#fff; padding:22px; display:flex; gap:18px; align-items:center;}
  .cd .cta .w{flex:1; min-width:0;}
  .cd .cta .kk{font-size:12px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--gold);}
  .cd .cta .u{font-size:23px; font-weight:700; line-height:1.15; margin-top:6px; word-break:break-word;}
  .cd .cta .n2{font-family:var(--font-text); font-size:15px; line-height:1.4; margin-top:10px; opacity:.92;}
  .cd .cta .qrw{flex:0 0 120px; text-align:center;}
  .cd .cta .qr{width:120px; height:120px; background:#fff; border-radius:var(--r-m); padding:7px; box-sizing:border-box;}
  .cd .cta .qc{font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--gold); margin-top:7px;}
  .cd .cta .qr svg{display:block; width:100%; height:100%;}
  .cd .fine{font-family:var(--font-text); font-size:13.5px; line-height:1.5; color:var(--muted); text-align:center; margin:0;}
  .cd .fine b{color:var(--ink); font-weight:600;}
`;

function stageHtml(cut, P) {
  return `<!DOCTYPE html><html lang="${cut.lang}"><head><meta charset="utf-8"><title>Demo stage</title>
<style>${P.faces}\n${P.root}\n${STAGE_CSS}</style></head><body>
${P.sprite}
<div id="cap"></div>
<div id="eg">${cut.label}</div>
<div id="phone"><div id="screen"><div id="addr"><svg class="gi" aria-hidden="true"><use href="#i-lock"/></svg>${P.url}</div><iframe id="app" title="Bus Tracker"></iframe></div></div>
<div id="ff"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5v13l9-6.5zM12 5.5v13l9-6.5z"/></svg><span></span></div>
<div id="ring"></div>
<div id="taps"></div>
<div id="card"></div>
<script>
(function(){
  const C = window.__vclock;
  const $ = id => document.getElementById(id);
  const app = () => $('app').contentWindow;
  // An element in the tracker, by selector or by an expression run in its
  // own scope, where its let-bindings (map, busMarkers) can be seen.
  function find(t){
    const w = app();
    if (typeof t === 'string') return w.document.querySelector(t);
    return w.eval(t.js);
  }
  function rect(t){
    const el = find(t);
    if (!el || !el.getBoundingClientRect) return null;
    const r = el.getBoundingClientRect(), f = $('app').getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: f.left + r.left, y: f.top + r.top, w: r.width, h: r.height, ft: f.top,
             inside: r.top >= 0 && r.bottom <= f.height && r.left >= 0 && r.right <= f.width };
  }
  window.__stage = {
    app, rect,
    open(url){ $('app').src = url; },
    booted(){
      const d = app().document;
      const t = d && d.getElementById('ticks');
      return !!(t && t.innerHTML.trim()) && d.readyState === 'complete';
    },
    fontsReady(){ return Promise.all([document.fonts.ready, app().document.fonts.ready]).then(() => true); },
    caption(html){
      const box = $('cap');
      [].slice.call(box.children).forEach(el => {
        el.classList.add('out');
        setTimeout(() => el.remove(), 240);
      });
      if (!html) return;
      const c = document.createElement('div');
      c.className = 'c in'; c.innerHTML = html;
      box.appendChild(c);
    },
    card(html, instant){
      const box = $('card');
      [].slice.call(box.children).forEach(el => {
        el.classList.remove('in'); el.classList.add('out');
        setTimeout(() => el.remove(), 520);
      });
      if (!html) return;
      const c = document.createElement('div');
      c.className = instant ? 'cd' : 'cd in'; c.innerHTML = html;
      box.appendChild(c);
    },
    tap(x, y){
      const t = document.createElement('div');
      t.className = 'tap'; t.style.left = x + 'px'; t.style.top = y + 'px';
      $('taps').appendChild(t);
      setTimeout(() => t.remove(), 800);
    },
    ring(r){
      const el = $('ring');
      if (!r){ el.classList.remove('on'); return; }
      const p = 7;
      el.style.left = (r.x - p) + 'px'; el.style.top = (r.y - p) + 'px';
      el.style.width = (r.w + 2*p - 6) + 'px'; el.style.height = (r.h + 2*p - 6) + 'px';
      el.classList.add('on');
    },
    // The words stay while the chip fades out, so it never fades as an
    // empty pill.
    fastForward(text){
      if (text) $('ff').querySelector('span').textContent = text;
      $('ff').classList.toggle('on', !!text);
    },
    scrollTo(y){ app().scrollTo(0, y); },
    scrollY(){ return app().scrollY; },
    async frame(dt, rate, state){
      if (state) Object.assign(C.demo, state);
      await C.advance(dt, rate);
      await C.painted();
      return { errors: C.errors.splice(0) };
    }
  };
})();
</script>
</body></html>`;
}

// ============================================================
// 6. The director: frames, taps, waits and moving buses
// ============================================================
class Stop extends Error {}

class Director {
  constructor(page, opt) {
    Object.assign(this, page);
    this.fps = opt.fps;
    this.sink = opt.sink;
    this.stills = opt.stills;       // seconds to save as PNG, or null for a video
    this.until = opt.until;
    this.out = opt.out;
    this.name = opt.name;
    this.kit = opt.kit;
    this.n = 0;
    this.rate = 1;
    this.vt = opt.epoch;            // the page's clock, mirrored here
    this.buses = new Map();
    this.track = null;              // where the sharer's GPS is going
    this.thanks = 0;
  }
  get T() { return this.n / this.fps; }

  async ev(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('in the page: ' + ((d.exception && d.exception.description) || d.text));
    }
    return r.result.value;
  }
  app(js) { return this.ev('__stage.app().eval(' + JSON.stringify(js) + ')'); }

  // ---- what the database says, this frame --------------------------------
  rows() {
    const out = [];
    for (const [id, b] of this.buses) {
      const f = Math.max(0, Math.min(1, (this.vt - b.v0) / Math.max(1, b.v1 - b.v0)));
      const p = b.road.at(b.d0 + (b.d1 - b.d0) * f);
      // A live bus wrote a few seconds ago, over and over; a stale one
      // stopped writing and its age only grows.
      const age = b.every ? ((this.vt / 1000 + b.phase) % b.every) : b.age + (this.vt - b.v0) / 1000;
      const moving = f > 0 && f < 1;
      out.push({ pub_id: id, lat: p.lat, lng: p.lng, direction: b.dir, bus_label: b.label, age, speed: moving ? 8.5 : 0 });
      for (let i = 1; i < (b.count || 1); i++) {
        out.push({ pub_id: id + 'x' + i, lat: p.lat + 0.00022 * i, lng: p.lng + 0.00015 * i, direction: b.dir,
          bus_label: null, age: age + 9 * i, speed: 0 });
      }
    }
    return out;
  }
  gpsNow() {
    const t = this.track;
    if (!t) return null;
    const f = Math.max(0, Math.min(1, (this.vt - t.v0) / Math.max(1, t.v1 - t.v0)));
    const p = t.road.at(t.d0 + (t.d1 - t.d0) * f);
    return { lat: p.lat, lng: p.lng, speed: f < 1 ? 9 : 0 };
  }

  // A made-up bus on a road (stop names, in the order it drives them), from
  // where the chain reads km0 to where it reads km1 over secs of the page's
  // time. Live ones "write" every few seconds; a stale one stopped writing.
  bus(id, o) {
    const road = this.kit.road(o.road);
    const d0 = road.find(o.km0), d1 = road.find(o.km1 === undefined ? o.km0 : o.km1);
    this.buses.set(id, { dir: o.dir, label: o.label || null, road, d0, d1, v0: this.vt,
      v1: this.vt + (o.secs || 0) * 1000, count: o.count || 1,
      every: o.stale ? 0 : (o.every || 6), phase: o.phase || 0, age: o.age || 0 });
  }
  unbus(id) { this.buses.delete(id); }
  gps(o) {
    if (!o) { this.track = null; return; }
    const road = this.kit.road(o.road);
    this.track = { road, d0: road.find(o.km0), d1: road.find(o.km1 === undefined ? o.km0 : o.km1),
      v0: this.vt, v1: this.vt + (o.secs || 0) * 1000 };
  }

  // ---- frames -------------------------------------------------------------
  async frame() {
    if (this.until !== null && this.T >= this.until) throw new Stop();
    const dt = 1000 / this.fps;
    const state = { buses: this.rows(), gps: this.gpsNow(), myThanks: this.thanks };
    const r = await this.ev('__stage.frame(' + dt + ',' + this.rate + ',' + JSON.stringify(state) + ')');
    if (r.errors.length) throw new Error('the tracker threw at ' + this.T.toFixed(2) + 's:\n' + r.errors.join('\n'));
    if (this.thrown.length) throw new Error('the page threw at ' + this.T.toFixed(2) + 's:\n' + this.thrown.splice(0).join('\n'));
    this.vt += dt * this.rate;
    await this.idle();
    await this.capture();
    this.n++;
  }
  async idle() {
    const t0 = Date.now();
    while (this.pending.size && Date.now() - t0 < 8000) await new Promise(r => setTimeout(r, 15));
  }
  async capture() {
    const T = this.T;
    if (this.stills) {
      const want = this.stills.find(s => Math.abs(s - T) < 0.5 / this.fps);
      if (want === undefined) return;
      const shot = await this.send('Page.captureScreenshot', { format: 'png' });
      const file = path.join(this.out, this.name + '-' + want.toFixed(2).replace('.', '_') + 's.png');
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
      console.log('  still ' + file);
      return;
    }
    const shot = await this.send('Page.captureScreenshot', { format: 'jpeg', quality: 94, optimizeForSpeed: true });
    if (!this.sink.write(Buffer.from(shot.data, 'base64'))) await new Promise(r => this.sink.once('drain', r));
  }
  async wait(sec) {
    const end = this.n + Math.round(sec * this.fps);
    while (this.n < end) await this.frame();
  }

  // ---- what the viewer reads ------------------------------------------------
  say(o) {
    console.log('  ' + this.T.toFixed(2).padStart(6) + 's  ' + (o.k || o.t || ''));
    const step = o.n ? '<b>' + o.n + '</b>' : '';
    const html = (o.k ? '<div class="k">' + step + o.k + '</div>' : '') +
      (o.t ? '<div class="t">' + o.t + '</div>' : '') + (o.b ? '<div class="b">' + o.b + '</div>' : '');
    return this.ev('__stage.caption(' + JSON.stringify(html) + ')');
  }
  // A full-frame card over everything. The first one of a video is there
  // from its first frame, so it is not faded in over the phone.
  card(html, instant) { return this.ev('__stage.card(' + JSON.stringify(html || '') + ',' + !!instant + ')'); }
  fastForward(text) { return this.ev('__stage.fastForward(' + JSON.stringify(text || '') + ')'); }
  async ring(target) {
    if (!target) return this.ev('__stage.ring(null)');
    const r = await this.rect(target, 'highlight');
    return this.ev('__stage.ring(' + JSON.stringify(r) + ')');
  }
  async rect(target, what) {
    const r = await this.ev('__stage.rect(' + JSON.stringify(target) + ')');
    if (!r) throw new Error('step "' + what + '" at ' + this.T.toFixed(2) + 's: nothing on screen matches ' + JSON.stringify(target));
    return r;
  }

  // ---- what the viewer's thumb does ----------------------------------------
  async tap(target, o) {
    o = o || {};
    const r = await this.rect(target, 'tap');
    if (!r.inside && !o.anyway) throw new Error('step "tap" at ' + this.T.toFixed(2) + 's: ' + JSON.stringify(target) + ' is outside the phone screen; scroll first');
    const x = r.x + (o.dx === undefined ? r.w / 2 : o.dx), y = r.y + (o.dy === undefined ? r.h / 2 : o.dy);
    await this.ev('__stage.tap(' + x + ',' + y + ')');
    await this.wait(0.17);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    await this.wait(o.after === undefined ? 0.45 : o.after);
  }
  async type(text, per) {
    for (const ch of text) {
      await this.send('Input.insertText', { text: ch });
      await this.wait(per || 0.11);
    }
  }
  // The tracker's own scroll, eased, over sec. The ring was measured where
  // things were, so it goes first, and the caller puts it back if wanted.
  async scroll(to, sec) {
    await this.ev('__stage.ring(null)');
    let y = to;
    if (typeof to !== 'number') {
      const r = await this.rect(to.target, 'scroll');
      const top = await this.ev('__stage.scrollY()');
      y = Math.max(0, top + (r.y - r.ft) - (to.offset || 0));
    }
    const from = await this.ev('__stage.scrollY()');
    const frames = Math.max(1, Math.round((sec || 0.7) * this.fps));
    for (let i = 1; i <= frames; i++) {
      const f = i / frames, e = f < .5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
      await this.ev('__stage.scrollTo(' + (from + (y - from) * e) + ')');
      await this.frame();
    }
  }
  // Skip ahead. The other buses hold still; the sharer's GPS is wherever
  // the script last sent it, which it has to have done before this, because
  // the page's timers each fire once on the far side of the gap and would
  // otherwise find the bus hours later in the same place, and ask whether
  // anybody is still on it.
  async skip(ms) {
    this.vt += ms;
    for (const b of this.buses.values()) { b.v0 += ms; b.v1 += ms; }
    if (this.track) { this.track.v0 += ms; this.track.v1 += ms; }
    const state = { buses: this.rows(), gps: this.gpsNow(), myThanks: this.thanks };
    await this.ev('Object.assign(__demo,' + JSON.stringify(state) + '); __vclock.skip(' + ms + ')');
  }
  // The next poll, now. The sharing tab fetches every 18 seconds while it is
  // on screen (SLOW_FEED_MS), so a salamat would otherwise land whenever
  // that happened to come round rather than on its caption.
  poll() { return this.app('lastPositionsAt = 0; pollPositions()'); }
  async expect(js, what) {
    const ok = await this.app(js);
    if (!ok) throw new Error('at ' + this.T.toFixed(2) + 's the tracker is not showing what the script expects: ' + what);
  }
}

// ============================================================
// 7. The two cuts
// ============================================================
// Every bus is one of the flyer's example ones, at the flyer's example
// places. Distances are where the chain reads them, so "km0: 38.26" is
// 3.0 km and five stops before S&R Kawit on the saved-stop card: the
// flyer's own example screen, set moving.
const ROADS = {
  // Imus to Kawit, the way the stops run up to the S&R and past it.
  kawit: ['New Imus City Hall', 'Ospital ng Imus', 'Alapan 2-B', 'Savemore - The Avenue', 'Veraneo',
          'Baypoint Estates', 'Kalayaan Road', 'Evo City', 'S&R Kawit', 'Gahak'],
  amadeo: ['Tagaytay Olivarez', 'Salaban (Shakey\'s Bypass)', 'Loma', 'Amadeo (Highway)', 'Dagatan', 'Banaybanay'],
  ridge: ['Crossing Mendez', 'NBI Tagaytay', 'Lourdes', 'Tagaytay Olivarez', 'Olivarez Terminal'],
  gentrias: ['Javalera', 'Gateway Business Park', 'Biclatan', 'Manggahan', 'Monterey', 'Sunny Brooke',
             'Vista Mall General Trias', 'Santiago', 'SM City General Trias', 'Greengate Homes', 'Malagasang 1-G'],
  whole: ['Crossing Mendez', 'Lourdes', 'Tagaytay Olivarez', 'Loma', 'Amadeo (Highway)', 'Tamacan', 'Javalera',
          'Manggahan', 'Santiago', 'New Imus City Hall', 'Savemore - The Avenue', 'Veraneo', 'S&R Kawit', 'Gahak',
          'PITX', 'City of Dreams', 'World Trade Center', 'Washington', 'Makati Medical Center', 'One Ayala Terminal']
};
const B98018 = 'd3m0b98018000000000000000000a001';

// The four buses of the flyer's example screen.
function flyerBuses(d) {
  d.bus(B98018, { dir: 'north', label: '98018', road: ROADS.kawit, km0: 38.26, phase: 2 });
  d.bus('d3m0b98104000000000000000000a002', { dir: 'north', label: '98104', road: ROADS.amadeo, km0: 11.0, km1: 12.6, secs: 300, phase: 4.5 });
  d.bus('d3m0b00000000000000000000000a003', { dir: 'south', label: null, road: ROADS.ridge, km0: 4.9, count: 2, phase: 3 });
  d.bus('d3m0b98077000000000000000000a004', { dir: 'south', label: '98077', road: ROADS.gentrias, km0: 33.5, km1: 31.0, secs: 300, phase: 1 });
}

// Sharing from the bus, from the tab to the welcome: the same five taps in
// both cuts, from Mendez Crossing, so the ticket at the end is the whole
// route.
async function startTrip(d) {
  d.gps({ road: ROADS.whole, km0: 0.3, km1: 1.5, secs: 300 });
  await d.tap('#tabOnbus', { after: 0.5 });
  await d.tap('#pickNorth', { after: 0.4 });
  await d.tap('#busLabel', { after: 0.15 });
  await d.type('98019', 0.1);
  await d.wait(0.3);
  await d.tap('#onbusStartBtn', { after: 0.3 });
}
// Two hours and a half later, pulling into One Ayala.
async function laterAtAyala(d, words) {
  await d.fastForward(words);
  d.gps({ road: ROADS.whole, km0: 59.5, km1: 60.0, secs: 150 });
  await d.skip(2 * 3600e3 + 26 * 60e3);
}

function boardSvg(P, id, pitch) {
  return P.S.signboardSvg(P.words, { id, pitch, center: true });
}
function scenePic(P, time) {
  return '<div class="pic">' + P.S.sceneSvg(time, 'cvs') + '</div>';
}

const CUTS = {
  riders: {
    lang: 'fil', file: 'demo-riders.mp4',
    label: 'Halimbawa · example screen',
    async play(d, P) {
      flyerBuses(d);
      await d.open();
      // -- the cover: the flyer's own headline and promise. Its first frame
      // is the preview a group chat shows, so the board, the picture and the
      // headline are there from it, and only the small print rises in.
      await d.card(`
        <div class="band"><div class="board">${boardSvg(P, 'cv1', 3.6)}</div>
          <div class="sub">WONDERFUL TRANSPORT · COMMUNITY LIVE TRACKER · UNOFFICIAL</div></div>
        ${scenePic(P, 'dawn')}
        <div class="mid">
          <h1>Nasaan na<br><em>ang bus?</em></h1>
          <p class="lede rise d3">Tingnan kung nasaan ang bus ngayon — bago ka pa lumabas ng bahay.</p>
        </div>
        <div class="foot rise d4"><div class="eg">Halimbawa lang ang mga bus sa video na ito</div></div>`, true);
      await d.wait(4.4);

      // -- 1: open the link
      await d.say({ n: 1, k: 'Buksan ang link', t: 'Walang app.<br>Walang account.',
        b: 'Walang ida-download, walang gagawing account. Bubukas agad sa browser mo.' });
      await d.card(null);
      await d.wait(3.8);

      // -- 2: where the buses are
      await d.say({ n: 2, k: 'Tingnan kung nasaan ang bus', t: 'Bawat bilog,<br><em>isang bus.</em>',
        b: 'Dilaw ang papuntang Ayala, maroon ang papuntang Mendez. Galing ang posisyon sa mga nasa bus mismo.' });
      await d.wait(0.7);
      await d.ring('#trackStrip');
      await d.wait(2.6);
      await d.ring('.mapwrap');
      await d.wait(2.6);
      await d.ring(null);

      // -- 3: your own stop
      await d.say({ n: 3, k: 'I-save ang stop mo', t: 'Ilang stop pa<br>bago dumating?',
        b: 'Piliin ang stop mo. Bibilangin ng app kung ilang stop at ilang km pa ang susunod na bus.' });
      await d.scroll({ target: '#myStop', offset: 330 }, 0.8);
      await d.wait(0.3);
      await d.tap('#myStop .mystop-btn', { after: 0.6 });
      await d.tap('#stopSearch', { after: 0.2 });
      await d.type('S&R');
      await d.wait(0.4);
      await d.tap('#stopList button[data-name="S&R Kawit"]', { after: 0.7 });
      await d.expect('/about\\s*5\\s*stops before yours/.test(document.querySelector("#myStop .ride-big").textContent)',
        'the saved-stop card saying "about 5 stops before yours"');
      await d.ring('#myStop .ride');
      await d.wait(2.6);

      // -- the bus coming: the same card, sped up, about 24 km/h
      await d.say({ k: 'Habang papalapit ang bus', t: '<em>Malapit na!</em> …<br><em>Sakay na!</em>',
        b: 'Dalawang stop na lang: <b>Malapit na!</b> Kapag stop mo na ang susunod: <b>Sakay na!</b>' });
      d.bus(B98018, { dir: 'north', label: '98018', road: ROADS.kawit, km0: 38.26, km1: 41.2, secs: 7.6 * 56, phase: 2 });
      await d.fastForward('Pinabilis');
      d.rate = 56;
      await d.wait(8.6);
      d.rate = 1;
      await d.fastForward(null);
      await d.expect('/Next stop is yours/.test(document.querySelector("#myStop .ride-big").textContent)',
        'the card saying "Next stop is yours" once the bus is one stop out');
      await d.wait(1.8);
      await d.ring(null);

      // -- 4: salamat
      await d.say({ n: 4, k: 'Mag-salamat', t: 'I-tap ang bus.<br>Sabihin: <em>salamat!</em>',
        b: 'May nag-share ng lokasyon ng bus para sa lahat. Isang tap, at malalaman niyang may natulungan siya.' });
      await d.scroll({ target: '.mapwrap', offset: 40 }, 0.7);
      await d.wait(0.5);
      await d.tap({ js: 'busMarkers["' + B98018 + '"].getElement()' }, { after: 1.3 });
      await d.tap('.buspop .tybtn', { after: 2.6 });

      // -- 5: sharing from the bus
      await d.say({ n: 5, k: 'Nasa bus ka?', t: 'I-share ang lokasyon<br><em>ng bus.</em>',
        b: 'I-tap ang “I\'m on the bus”, piliin ang direksyon, at makikita ka na ng iba. Puwede mong itigil anumang oras.' });
      await d.scroll(0, 0.6);
      await startTrip(d);
      await d.expect('document.documentElement.classList.contains("trip-on")', 'the sharing tab in trip mode');
      await d.wait(3.4);

      // -- the ticket at the end of the trip
      await d.say({ k: 'Pagbaba mo', t: 'I-tap ang Stop.<br>May <em>ticket</em> ka pa.',
        b: 'Ginawa sa phone mo, hindi ipinapadala kahit saan. Salamat sa pag-share!' });
      d.thanks = 3;
      await laterAtAyala(d, 'Makalipas ang 2 oras');
      await d.wait(1.8);
      await d.fastForward(null);
      await d.wait(0.5);
      await d.tap('#onbusActive .btn-stop', { after: 0.4 });
      await d.expect('!document.getElementById("tktModal").classList.contains("hidden")', 'the salamat ticket on screen');
      await d.wait(3.6);

      // -- the close: the flyer's call to action
      await d.card(`
        <div class="band rise"><div class="board">${boardSvg(P, 'cv2', 3.2)}</div>
          <div class="sub">COMMUNITY LIVE TRACKER · UNOFFICIAL</div></div>
        <div class="mid">
          <div class="kick c rise d1">Buksan ngayon</div>
          <div class="url rise d1">${P.url}</div>
          <div class="qrbig rise d2">${P.qr}</div>
          <p class="n rise d2">I-scan ang QR o i-type ang link. Gumagana sa kahit anong phone.</p>
          <p class="pass rise d3">I-post ito sa group chat ninyo. Mas maraming nag-share, mas kapaki-pakinabang para sa lahat.</p>
          <div class="pts rise d4"><span>Walang app</span><span>Walang account</span><span>Libre, walang ads</span><span>Walang itinatagong history ng biyahe</span></div>
        </div>
        <div class="foot rise d5"><p class="fine"><b>Hindi ito opisyal.</b> Not affiliated with, run by, or endorsed by Wonderful Transport.
          Galing sa mga volunteer ang posisyon. Kapag walang nag-share, walang bus sa mapa — hindi ibig sabihin walang bus.</p></div>`);
      await d.wait(7.5);
    }
  },

  operators: {
    lang: 'en', file: 'demo-operators.mp4',
    label: 'Example screen · made-up buses',
    async play(d, P) {
      flyerBuses(d);
      // The rider's side of this cut has a stop saved already, the flyer's.
      await d.ev('localStorage.setItem("wt-mystop", ' + JSON.stringify(JSON.stringify(
        Object.assign({ name: 'S&R Kawit' }, d.kit.place('S&R Kawit')))) + ')');
      await d.open();
      await d.card(`
        <div class="band"><div class="board">${boardSvg(P, 'cv1', 3.6)}</div>
          <div class="sub">COMMUNITY LIVE TRACKER · UNOFFICIAL</div></div>
        ${scenePic(P, 'day')}
        <div class="mid">
          <h1 class="s">A community-run<br>live bus tracker<br><em>for your route</em></h1>
          <p class="lede rise d3">Not affiliated with, run by, or endorsed by Wonderful Transport. Free, with no ads, and open source.</p>
        </div>
        <div class="foot rise d4"><div class="eg">The buses in this video are made up</div></div>`, true);
      await d.wait(4.8);

      // The briefing's own words. Not "crew type their position": in a video
      // for the company, that would be telling it its drivers text at the
      // wheel, which is nobody's business here to report.
      await d.say({ k: 'Today', t: '“Nasaan na ang bus?”',
        b: 'Riders find out where the bus is by asking in a group chat. This is the same question, answered on a map.' });
      await d.card(null);
      await d.wait(4.4);

      await d.say({ n: 1, k: 'For anyone on board', t: 'One tap puts<br>the bus on the map.',
        b: 'A rider, the conductor or the driver picks the direction, adds the bus number if they like, and starts. No account, no name.' });
      await startTrip(d);
      await d.wait(2.6);

      await d.say({ n: 2, k: 'While sharing', t: 'Built for a phone<br>on the dashboard.',
        b: 'The screen goes dark, with one button: <b>Stop sharing</b>. On Android, an app keeps sharing with the screen locked.' });
      await d.wait(4.2);
      await d.say({ n: 3, k: 'Riders can say thanks', t: '“3 riders said <em>salamat</em>”',
        b: 'Only the person sharing sees it, and it is deleted with the trip. <b>No score, no total, no ranking.</b>' });
      await d.scroll({ target: '#onbusStripCard', offset: 96 }, 0.7);
      d.thanks = 3;
      await d.poll();
      await d.wait(0.5);
      await d.ring('#onbusStripCard');
      await d.wait(3.9);
      await d.scroll(0, 0.5);

      await d.say({ n: 4, k: 'What riders see', t: 'Where each bus is,<br>and how fresh.',
        b: 'Every bus says when it last moved. Gold runs to One Ayala, maroon to Mendez. The green ring marks the bus this phone is sharing.' });
      await d.tap('#tabTrack', { after: 0.6 });
      await d.ring('#trackStrip');
      await d.wait(2.4);
      await d.ring('.mapwrap');
      await d.wait(2.4);
      await d.say({ k: 'What riders see', t: 'How far from<br>their own stop.',
        b: 'In stops and km, <b>never in minutes</b>: an arrival time would need a record of past trips, and none is kept.' });
      await d.scroll({ target: '#myStop', offset: 330 }, 0.8);
      await d.ring('#myStop .ride');
      await d.wait(4.2);
      await d.ring(null);

      await d.say({ n: 5, k: 'When you get off', t: 'Tap Stop. The bus<br>leaves every map.',
        b: 'The sharer gets a souvenir ticket, made on the phone and sent nowhere. A kept copy has no times and no bus number.' });
      await d.scroll(0, 0.5);
      await laterAtAyala(d, '2 hours later');
      await d.tap('#tabOnbus', { after: 1.2 });
      await d.fastForward(null);
      await d.tap('#onbusActive .btn-stop', { after: 0.4 });
      await d.expect('!document.getElementById("tktModal").classList.contains("hidden")', 'the salamat ticket on screen');
      await d.wait(3.8);

      await d.card(`
        <div class="band rise"><div class="board">${boardSvg(P, 'cv3', 2.8)}</div></div>
        <div class="mid">
          <div class="kick rise">What it records</div>
          <h2 class="rise d1">There is no location history. <em>Anywhere.</em></h2>
          <ul>
            <li class="rise d2">One row per bus <b>sharing right now</b>, overwritten every few seconds.</li>
            <li class="rise d3">Deleted the moment the trip ends. No trail, no archive, and no backup of one.</li>
            <li class="rise d4">So it cannot be used to review a driver's <b>speed, breaks or route</b>. Not because we promise not to: the data is never written down.</li>
          </ul>
        </div>
        <div class="foot rise d5"><p class="fine">No names, no phone numbers, no accounts. Watching never asks for anyone's location.</p></div>`);
      await d.wait(9);

      await d.card(`
        <div class="band rise"><div class="board">${boardSvg(P, 'cv4', 2.8)}</div>
          <div class="sub">COMMUNITY LIVE TRACKER · UNOFFICIAL</div></div>
        <div class="pic low rise d1">${P.S.sceneSvg('day', 'cvs2')}</div>
        <div class="mid">
          <div class="kick rise d1">What we ask</div>
          <h2 class="rise d1">Tell us if you want it <em>changed or gone.</em></h2>
          <p class="note rise d2">That needs nothing but a reply. And if you are willing: let the flyer go up where riders wait, and let crew mention it.</p>
          <div class="cta rise d3"><div class="w"><div class="kk">Write to</div><div class="u">${P.email}</div>
            <div class="n2">The full briefing for the company:<br><b>${P.url}/for-operators.html</b></div></div>
            <div class="qrw"><div class="qr">${P.qr}</div><div class="qc">The tracker</div></div></div>
        </div>
        <div class="foot rise d4"><p class="fine"><b>Not affiliated with, run by, or endorsed by Wonderful Transport.</b>
          Free, with no ads, and open source, so every claim here can be checked.</p></div>`);
      await d.wait(7.5);
    }
  }
};

// ============================================================
// 8. Running it
// ============================================================
function readConfig() {
  let text = fs.readFileSync(path.join(ROOT, 'config.txt'), 'utf8');
  const key = (process.env.CARTO_API_KEY || '').trim();
  if (key) text = text.replace(/^CARTO_API_KEY\s*=.*$/m, 'CARTO_API_KEY = ' + key);
  else console.warn('CARTO_API_KEY is not set, so the map tiles will carry CARTO\'s watermark.');
  return text;
}

// The schedule, the switches and the hours are the route's real ones, as the
// admin page stores them. Sightings are off and so is the parol, because the
// first is off on the live route and the second would date the video.
const SETTINGS = {
  hours: { north: [['06:00', '10:00'], ['15:40', '20:00']], south: [['06:00', '10:00'], ['15:40', '20:00']] },
  headway_min: 30, bus_expiry_min: 10, sighting_expiry_min: 120, max_sessions: 25,
  sightings_enabled: false, parol_enabled: false
};
// Monday 12 October 2026, 7:12 AM in Manila: inside the morning departures.
const EPOCH = Date.UTC(2026, 9, 11, 23, 12, 0);

async function render(cdp, base, name, opt) {
  const cut = CUTS[name];
  const P = opt.P;
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', newWindow: false });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (m, p) => cdp.send(m, p, sessionId);
  const pending = new Set(), thrown = [];
  const listen = msg => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Network.requestWillBeSent') pending.add(msg.params.requestId);
    else if (msg.method === 'Network.loadingFinished' || msg.method === 'Network.loadingFailed') pending.delete(msg.params.requestId);
    else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      thrown.push((d.exception && d.exception.description) || d.text);
    }
  };
  cdp.listeners.push(listen);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*', '*supabase.in*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: SCALE, mobile: false });
  await send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Manila' });
  await send('Emulation.setLocaleOverride', { locale: 'en-PH' });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'no-preference' }] });
  const cfg = { epoch: EPOCH, config: opt.config, settings: SETTINGS };
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + prelude.toString() + ')(' + JSON.stringify(cfg) + ');' });
  const loaded = new Promise(r => cdp.listeners.push(m => { if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') r(); }));
  await send('Page.navigate', { url: base + '/__stage/' + name + '.html' });
  await loaded;

  let sink = null, ff = null, done = null;
  const file = path.join(opt.out, cut.file);
  if (!opt.stills) {
    ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(opt.fps), '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level:v', '4.1',
      '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
    done = new Promise((res, rej) => ff.on('exit', c => c === 0 ? res() : rej(new Error('ffmpeg exited with ' + c))));
    sink = ff.stdin;
  }
  const d = new Director({ send, pending, thrown }, { fps: opt.fps, sink, stills: opt.stills, until: opt.until,
    out: opt.out, name, kit: opt.kit, epoch: EPOCH });
  // Opening the tracker is not filmed: its first second is the page loading
  // over the network, at whatever speed this machine has, so the clock is
  // run without frames until it has booted and its map has drawn.
  d.open = async () => {
    // With a share key in the link, the way the group chat's link carries
    // one: the stage's address bar shows only the host, never the key.
    await d.ev('__stage.open("/index.html#k=demo-share-key")');
    const t0 = Date.now();
    while (!(await d.ev('__stage.booted()'))) {
      if (Date.now() - t0 > 30000) throw new Error('the tracker did not boot in the stage');
      await new Promise(r => setTimeout(r, 50));
    }
    await d.ev('__stage.fontsReady()');
    const keep = d.capture;
    d.capture = async () => {};
    const n = d.n;
    for (let i = 0; i < Math.round(1.5 * d.fps); i++) await d.frame();
    d.n = n;
    d.capture = keep;
  };
  const t0 = Date.now();
  try {
    await cut.play(d, P);
  } catch (e) {
    if (!(e instanceof Stop)) { if (ff) ff.stdin.destroy(); throw e; }
  } finally {
    cdp.listeners.splice(cdp.listeners.indexOf(listen), 1);
  }
  if (ff) { ff.stdin.end(); await done; }
  await cdp.send('Target.closeTarget', { targetId });
  const secs = d.n / opt.fps;
  console.log('  ' + name + ': ' + secs.toFixed(1) + ' s of video, ' + d.n + ' frames, in ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s' +
    (opt.stills ? '' : ' -> ' + file));
}

async function main() {
  const args = process.argv.slice(2);
  const opt = { out: path.join(ROOT, 'assets', 'flyer'), fps: 30, stills: null, until: null };
  const names = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--out') opt.out = path.resolve(args[++i]);
    else if (a === '--fps') opt.fps = +args[++i];
    else if (a === '--stills') opt.stills = args[++i].split(',').map(Number);
    else if (a === '--until') opt.until = +args[++i];
    else if (a === 'all') names.push(...Object.keys(CUTS));
    else if (CUTS[a]) names.push(a);
    else { console.error('usage: node tools/render-demo.js [riders|operators|all] [--out DIR] [--fps N] [--stills S,S] [--until S]'); process.exit(2); }
  }
  if (!names.length) names.push(...Object.keys(CUTS));
  fs.mkdirSync(opt.out, { recursive: true });
  opt.config = readConfig();
  opt.kit = routeKit();
  opt.P = pieces();
  const pages = {};
  for (const n of Object.keys(CUTS)) pages['/__stage/' + n + '.html'] = stageHtml(CUTS[n], opt.P);
  const server = await serve(pages);
  const base = 'http://127.0.0.1:' + server.address().port;
  const cdp = launch();
  console.log('Chromium: ' + cdp.chrome);
  try {
    for (const n of names) await render(cdp, base, n, opt);
  } finally {
    cdp.close();
    server.close();
  }
  console.log('Done.');
}

main().catch(e => { console.error((e && e.stack) || e); process.exit(1); });
