// The showcase video's animated cut: drawn scenes and kinetic type, and no
// screens. Where film.js films the real app, this draws it: every picture is
// the app's own, from index.html's PICTURES block (the stage carries it, and
// a scene draws one again each frame where something in it moves), the words
// are the captions the maintainer chose, the poster's and the app's, and it
// ends on the film's own card, the two ways in. About 42 seconds.
//
//   sh tools/render-video.sh [output-directory] --motion
//
// writes bus-tracker-motion.mp4, its sounds on their own and a cover, beside
// the film's. It draws no map, so it needs no CARTO_API_KEY. The scenes'
// movements are in stage.html (the 'm-' interludes); what happens when, and
// what each scene draws, is here.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const R = require('./render.js');
const S = require('./sounds.js');
const F = require('./film.js');

// ---- The scenes, and how long each runs ---------------------------------------
// The question; the route with its buses on it; the bus coming to your stop,
// Malapit na! and Sakay na!; sharing it, and salamat; getting off, and the
// ticket; dressing up the bus; the two ways in. Each comes up from below
// over the last SLIDE seconds of the one before, as the film's interludes do.
const DUR = { hook:4.4, route:5.8, near:7.0, share:6.0, ticket:6.4, dress:5.8, end:6.5 };
const T = {};
let acc = 0;
Object.keys(DUR).forEach(k => { T[k] = acc; acc += DUR[k]; });
T.total = acc;
const SLIDE = .4;

// Keyframes [[u, value], ...], eased between, the way the stage reckons
// them (keyed in stage.html), and when such a value first comes down to v.
const ease = p => { p = Math.max(0, Math.min(1, p)); return p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; };
function keyed(k, u){
  if (u <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (u <= k[i][0]){ const a = k[i - 1], b = k[i]; return a[1] + (b[1] - a[1]) * ease((u - a[0]) / (b[0] - a[0])); }
  return k[k.length - 1][1];
}
function when(k, v){
  for (let u = k[0][0]; u <= k[k.length - 1][0] + 1e-9; u += 1 / 240) if (keyed(k, u) <= v) return u;
  throw new Error('a keyframed value never comes down to ' + v);
}

// ---- The route, from config.txt ------------------------------------------------
// Its checkpoints' short names, as the strip writes them, and their marks.
const CPS = fs.readFileSync(path.join(R.ROOT, 'config.txt'), 'utf8').split(/\r?\n/)
  .filter(l => /^\s*CHECKPOINT\s*=/.test(l)).map(l => l.split('=').slice(1).join('=').split('|').map(x => x.trim()))
  .map(p => ({ name:p[0], short:p[1], mark:(p[5] || '').toLowerCase() }));

// ---- The words -----------------------------------------------------------------------
// Kinetic type: | between lines, *words* in the highlight, each word its own
// span for the stage to bring in.
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function kt(text){
  let hi = false;
  const word = w => {
    if (w[0] === '*'){ hi = true; w = w.slice(1); }
    const close = w.slice(-1) === '*';
    if (close) w = w.slice(0, -1);
    const out = '<span class="w' + (hi ? ' hi' : '') + '">' + esc(w) + '</span>';
    if (close) hi = false;
    return out;
  };
  return '<div class="kt">' + text.split('|').map(l => '<span class="ln">' + l.trim().split(/\s+/).map(word).join(' ') + '</span>').join('') + '</div>';
}
// The question as Play's feature graphic asks it, the website's own line,
// three of the film's captions, and the poster's line for the ticket.
const WORDS = {
  hook:  'Nasaan na|ang bus?',
  route: 'See where|the bus is|*right now.*',
  near:  'Know when|your bus|is *near.*',
  share: 'On the bus?|*Share it.*',
  ticket:'A ticket and|a salamat|*every trip.*',
  dress: 'Earn coins and|*dress up*|*your bus.*'
};

// ---- What each scene draws, and when ------------------------------------------------
// Times are the scene's own, from when it has come up.
const HOOK = { kt:.25, f:[[0, 26], [DUR.hook, 14]], sky:'dawn', dur:DUR.hook };
// The strip, as the app draws it: northbound above in gold, southbound
// below in maroon, a station for each checkpoint, and buses as the coach's
// front on a disc, going each its own way.
const RAIL = [70, 930], NY = 170, SY = 450;
const ROUTE = { kt:.45, railAt:.9, rail:RAIL, buses:[
  { dir:1, y:NY, x0:.03, v:.10, at:1.75 }, { dir:1, y:NY, x0:.37, v:.08, at:1.9 }, { dir:1, y:NY, x0:.72, v:.07, at:2.05 },
  { dir:-1, y:SY, x0:.12, v:.09, at:2.2 }, { dir:-1, y:SY, x0:.58, v:.08, at:2.35 }] };
// The stop card's picture: the bus coming down the road, four stops off to
// your stop. It says Malapit na! (and buzzes) two stops off, Sakay na! at
// the last, as the card does: n stops between for f in (n, n + 1].
const NEAR = { kt:-.15, cardAt:.3, f:[[1.0, 4.6], [6.4, 0]], worn:['sampaguita'], paint:'klasiko' };
NEAR.nearAt = when(NEAR.f, 3);
NEAR.hereAt = when(NEAR.f, 1);
const SHARE = { kt:-.15, cardAt:.3, pinAt:1.1, tys:[2.2, 2.75, 3.3], sayAt:4.0 };
// On board, from the front seat: the stop comes up the road (km to go),
// Bababa na!, then Stop and the ticket, from the third checkpoint to the
// fourth, as the film's trip goes.
const TICKET = { kt:-.15, cardAt:.3, km:[[.4, .17], [3.1, .012]], flagAt:.8, tktAt:3.2, stampAt:4.15,
  stops:[2.81, 4.63, 5.3], place:(CPS[3] || CPS[0]).name, worn:['sampaguita', 'dice'], paint:'kahel' };
// A new paint and one more thing on it, every half second.
const ADD = ['flames', 'horns', 'flowers', 'goldrims', 'underglow', 'visor'];
const PAINTS = ['kahel', 'dagat', 'lila', 'ginto', 'gubat', 'uling'];
const DRESS = { kt:-.15, cardAt:.3, looks:[{ at:0, paint:'klasiko', keys:['sampaguita'] }].concat(ADD.map((k, i) =>
  ({ at:1.4 + i * .5, paint:PAINTS[i], keys:['sampaguita'].concat(ADD.slice(0, i + 1)) }))), tiles:[1.4, 1.9, 2.4, 2.9] };

// ---- The stage's plan ---------------------------------------------------------------
function plan(P){
  const coach = P.svCoachFront('klasiko', [], false);
  const bus = (b, i) => {
    const c = b.dir > 0 ? '#e39a1c' : '#7a1f2b';
    return '<g class="m-bus" opacity="0"><circle class="m-live" r="40" fill="none" stroke="' + c + '" stroke-width="6"/>' +
      '<circle r="54" fill="' + c + '" stroke="#fbf4e4" stroke-width="7"/>' +
      '<svg x="-40" y="-43" width="80" height="80" viewBox="-10 -12 160 152" overflow="visible">' + coach + '</svg></g>';
  };
  const n = CPS.length, sx = i => RAIL[0] + i * (RAIL[1] - RAIL[0]) / (n - 1);
  const strip = '<svg viewBox="0 0 1000 640" aria-hidden="true">' +
    '<text class="dir" x="' + RAIL[0] + '" y="' + (NY - 74) + '">NORTHBOUND → ' + esc(CPS[n - 1].name.toUpperCase()) + '</text>' +
    '<text class="dir" x="' + RAIL[0] + '" y="' + (SY + 98) + '">← SOUTHBOUND · TO ' + esc(CPS[0].short) + '</text>' +
    '<path class="m-rail" d="M' + RAIL[0] + ' ' + NY + 'H' + RAIL[1] + '" stroke="#e39a1c" stroke-width="16" stroke-linecap="round" stroke-dasharray="1000" stroke-dashoffset="1000"/>' +
    '<path class="m-rail" d="M' + RAIL[1] + ' ' + SY + 'H' + RAIL[0] + '" stroke="#7a1f2b" stroke-width="16" stroke-linecap="round" stroke-dasharray="1000" stroke-dashoffset="1000"/>' +
    CPS.map((c, i) => '<g class="m-stn" opacity="0"><circle cx="' + sx(i) + '" cy="' + NY + '" r="17" fill="#fbf4e4" stroke="#e39a1c" stroke-width="7"/>' +
      '<circle cx="' + sx(i) + '" cy="' + SY + '" r="17" fill="#fbf4e4" stroke="#7a1f2b" stroke-width="7"/>' +
      '<text x="' + sx(i) + '" y="' + ((NY + SY) / 2 + 11) + '" text-anchor="middle">' + esc(c.short) + '</text></g>').join('') +
    ROUTE.buses.map(bus).join('') + '</svg>';
  const flower = '<i><svg viewBox="-12 -12 24 24" width="40" height="40" style="vertical-align:-8px">' +
    [0, 72, 144, 216, 288].map(a => '<circle r="5" cx="0" cy="-6" fill="#e39a1c" transform="rotate(' + a + ')"/>').join('') +
    '<circle r="4" fill="#c4432e"/></svg></i>';
  const tys = [[120, 770], [600, 720], [330, 650]];
  const from = CPS[2] || CPS[0], to = CPS[3] || CPS[n - 1];
  const scene = (id, x, html) => Object.assign({ id, in: T[id] ? [T[id] - SLIDE, T[id]] : undefined,
    out: id === 'end' ? undefined : [T[id] + DUR[id] - SLIDE, T[id] + DUR[id]], html }, x);
  return {
    captions: [], phone: [[0, 1920]], phoneX: [],
    ints: [
      scene('hook', HOOK, '<div class="m-bg"></div>' + kt(WORDS.hook) + '<div class="m-road"></div>'),
      scene('route', ROUTE, '<div class="m-bg"></div><div class="v-board">' + R.board(P, ['MENDEZ / TAGAYTAY', '⇄ ONE AYALA'], 'mr', 6.4) + '</div>' +
        kt(WORDS.route) + '<div class="m-strip">' + strip + '</div>'),
      scene('near', NEAR, '<div class="m-bg"></div>' + kt(WORDS.near) + '<div class="m-card"></div><div class="m-pill"></div><div class="m-say"></div>'),
      scene('share', SHARE, '<div class="m-bg"></div>' + kt(WORDS.share) +
        '<div class="m-card">' + F.framed(P, { views:['volcano'], sky:'day', worn:['sampaguita'], paint:'klasiko', now:0 }, '44 22 126 62') + '</div>' +
        '<div class="m-ring"></div><div class="m-ring"></div><div class="m-ring"></div>' +
        '<div class="m-pin"><svg viewBox="-90 -90 180 180"><path d="M0 60C0 60-50 18-50-12C-50-40-28-62 0-62S50-40 50-12C50 18 0 60 0 60Z" fill="#4f46b8" stroke="#fff" stroke-width="8"/>' +
          '<circle cy="-12" r="18" fill="#fff"/></svg></div>' +
        tys.map(p => '<div class="m-ty" style="left:' + p[0] + 'px; top:' + p[1] + 'px">' + flower + 'Salamat!</div>').join('') +
        '<div class="m-say">Your bus is on everyone\'s map now.</div>'),
      scene('ticket', TICKET, '<div class="m-bg"></div>' + kt(WORDS.ticket) + '<div class="m-card"></div><div class="m-pill here">Bababa na!</div>' +
        '<div class="m-tkt"><div class="hd"><span>SALAMAT TICKET</span><span>WED 14 OCT</span></div>' +
          '<div class="sub">Community bus tracker · unofficial</div><div class="dir">▲ NORTHBOUND</div>' +
          '<div class="art">' + P.ticketArtSvg({ from:from.mark, to:to.mark, sky:'day' }) + '</div>' +
          '<div class="ends">' + esc(from.short) + ' → ' + esc(to.short) + '</div><div class="ty">3 riders said salamat</div></div>' +
        '<div class="m-stamp">Salamat</div>'),
      scene('dress', DRESS, '<div class="m-bg"></div>' + kt(WORDS.dress) + '<div class="m-card"></div>' +
        '<div class="m-tiles">' + ADD.slice(0, DRESS.tiles.length).map(k => '<div class="m-tile">' + P.decorTile(k) + '</div>').join('') + '</div>'),
      scene('end', {}, F.endCard(P, F.endQr()))
    ].map(x => Object.assign(x, { id: x.id === 'end' ? 'end' : 'm-' + x.id }))
  };
}

// ---- What is heard, and when ------------------------------------------------------
function score(){
  const at = (k, u) => T[k] + u, out = [];
  const add = (t, kind, o) => out.push(Object.assign({ t, kind }, o || {}));
  Object.keys(DUR).forEach(k => { if (T[k] > 0) add(T[k] - SLIDE, 'whoosh'); });
  // A pop as each line of the question lands.
  WORDS.hook.split('|').reduce((i, l) => { add(at('hook', HOOK.kt + .2 + i * .09), 'pop', { gain:.5 }); return i + l.trim().split(/\s+/).length; }, 0);
  add(at('route', .15), 'board');
  ROUTE.buses.forEach(b => add(at('route', b.at + .1), 'pop', { gain:.4 }));
  add(at('near', NEAR.nearAt), 'buzz', { pattern:[180, 90, 180], gain:1 });
  add(at('near', NEAR.nearAt), 'pop');
  add(at('near', NEAR.hereAt), 'chime');
  add(at('share', SHARE.pinAt), 'start');
  SHARE.tys.forEach(u => add(at('share', u), 'sparkle'));
  add(at('ticket', TICKET.flagAt), 'chime');
  add(at('ticket', TICKET.tktAt), 'ticket');
  add(at('ticket', TICKET.stampAt), 'stamp');
  DRESS.looks.slice(1).forEach(l => add(at('dress', l.at), 'dress'));
  add(at('dress', DRESS.looks[1].at), 'coins');
  add(T.end + .35, 'outro');
  return out.sort((a, b) => a.t - b.t);
}

// ---- Running it --------------------------------------------------------------------
async function main(){
  fs.mkdirSync(R.OUT, { recursive:true });
  const { chromium } = R.playwright();
  const browser = await chromium.launch({ executablePath: R.CHROME || undefined, args:['--hide-scrollbars', '--force-color-profile=srgb'] });
  const P = R.pictures();
  const stage = new R.Stage();
  const started = Date.now();
  await stage.open(browser);
  await stage.init(plan(P));
  // The end card's bus is the one just dressed, as in the film.
  const last = DRESS.looks[DRESS.looks.length - 1];
  await stage.page.evaluate(h => { document.getElementById('endRide').innerHTML = h; },
    F.framed(P, { views:['towers'], sky:'day', worn:last.keys, paint:last.paint, now:0 }, F.END_VIEW));
  const name = R.NAME + '-motion' + (R.FROM > 0 || R.TO < T.total ? '-part' : '');
  const file = path.join(R.OUT, name + '.mp4'), silent = path.join(R.OUT, name + '-picture.mp4');
  const enc = R.encoder(silent);
  const frames = Math.round(T.total * R.FPS);
  let drawn = 0;
  for (let f = 0; f < frames; f++){
    const v = f / R.FPS;
    if (v >= R.TO) break;
    if (v < R.FROM) continue;
    await enc.write(await stage.frame(v, null, null));
    drawn++;
    if (drawn % 60 === 0) process.stdout.write('  ' + v.toFixed(1) + 's of ' + T.total.toFixed(1) + 's (' + Math.round((Date.now() - started) / 1000) + 's)\n');
  }
  await enc.end();
  const from = Math.max(0, R.FROM), to = Math.min(T.total, R.TO), heard = score();
  const track = path.join(R.OUT, name + '-ui-sounds.wav');
  fs.writeFileSync(track, S.wav(S.mix(heard.filter(e => e.t >= from - 2 && e.t < to).map(e => Object.assign({}, e, { t:e.t - from })), to - from)));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', track, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', file]);
  fs.unlinkSync(silent);
  // The cover: the bus two stops off, Malapit na! up.
  try {
    const c = Math.max(R.FROM, Math.min(T.near + NEAR.nearAt + .8, R.TO - .1)) - R.FROM;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(c), '-i', file, '-frames:v', '1', '-q:v', '2', path.join(R.OUT, R.NAME + '-motion-cover.jpg')]);
  } catch (e) {}
  console.log('Sounds: ' + heard.filter(e => e.t >= from && e.t < to).map(e => e.kind + '@' + e.t.toFixed(2)).join(' '));
  console.log('Wrote ' + file + ' and ' + path.basename(track) + ' (' + drawn + ' frames in ' + Math.round((Date.now() - started) / 1000) + 's)');
  await browser.close();
}
module.exports = { main, plan, score, T, DUR };
