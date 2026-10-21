// The showcase video's story, scene by scene: what is on screen, what is
// tapped and when, what the caption says, and where the made-up buses are.
// The machinery is in render.js; run that (or tools/render-video.sh).
//
// A promo, not a tutorial (the maintainer's call, October 2026): the
// moments that sell the app, one after another, and none of the steps
// between them. One sharer's morning. Waiting at Javalera, with the stop
// saved and its buzz on, the bus comes up the map and down the stop card's
// road until "Sakay na!"; on board, Start puts it on everyone's map and
// riders say salamat; the card says "Bababa na!" as the bus pulls in at
// their stop; the trip's ticket; and the bus in other paints and dress.
// What happens between those moments (saving the stop, the direction, Stop,
// Keep, opening My tickets) is done while the phone is off the screen, and
// Start is the one tap shown.
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
// As long as its beats take at the film's pace (below): about 46 seconds in
// all, an end card of 6.5 included.
const DUR = { title:3.2, wait:10.1, share:6.6, trip:2.4, getoff:3.3, ticket:4.0, dress:5.6, fleet:4.6, end:6.5 };
const T = {};
let acc = 0;
Object.keys(DUR).forEach(k => { T[k] = acc; acc += DUR[k]; });
T.total = acc;

// ---- The pace -----------------------------------------------------------------
// The app speaks for itself: three captions, one for each part of the story
// (waiting for the bus, sharing it, dressing it up), and the rest is said by
// the app's own words on screen, Malapit na!, Sakay na!, the salamat,
// Bababa na!, the ticket. The one tap shown, Start, goes as every tap did in
// the longer cut: a ring closes in on the button (POINT seconds) so the eye
// is there first, then the tap. Where a caption lands, nothing is tapped or
// moved until it can have been read (READ: a moment to notice it, and a
// quarter of a second a word), because a viewer reads the words first and
// looks at the phone after. rehearse() stops the render if a cue breaks that.
//
// The first cut had a caption for every step, each tapped about half a
// second after it appeared, and a viewer was still reading when the screen
// changed. Holding all thirteen until read made 75 seconds of it, and
// showing each on its own over the dimmed phone made 80; the maintainer
// liked neither and chose three captions (October 2026). The cut after that
// showed every step of the story at a pace that could be followed, about 70
// seconds, and read as a tutorial; the maintainer wanted a promo.
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
// The stops before it, for the way the bus still has to come on the map:
// the card counts some of these off as it comes (LIVE, and G.trail).
const DOTS = NORTH.names.slice(NORTH.names.indexOf(WAIT) - 9, NORTH.names.indexOf(WAIT)).map(n => ({ lat:R.stop(n).lat, lng:R.stop(n).lng }));

// ---- The morning ---------------------------------------------------------------
// The sharer's phone: a Wednesday morning inside the northbound hours, then
// half an hour of the trip passes during its interlude, once the phone is
// off the screen and over by JUMPED, so that the phone keeps the film's time
// again before it comes back: the road on board goes by the phone's clock.
const A_DAY = Date.parse('2026-10-14T06:15:00+08:00');
const JUMP = 30 * 60000, JUMPED = T.trip + .55;
const A_CLOCK = R.keys([[0, A_DAY], [T.trip + .4, A_DAY + (T.trip + .4) * 1000], [JUMPED, A_DAY + JUMPED * 1000 + JUMP],
                        [1000, A_DAY + 1000 * 1000 + JUMP]]);

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
// And the stop they wait at, saved on an earlier morning.
const SEED_STOP = { name:WAIT, lat:R.stop(WAIT).lat, lng:R.stop(WAIT).lng };

// After the dressing up, another rider's map: the other sharers' buses up the
// route, each as its sharer chose to show it (the maintainer's idea, October
// 2026), one of them plain, its sharer having not chosen to; and yours,
// dressed as the dressing up left it, which comes down onto the map. Their
// looks are codes the way the server carries them (busLook()), read back the
// way a popup reads them (lookRead()).
const FLEET = [
  { id:'f1', dir:'north', road:NORTH, at:'Tagaytay Olivarez', paint:'dagat', worn:['goldrims', 'horns', 'visor'], side:1 },
  { id:'f2', dir:'north', road:NORTH, at:'Santiago', paint:null, worn:[], side:1 },
  { id:'f3', dir:'south', road:SOUTH, at:'S&R Kawit', paint:'lila', worn:['flowers', 'fringe', 'mirror'], side:-1 },
  { id:'f4', dir:'south', road:SOUTH, at:'Washington', paint:'uling', worn:['flames', 'exhaust', 'antenna'], side:1 }
];
const YOURS = { id:'fy', dir:'north', road:NORTH, at:'Panungyanan', side:-1 };
// The moments of the scene, from its start: the coach lifts off, the phones
// swap under it, it lands, and the cards come up one by one, yours last.
const LANDS = T.fleet + 1.35, BLOOM = T.fleet + 1.5, BLOOMS = [0, .3, .6, .9, 1.35];
// Where each is on its road at t: a little way on during the scene.
const fleetKm = b => R.keys([[T.fleet - 3, b.road.km(b.at) - .2], [T.end + 1, b.road.km(b.at) + .4]]);

// ---- The buses --------------------------------------------------------------
function buses(world){
  // The one the sharer waits for, from far enough off that it is not there
  // yet: seven stops and 14.5 km as the phone comes up, a bus small at the
  // far end of the card's road and a badge well down the map from the pin,
  // and it grows as it comes, both places at once (the maintainer's ask).
  // No further: before 9.25 km the Tagaytay hook puts stops behind it on
  // the chain, and the count goes 11, 12, 13, 14 and then 8. Waiting at
  // Javalera the count changes at 9.25 (7 stops), 11.8, 14.4, 15.75, 18.25,
  // 19.15 (2, Malapit na!, and the buzz), 20.15, 22.25 and 22.65 km (Sakay
  // na!), measured on this road. It stays at seven while the caption is
  // read and the pin, the sight and the way are drawn, then comes a stop at
  // each of the film's polls, on the half second, where it is put between
  // two of those marks, so the card counts every stop and each alarm is
  // crossed between two polls and clear of both. It pulls in at the stop as
  // the phone goes, and leaves the map as they board: whoever was sharing
  // it got off there.
  world.bus({ id:'a1', phone:'A', dir:'north', label:'1043', road:NORTH, on:[0, T.share + .2], age:5000,
    km:R.keys([[0, 9.4], [T.wait + 4.3, 9.9], [T.wait + 4.8, 12.8], [T.wait + 5.3, 15.0], [T.wait + 5.8, 17.0], [T.wait + 6.3, 18.7],
               [T.wait + 6.8, 19.5], [T.wait + 7.3, 20.8], [T.wait + 7.8, 22.4], [T.wait + 8.3, 23.1], [T.wait + 8.8, 24.2],
               [T.wait + 9.3, WAIT_KM - .05]]) });
  world.bus({ id:'a2', phone:'A', dir:'north', label:null, road:NORTH, on:[0, 1000], age:9000,
    km:R.keys([[0, 40.5], [T.share, 47.0], [T.trip + DUR.trip, 61], [1000, 61]]) });
  world.bus({ id:'a3', phone:'A', dir:'north', label:'1027', road:NORTH, on:[0, 1000], age:7000,
    km:R.keys([[0, 55.5], [T.share, 60.5], [T.trip + DUR.trip, 66], [1000, 66]]) });
  world.bus({ id:'a4', phone:'A', dir:'south', label:'1019', road:SOUTH, on:[0, 1000], age:11000,
    km:R.keys([[0, 22.0], [T.share, 28.0], [T.trip + DUR.trip, 44], [1000, 44]]) });
  // One more behind it, once it has gone: on the ridge it would sit on the
  // one waited for, at the map's zoom.
  world.bus({ id:'a5', phone:'A', dir:'north', label:null, road:NORTH, on:[T.share - .3, 1000], age:14000,
    km:R.keys([[0, 2.2], [T.share, 6.0], [T.trip + DUR.trip, 14], [1000, 14]]) });
  // Salamat on the sharer's trip: one, then three.
  world.thanks.A = R.keys([[SALAMAT[0], 0], [SALAMAT[0] + .01, 1], [SALAMAT[1], 1], [SALAMAT[1] + .01, 3]]);
  // The rider's map after the dressing up (FLEET); their looks are put in
  // once the sharer's phone can write them (main()). Yours is on the map
  // from when it lands.
  FLEET.concat([YOURS]).forEach(b => {
    b.bus = world.bus({ id:b.id, phone:'B', dir:b.dir, label:null, road:b.road, on:[0, 1000], age:6000, look:'', km:fleetKm(b) });
  });
  YOURS.bus.on = [LANDS, 1000];
}
// ---- Captions ---------------------------------------------------------------
// One plain sentence for each part of the story, *word* drawn in gold, at
// the top from its time until its to: waiting for the bus, from the first
// look at the map until the bus is boarded; sharing it, until the trip;
// dressing it up, until the end card. The words are the maintainer's, kept
// from the captions there were. Each lands once the camera has settled, and
// the first tap or new look under it is timed from it: read(k) is when
// caption k has been read, the first moment anything may happen under it.
const CAP = {
  near:  { at:T.wait + .25,  to:T.share, say:'Know when your bus is *near*.' },
  share: { at:T.share + .35, to:T.trip + .3, say:'On the bus? *Share it*.' },
  dress: { at:T.dress + .35, to:T.fleet + .3, say:'Earn coins and *dress up your bus*.' }
};
const read = k => CAP[k].at + READ(CAP[k].say);
const SAY = Object.keys(CAP).map(k => [CAP[k].at, CAP[k].to, CAP[k].say]);
// Start, its ring closing in while the caption's last word is read; Stop,
// once the camera is back on the whole phone and its picture is held (see
// the ticket's cues); and the salamat (one, then three in all).
const START = read('share') + .1, STOP = T.ticket + .5;
const SALAMAT = [START + 3.2, START + 4.1];

// The sharer's GPS, from Start until Stop. 700 m past the stop when Start is
// tapped: the card still has the stop they waited at, and within 300 m of it
// (AT_STOP_KM) it would say "Bababa na!" and spend the trip's one buzz there.
// The trip itself goes by while the phone is off the screen, in a moment of
// the interlude, to 75 m short of where the bus stops (ARRIVE_KM, 6 m short
// of the stop's sign); the card says Bababa na! from 35.2 km. From JUMPED it
// goes at 90 km/h, slower than the fastest the card's road drives rather
// than jumps (SV_FASTEST in index.html), so the road comes on from the front
// seat at the bus's own pace with the stop and its people in sight as the
// phone comes up; then it slows as a bus pulling in does, in two seconds,
// and stands. The view runs the feed and a poll behind (about a second in
// the film), which is why the phone comes back a second after the jump and
// not before: the jump itself is drawn as one. The app would ask "Getting
// off here?" within 100 m of a stop saved while well ahead of the bus; the
// maintainer asked for the bus to arrive without the question (October
// 2026), so the stop is saved again at JUMPED, before that moment's fix and
// after the last one well short of it, and by the app's own rule a stop
// saved inside 500 m of the bus is not one it arrives at. During the jump
// itself the bus keeps moving, so the half hour never looks like a bus
// standing still to the trip's own checks.
const ARRIVE_KM = NORTH.km(OFF) - .006;
// When the card's view has the bus standing there: the feed and a poll
// after the GPS stops (about three quarters of a second in the film).
const STOOD = JUMPED + 4.75;
const GPS = R.keys([[START - .05, WAIT_KM + .7], [T.trip + .4, 26.4], [JUMPED, ARRIVE_KM - .075], [JUMPED + 2.0, ARRIVE_KM - .025],
                    [JUMPED + 2.5, ARRIVE_KM - .0141], [JUMPED + 3.0, ARRIVE_KM - .0063], [JUMPED + 3.5, ARRIVE_KM - .0016],
                    [JUMPED + 4.0, ARRIVE_KM], [1000, ARRIVE_KM]]);
// Where a buzz belongs in the story: waiting. On board the card buzzes
// once, two stops before the sharer's own, and that is in the interlude.
const BUZZ_SCENES = [[T.wait, T.share]];
// The phone comes up at the end of the title, goes down for the trip and
// the end, drops away under the ticket as it comes off the top of it, and
// swipes across between the other moments: onto the bus and to My tickets.
// What happens between two moments is done while it is off the screen.
const PHONE_Y = [[T.wait - .6, 1920], [T.wait, 0], [T.trip - .1, 0], [T.trip + .5, -1920], [T.trip + .501, 1920], [T.getoff - .6, 1920],
                 [T.getoff, 0], [T.ticket + 1.0, 0], [T.ticket + 1.55, 1900], [T.dress - .0499, 1900], [T.dress - .0498, 0],
                 [T.end, 0], [T.end + .6, -1920]];
const whip = t => [[t - .3, 0], [t - .05, -1180], [t - .0499, 1180], [t + .25, 0]];
const PHONE_X = [].concat(whip(T.share), whip(T.dress), whip(T.fleet + .4));
// What else the bus could wear, under the last caption: a paint and the
// things on it, from SHOP and the trophies this bus has earned (an unearned
// trophy cannot be worn).
const LOOKS = [
  { paint:'dagat', worn:['flames', 'goldrims', 'horns', 'sampaguita'] },
  { paint:'lila',  worn:['underglow', 'mirror', 'fringe', 'flowers'] },
  { paint:'uling', worn:['flames', 'exhaust', 'antenna', 'stripe'] },
  { paint:'ginto', worn:['goldrims', 'visor', 'dice', 'horns', 'bumpers'] },
  { paint:'gubat', worn:['underglow', 'antenna', 'flowers', 'sunrise', 'fringe'] }
];
// The frame's own sounds: the board lighting up, the swipes between
// moments, the phone dropping away under the ticket, and the end card.
const SCORE = [
  { t:.35, kind:'board' }, { t:T.wait - .6, kind:'whoosh' }, { t:T.share - .3, kind:'whoosh' },
  { t:T.trip - .1, kind:'whoosh' }, { t:T.getoff - .6, kind:'whoosh' }, { t:T.ticket + 1.0, kind:'whoosh', gain:.6 },
  { t:T.dress - .3, kind:'whoosh' }, { t:T.fleet + .1, kind:'whoosh' }, { t:T.fleet + .65, kind:'whoosh', gain:.5 },
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

// ---- Where things are, for the motion graphics ----------------------------
// Run in the page each frame while a graphic needs it: where the saved
// stop's pin, the bus waited for and the stops before the pin are on the
// map, the card's count and its flag; the sharer's own bus on the strip; the
// stop on the road on board; the bus in My tickets; on the rider's map, the
// fleet's buses and where yours lands. In the page's pixels.
function LIVE(o){
  const q = s => document.querySelector(s);
  const box = el => { if (!el) return null; const b = el.getBoundingClientRect(); return b.width || b.height ? { x:b.x, y:b.y, w:b.width, h:b.height } : null; };
  const out = {};
  if (o.map){
    const c = map.getContainer().getBoundingClientRect();
    const pin = box(q('.mypin')), m = busMarkers[o.bus], b = m && m.getElement() ? box(m.getElement()) : null;
    out.pin = pin && { x:pin.x + pin.w / 2, y:pin.y + pin.h };
    out.bus = b && { x:b.x + b.w / 2, y:b.y + b.h / 2 };
    out.dots = o.dots.map(ll => { const p = map.latLngToContainerPoint(ll); return { x:c.left + p.x, y:c.top + p.y }; });
    const num = q('#myStop .ride-big .num'), s = num ? num.textContent.trim() : '';
    out.n = /^\d+$/.test(s) ? +s : 0;
    out.flag = box(q('#myStop .ride-flag'));
  }
  if (o.pill) out.pill = box(q('#onbusStrip .buspill.me'));
  if (o.stop) out.stop = box(q('#tripStop .sv-k[data-w="0"]'));
  if (o.coach) out.coach = box(q('.alb-ride .rk'));
  if (o.fleet){
    const c = map.getContainer().getBoundingClientRect(), p = map.latLngToContainerPoint(o.land);
    out.fleet = o.fleet.map(id => { const m = busMarkers[id], b = m && m.getElement() ? box(m.getElement()) : null; return b && { x:b.x + b.w / 2, y:b.y + b.h / 2 }; });
    out.land = { x:c.left + p.x, y:c.top + p.y };
  }
  return out;
}
// A look as the server carries it (busLook()'s code), from a paint and what
// is worn; no paint is a bus whose sharer did not choose to show it.
function LOOKCODE(list){
  return list.map(o => o.paint ? findIn(PAINTS, o.paint).id + o.worn.map(k => (findIn(DECOR, k) || findIn(SHOP, k)).id).sort().join('') : '');
}
// A card's picture, as the bus's popup has it: the look read back the way
// the popup reads it, and the view of the place the bus is nearest.
function CARD(list){
  return list.map(o => {
    const look = lookRead(o.code) || { paint:'klasiko', worn:[] };
    const i = nearestCheckpoint(routeProgressKm({ lat:o.lat, lng:o.lng }, CHECKPOINTS, ROUTE_CHAIN));
    return { paint:look.paint, worn:look.worn, view:(CHECKPOINTS[i] && CHECKPOINTS[i].mark) || '' };
  });
}
// What LIVE is asked for at v.
function liveAt(v){
  const o = {};
  if (v >= T.wait - .9 && v < T.share) Object.assign(o, { map:true, bus:'a1', dots:DOTS });
  if (v >= START && v < T.trip) o.pill = true;
  if (v >= T.getoff - .65 && v < T.ticket + .5) o.stop = true;
  if (v >= T.dress - .05 && v < T.fleet + .3) o.coach = true;
  if (v >= T.fleet + .3 && v < T.end + .5) Object.assign(o, { fleet:FLEET.concat([YOURS]).map(b => b.id), land:YOURS.road.point(YOURS.bus.km(LANDS)) });
  return Object.keys(o).length ? o : null;
}
// Which phone LIVE is run on at v: the rider's, once the phones have swapped.
const livePhone = (v, A, B) => v >= T.fleet + .3 ? B : A;

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
  // first, so the eye is already there when the tap lands.
  const press = (phone, sel, t) => {
    at(t - POINT, async v => {
      const r = await phone.rect(sel);
      if (r) await stage.event({ type:'point', at:v, dur:POINT, x:r.x + r.w / 2, y:r.y + r.h / 2 });
    });
    at(t, v => tap(phone, sel, v));
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
  const list = [];
  const at = (t, fn) => list.push({ t, fn });
  const scrolls = [];
  // The page itself, from where it is to y over dur seconds, worked out when
  // the cue runs.
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
  // A window opened while the phone is off the screen is open when it comes
  // back: its way in is over before anybody sees it, and a camera can be
  // put on what is in it at once.
  const opened = sel => A.run(s => document.querySelector(s).getAnimations({ subtree:true }).forEach(a => {
    if (/^(cardin|veil)$/.test(a.animationName || '')) a.finish();
  }), sel);

  // A motion graphic (stage.html, G), from v on.
  const g = (v, kind, o) => stage.event(Object.assign({ type:'g', kind, at:v }, o || {}));
  const sound = (t, kind, gain) => heard.push({ t, kind, gain });

  // wait: before the phone comes up, as a rider who waits for this bus has
  // it: the stop saved (SEED_STOP), its buzz on, the map a step in, which
  // puts the bus and the pin twice as far apart and is still the whole
  // route, and the page down to the foot of the card. The phone comes up
  // close on the map, filmed twice as fine (see SHARP), between the stop and
  // the bus. Once the caption is read, a pin comes down on the stop (it is a
  // mark on the map, not where anyone stands: nobody waits on the pin, the
  // maintainer's point), a sight closes on the bus, and the way between is
  // drawn, a dot for each stop it has still to pass. Then the whole phone,
  // the map and the card, and the bus comes up the one as it comes down the
  // other, each dot going as the card counts it off, to the pin. Nothing is
  // tapped.
  at(0, () => A.run(() => {
    try { sessionStorage.setItem('wt-buzz', '1'); } catch (e) {}
    map.setZoom(map.getZoom() + 1, { animate:false });
    renderBuses();
  }));
  at(T.wait - .9, () => A.run(() => {
    const c = document.getElementById('myStop').getBoundingClientRect(), d = document.scrollingElement;
    d.scrollTop = Math.max(0, Math.min(d.scrollHeight - innerHeight, d.scrollTop + c.bottom + 8 - innerHeight));
  }));
  at(T.wait - .85, async v => {
    await A.resolution(6);
    const l = await A.run(LIVE, { map:true, bus:'a1', dots:[] });
    if (!l || !l.pin || !l.bus) throw new Error('A: no pin or no bus on the map to close on');
    const x = (l.pin.x + l.bus.x) / 2, y = (l.pin.y + l.bus.y) / 2;
    await stage.event({ type:'camera', at:v, dur:.01, rect:{ x:x - 110, y:y - 60, w:220, h:120 }, width:1000, cy:1170, maxZ:2.1 });
  });
  const pinAt = read('near') + .05, joy = T.wait + 9.5;
  at(pinAt, v => g(v, 'pin', { label:WAIT, joy, until:T.share - .05 }));
  sound(pinAt + .36, 'stamp', .7);
  at(pinAt + .75, v => g(v, 'lock', { until:T.share - .05 }));
  sound(pinAt + .75, 'switch', .5);
  at(pinAt + .9, v => g(v, 'trail', { until:T.share - .05 }));
  at(pinAt + 1.55, v => cam(A, null, v, { dur:.6 }));
  at(pinAt + 2.2, () => A.resolution(3));
  // The card's two alarms: Malapit na! (and the buzz), Sakay na!.
  at(T.wait + 6.8, v => g(v, 'pulse', { on:'flag', color:'#e39a1c' }));
  at(T.wait + 8.3, v => g(v, 'pulse', { on:'flag', color:'#4f46b8' }));
  at(joy, v => g(v, 'burst'));
  sound(joy, 'sparkle', .8);

  // share: on board, off the screen for a moment: where to get off, the
  // other tab, northbound. Then Start; the camera goes back past the whole
  // phone, rings go out from it and other riders' phones come up around it
  // with the bus on their maps; and then close on the strip, where the
  // salamat arrive (and their stars, from main()).
  at(T.share - .08, async () => {
    await A.run(name => { const s = STOPS.find(x => x.name === name); setMyStop(s.name, s.lat, s.lng); }, OFF);
    await A.scrollTo(0);
    await A.tap('#tabOnbus');
    await A.tap('#pickNorth');
  });
  press(A, '#onbusStartBtn', START);
  at(START + .25, v => stage.event({ type:'camera', at:v, dur:.55, z:.74, cy:1010 }));
  at(START + .3, v => g(v, 'cast', { until:START + 2.6 }));
  [0, 1, 2, 3].forEach(i => sound(START + .3 + .25 + i * .17 + .3, 'pop', .35));
  at(START + 2.45, centre(A, '#onbusStripCard', .4));
  at(START + 2.5, v => cam(A, '#onbusStripCard', v, { width:1000, cy:1170 }));

  // trip: off the screen, the road opened on the card, as the sharer would
  // (it starts folded on the sharing tab); the stop saved again (see GPS);
  // and, once the jump is drawn, close on the card.
  at(T.trip + .5, () => A.run(() => { if (!ROAD) toggleRoad(); }));
  at(JUMPED, () => A.run(() => setMyStop(MYSTOP.name, MYSTOP.lat, MYSTOP.lng)));
  at(T.trip + 1.6, () => A.reveal('#tripStop'));
  at(T.trip + 1.65, v => cam(A, '#tripStop', v, { width:1010, cy:960, dur:.01 }));
  // getoff: the road comes up to the stop by itself, a marker over the stop
  // they get off at, the bus pulls in, and a tick once it stands there.
  at(T.getoff - .1, v => g(v, 'here', { check:STOOD, until:T.ticket + .5 }));
  sound(STOOD, 'pop', .55);

  // ticket: printed (the maintainer's pick of three ways from the stop to
  // the ticket, October 2026; a rubber stamp's ink and the camera through
  // the stop were the others). Back to the whole phone; Stop while the
  // phone's picture is held (see main()); the ticket comes up out of its
  // top, the phone drops away, and the ticket comes forward, and the parts
  // it brings fly out of it into a purse.
  at(T.ticket, v => cam(A, null, v, { dur:.45 }));
  at(STOP, async v => {
    await A.run(() => stopSharing());
    const img = await A.picture('#tktCard', ['.tkt-parts']);
    await stage.print(img);
    await g(v + .05, 'print', { until:T.dress - .05 });
    const p = img.parts['.tkt-parts'];
    if (p) await g(T.ticket + 2.3, 'coins', { px:p.x, py:p.y, from:SEED_BUS.c, to:SEED_BUS.c + 25, until:T.dress - .05 });
  });
  [0, 1, 2].forEach(i => sound(T.ticket + 2.3 + .87 + i * .16, 'coins', .55));

  // dress: My tickets, off the screen, and the phone comes back on it,
  // filmed twice as fine (see SHARP). Once the caption is read the camera
  // goes in on the bus itself, and it tries on other paints and dress,
  // under half a second each, each with a stroke of its paint across it:
  // taken from the shop's and the trophies' own lists, put straight into
  // what the phone remembers and drawn by My tickets itself; nothing is
  // tapped. The end card draws it as it is left.
  at(T.dress - .05, async v => {
    await A.run(() => { closeTicket(); openAlbum(); });
    await opened('#albumModal');
    await A.resolution(6);
    await cam(A, '#albumModal .modal-card', v, { width:1040, topAt:470, maxH:560, dur:.01 });
  });
  at(read('dress'), v => cam(A, '.alb-ride .rk', v, { width:920, cy:1100, maxZ:3, dur:.8 }));
  LOOKS.forEach((l, i) => {
    const t = read('dress') + .6 + i * .45;
    at(t - .14, v => g(v, 'paint', { paint:l.paint }));
    at(t, async v => {
      await A.run(l => {
        const b = loadBus();
        b.paints = PAINTS.slice(1).map(p => p.k); b.own = SHOP.map(x => x.k); b.paint = l.paint;
        b.off = busEarned(b, CHECKPOINTS).concat(b.own).filter(k => l.worn.indexOf(k) < 0);
        saveBus(b); renderAlbum();
      }, l);
      heard.push({ t:v, kind:'dress' });
    });
  });
  // fleet: off the screen, another rider's phone, on the website, its map a
  // step in and the page at the map. Then the coach lifts off My tickets
  // (G.lift) as the phones swap under it, and comes down on the route as a
  // badge where yours then is on that rider's map; and the cards come up out
  // of the buses (G.cards), each as its sharer dressed it, yours last.
  at(T.fleet - 2.5, () => B.open(browser, A_CLOCK, { 'wt-guide-seen':'1' }, T.fleet - 2.5));
  at(T.fleet - 1, () => B.run(() => {
    map.setZoom(map.getZoom() + 1, { animate:false });
    document.scrollingElement.scrollTop += map.getContainer().getBoundingClientRect().top - 8;
  }));
  at(T.fleet, async v => {
    const own = await A.run(() => { const b = loadBus(); return { paint:b.paint, worn:busWorn(b, CHECKPOINTS), code:busLook(b, CHECKPOINTS) }; });
    YOURS.code = own.code;
    if (YOURS.bus) YOURS.bus.look = own.code;
    await g(v, 'lift', { paint:own.paint, worn:own.worn, until:LANDS + .7 });
  });
  at(T.fleet + .35, v => cam(B, null, v, { dur:.01 }));
  at(LANDS, () => B.poll());
  sound(LANDS, 'stamp', .45);
  at(BLOOM, async v => {
    const all = FLEET.concat([YOURS]);
    if (!YOURS.bus) return;   // the rehearsal's world has no buses
    const drawn = await A.run(CARD, all.map(b => { const p = b.road.point(b.bus.km(v)); return { code:b.code, lat:p.lat, lng:p.lng }; }));
    if (!Array.isArray(drawn)) return;
    const sky = await B.run(() => skyNow());
    await g(v, 'cards', { sky, buses:drawn.map((d, i) => Object.assign(d, { at:BLOOMS[i], side:all[i].side, yours:all[i] === YOURS })) });
  });
  BLOOMS.forEach((d, i) => sound(BLOOM + d + .1, i < BLOOMS.length - 1 ? 'pop' : 'sparkle', i < BLOOMS.length - 1 ? .4 : .8));
  return { list: list.sort((a, b) => a.t - b.t), scrolls };
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
// One film, ending on the poster's two ways in, each with its QR code: the
// tracker, for watching, and the Android app, for sharing with the phone
// locked, at ANDROID_APP_URL in config.txt (the closed test's sign-up while
// it runs, the listing once the app is public), with Google's badge. The
// sharer's phone is filmed as the app shows the page (render.js, Phone's
// app), with Android's status bar. The website is Bus Tracker and the app is Fibi, as
// everywhere else. Google's badge is its own PNG, unaltered, the one
// index.html carries, with Google's line under it.
const SITE_URL = 'https://community-bus-tracker.netlify.app';
const APP_URL = ((fs.readFileSync(path.join(R.ROOT, 'config.txt'), 'utf8').match(/^ANDROID_APP_URL[ \t]*=[ \t]*(\S*)/m) || [])[1] || '').trim();
const TESTERS = /\/testers\.html(?:[?#]|$)/i.test(APP_URL);
const BADGE = (fs.readFileSync(path.join(R.ROOT, 'index.html'), 'utf8').match(/class="playbadge"[^>]*><img src="(data:image\/png;base64,[^"]+)"/) || [])[1];
if (APP_URL && !BADGE) throw new Error('index.html has no Google Play badge to end the film on: see "How it ends" in film.js');
// The end card's bus on the road, cut to the strip it has over the two cards.
const END_VIEW = '22 15 166 54';

// ---- What the stage is told before the first frame ---------------------------
function plan(P, worn, qr){
  const sky = P.TICKET_SKIES.day;
  return {
    captions: SAY.map(c => ({ from:c[0], to:c[1], html:gold(c[2]) })),
    phone: PHONE_Y,
    phoneX: PHONE_X,
    ints: [
      // "Where is the bus now?", as riders ask it in the group chat and as
      // Play's feature graphic asks it.
      { id:'title', out:[T.wait - .6, T.wait],
        html: '<div class="v-board" style="top:330px">' + R.board(P, ['MENDEZ / TAGAYTAY', '⇄ ONE AYALA'], 'tb', 8.6) + '</div>' +
              '<div class="hook">Nasaan na ang bus?</div>' +
              '<div class="v-scene">' + P.sceneSvg('dawn', 'ts') + '</div>' },
      { id:'trip', in:[T.trip - .1, T.trip + .5], out:[T.getoff - .6, T.getoff],
        html: '<div class="v-sky" style="background:' + sky.sky + '"></div>' +
              '<div class="v-board">' + R.board(P, ['GEN. TRIAS'], 'tg', 13) + '</div>' +
              '<div class="v-scene">' + framed(P, { views:['church'], sky:'day', worn:worn.worn, paint:worn.paint, now:0 }, '30 4 200 80') + '</div>' +
              '<div class="v-ground" style="background:' + sky.ground + '"></div>' },
      { id:'end', in:[T.end, T.end + .6], html:endCard(P, qr) }
    ]
  };
}
// The poster's two ways in, in its words: the end card of this film and of
// the animated one (motion.js). Its bus on the road (#endRide) is drawn when
// the film gets there, as the bus is by then.
function endCard(P, qr){
  return '<div class="v-board">' + R.board(P, ['MENDEZ / TAGAYTAY', '⇄ ONE AYALA'], 'te', 5.4) + '</div>' +
    '<div class="e-name">Bus Tracker</div>' +
    '<div class="e-lede">See where the bus is right now.</div>' +
    '<div class="v-scene" id="endRide"></div>' +
    '<div class="e-way e-watch' + (qr.app ? '' : ' e-only') + '"><div class="e-qr">' + qr.site + '</div><div class="e-words">' +
      '<div class="e-kicker">Watch the bus</div><div class="e-big">Open the tracker</div>' +
      '<div class="e-url">' + SITE_URL.replace(/^https:\/\//, '') + '</div><div class="e-note">No app, no account.</div></div></div>' +
    (qr.app ? '<div class="e-way e-droid"><div class="e-qr">' + qr.app + '</div><div class="e-words">' +
      '<div class="e-kicker"><img class="e-icon" src="' + R.SITE + '/mobile/store/play-icon-512.png" alt="">Fibi · Android</div>' +
      '<div class="e-big">Share with your phone locked</div>' +
      '<img class="e-badge" src="' + BADGE + '" alt="Get it on Google Play">' +
      (TESTERS ? '<div class="e-note">Early access. Scan to join the testers.</div>' : '') + '</div></div>' : '') +
    '<div class="e-fine">Community-run. Not affiliated with the bus company.' +
      (qr.app ? '<small>Google Play and the Google Play logo are trademarks of Google LLC.</small>' : '') + '</div>';
}
// The two QR codes, drawn by the same tool as the poster's.
function endQr(){
  const qrOf = url => execFileSync(process.execPath, [path.join(__dirname, '..', 'make-qr.js'), url],
    { stdio:['ignore', 'pipe', 'ignore'] }).toString();
  return { site: qrOf(SITE_URL), app: APP_URL ? qrOf(APP_URL) : '' };
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
  const stand = name => ({ name, open: async () => {}, resolution: async () => {}, scrollTo: async () => {}, reveal: async () => {},
    picture: async () => ({ png:null, w:1, h:1, parts:{} }), poll: async () => {},
    tap: async () => ({ x:0, y:0 }), rect: async () => ({ x:0, y:0, w:1, h:1 }), run: async () => ({ x:0, y:0, w:1, h:1, pin:{ x:0, y:0 }, bus:{ x:0, y:0 } }) });
  const { list, scrolls } = cues(stand('A'), stand('B'), { event: async e => { noted.push(e); }, print: async () => {} }, {}, null, heard);
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
  const A = new R.Phone('A', world, { app:true }), B = new R.Phone('B', world);
  const stage = new R.Stage();
  const started = Date.now();
  await stage.open(browser);
  await A.open(browser, A_CLOCK, { 'wt-guide-seen':'1', 'wt-bus':JSON.stringify(SEED_BUS), 'wt-tickets':JSON.stringify(SEED_TICKETS),
    'wt-mystop':JSON.stringify(SEED_STOP) }, 0);
  // Everything those nine trips earned has been paid for already.
  const worn = await A.run(() => {
    const b = loadBus(); b.paid = busEarned(b, CHECKPOINTS); saveBus(b);
    return { worn: busWorn(b, CHECKPOINTS), paint: b.paint };
  });
  await stage.init(plan(P, worn, endQr()));
  // The fleet's looks, as their sharers' phones would send them.
  const codes = await A.run(LOOKCODE, FLEET.map(b => ({ paint:b.paint, worn:b.worn })));
  FLEET.forEach((b, i) => { b.code = b.bus.look = codes[i]; });
  // What is heard, and when: taps and buzzes as they happen, what the page
  // does as it is seen to (LISTEN), and the frame's own moments (SCORE).
  const heard = SCORE.slice();
  const { list, scrolls } = cues(A, B, stage, world, browser, heard);

  const base = R.NAME;
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
    // The buzz the story is about: Malapit na!, the one buzz the card gives a
    // bus. The page also buzzes as a trip starts (15 ms, too short to see or
    // hear) and once on board, both off the screen or out of the story, and
    // they stay out.
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
        framed(P, { views:['towers'], sky:'day', worn:look.worn, paint:look.paint, now:0 }, END_VIEW));
    }
    const which = v >= T.fleet + .35 ? B : A;
    const onScreen = (v >= T.wait - .8 && v < T.trip + .5) || (v >= T.getoff - .6 && v < T.end + .4);
    // While the ticket comes off the phone, the phone's picture is held: it
    // is the stop it got to, whatever the page is doing under it.
    const held = v >= STOP && v < T.dress - .05;
    const shot = onScreen && !held && which.page ? await which.shot() : null;
    if (which.page){
      const now = await which.run(LISTEN);
      const did = onScreen && which.was ? changes(which.was, now) : [];
      heard.push(...did.map(kind => ({ t:v, kind })));
      // A salamat's stars, from where the page floats it up.
      if (did.indexOf('sparkle') >= 0) await stage.event({ type:'g', kind:'stars', at:v });
      which.was = now;
    }
    const lp = livePhone(v, A, B), want = liveAt(v), live = want && lp.page ? await lp.run(LIVE, want) : null;
    const jpg = await stage.frame(v, shot, which.app ? clockOf(which.now) : null, live);
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
    const at = Math.max(R.FROM, Math.min(T.wait + 7.3, R.TO - .1)) - R.FROM;
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
module.exports = { main, rehearse, plan, framed, endCard, endQr, END_VIEW, T, DUR, SAY, READ };
