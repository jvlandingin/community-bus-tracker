// The showcase video's story, scene by scene: what is on screen, what is
// tapped and when, what the caption says, and where the made-up buses are.
// The machinery is in render.js; run that (or tools/render-video.sh).
//
// One sharer's morning, then another rider's. Waiting at Javalera, the
// stop card counts the bus down to "Sakay na!"; on board, the sharer puts
// the bus on everyone's map, riders say salamat, the card counts down to
// "Bababa na!", and Stop gives a ticket. The ticket goes into My tickets,
// the bus gets a new paint, and "Show customized bus to riders" goes on.
// Next morning a rider by Tagaytay taps that bus and sees it as dressed.
//
// Javalera and SM City General Trias were chosen because the card counts
// down to them one stop at a time. Waiting at Dagatan it reads "8 stops"
// and then "2", which is right (the Tagaytay hook puts the stops behind the
// bus on the chain) but looks like a fault on screen.
//
// The captions are one short plain sentence each, in English, and never
// promise what the app does not: no minutes, no arrival time. "Earn coins
// and dress up your bus." and "Help other commuters." are the maintainer's
// words; the app itself calls the coins spare parts.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const R = require('./render.js');
const S = require('./sounds.js');

// ---- How long each scene runs, in seconds ----------------------------------
// Saving the stop takes its time, so a viewer reads the name being typed and
// sees the pin land; the scenes around it are a little quicker for it.
const DUR = { title:3.0, watch:5.6, wait:11.95, share:6.6, trip:2.6, getoff:5.4, ticket:5.4, collect:3.0, dress:6.45, show:2.8, rider:4.2, end:4.8 };
const T = {};
let acc = 0;
Object.keys(DUR).forEach(k => { T[k] = acc; acc += DUR[k]; });
T.total = acc;

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
// half an hour of the trip passes during its interlude.
const A_DAY = Date.parse('2026-10-14T06:15:00+08:00');
const JUMP = 30 * 60000;
const A_CLOCK = R.keys([[0, A_DAY], [T.trip, A_DAY + T.trip * 1000], [T.trip + DUR.trip, A_DAY + (T.trip + DUR.trip) * 1000 + JUMP],
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
  // view, two (Malapit na!) about 2.9s later, Sakay na! at 18.55s. It leaves
  // the map as they board: whoever was sharing it got off there.
  world.bus({ id:'a1', phone:'A', dir:'north', label:'1043', road:NORTH, on:[0, T.share + .2], age:5000,
    km:R.keys([[0, 10.6], [T.wait + 4.35, 15.9], [T.wait + 8.05, 19.3], [T.wait + 10.35, 22.8], [T.wait + 11.75, WAIT_KM - .05]]) });
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
  world.thanks.A = R.keys([[T.share + 3.3, 0], [T.share + 3.31, 1], [T.share + 4.6, 1], [T.share + 4.61, 3]]);
}
// The sharer's GPS. 700 m past the stop when Start is tapped: the card still
// has the stop they waited at, and within 300 m of it (AT_STOP_KM) it would
// say "Bababa na!" and spend the trip's one buzz there. Along the road in
// time-lapse, three stops short of getting off by the end of the interlude;
// then on through 'getoff', where the card counts down as the bus goes
// (filmPage lets the phone send twice a second): Malapit na! and its buzz
// at 32.0 km, a stop to go at 32.6, the next stop yours at 34.4, Bababa na!
// at 35.2 about 3s in, then slowing towards the sign.
const GPS = R.keys([[T.share + 1.9, WAIT_KM + .7], [T.share + DUR.share, 26.4], [T.trip + DUR.trip - .25, 31.0],
                    [T.getoff + .3, 31.4], [T.getoff + 2.6, 34.6], [T.getoff + 3.3, 35.3], [T.getoff + DUR.getoff, 35.9], [1000, 35.9]]);

// ---- Captions ---------------------------------------------------------------
// One plain sentence each. *word* is drawn in gold.
const SAY = [
  [T.watch + .25, T.watch + 3.0, 'See the buses *on the map*.'],
  [T.watch + 3.1, T.wait, 'Shared by *riders on the bus*.'],
  [T.wait + .1, T.wait + 4.9, 'Save *your stop*.'],
  [T.wait + 5.0, T.wait + 10.2, 'Know when your bus is *near*.'],
  [T.wait + 10.3, T.share, 'Time to *get on*!'],
  [T.share + .1, T.share + 3.6, 'On the bus? *Share it*.'],
  [T.share + 3.7, T.trip, 'Help *other commuters*.'],
  [T.getoff + .1, T.ticket, 'Know when to *get off*.'],
  [T.ticket + .1, T.collect, 'Tap Stop. Get a *ticket*.'],
  [T.collect + .1, T.dress, 'Collect your *tickets*.'],
  [T.dress + .1, T.show, 'Earn coins and *dress up your bus*.'],
  [T.show + .1, T.rider, 'Show it to *other riders*.'],
  [T.rider + .1, T.end, 'Other riders *see your bus*.']
];
// Where a buzz belongs in the story: waiting, and getting off.
const BUZZ_SCENES = [[T.wait, T.share], [T.getoff - .6, T.ticket]];
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
  const shown = el => !!el && el.getClientRects().length > 0 && !el.closest('.hidden');
  const flag = [].slice.call(document.querySelectorAll('#myStop .ride-flag, #tripStop .ride-flag')).filter(shown)[0];
  const ty = q('#tyLine'), toast = q('#toast'), keep = q('#tktKeep');
  return { flag: flag ? flag.textContent : '', live: typeof sharing !== 'undefined' && !!sharing,
           ty: shown(ty) ? ty.textContent : '', tkt: shown(q('#tktModal .tkt')), kept: !!keep && keep.classList.contains('done'),
           album: shown(q('#albumModal .modal-card')), stops: shown(q('#stopModal .modal-card')),
           toast: shown(toast) ? toast.textContent : '', on: !!q('.alb-toggle.on'), popup: !!q('.buspop') };
}
function changes(a, b){
  const out = [];
  if (b.flag && b.flag !== a.flag) out.push(/Malapit/.test(b.flag) ? 'pop' : 'chime');
  if (b.live && !a.live) out.push('start');
  if (b.ty && b.ty !== a.ty) out.push('sparkle');
  if (b.tkt && !a.tkt) out.push('ticket');
  if (b.kept && !a.kept) out.push('stamp');
  if ((b.album && !a.album) || (b.stops && !a.stops)) out.push('open');
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
// finger went.
function cues(A, B, stage, world, browser, heard){
  const tap = async (phone, sel, at) => {
    const p = await phone.tap(sel);
    await stage.event({ type:'tap', at, x:p.x, y:p.y });
    heard.push({ t:at, kind:'tap' });
  };
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

  // watch: nothing tapped; the buses move.
  // wait: save the stop, switch the buzz on, and watch it count down.
  scrolls.push(smooth(A, 0, 120, T.wait + .15, T.wait + .55));
  at(T.wait + .75, v => tap(A, '#myStop .mystop-btn', v));
  // Close on the picker, near enough to read what is typed and what it
  // finds; the whole name, a letter at a time, and a moment on it.
  at(T.wait + 1.0, v => cam(A, '#stopModal .modal-card', v, { width:1040, topAt:330, maxH:560 }));
  // The list shrinks to what the first letter finds and the picker, which
  // the page keeps in the middle, moves with it: the camera follows.
  at(T.wait + 1.5, v => cam(A, '#stopModal .modal-card', v, { width:1040, cy:1040, dur:.4 }));
  WAIT.split('').forEach((c, i) => at(T.wait + 1.4 + i * .14, async v => {
    await type(A, '#stopSearch', WAIT.slice(0, i + 1));
    heard.push({ t:v, kind:'tap', gain:.35 });
  }));
  at(T.wait + 2.95, v => tap(A, '#stopList button[data-name="' + WAIT + '"]', v));
  // Picked: the camera goes to the pin as it lands on the map, rings go out
  // from it with its name beside them, and it stays there a second before
  // the card. No closer than SHARP: the phone is filmed at three pixels a
  // point and the stage draws it at 2.2, so past 1.36 times the map is
  // blown up and blurs (2.4 did). The rings and the name do the pointing.
  // (The pin's own label, what tapping it shows, is wider than the screen
  // when close and sits over the pin.)
  at(T.wait + 3.1, async v => {
    const r = await A.rect('.mypin');
    await cam(A, '.mypin', v, { width:1000, cy:1060, maxZ:SHARP, dur:.6 });
    if (r) await stage.event({ type:'mark', at:v + .3, x:r.x + r.w / 2, y:r.y + r.h / 2, dur:1.5, label:WAIT });
    heard.push({ t:v + .3, kind:'stamp', gain:.8 });
  });
  at(T.wait + 4.75, v => cam(A, null, v, { dur:.45 }));
  at(T.wait + 4.75, centre(A, '#myStop', .45));
  at(T.wait + 5.25, v => cam(A, '#myStop', v, { width:1010, cy:1170 }));
  at(T.wait + 5.9, v => tap(A, '#myStop .buzz input', v));
  at(T.wait + 11.15, v => cam(A, null, v));
  // On board, off camera for a moment: where to get off.
  at(T.share - .08, async () => {
    await A.tap('#myStop button.edit');
    await type(A, '#stopSearch', 'SM City');
    await A.tap('#stopList button[data-name="' + OFF + '"]');
    await A.scrollTo(0);
  });
  // share: the other tab, northbound, Start.
  at(T.share + .7, v => tap(A, '#tabOnbus', v));
  at(T.share + 1.3, v => tap(A, '#pickNorth', v));
  at(T.share + 1.95, v => tap(A, '#onbusStartBtn', v));
  at(T.share + 3.5, centre(A, '#onbusStripCard', .4));
  at(T.share + 4.0, v => cam(A, '#onbusStripCard', v, { width:1000, cy:1170 }));
  // trip: off camera, the card under the strip in the middle of the screen.
  at(T.trip + 1.05, centre(A, '#tripStop', .3));
  at(T.trip + 1.6, v => cam(A, '#tripStop', v - .6, { width:1010, cy:1170 }));
  // ticket: Stop, the ticket, Keep.
  at(T.ticket + .15, v => cam(A, null, v, { dur:.45 }));
  at(T.ticket + .15, glideDoc(A, () => 0, .4));
  at(T.ticket + .7, v => tap(A, '#onbusActive .btn-stop', v));
  at(T.ticket + 1.3, v => cam(A, '#tktCard', v, { width:1040, topAt:430, maxH:420 }));
  at(T.ticket + 2.5, glide(A, '#tktModal', s => { const b = document.querySelector(s); return b.scrollHeight - b.clientHeight; }, 1.3));
  at(T.ticket + 3.75, v => cam(A, null, v, { dur:.5 }));
  at(T.ticket + 4.4, v => tap(A, '#tktKeep', v));
  // collect: My tickets, down to the tickets.
  at(T.collect + .2, v => tap(A, '#tktKeep', v));
  at(T.collect + .45, v => cam(A, '#albumModal .modal-card', v, { width:1040, cy:1130, dur:.5 }));
  at(T.collect + .6, glide(A, '#albumModal .modal-scroll', s => {
    const box = document.querySelector(s), list = box.querySelector('.alb-list');
    return list.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 60;
  }, .9));
  // dress: back up to the bus, a new paint (one tap to choose, one to get it).
  at(T.dress + .05, glide(A, '#albumModal .modal-scroll', s => {
    const box = document.querySelector(s), p = box.querySelector('.alb-paints');
    return Math.max(0, p.getBoundingClientRect().bottom - box.getBoundingClientRect().top + box.scrollTop - box.clientHeight + 16);
  }, .8));
  // Close on the bus from here to the switch, so filmed twice as fine (see
  // SHARP), and the montage after it closer still.
  at(T.dress + .85, () => A.resolution(6));
  at(T.dress + .9, v => cam(A, '.alb-bus', v, { width:1000, cy:1000 }));
  at(T.dress + 1.2, v => tap(A, '.alb-paint[data-paint="kahel"]', v));
  at(T.dress + 1.9, v => tap(A, '.alb-paint[data-paint="kahel"]', v));
  // Then what else it could wear: the same bus in other paints and with
  // other things on, half a second each, and back to the one just bought.
  // Taken from the shop's and the trophies' own lists, put straight into
  // what the phone remembers and drawn by My tickets itself; nothing is
  // tapped, and the bus as bought comes back before anything else sees it.
  let bought = null;
  // Close on the coach itself.
  at(T.dress + 2.3, async v => {
    bought = await A.run(() => localStorage.getItem('wt-bus'));
    await cam(A, '.alb-ride .rk', v, { width:920, cy:1100, maxZ:3, dur:.5 });
  });
  LOOKS.forEach((l, i) => at(T.dress + 2.8 + i * .5, async v => {
    await A.run(l => {
      const b = loadBus();
      b.paints = PAINTS.slice(1).map(p => p.k); b.own = SHOP.map(x => x.k); b.paint = l.paint;
      b.off = busEarned(b, CHECKPOINTS).concat(b.own).filter(k => l.worn.indexOf(k) < 0);
      saveBus(b); renderAlbum();
    }, l);
    heard.push({ t:v, kind:'dress' });
  }));
  at(T.dress + 2.8 + LOOKS.length * .5, async v => {
    await A.run(r => { localStorage.setItem('wt-bus', r); renderAlbum(); }, bought);
    heard.push({ t:v, kind:'dress' });
  });
  // show: switch it on, and give the next morning's bus its look.
  at(T.show + .05, v => cam(A, '.alb-show', v, { width:1000, cy:1150, dur:.5 }));
  at(T.show + .6, () => A.resolution(3));
  at(T.show + .6, v => tap(A, '.alb-toggle', v));
  at(T.show + 1.2, async () => { world.dressed.look = await A.run(() => busLook(loadBus(), CHECKPOINTS)); });
  // rider: another phone; tap the sharer's bus.
  // The rider's phone, filmed twice as fine: its popup is seen closer than
  // SHARP. Set while it is still off the screen.
  at(T.rider - 1.2, async () => {
    await B.open(browser, B_CLOCK, { 'wt-guide-seen':'1' }, T.rider - 1);
    await B.resolution(6);
  });
  at(T.rider + .7, async v => {
    const p = await B.run(() => {
      let at = null;
      map.eachLayer(l => {
        if (at || !l.getLatLng || !l.getPopup || !l.getPopup()) return;
        const html = String(l.getPopup().getContent() || '');
        if (html.indexOf('1043') < 0) return;
        const pt = map.latLngToContainerPoint(l.getLatLng()), box = map.getContainer().getBoundingClientRect();
        at = { x: box.left + pt.x, y: box.top + pt.y - 14 };
      });
      return at;
    });
    if (p){ await B.tap({ x:p.x, y:p.y, w:0, h:0 }); await stage.event({ type:'tap', at:v, x:p.x, y:p.y }); heard.push({ t:v, kind:'tap' }); }
  });
  at(T.rider - .4, v => cam(A, null, v, { dur:.3 }));
  at(T.rider + 1.05, centre(B, '.buspop .leaflet-popup-content-wrapper', .4));
  at(T.rider + 1.5, v => cam(B, '.buspop .leaflet-popup-content-wrapper', v, { width:980, cy:1170 }));
  return { list: list.sort((a, b) => a.t - b.t), scrolls };
}
function easeIO(p){ p = Math.max(0, Math.min(1, p)); return p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }

// The bus on the road, as a bus's popup draws it, framed for a tall picture
// (the popup's framing is RIDE_FRAMES in index.html; this is only the camera).
const framed = (P, t, box) => P.rideSvg(t).replace(/viewBox="[^"]*"/, 'viewBox="' + box + '"');

// ---- What the stage is told before the first frame ---------------------------
function plan(P, worn, qr){
  const sky = P.TICKET_SKIES.day;
  return {
    captions: SAY.map(c => ({ from:c[0], to:c[1], html:gold(c[2]) })),
    // The phone comes up at the end of the title, goes down for the trip and
    // the end, and slides across between the two phones.
    phone: [[T.watch - .6, 1920], [T.watch, 0], [T.trip - .1, 0], [T.trip + .5, -1920], [T.trip + .501, 1920], [T.getoff - .6, 1920],
            [T.getoff, 0], [T.end, 0], [T.end + .6, -1920]],
    // Two whips: getting on the bus (the stop to get off at is set while the
    // phone is off the screen) and handing over to the other phone.
    phoneX: [[T.share - .3, 0], [T.share - .05, -1180], [T.share - .0499, 1180], [T.share + .25, 0],
             [T.rider - .4, 0], [T.rider - .1, -1180], [T.rider - .0999, 1180], [T.rider + .25, 0]],
    ints: [
      { id:'title', out:[T.watch - .6, T.watch],
        html: '<div class="v-board" style="top:330px">' + R.board(P, ['MENDEZ / TAGAYTAY', '⇄ ONE AYALA'], 'tb', 8.6) + '</div>' +
              '<div class="hook">Where is the bus?</div>' +
              '<div class="v-scene">' + P.sceneSvg('dawn', 'ts') + '</div>' },
      { id:'trip', in:[T.trip - .1, T.trip + .5], out:[T.getoff - .6, T.getoff],
        html: '<div class="v-sky" style="background:' + sky.sky + '"></div>' +
              '<div class="v-board">' + R.board(P, ['GEN. TRIAS'], 'tg', 13) + '</div>' +
              '<div class="v-scene">' + framed(P, { views:['church'], sky:'day', worn:worn.worn, paint:worn.paint, now:0 }, '30 4 200 80') + '</div>' +
              '<div class="v-ground" style="background:' + sky.ground + '"></div>' },
      { id:'end', in:[T.end, T.end + .6],
        html: '<div class="v-board">' + R.board(P, ['MENDEZ / TAGAYTAY', '⇄ ONE AYALA'], 'te', 5.4) + '</div>' +
              '<div class="name">Bus Tracker</div>' +
              '<div class="lede">See where the bus is right now.</div>' +
              '<div class="v-scene" id="endRide"></div>' +
              '<div class="qr">' + qr + '</div>' +
              '<div class="url">community-bus-tracker.netlify.app</div>' +
              '<div class="fine">No app, no account.<br>Community-run. Not affiliated with the bus company.</div>' }
    ]
  };
}

// ---- Running it -------------------------------------------------------------------
async function main(){
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
  const qr = execFileSync(process.execPath, [path.join(__dirname, '..', 'make-qr.js'), 'https://community-bus-tracker.netlify.app'],
    { stdio:['ignore', 'pipe', 'ignore'] }).toString();
  await stage.init(plan(P, worn, qr));
  // What is heard, and when: taps and buzzes as they happen, what the page
  // does as it is seen to (LISTEN), and the frame's own moments (SCORE).
  const heard = SCORE.slice();
  const { list, scrolls } = cues(A, B, stage, world, browser, heard);

  const name = R.NAME + (R.FROM > 0 || R.TO < T.total ? '-part' : '');
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
    if (v >= T.share + 1.9 && v < T.ticket + .7) await A.gps(NORTH.point(GPS(v)));
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
    const jpg = await stage.frame(v, shot);
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
    const at = Math.max(R.FROM, Math.min(T.wait + 8.75, R.TO - .1)) - R.FROM;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(at), '-i', file, '-frames:v', '1', '-q:v', '2', path.join(R.OUT, R.NAME + '-cover.jpg')]);
  } catch (e) {}
  console.log('Calls answered here, none sent to Supabase: ' + JSON.stringify(world.log));
  console.log('Sounds: ' + heard.filter(e => e.t >= from && e.t < to).map(e => e.kind + '@' + e.t.toFixed(2)).join(' '));
  console.log('Wrote ' + file + ' and ' + path.basename(track) + ' (' + drawn + ' frames in ' + Math.round((Date.now() - started) / 1000) + 's)');
  await browser.close();
}
module.exports = { main, T, DUR };
