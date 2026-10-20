// The showcase video's story, scene by scene: what is on screen, what is
// tapped and when, what the caption says, and where the made-up buses are.
// The machinery is in render.js; run that (or tools/render-video.sh).
//
// One sharer's morning, then another rider's. Waiting at Javalera, the
// stop card counts the bus down to "Sakay na!"; on board, the sharer puts
// the bus on everyone's map, riders say salamat, the card says "Bababa
// na!" as the road comes up to their stop, the app asks "Getting off here?"
// and Stop sharing gives a ticket. The ticket goes into My tickets,
// the bus gets a new paint, and "Show customized bus to riders" goes on.
// Next morning a rider by Tagaytay taps that bus and sees it as dressed.
//
// Javalera and SM City General Trias were chosen because the card counts
// down to them one stop at a time. Waiting at Dagatan it reads "8 stops"
// and then "2", which is right (the Tagaytay hook puts the stops behind the
// bus on the chain) but looks like a fault on screen.
//
// There are three captions, one for each part of the story, each one short
// plain sentence in English that never promises what the app does not: no
// minutes, no arrival time. "Earn coins and dress up your bus." is the
// maintainer's own; the app itself calls the coins spare parts.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const R = require('./render.js');
const S = require('./sounds.js');

// ---- How long each scene runs, in seconds ----------------------------------
// As long as its beats take at the film's pace (below): about 66 seconds in
// all.
const DUR = { title:3.2, watch:4.2, wait:12.9, share:8.8, trip:2.2, getoff:4.65, ticket:5.65, collect:3.0, dress:8.5, show:2.4, rider:3.85, end:6.5 };
const T = {};
let acc = 0;
Object.keys(DUR).forEach(k => { T[k] = acc; acc += DUR[k]; });
T.total = acc;

// ---- The pace -----------------------------------------------------------------
// The app speaks for itself: three captions, one for each part of the story
// (waiting for the bus, sharing it, dressing it up), and the rest is said by
// the app's own words on screen, Malapit na!, Sakay na!, the salamat,
// Bababa na!, the ticket. Every beat goes the same way: the camera settles
// on what is about to be used, a ring closes in on the button (POINT
// seconds) so the eye is there first, the tap, and a moment on what it did.
// Where a caption lands, nothing is tapped or moved until it can have been
// read (READ: a moment to notice it, and a quarter of a second a word),
// because a viewer reads the words first and looks at the phone after.
// rehearse() stops the render if a cue breaks that.
//
// The first cut had a caption for every step, each tapped about half a
// second after it appeared, and a viewer was still reading when the screen
// changed. Holding all thirteen until read made 75 seconds of it, and
// showing each on its own over the dimmed phone made 80; the maintainer
// liked neither and chose three captions (October 2026).
const POINT = .35;
const READ = say => .4 + .25 * say.replace(/\*/g, '').trim().split(/\s+/).length;

// ---- The roads, as stops in the order a northbound bus passes them --------
const NORTH = R.road(['Crossing Mendez', 'NBI Tagaytay', 'City College of Tagaytay', 'SMDC (Wind Residences)', 'Magallanes Square / Hiraya',
  'Lourdes', 'Tagaytay Olivarez', 'Metrogate Tagaytay', 'Tagaytay Greenville', "Salaban (Shakey's Bypass)", 'Loma', 'Amadeo (Highway)',
  'Dagatan', 'Banaybanay', 'Balite', 'Tamacan', 'Panungyanan', 'Javalera', 'Gateway Business Park', 'Biclatan', 'Manggahan', 'Monterey',
  'Sunny Brooke', 'Vista Mall General Trias', 'Santiago', 'SM City General Trias', 'Greengate Homes', 'Malagasang 1-G', 'New Imus City Hall',
  'Ospital ng Imus', 'Alapan 2-B', 'Savemore - The Avenue', 'Veraneo', 'Baypoint Estates', 'Kalayaan Road', 'Evo City', 'S&R Kawit', 'Gahak',
  'PITX', 'City of Dreams', 'Parqal Mall', 'DFA-Aseana', 'W-Mall', 'Double Dragon', 'Manila Tytana Colleges', 'HK Sun Plaza',
  'World Trade Center', 'Shell Buendia', 'LRT Buendia (Gil Puyat)', 'Washington', 'Makati Medical Center', 'Paseo de Roxas',
  'Makati Shangri-La', 'One Ayala Terminal']);
const SOUTH = R.road(['One Ayala Terminal', 'Makati Shangri-La', 'Paseo de Roxas', 'Makati Medical Center', 'Washington', 'LRT Buendia (Gil Puyat)',
  'World Trade Center', 'HK Sun Plaza', 'Double Dragon', 'W-Mall', 'DFA-Aseana', 'City of Dreams', 'PITX', 'Gahak', 'S&R Kawit', 'Evo City',
  'Kalayaan Road', 'Baypoint Estates', 'Veraneo', 'Savemore - The Avenue', 'Alapan 2-B', 'Ospital ng Imus', 'New Imus City Hall',
  'Malagasang 1-G', 'Greengate Homes', 'SM City General Trias', 'Santiago', 'Vista Mall General Trias', 'Sunny Brooke', 'Monterey']);
const WAIT = 'Javalera', OFF = 'SM City General Trias';
const WAIT_KM = NORTH.km(WAIT);   // 24.7 on this road

// ---- The two days -----------------------------------------------------------
// The sharer's phone: a Wednesday morning inside the northbound hours, then
// half an hour of the trip passes during its interlude, once the phone is
// off the screen and over by JUMPED, so that the phone keeps the film's time
// again before it comes back: the road on board goes by the phone's clock.
const A_DAY = Date.parse('2026-10-14T06:15:00+08:00');
const JUMP = 30 * 60000, JUMPED = T.trip + .9;
const A_CLOCK = R.keys([[0, A_DAY], [T.trip + .4, A_DAY + (T.trip + .4) * 1000], [JUMPED, A_DAY + JUMPED * 1000 + JUMP],
                        [1000, A_DAY + 1000 * 1000 + JUMP]]);
// The other rider's phone, the next morning.
const B_DAY = Date.parse('2026-10-15T05:52:00+08:00');
const B_CLOCK = v => B_DAY + (v - T.rider) * 1000;

// What the sharer's phone remembers: nine trips shared, six tickets kept.
// The tenth, in this film, earns the tassels (Borlas, 10 trips shared).
const SEED_BUS = { n:9, first:1, full:1, dawn:3, night:1, north:6, south:3, tw:1, ts:1, mins:480, ty:16, wk:2962, streak:3, best:3,
  c:40, day:20739, dayn:1, show:0, asked:1, places:['MENDEZ', 'TGY', 'AMADEO', 'GEN.T', 'IMUS', 'KAWIT', 'PITX', 'AYALA'],
  own:['dice', 'visor'], paints:[], paint:'klasiko', off:['bell', 'placard', 'route', 'stripe'], paid:[] };
const SEED_TICKETS = [
  { d:'2026-10-05', dir:'s', from:'AYALA', to:'AMADEO', st:[], ty:false },
  { d:'2026-10-06', dir:'n', from:'TGY', to:'KAWIT', st:['first'], ty:true },
  { d:'2026-10-08', dir:'s', from:'PITX', to:'GEN.T', st:['night'], ty:false },
  { d:'2026-10-09', dir:'n', from:'MENDEZ', to:'AYALA', st:['full', 'dawn'], ty:true },
  { d:'2026-10-12', dir:'n', from:'AMADEO', to:'IMUS', st:['dawn'], ty:true },
  { d:'2026-10-13', dir:'s', from:'GEN.T', to:'TGY', st:[], ty:true }
];

// ---- The buses --------------------------------------------------------------
function buses(world){
  // The one the sharer waits for: four stops off when the card comes into
  // view, two (Malapit na!, and the buzz) 1.6s after the buzz is switched
  // on, at the stop (Sakay na!) 2.5s after that. Waiting at Javalera the
  // card's words change between 15.7 and 15.8, 18.2 and 18.3, 19.1 and
  // 19.2 (Malapit na!) and 22.6 and 22.7 km (Sakay na!) on this road,
  // measured a tenth of a kilometre apart. The page sees the bus only at
  // the film's polls, on the half second, so each alarm is crossed between
  // two of them (15.5 and 16.0s, 18.0 and 18.5s) and clear of both.
  // It leaves the map as they board: whoever was sharing it got off there.
  world.bus({ id:'a1', phone:'A', dir:'north', label:'1043', road:NORTH, on:[0, T.share + .2], age:5000,
    km:R.keys([[0, 10.6], [T.wait + 6.25, 17.0], [T.wait + 8.1, 18.95], [T.wait + 8.6, 19.3], [T.wait + 11.1, 22.9],
               [T.wait + 12.2, WAIT_KM - .05]]) });
  world.bus({ id:'a2', phone:'A', dir:'north', label:null, road:NORTH, on:[0, 1000], age:9000,
    km:R.keys([[0, 40.5], [T.share, 47.0], [T.trip + DUR.trip, 61], [1000, 61]]) });
  world.bus({ id:'a3', phone:'A', dir:'north', label:'1027', road:NORTH, on:[0, 1000], age:7000,
    km:R.keys([[0, 55.5], [T.share, 60.5], [T.trip + DUR.trip, 66], [1000, 66]]) });
  world.bus({ id:'a4', phone:'A', dir:'south', label:'1019', road:SOUTH, on:[0, 1000], age:11000,
    km:R.keys([[0, 22.0], [T.share, 28.0], [T.trip + DUR.trip, 44], [1000, 44]]) });
  world.bus({ id:'a5', phone:'A', dir:'north', label:null, road:NORTH, on:[0, 1000], age:14000,
    km:R.keys([[0, 2.2], [T.share, 6.0], [T.trip + DUR.trip, 14], [1000, 14]]) });
  // The next morning: the sharer's bus again, dressed, on the ridge road
  // short of Tagaytay, so its popup draws it against Taal. Its look is set
  // from the sharer's phone once it has one (see 'show').
  world.dressed = world.bus({ id:'b1', phone:'B', dir:'north', label:'1043', road:NORTH, on:[0, 1000], age:4000, look:'',
    km:R.keys([[T.rider - 1, 3.4], [T.rider + DUR.rider, 4.4]]) });
  world.bus({ id:'b2', phone:'B', dir:'north', label:null, road:NORTH, on:[0, 1000], age:8000,
    km:R.keys([[T.rider - 1, 27.0], [T.rider + DUR.rider, 28.5]]) });
  world.bus({ id:'b3', phone:'B', dir:'south', label:'1019', road:SOUTH, on:[0, 1000], age:12000,
    km:R.keys([[T.rider - 1, 18.0], [T.rider + DUR.rider, 19.5]]) });
  // Salamat on the sharer's trip: one, then three.
  world.thanks.A = R.keys([[SALAMAT[0], 0], [SALAMAT[0] + .01, 1], [SALAMAT[1], 1], [SALAMAT[1] + .01, 3]]);
}
// ---- Captions ---------------------------------------------------------------
// One plain sentence for each part of the story, *word* drawn in gold, at
// the top from its time until its to: waiting for the bus, from the first
// look at the map until the bus is boarded; sharing it, until the trip;
// dressing it up, until the other rider. The words are the maintainer's,
// kept from the captions there were. Each lands once the camera has settled,
// and the first tap under it is timed from it: read(k) is when caption k has
// been read, the first moment anything may happen under it.
const CAP = {
  near:  { at:T.watch + .25, to:T.share, say:'Know when your bus is *near*.' },
  share: { at:T.share + .35, to:T.trip,  say:'On the bus? *Share it*.' },
  dress: { at:T.dress + 1.6, to:T.rider, say:'Earn coins and *dress up your bus*.' }
};
const read = k => CAP[k].at + READ(CAP[k].say);
const SAY = Object.keys(CAP).map(k => [CAP[k].at, CAP[k].to, CAP[k].say]);
// Start and Stop, and the salamat (one, then three in all). Stop is the
// "Stop sharing" of the app's "Getting off here?", asked at ASK.
const START = read('share') + 2.4, STOP = T.ticket + .6, ASK = STOP - 1.85;
const SALAMAT = [T.share + 6.8, T.share + 8.0];

// The sharer's GPS, from Start until Stop. 700 m past the stop when Start is
// tapped: the card still has the stop they waited at, and within 300 m of it
// (AT_STOP_KM) it would say "Bababa na!" and spend the trip's one buzz there.
// The trip itself goes by while the phone is off the screen, in a moment of
// the interlude, to 140 m short of where the app asks "Getting off here?":
// within 100 m of the stop along the route (STOP_REACHED_KM), at 37.08 km on
// this road, measured. The card says Bababa na! there, from 35.2 km.
// From JUMPED it goes at V, about 110 km/h, the fastest the card's road
// drives rather than jumps (SV_FASTEST in index.html), so the road comes on
// from the front seat at the bus's own pace: the green sign for 0.2 km to
// go goes by the glass a second after the phone is up, and the stop with
// its people comes into sight on the horizon before the app asks. Then it
// slows, as a bus pulling in does. Faster, the road's joints and dashes go
// by too fast for the film's frames; the old time-lapse, a stop every
// 0.75 s, was further each half second than the road drives and was drawn
// as a jump every time.
const V = .03, ASK_KM = NORTH.km(OFF) - .1;
const GPS = R.keys([[START - .05, WAIT_KM + .7], [T.trip + .4, 26.4], [JUMPED, ASK_KM - V * (ASK - JUMPED)], [ASK, ASK_KM],
                    [ASK + .5, ASK_KM + .012], [ASK + 1, ASK_KM + .02], [ASK + 1.5, ASK_KM + .025], [ASK + 2, ASK_KM + .027],
                    [1000, ASK_KM + .027]]);
// Where a buzz belongs in the story: waiting. On board the card buzzes
// once, two stops before the sharer's own, and that is in the interlude.
const BUZZ_SCENES = [[T.wait, T.share]];
// The phone comes up at the end of the title, goes down for the trip and
// the end, and slides across between the two phones: two whips, getting on
// the bus (the stop to get off at is set while the phone is off the screen)
// and handing over to the other phone.
const PHONE_Y = [[T.watch - .6, 1920], [T.watch, 0], [T.trip - .1, 0], [T.trip + .5, -1920], [T.trip + .501, 1920], [T.getoff - .6, 1920],
                 [T.getoff, 0], [T.end, 0], [T.end + .6, -1920]];
const PHONE_X = [[T.share - .3, 0], [T.share - .05, -1180], [T.share - .0499, 1180], [T.share + .25, 0],
                 [T.rider - .4, 0], [T.rider - .1, -1180], [T.rider - .0999, 1180], [T.rider + .25, 0]];
// What else the bus could wear, for the few seconds after the paint is
// bought: a paint and the things on it, from SHOP and the trophies this bus
// has earned (an unearned trophy cannot be worn).
const LOOKS = [
  { paint:'dagat', worn:['flames', 'goldrims', 'horns', 'sampaguita'] },
  { paint:'lila',  worn:['underglow', 'mirror', 'fringe', 'flowers'] },
  { paint:'uling', worn:['flames', 'exhaust', 'antenna', 'stripe'] },
  { paint:'ginto', worn:['goldrims', 'visor', 'dice', 'horns', 'bumpers'] },
  { paint:'gubat', worn:['underglow', 'antenna', 'flowers', 'sunrise', 'fringe'] }
];
// The frame's own sounds: the board lighting up, the swipes between scenes
// and the end card.
const SCORE = [
  { t:.35, kind:'board' }, { t:T.watch - .6, kind:'whoosh' }, { t:T.share - .3, kind:'whoosh' },
  { t:T.trip - .1, kind:'whoosh' }, { t:T.getoff - .6, kind:'whoosh' }, { t:T.rider - .4, kind:'whoosh' },
  { t:T.end, kind:'whoosh' }, { t:T.end + .35, kind:'outro' }
];
// What the page is showing that has a sound, read off the phone on screen
// once a frame; changes() says which of them has just appeared.
function LISTEN(){
  const q = s => document.querySelector(s);
  // On the screen, not just on the page: the stop card below the fold
  // changing its words is not something anybody saw.
  const shown = el => {
    if (!el || !el.getClientRects().length || el.closest('.hidden')) return false;
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight;
  };
  const flag = [].slice.call(document.querySelectorAll('#myStop .ride-flag, #tripStop .ride-flag')).filter(shown)[0];
  const ty = q('#tyLine'), toast = q('#toast'), keep = q('#tktKeep');
  return { flag: flag ? flag.textContent : '', live: typeof sharing !== 'undefined' && !!sharing,
           ty: shown(ty) ? ty.textContent : '', tkt: shown(q('#tktModal .tkt')), kept: !!keep && keep.classList.contains('done'),
           album: shown(q('#albumModal .modal-card')), stops: shown(q('#stopModal .modal-card')), ask: shown(q('#askModal .modal-card')),
           toast: shown(toast) ? toast.textContent : '', on: !!q('.alb-toggle.on'), popup: !!q('.buspop') };
}
function changes(a, b){
  const out = [];
  if (b.flag && b.flag !== a.flag) out.push(/Malapit/.test(b.flag) ? 'pop' : 'chime');
  if (b.live && !a.live) out.push('start');
  if (b.ty && b.ty !== a.ty) out.push('sparkle');
  if (b.tkt && !a.tkt) out.push('ticket');
  if (b.kept && !a.kept) out.push('stamp');
  if ((b.album && !a.album) || (b.stops && !a.stops) || (b.ask && !a.ask)) out.push('open');
  if (b.toast && b.toast !== a.toast && /^Painted|is on your bus/.test(b.toast)) out.push('coins');
  if (b.on && !a.on) out.push('switch');
  if (b.popup && !a.popup) out.push('pop');
  return out;
}
// The closest the camera goes on the page, so it is never blown up: the
// phone is filmed at three pixels a point (Phone's deviceScaleFactor) and
// the stage shows it at 2.2 (860 / 390), so 3 / 2.2.
const SHARP = 1.35;
const gold = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*([^*]+)\*/g, '<b>$1</b>');

// ---- The scenes: what happens when ------------------------------------------
// Each cue is [time, what]. A tap is shown by the stage as a ring where the
// finger went, after a ring closing in on the place (press).
function cues(A, B, stage, world, browser, heard){
  const tap = async (phone, sel, at) => {
    const p = await phone.tap(sel);
    await stage.event({ type:'tap', at, x:p.x, y:p.y });
    heard.push({ t:at, kind:'tap' });
  };
  // A finger on a control at t, the ring closing in on it for POINT seconds
  // first, so the eye is already there when the tap lands. The control is a
  // selector, or a function the page runs to find the point.
  const find = async (phone, target) => {
    if (typeof target !== 'string') return phone.run(target);
    const r = await phone.rect(target);
    return r && { x:r.x + r.w / 2, y:r.y + r.h / 2 };
  };
  const press = (phone, target, t) => {
    at(t - POINT, async v => {
      const p = await find(phone, target);
      if (p) await stage.event({ type:'point', at:v, dur:POINT, x:p.x, y:p.y });
    });
    at(t, async v => {
      if (typeof target === 'string') return tap(phone, target, v);
      const p = await find(phone, target);
      if (!p) throw new Error(phone.name + ': nothing to tap');
      return tap(phone, { x:p.x, y:p.y, w:0, h:0 }, v);
    });
  };
  // The camera onto an element of the page, or back out to the whole phone.
  // A close-up fills the frame with the screen, but for the top under a
  // caption's band, wherever the element asks to be put (frameFor() in
  // stage.html), and the render says if a settled one shows any backdrop.
  const cam = async (phone, sel, at, o) => {
    const r = sel ? await phone.rect(sel) : null;
    if (r && o && o.maxH) r.h = Math.min(r.h, o.maxH);
    await stage.event(Object.assign({ type:'camera', at, rect:r, dur:.6 }, o || {}));
  };
  const type = async (phone, sel, text) => {
    await phone.run(([s, t]) => { const el = document.querySelector(s); el.value = t; el.dispatchEvent(new Event('input')); }, [sel, text]);
  };
  const smooth = (phone, from, to, a, b) => ({ from:a, to:b, fn: v => phone.scrollTo(from + (to - from) * easeIO((v - a) / (b - a))) });
  const list = [];
  const at = (t, fn) => list.push({ t, fn });
  const scrolls = [];
  // The page itself, the same way.
  const glideDoc = (phone, y, dur, arg) => async v => {
    const from = await phone.run(() => document.scrollingElement.scrollTop);
    const to = await phone.run(y, arg);
    scrolls.push({ from:v, to:v + dur, fn: w => phone.scrollTo(from + (to - from) * easeIO((w - v) / dur)) });
  };
  // The page scrolled so an element is in the middle of the screen, as far
  // as the page goes: then a camera on it has the page around it, not the
  // edge of the phone.
  const centre = (phone, sel, dur) => glideDoc(phone, s => {
    const r = document.querySelector(s).getBoundingClientRect(), d = document.scrollingElement;
    return Math.max(0, Math.min(d.scrollHeight - innerHeight, d.scrollTop + r.top + r.height / 2 - innerHeight / 2));
  }, dur, sel);
  // A scrolling box inside the page (My tickets, the ticket), from where it
  // is to y over dur seconds, worked out when the cue runs.
  const glide = (phone, sel, y, dur) => async v => {
    const from = await phone.run(s => document.querySelector(s).scrollTop, sel);
    const to = typeof y === 'function' ? await phone.run(y, sel) : y;
    scrolls.push({ from:v, to:v + dur, fn: w => phone.run(([s, top]) => { document.querySelector(s).scrollTop = top; },
      [sel, from + (to - from) * easeIO((w - v) / dur)]) });
  };

  // watch: nothing tapped; the buses move. Then the page goes down a little,
  // to the stop card.
  scrolls.push(smooth(A, 0, 120, T.wait - .8, T.wait - .4));
  // wait: save the stop, switch the buzz on, and watch it count down.
  press(A, '#myStop .mystop-btn', T.wait + .5);
  // Close on the picker, near enough to read what is typed and what it
  // finds; the whole name, a letter at a time, and a moment on it.
  at(T.wait + .75, v => cam(A, '#stopModal .modal-card', v, { width:1040, topAt:330, maxH:560 }));
  // The list shrinks to what the first letter finds and the picker, which
  // the page keeps in the middle, moves with it: the camera follows.
  at(T.wait + 1.65, v => cam(A, '#stopModal .modal-card', v, { width:1040, cy:1040, dur:.4 }));
  WAIT.split('').forEach((c, i) => at(T.wait + 1.55 + i * .15, async v => {
    await type(A, '#stopSearch', WAIT.slice(0, i + 1));
    heard.push({ t:v, kind:'tap', gain:.35 });
  }));
  press(A, '#stopList button[data-name="' + WAIT + '"]', T.wait + 3.25);
  // Picked: the camera goes to the pin as it lands on the map, rings go out
  // from it with its name beside them, and it stays there a second before
  // the card. No closer than SHARP: the phone is filmed at three pixels a
  // point and the stage draws it at 2.2, so past 1.36 times the map is
  // blown up and blurs (2.4 did). The rings and the name do the pointing.
  // (The pin's own label, what tapping it shows, is wider than the screen
  // when close and sits over the pin.)
  at(T.wait + 3.4, async v => {
    const r = await A.rect('.mypin');
    await cam(A, '.mypin', v, { width:1000, cy:1060, maxZ:SHARP, dur:.6 });
    if (r) await stage.event({ type:'mark', at:v + .3, x:r.x + r.w / 2, y:r.y + r.h / 2, dur:1.5, label:WAIT });
    heard.push({ t:v + .3, kind:'stamp', gain:.8 });
  });
  at(T.wait + 5.15, v => cam(A, null, v, { dur:.45 }));
  at(T.wait + 5.15, centre(A, '#myStop', .45));
  at(T.wait + 5.65, v => cam(A, '#myStop', v, { width:1010, cy:1170 }));
  press(A, '#myStop .buzz input', T.wait + 7.0);
  // Sakay na!, and the whip onto the bus. The phone goes off the screen
  // close on the card, and the camera comes back out while nobody sees it.
  at(T.share - .05, v => cam(A, null, v, { dur:.01 }));
  // On board, off camera for a moment: where to get off.
  at(T.share - .08, async () => {
    await A.tap('#myStop button.edit');
    await type(A, '#stopSearch', 'SM City');
    await A.tap('#stopList button[data-name="' + OFF + '"]');
    await A.scrollTo(0);
  });
  // share: the other tab, northbound, Start; then close on the strip, where
  // the salamat arrive.
  press(A, '#tabOnbus', read('share'));
  // Close on the sharing card: the direction and Start.
  at(read('share') + .3, v => cam(A, '#onbusView > .card', v, { width:1000, topAt:440, maxH:560 }));
  press(A, '#pickNorth', read('share') + 1.6);
  press(A, '#onbusStartBtn', START);
  at(START + .8, centre(A, '#onbusStripCard', .4));
  at(START + 1.25, v => cam(A, '#onbusStripCard', v, { width:1000, cy:1170 }));
  // trip: off camera, the road opened on the card, as the sharer would (it
  // starts folded on the sharing tab), and the card under the strip in the
  // middle of the screen.
  at(T.trip + .5, () => A.run(() => { if (!ROAD) toggleRoad(); }));
  at(T.trip + 1.05, centre(A, '#tripStop', .3));
  at(T.trip + 1.6, v => cam(A, '#tripStop', v - .6, { width:1010, cy:960 }));
  // getoff: the road comes up to the stop by itself, and the app asks
  // "Getting off here?" (ASK, by the GPS).
  // ticket: its Stop sharing, the ticket, down it, Keep.
  press(A, '#askYes', STOP);
  at(STOP + .6, v => cam(A, '#tktCard', v, { width:1040, topAt:60, maxH:420 }));
  at(T.ticket + 2.4, glide(A, '#tktModal', s => { const b = document.querySelector(s); return b.scrollHeight - b.clientHeight; }, 1.3));
  at(T.ticket + 4.2, v => cam(A, null, v, { dur:.5 }));
  press(A, '#tktKeep', T.ticket + 5.05);
  // collect: My tickets, down to the tickets.
  press(A, '#tktKeep', T.collect + .6);
  at(T.collect + .85, v => cam(A, '#albumModal .modal-card', v, { width:1040, cy:960, dur:.5 }));
  at(T.collect + 1.5, glide(A, '#albumModal .modal-scroll', s => {
    const box = document.querySelector(s), list = box.querySelector('.alb-list');
    return list.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 60;
  }, .9));
  // dress: back up to the bus, then a new paint (one tap to choose, one to
  // get it).
  at(T.dress + .05, glide(A, '#albumModal .modal-scroll', s => {
    const box = document.querySelector(s), p = box.querySelector('.alb-paints');
    return Math.max(0, p.getBoundingClientRect().bottom - box.getBoundingClientRect().top + box.scrollTop - box.clientHeight + 16);
  }, .8));
  // Close on the bus from here to the switch, so filmed twice as fine (see
  // SHARP), and the montage after it closer still. It settles before the
  // caption comes, so it fills the frame, and the caption comes over its top.
  at(T.dress + .85, () => A.resolution(6));
  at(T.dress + .9, v => cam(A, '.alb-bus', v, { width:1000, cy:1000 }));
  press(A, '.alb-paint[data-paint="kahel"]', read('dress'));
  press(A, '.alb-paint[data-paint="kahel"]', read('dress') + .7);
  // Then what else it could wear: the same bus in other paints and with
  // other things on, half a second each, and back to the one just bought.
  // Taken from the shop's and the trophies' own lists, put straight into
  // what the phone remembers and drawn by My tickets itself; nothing is
  // tapped, and the bus as bought comes back before anything else sees it.
  let bought = null;
  // Close on the coach itself.
  at(read('dress') + 1.2, async v => {
    bought = await A.run(() => localStorage.getItem('wt-bus'));
    await cam(A, '.alb-ride .rk', v, { width:920, cy:1100, maxZ:3, dur:.5 });
  });
  LOOKS.forEach((l, i) => at(read('dress') + 1.8 + i * .5, async v => {
    await A.run(l => {
      const b = loadBus();
      b.paints = PAINTS.slice(1).map(p => p.k); b.own = SHOP.map(x => x.k); b.paint = l.paint;
      b.off = busEarned(b, CHECKPOINTS).concat(b.own).filter(k => l.worn.indexOf(k) < 0);
      saveBus(b); renderAlbum();
    }, l);
    heard.push({ t:v, kind:'dress' });
  }));
  at(read('dress') + 1.8 + LOOKS.length * .5, async v => {
    await A.run(r => { localStorage.setItem('wt-bus', r); renderAlbum(); }, bought);
    heard.push({ t:v, kind:'dress' });
  });
  // show: switch it on, and give the next morning's bus its look.
  at(T.show + .05, v => cam(A, '.alb-show', v, { width:1000, cy:1150, dur:.5 }));
  at(T.show + .6, () => A.resolution(3));
  press(A, '.alb-toggle', T.show + 1.2);
  at(T.show + 1.3, async () => { world.dressed.look = await A.run(() => busLook(loadBus(), CHECKPOINTS)); });
  // rider: another phone; tap the sharer's bus.
  // The rider's phone, filmed twice as fine: its popup is seen closer than
  // SHARP. Set while it is still off the screen, once the bus has its look.
  at(T.rider - 1, async () => {
    await B.open(browser, B_CLOCK, { 'wt-guide-seen':'1' }, T.rider - 1);
    await B.resolution(6);
  });
  at(T.rider - .4, v => cam(A, null, v, { dur:.3 }));
  press(B, BUS_1043, T.rider + 1.0);
  at(T.rider + 1.3, centre(B, '.buspop .leaflet-popup-content-wrapper', .4));
  at(T.rider + 1.75, v => cam(B, '.buspop .leaflet-popup-content-wrapper', v, { width:980, cy:1170 }));
  return { list: list.sort((a, b) => a.t - b.t), scrolls };
}
// The sharer's bus on the rider's map, by its number: run in the page, it
// says where to tap, just above the middle of the badge.
function BUS_1043(){
  let at = null;
  map.eachLayer(l => {
    if (at || !l.getLatLng || !l.getPopup || !l.getPopup()) return;
    const html = String(l.getPopup().getContent() || '');
    if (html.indexOf('1043') < 0) return;
    const pt = map.latLngToContainerPoint(l.getLatLng()), box = map.getContainer().getBoundingClientRect();
    at = { x: box.left + pt.x, y: box.top + pt.y - 14 };
  });
  return at;
}

function easeIO(p){ p = Math.max(0, Math.min(1, p)); return p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
// A phone's clock as Android's status bar shows it, 6:15.
function clockOf(ms){
  return new Date(ms).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true, timeZone:'Asia/Manila' }).replace(/\s*[AP]M$/i, '');
}

// The bus on the road, as a bus's popup draws it, framed for a tall picture
// (the popup's framing is RIDE_FRAMES in index.html; this is only the camera).
const framed = (P, t, box) => P.rideSvg(t).replace(/viewBox="[^"]*"/, 'viewBox="' + box + '"');

// ---- How it ends ----------------------------------------------------------------
// One film, three endings (render.js --ending), for where the Android app is:
// the website while the app is only in internal testing, the closed test's
// sign-up while it needs testers who ride (testers.html says what it asks),
// and the app on Google Play once it is public. The two app endings film the
// page as the app shows it (R.APP), so it never shows what the website does
// not do and then sends the viewer to the website, or the other way round.
// The website is Bus Tracker and the app is Fibi, as everywhere else.
const SITE_URL = 'https://community-bus-tracker.netlify.app';
const PLAY_ID = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'mobile', 'capacitor.config.json'), 'utf8')).appId;
const ENDS = {
  web:     { qr:SITE_URL, name:'Bus Tracker', lede:'See where the bus is right now.', url:'community-bus-tracker.netlify.app',
             fine:'Nothing to install. No account.<br>Community-run. Not affiliated with the bus company.' },
  testers: { qr:SITE_URL + '/testers', app:true, name:'Fibi', lede:'Test the app early.', url:'community-bus-tracker.netlify.app/testers', long:true,
             fine:'Android. It keeps sharing with your screen locked.<br>Community-run. Not affiliated with the bus company.' },
  play:    { qr:'https://play.google.com/store/apps/details?id=' + PLAY_ID, app:true, name:'Fibi', lede:'On Google Play.', url:'Fibi: Bus Tracker PH',
             fine:'It keeps sharing with your screen locked.<br>Community-run. Not affiliated with the bus company.' }
};
const END = ENDS[R.ENDING];

// ---- What the stage is told before the first frame ---------------------------
function plan(P, worn, qr){
  const sky = P.TICKET_SKIES.day;
  return {
    captions: SAY.map(c => ({ from:c[0], to:c[1], html:gold(c[2]) })),
    phone: PHONE_Y,
    phoneX: PHONE_X,
    app: R.APP,
    ints: [
      // "Where is the bus now?", as riders ask it in the group chat and as
      // Play's feature graphic asks it.
      { id:'title', out:[T.watch - .6, T.watch],
        html: '<div class="v-board" style="top:330px">' + R.board(P, ['MENDEZ / TAGAYTAY', '⇄ ONE AYALA'], 'tb', 8.6) + '</div>' +
              '<div class="hook">Nasaan na ang bus?</div>' +
              '<div class="v-scene">' + P.sceneSvg('dawn', 'ts') + '</div>' },
      { id:'trip', in:[T.trip - .1, T.trip + .5], out:[T.getoff - .6, T.getoff],
        html: '<div class="v-sky" style="background:' + sky.sky + '"></div>' +
              '<div class="v-board">' + R.board(P, ['GEN. TRIAS'], 'tg', 13) + '</div>' +
              '<div class="v-scene">' + framed(P, { views:['church'], sky:'day', worn:worn.worn, paint:worn.paint, now:0 }, '30 4 200 80') + '</div>' +
              '<div class="v-ground" style="background:' + sky.ground + '"></div>' },
      { id:'end', in:[T.end, T.end + .6],
        html: '<div class="v-board">' + R.board(P, ['MENDEZ / TAGAYTAY', '⇄ ONE AYALA'], 'te', 5.4) + '</div>' +
              '<div class="name">' + (END.app ? '<img class="icon" src="' + R.SITE + '/mobile/store/play-icon-512.png" alt="">' : '') +
                END.name + '</div>' +
              '<div class="lede">' + END.lede + '</div>' +
              '<div class="v-scene" id="endRide"></div>' +
              '<div class="qr">' + qr + '</div>' +
              '<div class="url' + (END.long ? ' long' : '') + '">' + END.url + '</div>' +
              '<div class="fine">' + END.fine + '</div>' }
    ]
  };
}

// ---- The rehearsal ------------------------------------------------------------
// The cues played once before anything is launched, on stand-ins that only
// note what each would do and when. Anything that moves on the screen while
// a caption is still being read (a tap, the camera, a scroll, a letter typed,
// a new look on the bus, a salamat, the phone itself), a caption gone before
// it can have been read, or a tap while the camera or the page is still
// moving, stops the render here, with both named.
async function rehearse(){
  const noted = [], heard = [];
  const stand = name => ({ name, open: async () => {}, resolution: async () => {}, scrollTo: async () => {},
    tap: async () => ({ x:0, y:0 }), rect: async () => ({ x:0, y:0, w:1, h:1 }), run: async () => ({ x:0, y:0, w:1, h:1 }) });
  const { list, scrolls } = cues(stand('A'), stand('B'), { event: async e => { noted.push(e); } }, { dressed:{} }, null, heard);
  // As the render runs them: at the first frame at or after their time.
  for (const c of list) await c.fn(Math.ceil(c.t * R.FPS - 1e-6) / R.FPS);
  const moves = [], s = t => t.toFixed(2) + 's', e = 1e-6;
  noted.forEach(n => {
    if (n.type === 'tap') moves.push({ a:n.at, b:n.at, what:'a tap', tap:true });
    if (n.type === 'point') moves.push({ a:n.at, b:n.at + n.dur, what:'a ring pointing at a tap', tap:true, ring:true });
    if (n.type === 'camera') moves.push({ a:n.at, b:n.at + n.dur, what:'the camera', moving:true });
    if (n.type === 'mark') moves.push({ a:n.at, b:n.at + n.dur, what:'the rings on the pin' });
  });
  scrolls.forEach(c => moves.push({ a:c.from, b:c.to, what:'a scroll', moving:true }));
  heard.forEach(h => {
    if (h.kind === 'tap' && h.gain) moves.push({ a:h.t, b:h.t, what:'a letter typed' });
    if (h.kind === 'dress') moves.push({ a:h.t, b:h.t, what:'a new look on the bus' });
  });
  SALAMAT.forEach(t => moves.push({ a:t, b:t, what:'a salamat' }));
  [PHONE_Y, PHONE_X].forEach(k => k.forEach((p, i) => {
    if (i && p[1] !== k[i - 1][1]) moves.push({ a:k[i - 1][0], b:p[0], what:'the phone', moving:true });
  }));
  const bad = [];
  SAY.forEach(c => {
    const from = c[0], end = from + READ(c[2]);
    if (c[1] < end - e) bad.push('"' + c[2] + '" is gone at ' + s(c[1]) + ', before it can have been read at ' + s(end));
    moves.forEach(m => {
      if (m.ring) return;   // the ring may close in while the last word is read
      const hit = m.b > m.a ? m.a < end - e && m.b > from + e : m.a > from - e && m.a < end - e;
      if (hit) bad.push(m.what + ' at ' + s(m.a) + ' while "' + c[2] + '" (' + s(from) + ') is read, until ' + s(end));
    });
  });
  moves.filter(m => m.tap).forEach(t => moves.filter(m => m.moving).forEach(m => {
    if (t.a < m.b - e && t.b > m.a + e) bad.push(t.what + ' at ' + s(t.a) + ' while ' + m.what + ' moves, ' + s(m.a) + ' to ' + s(m.b));
  }));
  if (bad.length) throw new Error('Something moves too soon (see "The pace" in film.js):\n  ' + bad.join('\n  '));
}
// ---- Running it -------------------------------------------------------------------
async function main(){
  await rehearse();
  if (!R.KEY && process.argv.indexOf('--no-key') < 0){
    console.error('CARTO_API_KEY is not set. Without it every map tile says "API KEY REQUIRED".\n' +
      'Set it (the same key the Netlify build uses), or pass --no-key to render anyway.');
    process.exit(1);
  }
  fs.mkdirSync(R.OUT, { recursive:true });
  const { chromium } = R.playwright();
  const browser = await chromium.launch({ executablePath: R.CHROME || undefined, args:['--hide-scrollbars', '--force-color-profile=srgb'] });
  const world = new R.World();
  buses(world);
  const P = R.pictures();
  const A = new R.Phone('A', world), B = new R.Phone('B', world);
  const stage = new R.Stage();
  const started = Date.now();
  await stage.open(browser);
  await A.open(browser, A_CLOCK, { 'wt-guide-seen':'1', 'wt-bus':JSON.stringify(SEED_BUS), 'wt-tickets':JSON.stringify(SEED_TICKETS) }, 0);
  // Everything those nine trips earned has been paid for already.
  const worn = await A.run(() => {
    const b = loadBus(); b.paid = busEarned(b, CHECKPOINTS); saveBus(b);
    return { worn: busWorn(b, CHECKPOINTS), paint: b.paint };
  });
  const qr = execFileSync(process.execPath, [path.join(__dirname, '..', 'make-qr.js'), END.qr],
    { stdio:['ignore', 'pipe', 'ignore'] }).toString();
  await stage.init(plan(P, worn, qr));
  // What is heard, and when: taps and buzzes as they happen, what the page
  // does as it is seen to (LISTEN), and the frame's own moments (SCORE).
  const heard = SCORE.slice();
  const { list, scrolls } = cues(A, B, stage, world, browser, heard);

  const base = R.NAME + (R.ENDING === 'web' ? '' : '-' + R.ENDING);
  const name = base + (R.FROM > 0 || R.TO < T.total ? '-part' : '');
  const file = path.join(R.OUT, name + '.mp4'), silent = path.join(R.OUT, name + '-picture.mp4');
  const enc = R.encoder(silent);
  const frames = Math.round(T.total * R.FPS);
  let drawn = 0, endDrawn = false;
  for (let f = 0; f < frames; f++){
    const v = f / R.FPS;
    if (v >= R.TO) break;
    while (list.length && list[0].t <= v + 1e-6){
      const c = list.shift();
      try { await c.fn(v); } catch (e) { console.log('  cue at ' + c.t.toFixed(2) + 's failed: ' + e.message.split('\n')[0]); }
    }
    for (const s of scrolls) if (v >= s.from && v <= s.to + 1 / R.FPS) await s.fn(Math.min(v, s.to));
    // The sharer's GPS, from Start until Stop.
    if (v >= START - .05 && v < STOP) await A.gps(NORTH.point(GPS(v)));
    await A.step(v);
    if (B.page) await B.step(v);
    // The page's own poll, more often than it would, so the buses glide in
    // steps of half a second rather than six; and right after the sharer's
    // phone sends a position, so its bus moves on its own screen at once.
    if (f % R.POLL_FRAMES === 0 || A.wrote){ A.wrote = false; await A.poll(); }
    if (B.page && f % R.POLL_FRAMES === 0) await B.poll();
    // The buzzes the story is about: the switch going on, and the two
    // alarms. The page also buzzes as a trip starts (15 ms, too short to
    // see or hear), which stays out. It used to buzz once more just after
    // Stop, for the bus just left; that was the app's, and is fixed there.
    for (const p of await A.buzzes()){
      const ms = p.reduce((s, x) => s + x, 0);
      if (process.env.VIDEO_DEBUG) console.log('  buzz at ' + v.toFixed(2) + 's: ' + JSON.stringify(p));
      if (!BUZZ_SCENES.some(w => v >= w[0] && v < w[1])) continue;
      await stage.event({ type:'buzz', at:v, pattern:p, ms, strong: ms > 100 });
      heard.push({ t:v, kind:'buzz', pattern:p, gain: ms > 100 ? 1 : .6 });
    }
    if (v < R.FROM) continue;
    // The end card's bus is the one the sharer has just dressed.
    if (!endDrawn && v >= T.end - .5){
      endDrawn = true;
      const look = await A.run(() => { const b = loadBus(); return { worn: busWorn(b, CHECKPOINTS), paint: b.paint }; });
      await stage.page.evaluate(h => { document.getElementById('endRide').innerHTML = h; },
        framed(P, { views:['towers'], sky:'day', worn:look.worn, paint:look.paint, now:0 }, '22 6 166 72'));
    }
    const which = v < T.rider - .1 ? A : B;
    const onScreen = (v >= T.watch - .8 && v < T.trip + .5) || (v >= T.getoff - .5 && v < T.end + .4);
    const shot = onScreen && which.page ? await which.shot() : null;
    if (which.page){
      const now = await which.run(LISTEN);
      if (onScreen && which.was) heard.push(...changes(which.was, now).map(kind => ({ t:v, kind })));
      which.was = now;
    }
    const jpg = await stage.frame(v, shot, R.APP ? clockOf(which.now) : null);
    await enc.write(jpg);
    drawn++;
    if (drawn % 30 === 0) process.stdout.write('  ' + v.toFixed(1) + 's of ' + T.total.toFixed(1) + 's (' + Math.round((Date.now() - started) / 1000) + 's)\n');
  }
  await enc.end();
  // The sounds, on a track of their own and under the picture.
  const from = Math.max(0, R.FROM), to = Math.min(T.total, R.TO);
  const track = path.join(R.OUT, name + '-ui-sounds.wav');
  fs.writeFileSync(track, S.wav(S.mix(heard.filter(e => e.t >= from - 2 && e.t < to).map(e => Object.assign({}, e, { t:e.t - from })), to - from)));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', track, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', file]);
  fs.unlinkSync(silent);
  // The cover: a frame worth stopping on, for a post's thumbnail.
  try {
    const at = Math.max(R.FROM, Math.min(T.wait + 9.4, R.TO - .1)) - R.FROM;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(at), '-i', file, '-frames:v', '1', '-q:v', '2', path.join(R.OUT, base + '-cover.jpg')]);
  } catch (e) {}
  console.log('Calls answered here, none sent to Supabase: ' + JSON.stringify(world.log));
  // Settled close-ups that showed the backdrop round the glass, as spans of
  // the film.
  const gaps = (await stage.page.evaluate(() => V.gaps())).reduce((a, g) => {
    const last = a[a.length - 1];
    if (last && g.t - last.to < 1.5 / R.FPS){ last.to = g.t; g.edges.forEach(e => { if (last.edges.indexOf(e) < 0) last.edges.push(e); }); }
    else a.push({ from:g.t, to:g.t, edges:g.edges.slice() });
    return a;
  }, []).map(g => g.from.toFixed(2) + (g.to > g.from ? '-' + g.to.toFixed(2) : '') + 's (' + g.edges.join(', ') + ')');
  console.log('Backdrop round a close-up: ' + (gaps.join(', ') || 'none'));
  console.log('Sounds: ' + heard.filter(e => e.t >= from && e.t < to).map(e => e.kind + '@' + e.t.toFixed(2)).join(' '));
  console.log('Wrote ' + file + ' and ' + path.basename(track) + ' (' + drawn + ' frames in ' + Math.round((Date.now() - started) / 1000) + 's)');
  await browser.close();
}
module.exports = { main, rehearse, T, DUR, SAY, READ };
