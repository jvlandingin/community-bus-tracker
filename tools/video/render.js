#!/usr/bin/env node
// Renders the showcase video: about a minute, vertical (1080x1920), of the
// real tracker being used on a phone, with drawn interludes made by the
// app's own picture code and the interface's sounds (sounds.js).
//
//   sh tools/render-video.sh [output-directory]      (default: video-out/)
//
// What is real and what is not. Everything on the phone's screen is
// index.html exactly as committed, running in headless Chromium at a
// phone's size: its map (CARTO's tiles, which is why CARTO_API_KEY is
// needed), its strip, its stop card, its sharing tab, its ticket and My
// tickets. What is made up is the world it is shown: the buses, the
// sharer's GPS, and what the phone remembers from earlier trips. Every
// request the page makes to Supabase is answered here, by World below, so
// nothing reaches the route's database: no made-up bus goes on anybody's
// real map, no watcher is counted, no salamat is sent. There is no "demo"
// label on it: the maintainer took it out (October 2026).
//
// The captions keep to the app's own rules (CLAUDE.md, "Say it in a few
// words"): one short, plain sentence each, and no minutes or arrival times,
// because it counts stops and kilometres. One says coins where the app says
// spare parts, the maintainer's own words.
//
// Frame-exact. Each phone's clock is Playwright's fake one, paused, and
// moved on by one frame's worth before each screenshot, and every CSS
// animation on the page is paused and put at the same time (__vseek). So
// nothing stutters however long a frame takes to draw, and two renders look
// the same. They are not identical to the bit: drawing leaves noise too faint
// to see (52 dB or better, measured), and a tap still reaches the page by the
// wall clock, so what it opens can show a frame earlier or later. The buses
// move in time-lapse, much faster than a bus: their positions are worked out
// from the video's time.
//
// The parts, here:
//   World      the made-up buses and the answers to the page's requests
//   Phone      one browser at a phone's size running index.html
//   Stage      tools/video/stage.html: the frame around the phone
// and in film.js the story: the scenes, their captions, what is tapped when
// and where the buses are. film.js is route-specific in a way the app is
// not, because it names this route's stops (Javalera, SM City General Trias)
// and places; a fork rewrites it, and the rest follows config.txt.
//
// It needs Node, ffmpeg and Playwright. Playwright is not part of this
// repository (there is deliberately no package.json, see CLAUDE.md):
// render-video.sh finds it installed globally, or install it beside the
// repository without saving it, as CI does with jsdom:
//   npm install --no-save playwright-core@1.56
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const ARGS = process.argv.slice(2);
const opt = (k, d) => { const i = ARGS.indexOf(k); return i >= 0 && i + 1 < ARGS.length ? ARGS[i + 1] : d; };
const OUT = path.resolve(opt('--out', path.join(ROOT, 'video-out')));
const FPS = +opt('--fps', 30);
// Part of the film only, in seconds: everything before FROM still runs, so
// the phones are in the state they would be, but only FROM to TO is drawn.
const FROM = +opt('--from', 0), TO = +opt('--to', 1e9);
const NAME = opt('--name', 'bus-tracker');
const CHROME = process.env.CHROME || '';
const KEY = (process.env.CARTO_API_KEY || '').trim();

const SITE = 'https://bus.video.test';      // the made-up address the phones load the repository from
const STAGE = 'https://stage.video.test';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function playwright(){
  for (const name of ['playwright-core', 'playwright']){
    try { return require(name); } catch (e) {}
  }
  console.error('Playwright is not installed. From the repository root:\n' +
    '  npm install --no-save playwright-core@1.56\n(or install it globally, and run tools/render-video.sh).');
  process.exit(1);
}

// ---- The route's stops, from config.txt -------------------------------------
const CONFIG = fs.readFileSync(path.join(ROOT, 'config.txt'), 'utf8');
const fields = key => CONFIG.split('\n').filter(l => new RegExp('^' + key + '\\s*=').test(l))
  .map(l => l.slice(l.indexOf('=') + 1).split('|').map(s => s.trim()));
const STOPS = {};
fields('STOP').forEach(f => { STOPS[f[0]] = { name:f[0], lat:+f[1], lng:+f[2] }; });
function stop(name){
  if (!STOPS[name]) throw new Error('config.txt has no STOP called "' + name + '"');
  return STOPS[name];
}
function metres(a, b){
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// A road, as stops in the order a bus passes them: the stops are on the real
// road, so a bus drawn between them is too, near enough at these zooms.
function road(names){
  const pts = names.map(stop), at = [0];
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + metres(pts[i - 1], pts[i]) / 1000);
  const total = at[at.length - 1];
  return {
    total,
    // The point km along the road, and where each named stop is on it.
    point(km){
      km = Math.max(0, Math.min(total, km));
      for (let i = 1; i < pts.length; i++){
        if (km <= at[i]){
          const u = (km - at[i - 1]) / (at[i] - at[i - 1] || 1), a = pts[i - 1], b = pts[i];
          return { lat: a.lat + (b.lat - a.lat) * u, lng: a.lng + (b.lng - a.lng) * u };
        }
      }
      return { lat: pts[pts.length - 1].lat, lng: pts[pts.length - 1].lng };
    },
    km(name){ const i = names.indexOf(name); if (i < 0) throw new Error(name + ' is not on this road'); return at[i]; }
  };
}

// Straight lines between points: [[x, y], ...], held flat past either end.
function keys(list){
  return function(x){
    if (x <= list[0][0]) return list[0][1];
    for (let i = 1; i < list.length; i++){
      if (x <= list[i][0]){
        const a = list[i - 1], b = list[i];
        return a[1] + (b[1] - a[1]) * ((x - a[0]) / (b[0] - a[0] || 1));
      }
    }
    return list[list.length - 1][1];
  };
}

// ---- The made-up world ----------------------------------------------------
// Buses are given as a road and their kilometre on it against the video's
// time. A phone sees the buses of its own world (each phone lives on a day of
// its own), and the trips it shares itself, which come back with is_self
// the way the real server marks them.
class World {
  constructor(){ this.buses = []; this.writes = new Map(); this.thanks = {}; this.log = {}; }
  bus(b){ this.buses.push(b); return b; }
  rows(phone, self){
    const v = phone.v, now = phone.now, out = [];
    this.buses.forEach(b => {
      if (b.phone !== phone.name || v < b.on[0] || v >= b.on[1]) return;
      const p = b.road.point(b.km(v));
      out.push({ pub_id:b.id, lat:p.lat, lng:p.lng, speed:null, direction:b.dir, bus_label:b.label || null,
                 updated_at:new Date(now - (b.age || 6000)).toISOString(), is_self:false, thanks:null, look:b.look || '' });
    });
    this.writes.forEach((w, session) => {
      if (w.phone !== phone.name) return;
      const mine = !!self && session === self;
      out.push({ pub_id:'w' + w.n, lat:w.lat, lng:w.lng, speed:null, direction:w.dir, bus_label:w.label,
                 updated_at:new Date(w.at).toISOString(), is_self:mine,
                 // Like the server: a count on the sharer's own row only.
                 thanks: mine ? Math.round(this.thanks[phone.name] ? this.thanks[phone.name](v) : 0) : null,
                 look: w.look || '' });
    });
    return out;
  }
  answer(fn, a, phone){
    this.log[fn] = (this.log[fn] || 0) + 1;
    switch (fn){
      case 'get_settings': return SETTINGS;
      case 'get_positions': return this.rows(phone, a.p_self);
      case 'get_sightings': return [];
      case 'set_open_position':
      case 'set_keyed_position': {
        const old = this.writes.get(a.p_session);
        this.writes.set(a.p_session, { phone:phone.name, n: old ? old.n : this.writes.size + 1, lat:a.p_lat, lng:a.p_lng,
          dir:a.p_direction, label:a.p_label || null, look:a.p_look || '', at:phone.now });
        phone.wrote = true;
        return null;
      }
      case 'clear_bus_position': this.writes.delete(a.p_session); return null;
      default: return null;   // mark_watching, say_thanks: nothing to keep
    }
  }
}
// The route's settings as the live database has them (get_settings, October
// 2026), less the parol: it is in season while this is written, and a video
// is watched long after the season ends.
const SETTINGS = { notice:null, share_pin:false, settings:{
  hours:{ north:[['03:00','06:30',30],['11:00','15:30',30]], south:[['06:00','07:00',40],['15:40','20:00',40]],
          weekend:{ north:[['04:00','06:00',40],['11:00','15:00',40]], south:[['16:30','20:00',40],['06:00','07:00',40]] } },
  headway_min:40, max_sessions:25, open_sharing:true, parol_enabled:false, bus_expiry_min:10,
  sightings_enabled:true, sighting_expiry_min:120 } };

// ---- A phone --------------------------------------------------------------
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.txt':'text/plain; charset=utf-8',
  '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.webmanifest':'application/manifest+json',
  '.json':'application/json', '.ico':'image/x-icon', '.jpg':'image/jpeg' };
const VIEW = { width:390, height:660 };   // a phone's browser, its address bar showing
function serveRepo(route, url){
  let p = decodeURIComponent(new URL(url).pathname);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status:404, body:'' });
  let body = fs.readFileSync(f);
  if (p === '/config.txt' && KEY) body = Buffer.from(body.toString().replace(/^CARTO_API_KEY\s*=.*$/m, 'CARTO_API_KEY = ' + KEY));
  return route.fulfill({ status:200, contentType:TYPES[path.extname(f)] || 'application/octet-stream', body });
}
// Map tiles, kept on disk after the first render, so a re-render asks CARTO
// for nothing. The file is named by the tile, never by its address, which
// carries the key.
const TILES = path.join(OUT, '.tiles');
function tileFile(url){
  const u = new URL(url);
  return path.join(TILES, u.pathname.replace(/[^A-Za-z0-9_@./-]/g, '_'));
}

class Phone {
  constructor(name, world){ this.name = name; this.world = world; this.pending = 0; this.v = 0; this.now = 0; this.wrote = false; }
  // clock: video seconds to this phone's time (ms). seed: what this phone
  // already remembers (localStorage), as { key: value }.
  async open(browser, clock, seed, startV){
    this.clock = clock;
    this.ctx = await browser.newContext({
      viewport:VIEW, deviceScaleFactor:3, isMobile:true, hasTouch:true, colorScheme:'light',
      timezoneId:'Asia/Manila', locale:'en-PH', permissions:['geolocation'],
      geolocation:{ latitude:14.18, longitude:120.93, accuracy:8 }, serviceWorkers:'block'
    });
    // Up to one minute before startV, so the page has loaded and settled by then.
    this.v = startV;
    this.now = clock(startV) - 60000;
    await this.ctx.clock.install({ time:this.now });
    await this.ctx.clock.pauseAt(this.now + 1);
    this.now += 1;
    await this.ctx.addInitScript(INIT, { seed });
    await this.ctx.route(SITE + '/**', route => serveRepo(route, route.request().url()));
    await this.ctx.route(/^https:\/\/[^/]+\.supabase\.co\//, route => this.supabase(route));
    await this.ctx.route(/^https:\/\/[a-d]\.basemaps\.cartocdn\.com\//, route => {
      const f = tileFile(route.request().url());
      if (fs.existsSync(f)) return route.fulfill({ status:200, contentType:'image/png', body:fs.readFileSync(f) });
      return route.continue();
    });
    this.page = await this.ctx.newPage();
    this.page.on('request', () => { this.pending++; });
    this.page.on('requestfinished', () => { this.pending--; });
    this.page.on('requestfailed', () => { this.pending--; });
    this.page.on('response', async r => {
      const url = r.url();
      if (!/basemaps\.cartocdn\.com\//.test(url) || r.status() !== 200) return;
      const f = tileFile(url);
      if (fs.existsSync(f)) return;
      try { const b = await r.body(); fs.mkdirSync(path.dirname(f), { recursive:true }); fs.writeFileSync(f, b); } catch (e) {}
    });
    this.page.on('pageerror', e => console.log('  [' + this.name + '] page error: ' + e.message));
    this.cdp = await this.ctx.newCDPSession(this.page);
    await this.page.goto(SITE + '/', { waitUntil:'domcontentloaded' });
    // Settle: a minute of the page's time, a little at a time.
    const target = clock(startV);
    while (this.now < target - 1){
      const d = Math.min(250, target - this.now);
      await this.ctx.clock.runFor(d);
      this.now += d;
      await this.settle();
    }
    return this;
  }
  async supabase(route){
    const req = route.request();
    const fn = new URL(req.url()).pathname.split('/').pop();
    let a = {};
    try { a = JSON.parse(req.postData() || '{}'); } catch (e) {}
    const body = this.world.answer(fn, a, this);
    return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(body) });
  }
  // On to video time v: the clock first, then whatever the page does with it.
  async step(v){
    const target = Math.round(this.clock(v));
    this.v = v;
    let d = target - this.now;
    // A long jump (the trip's interlude) goes in pieces, so the page's own
    // timers fire as they would over the same stretch.
    while (d > 0){
      const s = Math.min(d, 6000);
      await this.ctx.clock.runFor(s);
      this.now += s; d -= s;
      if (d > 0) await this.settle(2);
    }
    await this.settle();
  }
  // Until nothing the page asked for is still on its way, and what came
  // back has been handled.
  async settle(minRounds){
    minRounds = minRounds || 3;
    for (let i = 0; i < 60; i++){
      await this.page.evaluate(YIELD);
      if (this.pending > 0){ await sleep(4); continue; }
      if (i >= minRounds && await this.page.evaluate(IMAGES_DONE)) break;
    }
  }
  async shot(){
    await this.page.evaluate(ms => window.__vseek(ms), this.now);
    const r = await this.cdp.send('Page.captureScreenshot', { format:'jpeg', quality:90 });
    return Buffer.from(r.data, 'base64');
  }
  async rect(sel){
    return this.page.evaluate(s => {
      const el = typeof s === 'string' ? document.querySelector(s) : null;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x:r.x, y:r.y, w:r.width, h:r.height };
    }, sel);
  }
  // Scrolled to the middle of the screen at once: only for what is done off
  // camera, where nobody sees the page jump.
  async reveal(sel){ await this.page.evaluate(s => document.querySelector(s).scrollIntoView({ block:'center' }), sel); }
  // A finger on the middle of an element, or on a point. Returns where, for
  // the ring the stage draws. Something hidden or off the screen is an error,
  // not a tap on whatever is there instead: a finger cannot reach it either.
  async tap(sel){
    const r = typeof sel === 'string' ? await this.rect(sel) : sel;
    if (!r) throw new Error(this.name + ': nothing to tap at ' + sel);
    if (typeof sel === 'string' && !(r.w > 0 && r.h > 0)) throw new Error(this.name + ': ' + sel + ' is not shown');
    const x = r.x + (r.w || 0) / 2, y = r.y + (r.h || 0) / 2;
    if (x < 0 || y < 0 || x > VIEW.width || y > VIEW.height) throw new Error(this.name + ': ' + sel + ' is off the screen (' + Math.round(x) + ', ' + Math.round(y) + ')');
    await this.page.touchscreen.tap(x, y);
    return { x, y };
  }
  async gps(p){
    if (this.lastGps && metres(this.lastGps, p) < 1) return;
    this.lastGps = p;
    await this.ctx.setGeolocation({ latitude:p.lat, longitude:p.lng, accuracy:8 });
  }
  // The page's own poll for positions, now rather than at its next turn.
  async poll(){ await this.page.evaluate(() => { lastPositionsAt = 0; return pollPositions(); }); await this.settle(); }
  run(fn, arg){ return this.page.evaluate(fn, arg); }
  async buzzes(){ return this.page.evaluate(() => window.__buzzes.splice(0)); }
  async scrollTo(y){ await this.page.evaluate(y => { document.scrollingElement.scrollTop = y; }, y); }
}
// Put into every phone before the page's own scripts. seed is what this
// phone remembers; the buzz is caught so the stage can show it; the text
// caret is hidden, because it blinks by the wall clock rather than the page's.
function INIT(o){
  if (!sessionStorage.getItem('v-seeded')){
    sessionStorage.setItem('v-seeded', '1');
    Object.keys(o.seed || {}).forEach(function(k){ localStorage.setItem(k, o.seed[k]); });
  }
  const log = [];
  Object.defineProperty(window, '__buzzes', { value:log });
  try { Navigator.prototype.vibrate = function(p){ log.push(Array.isArray(p) ? p : [p]); return true; }; } catch (e) {}
  const born = new WeakMap();
  window.__vseek = function(ms){
    document.getAnimations().forEach(function(a){
      if (!born.has(a)) born.set(a, ms);
      const el = a.effect && a.effect.target;
      // An animation the page's own CSS has paused (a standing bus's
      // picture) stays where it is.
      const held = typeof CSSAnimation !== 'undefined' && a instanceof CSSAnimation && el && el.nodeType === 1 &&
        /paused/.test(getComputedStyle(el).animationPlayState);
      a.pause();
      if (!held) a.currentTime = Math.max(0, ms - born.get(a));
    });
  };
  document.addEventListener('DOMContentLoaded', function(){
    const s = document.createElement('style');
    s.textContent = 'input,textarea{caret-color:transparent !important}';
    document.head.appendChild(s);
  });
}
const YIELD = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
const IMAGES_DONE = () => Array.prototype.every.call(document.images, im => im.complete);

// ---- The stage --------------------------------------------------------------
class Stage {
  async open(browser){
    this.ctx = await browser.newContext({ viewport:{ width:1080, height:1920 }, deviceScaleFactor:1, colorScheme:'light' });
    const appCss = (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/<style[^>]*>[\s\S]*?<\/style>/g) || []).join('\n')
      .replace(/url\(assets\//g, 'url(' + SITE + '/assets/');
    const html = fs.readFileSync(path.join(__dirname, 'stage.html'), 'utf8').replace('<!--APP-STYLES-->', appCss);
    this.screenBuf = null;
    await this.ctx.route(STAGE + '/**', route => {
      const u = new URL(route.request().url());
      if (u.pathname === '/') return route.fulfill({ status:200, contentType:'text/html', body:html });
      if (u.pathname === '/screen') return route.fulfill({ status:200, contentType:'image/jpeg', body:this.screenBuf });
      return route.fulfill({ status:404, body:'' });
    });
    await this.ctx.route(SITE + '/**', route => serveRepo(route, route.request().url()));
    this.page = await this.ctx.newPage();
    this.page.on('pageerror', e => console.log('  [stage] page error: ' + e.message));
    this.cdp = await this.ctx.newCDPSession(this.page);
    await this.page.goto(STAGE + '/');
    await this.page.evaluate(() => document.fonts.ready);
    this.n = 0;
  }
  init(plan){ return this.page.evaluate(p => V.init(p), plan); }
  event(e){ return this.page.evaluate(e => V.event(e), e); }
  async frame(t, screen){
    if (screen){
      this.screenBuf = screen;
      await this.page.evaluate(u => V.screen(u), STAGE + '/screen?n=' + (++this.n));
    }
    await this.page.evaluate(t => V.render(t), t);
    const r = await this.cdp.send('Page.captureScreenshot', { format:'jpeg', quality:93 });
    return Buffer.from(r.data, 'base64');
  }
}

// ---- The app's own pictures, for the interludes -----------------------------
// The SIGNBOARD and PICTURES blocks of index.html, taken out by their
// markers and run, the way tools/make-pictures.js and the tests do.
function pictures(){
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const block = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b); if (i < 0 || j < i) throw new Error('index.html has no ' + a); return html.slice(i, j); };
  const S = {};
  new Function('S', block('// ---- THE SIGNBOARD (unit tested)', '// ---- END SIGNBOARD') +
    block('// ---- THE PICTURES (unit tested)', '// ---- END PICTURES') +
    'S.signboardSvg=signboardSvg;S.signLayout=signLayout;S.sceneSvg=sceneSvg;S.rideSvg=rideSvg;S.TICKET_SKIES=TICKET_SKIES;S.SCENE_TIMES=SCENE_TIMES;')(S);
  return S;
}
// A lit board: the dots off underneath, and the same board lit over it, for
// the stage to uncover from left to right.
function board(P, lines, id, pitch){
  const lay = P.signLayout(lines, {});
  if (!lay) throw new Error('the board has no dots for ' + lines.join(' / '));
  const svg = P.signboardSvg(lines, { id, pitch });
  return '<div class="dm"><div class="off">' + svg.replace(new RegExp(id + '-', 'g'), id + 'x-') + '</div><div class="lit">' + svg + '</div></div>';
}

// ---- Encoding -----------------------------------------------------------------
function encoder(file){
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file],
    { stdio:['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exited ' + c))));
  return {
    write: buf => new Promise(res => { if (ff.stdin.write(buf)) res(); else ff.stdin.once('drain', res); }),
    end: () => { ff.stdin.end(); return done; }
  };
}

module.exports = { World, Phone, Stage, road, keys, stop, pictures, board, encoder, FPS, FROM, TO, OUT, NAME, KEY, CHROME, playwright };
if (require.main === module) require('./film.js').main().catch(e => { console.error(e); process.exit(1); });
