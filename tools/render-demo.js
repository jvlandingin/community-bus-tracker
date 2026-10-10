#!/usr/bin/env node
// Renders the demo videos: the real tracker, played with made-up buses on
// one or two phones, filmed frame by frame on a stage of moving words,
// signs and transitions, for the group chat and for the bus company.
//
//   node tools/render-demo.js                    both cuts, into assets/flyer/
//   node tools/render-demo.js riders             one cut
//   node tools/render-demo.js operators --out /tmp/demo --stills 6,21.5
//
// --stills saves PNGs of the given seconds instead of a video, which is how
// to look at a change in a minute rather than ten; --until stops early;
// --fps changes the frame rate; --sound redoes only the sound of a video
// already rendered, in a minute or two. Each scene's start time is printed.
//
// Outputs, 1080x1920 portrait, H.264 at 30 frames a second, with interface
// sounds (taps, wipes, the counter, the board) made by tools/demo-sound.js
// and no music:
//   demo-riders.mp4      in the mix of Tagalog and English the group chat
//                        uses, with the flyer's own lines wherever the flyer
//                        has one
//   demo-operators.mp4   in English, with the briefing's lines
//
// Four files make them. This one is the engine: the browser, the clock,
// the stand-in database and the director the scripts are written in.
// tools/demo-stage.html is the stage, the moving graphics around the phones.
// tools/demo-cuts.js holds the two scripts: what happens when, and the words.
// tools/demo-sound.js makes the sound from the cues the director notes.
//
// Nothing on a phone's screen is drawn for the video. Each phone is the
// real index.html in a frame on the stage, tapped through with the
// browser's own input events, so the videos show what the tracker ships
// today and re-rendering is how they are kept current: the same rule as
// the flyer's PDF and the icons. A change to the tracker's layout can break
// a step (a tap on something that moved), and then the render stops and
// says which rather than recording the wrong thing.
//
// The buses are made up, and every frame that shows the tracker says so, the
// way the flyer's example screen does: "Halimbawa · example screen" in the
// riders' video and "Example screen · made-up buses" in the operators'. That
// label is the one thing a demo of this app may never lose: a video of the
// tracker that could be mistaken for a recording of live buses is exactly
// what this project's rules would not forgive. Sped-up stretches say so too,
// and the buses are the flyer's example ones, at the flyer's example places.
//
// No request reaches the database. The pages' calls to Supabase are answered
// by a stand-in inside the browser (prelude(), below), anything else
// addressed to Supabase is refused, and the browser is told to block the
// host besides, so rendering can never put a bus on anybody's real map. Two
// phones on one stage are two people on one route: the stand-in keeps a row
// per sharing phone, so a salamat tapped on one phone arrives on the other
// by the same rules the SQL keeps. The map tiles are real: they come from
// CARTO, as in the app, with CARTO_API_KEY taken from the environment the
// way the Netlify build takes it (tools/write-basemap-key.js). Without it the
// tiles carry CARTO's "API KEY REQUIRED" watermark, which is fine for a
// draft and not for a post.
//
// The clock is the pages' own, replaced. Date, the timers and animation
// frames move only when the renderer advances them, one video frame at a
// time, and every CSS animation, the stage's and the tracker's alike, is
// frozen and placed by hand on each frame. That is what keeps the video
// smooth on a slow machine and the same on every run, and what lets a script
// skip two hours ahead for the ticket.
//
// The scripts name this route's stops, so a fork rewrites them. The boards,
// the link and its QR code come from index.html and flyer.html, so they
// follow those.
//
// Needs Chromium (chrome-headless-shell first, as in render-flyer.sh) and
// ffmpeg with libx264, and nothing installed: like the other tools it drives
// the browser directly over its debugging pipe, because there is
// deliberately no package.json in this repository. Both cuts take about a
// quarter of an hour, nearly all of it screenshots.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { renderer } = require('./make-pictures.js');
const sound = require('./demo-sound.js');

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
// GPS that reports wherever the script has put each phone's bus. It is
// installed in the stage and again in every phone's frame, which borrows the
// stage's clock and database, so they all move together and two phones are
// two people on one route. This function is sent to the browser as source
// text and runs there, not here.
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
    // dt of video time, at rate times as fast for the pages: timers and
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
    // each is frozen when first seen and then placed by hand on every frame,
    // from how long this clock says it has been running. Frozen with a
    // playback rate of zero, never with pause(): Chromium stops cancelling a
    // CSS animation once script has paused it, so a class taken off would
    // leave its animation applied, and one put back would not restart. At
    // its end each is let go to finish the way it would have by itself.
    K.stepAnimations = () => {
      for (const win of K.wins) {
        let list = [];
        try { list = win.document.getAnimations(); } catch (e) { continue; }
        for (const a of list) {
          let s = K.anims.get(a);
          if (!s) { s = { start: K.at, done: false }; K.anims.set(a, s); try { a.playbackRate = 0; } catch (e) {} }
          if (s.done) continue;
          const elapsed = K.at - s.start;
          let end = Infinity;
          try { end = a.effect.getComputedTiming().endTime; } catch (e) {}
          if (elapsed >= end) { s.done = true; try { a.playbackRate = 1; a.finish(); } catch (e) {} }
          else { try { a.currentTime = elapsed; } catch (e) {} }
        }
      }
    };
    // Two real frames, so what this step changed has been painted.
    K.painted = () => new Promise(r => real.raf(() => real.raf(() => r())));
    K.demo = makeDemo(K);
    return K;
  }

  // The database, as far as the tracker can tell: the script's made-up
  // buses, and a row for every phone that is sharing, keyed by its session
  // the way bus_positions is. It answers the calls index.html makes, by the
  // same rules the SQL keeps (sql/04, sql/07): a sharer's own row comes back
  // marked as theirs with its salamat count, everybody else's never shows a
  // count, a rider's second salamat for one bus is ignored, and a row past
  // the route's expiry is left out. Nothing is sent anywhere.
  function makeDemo(K) {
    const D = { settings: cfg.settings, notice: null, buses: [], gps: {}, sharers: new Map(), thanked: new Set(), n: 0 };
    const iso = ms => new K.real.Date(ms).toISOString();
    const expiry = () => (D.settings.bus_expiry_min || 10) * 60000;
    D.positions = self => {
      const now = K.now();
      const rows = D.buses.filter(b => (b.age || 0) * 1000 < expiry()).map(b => ({
        pub_id: b.pub_id, lat: b.lat, lng: b.lng, speed: b.speed || 0,
        direction: b.direction, bus_label: b.bus_label || null,
        updated_at: iso(now - (b.age || 0) * 1000), is_self: false, thanks: null
      }));
      for (const [session, s] of D.sharers) {
        if (now - s.at > expiry()) continue;
        const mine = !!self && self === session;
        rows.push({ pub_id: s.pub, lat: s.lat, lng: s.lng, speed: s.speed, direction: s.direction,
          bus_label: s.label, updated_at: iso(s.at), is_self: mine, thanks: mine ? s.thanks : null });
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
        let s = D.sharers.get(a.p_session);
        if (!s) { s = { pub: ('d3m0sharer' + (++D.n)).padEnd(32, '0'), thanks: 0 }; D.sharers.set(a.p_session, s); }
        Object.assign(s, { lat: a.p_lat, lng: a.p_lng, speed: a.p_speed, direction: a.p_direction, label: a.p_label, at: K.now() });
      } else if (fn === 'clear_bus_position') D.sharers.delete(a.p_session);
      else if (fn === 'say_thanks') {
        const key = a.p_pub + ' ' + a.p_watcher;
        for (const s of D.sharers.values()) {
          if (s.pub === a.p_pub && !D.thanked.has(key)) { D.thanked.add(key); s.thanks++; }
        }
      }
      return Promise.resolve(answer(JSON.stringify(data), 'application/json'));
    };
    // Riders on other phones, thanking a bus one of the script's phones is sharing.
    D.addThanks = (session, n) => { const s = D.sharers.get(session); if (s) s.thanks += n; };
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
    // Which phone this frame is, from its address: each one is a different
    // person, so each keeps its own localStorage and sessionStorage, in
    // memory, seeded from the address. Two frames of one origin would
    // otherwise share a session id and be the same sharer.
    let pid = null;
    try {
      const q = new URLSearchParams(win.location.search);
      pid = q.get('phone');
      if (pid) {
        const seed = JSON.parse(q.get('store') || '{}');
        const store = init => {
          const m = new Map(Object.entries(init || {}));
          return {
            getItem: k => m.has(String(k)) ? m.get(String(k)) : null,
            setItem: (k, v) => { m.set(String(k), String(v)); },
            removeItem: k => { m.delete(String(k)); },
            clear: () => m.clear(),
            key: i => Array.from(m.keys())[i] || null,
            get length() { return m.size; }
          };
        };
        Object.defineProperty(win, 'localStorage', { configurable: true, value: store(seed.local) });
        Object.defineProperty(win, 'sessionStorage', { configurable: true, value: store(seed.session) });
      }
    } catch (e) {}
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
    // This phone's GPS, once a second, from wherever the script put its bus.
    const geo = {
      getCurrentPosition(ok, fail) {
        C.add(win, () => { const p = fix(); if (p) ok(p); else if (fail) fail({ code: 2 }); }, 600, [], false);
      },
      watchPosition(ok) { return C.add(win, () => { const p = fix(); if (p) ok(p); }, 1000, [], true); },
      clearWatch(id) { C.timers.delete(id); }
    };
    function fix() {
      const g = pid && C.demo.gps && C.demo.gps[pid];
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
// 5. The stage, with the tracker's own look put into it
// ============================================================
// tools/demo-stage.html keeps no copy of the tracker's fonts, colours or
// icons: they are taken out of index.html here, the way styleguide.html
// takes them, and put in where the stage's two placeholders are. The words
// on the route board, the link and its QR code come from the same places
// as the flyer's.
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
  const stage = fs.readFileSync(path.join(__dirname, 'demo-stage.html'), 'utf8');
  if (stage.indexOf('/*TOKENS*/') < 0 || stage.indexOf('<!--SPRITE-->') < 0) throw new Error('tools/demo-stage.html has lost its placeholders');
  return {
    faces, root, sprite, words, qr, url, email, S: renderer(),
    stage: stage.replace('/*TOKENS*/', faces + '\n' + root).replace('<!--SPRITE-->', sprite)
  };
}

// ============================================================
// 6. The director: frames, phones, taps, words and moving buses
// ============================================================
// What tools/demo-cuts.js writes its scripts in. Every call that moves
// something starts it and returns; wait() is what lets time pass, one
// frame at a time, and each frame is filmed.
class Stop extends Error {}

class Director {
  constructor(page, opt) {
    this.send = page.send;
    this.pending = page.pending;
    this.thrown = page.thrown;
    this.fps = opt.fps;
    this.sink = opt.sink;
    this.stills = opt.stills;       // seconds to save as PNG, or null for a video
    this.until = opt.until;
    this.out = opt.out;
    this.name = opt.name;
    this.kit = opt.kit;
    this.P = opt.P;
    this.n = 0;
    this.rate = 1;
    this.filming = true;
    this.vt = opt.epoch;            // the pages' clock, mirrored here
    this.buses = new Map();
    this.tracks = new Map();        // where each phone's GPS is going
    this.phones = [];
    this.cues = [];                // the sounds, by the frame they belong to (tools/demo-sound.js)
  }
  get T() { return this.n / this.fps; }
  // A sound on this frame. Off camera nothing is heard.
  cue(kind) { if (this.filming) this.cues.push({ t: this.T, kind }); }
  where() { return ' at ' + this.T.toFixed(2) + 's'; }

  async ev(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('in the page' + this.where() + ': ' + ((d.exception && d.exception.description) || d.text));
    }
    return r.result.value;
  }
  call(fn, ...args) { return this.ev('__stage.' + fn + '(' + args.map(a => JSON.stringify(a === undefined ? null : a)).join(',') + ')'); }
  app(pid, js) { return this.ev('__stage.app(' + JSON.stringify(pid) + ').eval(' + JSON.stringify(js) + ')'); }

  // ---- what the database and the GPS say, this frame ----------------------
  rows() {
    const out = [];
    for (const [id, b] of this.buses) {
      const f = Math.max(0, Math.min(1, (this.vt - b.v0) / Math.max(1, b.v1 - b.v0)));
      const p = b.road.at(b.d0 + (b.d1 - b.d0) * f);
      // A live bus wrote a few seconds ago, over and over; a stale one
      // stopped writing and its age only grows.
      const age = b.every ? ((this.vt / 1000 + b.phase) % b.every) : b.age + (this.vt - b.v0) / 1000;
      out.push({ pub_id: id, lat: p.lat, lng: p.lng, direction: b.dir, bus_label: b.label, age, speed: f > 0 && f < 1 ? 8.5 : 0 });
      for (let i = 1; i < (b.count || 1); i++) {
        out.push({ pub_id: id + 'x' + i, lat: p.lat + 0.00022 * i, lng: p.lng + 0.00015 * i, direction: b.dir,
          bus_label: null, age: age + 9 * i, speed: 0 });
      }
    }
    return out;
  }
  gpsNow() {
    const out = {};
    for (const [pid, t] of this.tracks) {
      const f = Math.max(0, Math.min(1, (this.vt - t.v0) / Math.max(1, t.v1 - t.v0)));
      const p = t.road.at(t.d0 + (t.d1 - t.d0) * f);
      out[pid] = { lat: p.lat, lng: p.lng, speed: f < 1 ? 9 : 0 };
    }
    return out;
  }
  state() { return { buses: this.rows(), gps: this.gpsNow() }; }

  // A made-up bus on a road (stop names, in the order it drives them), from
  // where the chain reads km0 to where it reads km1 over secs of the pages'
  // time. Live ones "write" every few seconds; a stale one stopped writing.
  bus(id, o) {
    const road = this.kit.road(o.road);
    const d0 = road.find(o.km0), d1 = road.find(o.km1 === undefined ? o.km0 : o.km1);
    this.buses.set(id, { dir: o.dir, label: o.label || null, road, d0, d1, v0: this.vt,
      v1: this.vt + (o.secs || 0) * 1000, count: o.count || 1,
      every: o.stale ? 0 : (o.every || 6), phase: o.phase || 0, age: o.age || 0 });
  }
  unbus(id) { this.buses.delete(id); }
  // Where a phone's GPS says it is, moving the same way along a road.
  gps(pid, o) {
    if (!o) { this.tracks.delete(pid); return; }
    const road = this.kit.road(o.road);
    this.tracks.set(pid, { road, d0: road.find(o.km0), d1: road.find(o.km1 === undefined ? o.km0 : o.km1),
      v0: this.vt, v1: this.vt + (o.secs || 0) * 1000 });
  }

  // ---- frames -----------------------------------------------------------------
  async frame() {
    if (this.filming && this.until !== null && this.T >= this.until) throw new Stop();
    const dt = 1000 / this.fps;
    const r = await this.ev('__stage.frame(' + dt + ',' + this.rate + ',' + JSON.stringify(this.state()) + ')');
    if (r.errors.length) throw new Error('the tracker threw' + this.where() + ':\n' + r.errors.join('\n'));
    if (this.thrown.length) throw new Error('the page threw' + this.where() + ':\n' + this.thrown.splice(0).join('\n'));
    this.vt += dt * this.rate;
    await this.idle();
    if (this.filming) { await this.capture(); this.n++; }
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
  // Let sec of video pass. each(T), if given, runs before every frame: it
  // is how a script keeps a counter in step with what a phone shows.
  async wait(sec, each) {
    const frames = Math.round(sec * this.fps);
    for (let i = 0; i < frames; i++) {
      if (each) await each(this.T);
      await this.frame();
    }
  }
  // Time that passes off camera: setting up before the first frame.
  async offCamera(sec) {
    this.filming = false;
    try { for (let i = 0; i < Math.round(sec * this.fps); i++) await this.frame(); }
    finally { this.filming = true; }
  }

  // ---- phones -------------------------------------------------------------------
  // Each phone is index.html in a frame on the stage, a person of its own:
  // its own storage (seeded with store), its own GPS, and the share key in
  // its link the way the group chat's link carries one. The address bar
  // shows only the host, never the key.
  phone(pid, o) {
    o = o || {};
    const q = '?phone=' + encodeURIComponent(pid) + (o.store ? '&store=' + encodeURIComponent(JSON.stringify(o.store)) : '');
    this.phones.push(pid);
    return this.call('phone', pid, { url: '/index.html' + q + '#k=demo-share-key', host: this.P.url, pose: o.pose, label: o.label });
  }
  // Waits for every phone to boot, then lets a second and a half pass off
  // camera: the first thing the tracker does is load, at whatever speed this
  // machine has, and that is not worth filming.
  async boot() {
    const t0 = Date.now();
    for (const pid of this.phones) {
      while (!(await this.call('booted', pid))) {
        if (Date.now() - t0 > 30000) throw new Error('phone ' + pid + ' did not boot on the stage');
        await new Promise(r => setTimeout(r, 50));
      }
    }
    await this.call('fontsReady');
    await this.offCamera(1.5);
  }
  pose(pid, to, sec, ease) { return this.call('pose', pid, to, Math.round((sec || 0) * 1000), ease); }
  // The camera: zoom so that something in a phone sits at (fx, fy) on the
  // stage, at scale s, over sec.
  async focus(pid, target, o) {
    if ((o.sec || 0) >= 0.8) this.cue('drift');
    const ok = await this.call('focus', pid, target, Object.assign({}, o, { dur: Math.round((o.sec || 0) * 1000) }));
    if (!ok) throw new Error('focus' + this.where() + ': nothing in ' + pid + ' matches ' + JSON.stringify(target));
  }
  async rect(pid, target, what) {
    const r = await this.call('rect', pid, target);
    if (!r) throw new Error(what + this.where() + ': nothing in ' + pid + ' matches ' + JSON.stringify(target));
    return r;
  }
  async tap(pid, target, o) {
    o = o || {};
    const r = await this.rect(pid, target, 'tap');
    if (!r.inside && !o.anyway) throw new Error('tap' + this.where() + ': ' + JSON.stringify(target) + ' is outside ' + pid + '\'s screen; scroll first');
    let x = r.x + r.w * (o.ax === undefined ? .5 : o.ax), y = r.y + r.h * (o.ay === undefined ? .5 : o.ay);
    await this.call('tap', x, y);
    this.cue('tap');
    await this.wait(0.17);
    // Measured again just before the press: a phone still settling from a
    // move would otherwise take its target out from under the finger.
    const r2 = await this.rect(pid, target, 'tap');
    x = r2.x + r2.w * (o.ax === undefined ? .5 : o.ax); y = r2.y + r2.h * (o.ay === undefined ? .5 : o.ay);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    await this.wait(o.after === undefined ? 0.45 : o.after);
    return { x, y };
  }
  async type(text, per) {
    for (const ch of text) {
      await this.send('Input.insertText', { text: ch });
      this.cue('key');
      await this.wait(per || 0.11);
    }
  }
  // A phone's own scroll, eased, over sec. The tracked marks follow it.
  async scroll(pid, to, sec) {
    let y = to;
    if (typeof to !== 'number') {
      const r = await this.app(pid, '(function(){var e=document.querySelector(' + JSON.stringify(to.target) + ');return e?e.getBoundingClientRect().top:null})()');
      if (r === null) throw new Error('scroll' + this.where() + ': nothing in ' + pid + ' matches ' + to.target);
      y = Math.max(0, (await this.call('scrollY', pid)) + r - (to.offset || 0));
    }
    const from = await this.call('scrollY', pid);
    const frames = Math.max(1, Math.round((sec || 0.7) * this.fps));
    for (let i = 1; i <= frames; i++) {
      const f = i / frames, e = f < .5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
      await this.call('scrollTo', pid, from + (y - from) * e);
      await this.frame();
    }
  }
  // Skip ahead. The made-up buses hold still; each phone's GPS is wherever
  // the script last sent it, which it has to have done before this, because
  // the pages' timers each fire once on the far side of the gap and would
  // otherwise find a bus hours later in the same place, and ask whether
  // anybody is still on it.
  async skip(ms) {
    this.vt += ms;
    for (const b of this.buses.values()) { b.v0 += ms; b.v1 += ms; }
    for (const t of this.tracks.values()) { t.v0 += ms; t.v1 += ms; }
    await this.ev('__stage.skip(' + ms + ',' + JSON.stringify(this.state()) + ')');
  }
  async expect(pid, js, what) {
    if (!(await this.app(pid, js))) throw new Error(this.where() + ' ' + pid + ' is not showing what the script expects: ' + what);
  }
  // The next poll, now. The sharing tab fetches every 18 seconds while it is
  // on screen (SLOW_FEED_MS), so a salamat would otherwise land whenever
  // that happened to come round rather than on its cue.
  poll(pid) { return this.app(pid, 'lastPositionsAt = 0; pollPositions()'); }
  // Riders this script does not film, thanking the bus a phone shares.
  async thanks(pid, n) {
    const session = await this.app(pid, 'getSessionId()');
    await this.ev('__demo.addThanks(' + JSON.stringify(session) + ',' + n + ')');
  }

  // ---- what the viewer sees around the phones -----------------------------
  bg(name) { return this.call('bg', name); }
  scrim(on) { return this.call('scrim', !!on); }
  label(pid, text) { return this.call('label', pid, text || null); }
  hilite(pid) { return this.call('hilite', pid); }
  tag(text) { return this.call('tag', text || null); }
  ff(text, kind) { if (text) this.cue('tick'); return this.call('ff', text || null, kind); }
  title(key, o) {
    this.cue('swish');
    console.log('  ' + this.T.toFixed(2).padStart(6) + 's  ' + (o.kicker || '') + ' / ' + String(o.lines[0]).replace(/<[^>]*>/g, ''));
    return this.call('title', key, o);
  }
  untitle(key) { return this.call('untitle', key); }
  callout(key, o) { this.cue('pop'); return this.call('callout', key, o); }
  ring(key, o) { this.cue('pop'); return this.call('ring', key, o); }
  unmark(key) { return this.call('unmark', key); }
  // The route board's own dot matrix, for any words its font can draw.
  led(key, lines, o) {
    lines = [].concat(lines);
    const svg = this.P.S.signboardSvg(lines, { id: 'led-' + key + '-' + this.n, pitch: o.pitch || 3, center: true });
    if (!svg) throw new Error('the LED board cannot draw "' + lines.join(' / ') + '": a character has no dots in SIGN_FONT');
    this.cue('slam');
    return this.call('led', key, svg, o);
  }
  unled(key) { return this.call('unled', key); }
  flap(key, o) { this.cue('flap'); return this.call('flap', key, o); }
  setflap(key, value, o) { this.cue('flap'); return this.call('setflap', key, value, o); }
  unflap(key) { return this.call('unflap', key); }
  flowers(o) { return this.call('flowers', o); }
  burst(x, y, o) { this.cue('sparkle'); return this.call('burst', x, y, o || {}); }
  card(key, html, o) { return this.call('card', key, html, o || {}); }
  uncard(key) { return this.call('uncard', key); }
  // The livery wipe: in covers the frame (it takes 0.7 s, filmed), out
  // uncovers it again; between the two the script rearranges what is under.
  async wipeIn() { this.cue('whoosh'); await this.call('wipe', 'in'); await this.wait(0.7); }
  wipeOut() { this.cue('whooshOut'); return this.call('wipe', 'out'); }
}

// ============================================================
// 7. Running it
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

// The cues, synthesized into a track and put under the picture. The video
// stream is copied, not encoded again.
async function addSound(file, cues, seconds) {
  if (!fs.existsSync(file)) throw new Error('--sound needs ' + file + ' rendered first');
  const wav = file.replace(/\.mp4$/, '.wav'), tmp = file.replace(/\.mp4$/, '.tmp.mp4');
  fs.writeFileSync(wav, sound.synth(cues, seconds));
  await new Promise((res, rej) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-i', wav,
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', tmp],
    { stdio: ['ignore', 'inherit', 'inherit'] }).on('exit', c => c === 0 ? res() : rej(new Error('ffmpeg exited with ' + c))));
  fs.renameSync(tmp, file);
  fs.unlinkSync(wav);
  console.log('  sound: ' + cues.length + ' cues');
}

async function render(cdp, base, name, opt) {
  const cut = opt.cuts[name];
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
  await send('Page.navigate', { url: base + '/__stage.html' });
  await loaded;

  let sink = null, ff = null, done = null;
  const file = path.join(opt.out, cut.file);
  if (!opt.stills && !opt.soundOnly) {
    ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(opt.fps), '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level:v', '4.1',
      '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
    done = new Promise((res, rej) => ff.on('exit', c => c === 0 ? res() : rej(new Error('ffmpeg exited with ' + c))));
    sink = ff.stdin;
  }
  // --sound plays the cut again without filming it (an empty list of
  // stills takes no pictures) only to collect the cues, for a video that is
  // already rendered: the clock makes the second run frame-for-frame the same.
  const d = new Director({ send, pending, thrown }, { fps: opt.fps, sink, stills: opt.soundOnly ? [] : opt.stills, until: opt.until,
    out: opt.out, name, kit: opt.kit, P: opt.P, epoch: EPOCH });
  const t0 = Date.now();
  try {
    await cut.play(d, opt.P);
  } catch (e) {
    if (!(e instanceof Stop)) { if (ff) ff.stdin.destroy(); throw e; }
  } finally {
    cdp.listeners.splice(cdp.listeners.indexOf(listen), 1);
  }
  if (ff) { ff.stdin.end(); await done; }
  if (!opt.stills) await addSound(file, d.cues, d.n / opt.fps);
  await cdp.send('Target.closeTarget', { targetId });
  const secs = d.n / opt.fps;
  console.log('  ' + name + ': ' + secs.toFixed(1) + ' s of video, ' + d.n + ' frames, in ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s' +
    (opt.stills ? '' : ' -> ' + file));
}

async function main() {
  const cuts = require('./demo-cuts.js');
  const args = process.argv.slice(2);
  const opt = { out: path.join(ROOT, 'assets', 'flyer'), fps: 30, stills: null, until: null, cuts };
  const names = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--out') opt.out = path.resolve(args[++i]);
    else if (a === '--fps') opt.fps = +args[++i];
    else if (a === '--stills') opt.stills = args[++i].split(',').map(Number);
    else if (a === '--until') opt.until = +args[++i];
    else if (a === '--sound') opt.soundOnly = true;
    else if (a === 'all') names.push(...Object.keys(cuts));
    else if (cuts[a]) names.push(a);
    else { console.error('usage: node tools/render-demo.js [' + Object.keys(cuts).join('|') + '|all] [--out DIR] [--fps N] [--stills S,S] [--until S] [--sound]'); process.exit(2); }
  }
  if (!names.length) names.push(...Object.keys(cuts));
  fs.mkdirSync(opt.out, { recursive: true });
  opt.config = readConfig();
  opt.kit = routeKit();
  opt.P = pieces();
  const server = await serve({ '/__stage.html': opt.P.stage });
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

module.exports = { launch, serve, prelude, routeKit, pieces, readConfig, SETTINGS, EPOCH, W, H, SCALE };

if (require.main === module) main().catch(e => { console.error((e && e.stack) || e); process.exit(1); });
