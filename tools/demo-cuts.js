'use strict';
// The two demo videos, as scripts for tools/render-demo.js: what happens
// when, on which phone, and what the words say.
//
// The riders' video is in the mix of Tagalog and English the group chat
// uses, with the flyer's own lines wherever the flyer has one; the
// operators' is in English, with the briefing's. Neither may claim anything
// those two documents do not: a caption is a promise made in public.
//
// Every bus is one of the flyer's example ones, at the flyer's example
// places. Distances are where the checkpoint chain reads them, so
// "km0: 38.26" is 3.0 km and five stops before S&R Kawit on the saved-stop
// card: the flyer's own example screen, set moving.
//
// The stage is 540 by 960 (the video is twice that). A phone is 428 by 748
// at scale 1, posed by its centre (cx, cy), scale (s) and turn (rx, ry, rz).
// Each step that taps something fails loudly if the thing has moved, and a
// few check that the phone shows what the caption says.

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

// Where the phones stand.
const HERO = { cx: 270, cy: 640, s: .82, rx: 0, ry: 0, rz: 0, o: 1 };
const LEFT = { cx: 146, cy: 620, s: .57, rx: 0, ry: 12, rz: 0, o: 1 };
const RIGHT = { cx: 394, cy: 620, s: .57, rx: 0, ry: -12, rz: 0, o: 1 };
const FLAT_LEFT = Object.assign({}, LEFT, { ry: 0 });
const FLAT_RIGHT = Object.assign({}, RIGHT, { ry: 0 });
const OFF_RIGHT = { cx: 860, cy: 620, s: .57, rx: 0, ry: -24, rz: 0, o: 1 };
const OFF_LEFT = { cx: -330, cy: 620, s: .57, rx: 0, ry: 24, rz: 0, o: 1 };
// The phone on the dashboard, alone and turned towards the viewer.
const DASH = { cx: 280, cy: 650, s: .8, rx: 7, ry: 13, rz: -1.5, o: 1 };
const BELOW = { cx: 300, cy: 1460, s: .82, rx: 30, ry: -22, rz: 9, o: 1 };

const SETTINGS_TAG = { tl: 'Halimbawa · example screen', en: 'Example screen · made-up buses' };

// What the saved-stop card is saying, read off the rider's phone.
const CARD = `(function(){
  var r = document.querySelector('#myStop .ride'); if (!r) return null;
  var n = r.querySelector('.ride-big .num'), km = r.querySelector('.ride-big .km');
  return { n: n ? n.textContent.trim() : '', km: km ? km.textContent.replace('·', '').trim() : '',
           st: r.classList.contains('here') ? 'here' : r.classList.contains('near') ? 'near' : '' };
})()`;

// ---- Pictures ---------------------------------------------------------------
function board(P, id, pitch, scan) {
  const svg = P.S.signboardSvg(P.words, { id, pitch, center: true });
  return '<div class="board">' + (scan ? '<div class="scan">' + svg + '</div>' : svg) + '<div class="shine"><i></i></div></div>';
}
// The view from the ridge, with its coach driving in and, at dawn, its sun
// coming up and its headlamp coming on.
function scene(P, time, id) {
  let svg = P.S.sceneSvg(time, id);
  svg = svg.replace(/(<path d="M306 251l70-12v28z"[^>]*\/>)?(<svg x="110" y="196"[\s\S]*?<\/svg>)/, (m, beam, coach) =>
    '<g class="drive">' + (beam ? beam.replace('<path ', '<path class="beam" ') : '') + coach + '</g>');
  svg = svg.replace('<circle cx="470" cy="150" r="22"', '<circle class="sunup" cx="470" cy="150" r="22"');
  return '<div class="pic">' + svg + '</div>';
}
function coach(P, time) {
  return '<svg class="go" viewBox="0 0 364 136" style="' + P.S.SCENE_TIMES[time].coach + '" aria-hidden="true">' + P.S.COACH_SIDE + '</svg>';
}
function road() {
  let dashes = '';
  for (let x = 10; x < 540; x += 62) dashes += '<i style="left:' + x + 'px"></i>';
  return '<div class="road">' + dashes + '</div>';
}

// ---- Cards --------------------------------------------------------------------
function titleCard(P, o) {
  return '<i class="dots"></i>' +
    '<div style="text-align:center; padding-top:70px">' + board(P, 'tcb', 4.1) + '</div>' +
    (o.eyebrow ? '<div class="eyebrow rise d3" style="text-align:center; margin-top:16px">' + o.eyebrow + '</div>' : '') +
    '<div style="flex:1"></div>' +
    '<div class="big" style="text-align:center; font-size:' + o.size + 'px">' +
      o.lines.map(l => '<div><span class="settle">' + l + '</span></div>').join('') + '</div>' +
    (o.lede ? '<p class="lede rise d5" style="text-align:center; margin:22px 40px 0">' + o.lede + '</p>' : '') +
    '<div style="flex:1"></div>' + scene(P, o.time, 'tcs') +
    '<div class="eg rise d6" style="position:absolute; left:0; right:0; bottom:20px; text-align:center; font-size:12px; font-weight:700;' +
      ' letter-spacing:.14em; text-transform:uppercase; color:rgba(255,255,255,.85)">' + o.note + '</div>';
}

// The four buses of the flyer's example screen, less any a phone is playing.
function flyerBuses(d, skip) {
  if (skip !== '98018') d.bus('d3m0b98018000000000000000000a001', { dir: 'north', label: '98018', road: ROADS.kawit, km0: 38.26, phase: 2 });
  d.bus('d3m0b98104000000000000000000a002', { dir: 'north', label: '98104', road: ROADS.amadeo, km0: 11.0, km1: 12.6, secs: 300, phase: 4.5 });
  d.bus('d3m0b00000000000000000000000a003', { dir: 'south', label: null, road: ROADS.ridge, km0: 4.9, count: 2, phase: 3 });
  d.bus('d3m0b98077000000000000000000a004', { dir: 'south', label: '98077', road: ROADS.gentrias, km0: 33.5, km1: 31.0, secs: 300, phase: 1 });
}

// Sharing from the bus: the tab, the direction, the number, start.
async function startTrip(d, pid, label, o) {
  o = o || {};
  await d.tap(pid, '#tabOnbus', { after: o.quick ? .35 : .5 });
  await d.tap(pid, '#pickNorth', { after: .35 });
  await d.tap(pid, '#busLabel', { after: .15 });
  await d.type(label, .09);
  await d.wait(.25);
  await d.tap(pid, '#onbusStartBtn', { after: .3 });
}
// The same, done by a phone off camera before the video starts.
function startTripOffCamera(d, pid, label) {
  return d.app(pid, "switchTab('share'); pickDir('north'); document.getElementById('busLabel').value = " +
    JSON.stringify(label) + "; startSharing(); 1");
}
const busOf = (label) => 'BUSES.find(function(b){ return b.bus_label === ' + JSON.stringify(label) + '; }).pub_id';
async function marker(d, pid, label) {
  const pub = await d.app(pid, busOf(label));
  return { js: 'busMarkers[' + JSON.stringify(pub) + '].getElement()' };
}
async function pill(d, pid, label) {
  const pub = await d.app(pid, busOf(label));
  return '#trackStrip .buspill[onclick*="' + pub + '"]';
}
// Flowers from one place on the stage to another: the rider's salamat
// travelling to the phone of the person sharing.
async function flowersBetween(d, a, b, n) {
  const r1 = await d.rect(a.phone, a.target, 'flowers'), r2 = await d.rect(b.phone, b.target, 'flowers');
  await d.flowers({ x0: r1.x + r1.w / 2, y0: r1.y + r1.h / 2, x1: r2.x + r2.w / 2, y1: r2.y + r2.h / 2, n: n || 10 });
}

module.exports = {
  // ==========================================================================
  // The riders' video
  // ==========================================================================
  riders: {
    file: 'demo-riders.mp4',
    // tools/demo-riders-script.md is this cut written out scene by scene.
    // The motion does the explaining: four captions in the whole video, and
    // the salamat, the buses and the ticket are shown without words.
    async play(d, P) {
      const T = (o) => Object.assign({ x: 30, y: 52, w: 480, size: 60 }, o);
      // Off camera: a rider's phone, and a phone on bus 98018 that has been
      // sharing since before the video starts, parked five stops short of
      // the rider's stop.
      await d.bg('maroon');
      await d.phone('rider', { pose: BELOW });
      await d.phone('crew', { pose: OFF_RIGHT });
      flyerBuses(d, '98018');
      await d.boot();
      d.gps('crew', { road: ROADS.kawit, km0: 38.26 });
      await startTripOffCamera(d, 'crew', '98018');
      await d.offCamera(7);

      // -- 0. The cover: the flyer's question over the view from the ridge
      await d.card('title', titleCard(P, { time: 'dawn', size: 84,
        lines: ['Nasaan na', '<em>ang bus?</em>'], note: 'Halimbawa lang ang mga bus' }), { theme: 'maroon', instant: true });
      await d.wait(3.3);

      // -- 1. The buses, without words: the two lines, then one bus live
      await d.wipeIn();
      await d.uncard('title');
      await d.tag(SETTINGS_TAG.tl);
      await d.pose('rider', { cx: 270, cy: 560, s: .9, rx: 6, ry: -8, rz: 1.5 }, 1.3, 'back');
      await d.wipeOut();
      await d.wait(1.0);
      await d.hilite('rider');
      await d.wait(.6);
      await d.focus('rider', '#trackStrip', { s: 1.42, fx: 270, fy: 470, sec: 1.0 });
      await d.wait(1.0);
      await d.callout('nb', { phone: 'rider', target: '#trackStrip .track.nb', ax: .74, text: '▲ Pa-Ayala', color: 'gold', dx: -40, dy: -66 });
      await d.wait(.4);
      await d.callout('sb', { phone: 'rider', target: '#trackStrip .track.sb', ax: .3, text: '▼ Pa-Mendez', color: 'maroon', dx: 40, dy: 66 });
      await d.wait(1.6);
      await d.unmark('nb'); await d.unmark('sb');
      await d.focus('rider', '.mapwrap', { s: 1.12, fx: 270, fy: 520, sec: 1.0 });
      await d.app('rider', 'map.flyTo([14.395, 120.915], 12, { duration: 1.3 }); 1');
      await d.wait(1.5);
      await d.callout('live', { phone: 'rider', target: await marker(d, 'rider', '98018'), text: 'Live · 98018', color: 'gold', dx: 70, dy: -54 });
      await d.wait(1.6);
      await d.unmark('live');

      // -- 2. How far: save the stop, then the bus counts down to it
      await d.pose('rider', HERO, .9);
      await d.wait(.95);
      await d.scroll('rider', { target: '#myStop', offset: 420 }, .7);
      await d.tap('rider', '#myStop .mystop-btn', { after: .6 });
      await d.tap('rider', '#stopSearch', { after: .2 });
      await d.type('S&R');
      await d.wait(.3);
      await d.tap('rider', '#stopList button[data-name="S&R Kawit"]', { after: .5 });
      await d.expect('rider', '/about\\s*5\\s*stops before yours/.test(document.querySelector("#myStop .ride-big").textContent)',
        'the saved-stop card saying "about 5 stops before yours"');
      await d.scrim(true);
      await d.focus('rider', '#myStop .ride', { s: 1.3, fx: 270, fy: 690, sec: 1.0 });
      await d.title('t', T({ theme: 'dark', lines: ['Gaano <em>kalayo pa?</em>'], size: 50 }));
      await d.wait(.5);
      await d.flap('f', { value: '5', unit: 'stops pa', sub: '3.0 km', x: 40, y: 132, theme: 'dark' });
      await d.wait(1.5);
      // the crew phone drives the last three kilometres, sped up, and the
      // board above counts what the card counts
      await d.ff('Pinabilis');
      d.gps('crew', { road: ROADS.kawit, km0: 38.26, km1: 41.2, secs: 7.4 * 56 });
      d.rate = 56;
      let last = { n: '5', km: '3.0 km', st: '' };
      await d.wait(8.4, async () => {
        const c = await d.app('rider', CARD);
        if (!c) return;
        if (c.st !== last.st && c.st) {
          await d.untitle('t');
          await d.led('sign', c.st === 'here' ? 'SAKAY NA!' : 'MALAPIT NA!', { x: 30, y: 46, w: 480, slam: true, pitch: 3 });
          await d.burst(270, 104, {});
          if (c.st === 'here') await d.unflap('f');
        }
        if (c.st !== 'here' && /^\d$/.test(c.n) && c.n !== last.n) await d.setflap('f', c.n, { sub: c.km, unit: c.n === '1' ? 'stop pa' : 'stops pa' });
        else if (c.st !== 'here' && c.km && c.km !== last.km) await d.setflap('f', last.n, { sub: c.km });
        last = c;
      });
      d.rate = 1;
      await d.ff(null);
      await d.expect('rider', '/Next stop is yours/.test(document.querySelector("#myStop .ride-big").textContent)',
        'the card saying "Next stop is yours" once the bus is one stop out');
      await d.wait(1.2);

      // -- 3. Salamat, without words: one tap on the bus that came
      await d.unled('sign');
      await d.unflap('f');
      await d.scrim(false);
      await d.pose('rider', HERO, .8);
      await d.wait(.85);
      await d.scroll('rider', { target: '.mapwrap', offset: 30 }, .6);
      await d.tap('rider', await marker(d, 'rider', '98018'), { after: .8 });
      await d.tap('rider', '.buspop .tybtn', { after: 1.4 });
      await d.expect('rider', '!!document.querySelector(".buspop .tydone")', 'the popup saying the salamat was sent');

      // -- 4. On a bus yourself
      await d.wipeIn();
      await d.pose('crew', OFF_RIGHT, 0);
      await d.app('crew', 'stopSharing({ quiet: true }); 1');
      await d.app('rider', 'map.closePopup(); 1');
      await d.pose('rider', HERO, 0);
      await d.call('scrollTo', 'rider', 0);
      await d.bg('night');
      d.gps('rider', { road: ROADS.whole, km0: 0.3, km1: 1.6, secs: 300 });
      await d.title('t', T({ theme: 'night', lines: ['Share kung', '<em>nasaan ang bus</em>'], size: 54 }));
      await d.wipeOut();
      await d.wait(.6);
      await startTrip(d, 'rider', '98019');
      await d.expect('rider', 'document.documentElement.classList.contains("trip-on")', 'the sharing tab in trip mode');
      await d.wait(.8);
      await d.scrim(true);
      await d.focus('rider', '#onbusStripCard', { s: 1.25, fx: 270, fy: 660, sec: 1.0 });
      await d.wait(1.1);
      await d.callout('you', { phone: 'rider', target: '#onbusStrip .buspill.me', text: 'Ito ang bus mo', color: 'live', dx: 64, dy: -62 });
      await d.wait(2.0);
      await d.unmark('you');

      // -- 5. The ticket, without words: two hours on, Stop
      await d.untitle('t');
      await d.scrim(false);
      await d.pose('rider', HERO, .8);
      await d.ff('Makalipas ang 2 oras', 'time');
      d.gps('rider', { road: ROADS.whole, km0: 59.5, km1: 60.0, secs: 150 });
      await d.skip(2 * 3600e3 + 26 * 60e3);
      await d.thanks('rider', 3);
      await d.poll('rider');
      await d.wait(1.3);
      await d.ff(null);
      await d.tap('rider', '#onbusActive .btn-stop', { after: .3 });
      await d.expect('rider', '!document.getElementById("tktModal").classList.contains("hidden")', 'the salamat ticket on screen');
      await d.focus('rider', '#tktCard', { s: 1.1, fx: 270, fy: 500, sec: 1.0 });
      await d.wait(3.0);

      // -- 6. The close: the link, the QR, and the disclaimer
      await d.card('end', '<i class="dots"></i>' +
        '<div style="text-align:center; padding-top:58px">' + board(P, 'ecb', 3.4, true) + '</div>' +
        '<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:0 30px">' +
          '<div class="big rise d1" style="font-size:52px; text-align:center">Buksan <em>ngayon</em></div>' +
          '<div class="url" style="margin-top:16px"><span class="typeit" style="animation-timing-function:steps(' + P.url.length + ')">' + P.url + '</span></div>' +
          '<div class="qrbig pop d5" style="margin-top:26px; position:relative">' + P.qr + '<i class="scanline"></i></div>' +
          '<p class="say rise d7" style="text-align:center; margin:26px 0 0; font-size:30px">I-post sa group chat!</p>' +
        '</div>' +
        '<p class="fine rise d8" style="text-align:center; margin:0 30px 14px"><b>Hindi ito opisyal.</b> Not affiliated with, run by, or endorsed by Wonderful Transport. ' +
          'Kapag walang nag-share, walang bus sa mapa.</p>' +
        '<div class="coachbar">' + road() + coach(P, 'dawn') + '</div>', { theme: 'maroon' });
      await d.tag(null);
      await d.wait(6.5);
    }
  },

  // ==========================================================================
  // The operators' video
  // ==========================================================================
  operators: {
    file: 'demo-operators.mp4',
    async play(d, P) {
      const T = (o) => Object.assign({ x: 30, y: 52, w: 480, size: 52 }, o);
      // Off camera: a phone for someone on the bus, and a rider's phone with
      // the flyer's stop saved on it.
      await d.bg('maroon');
      await d.phone('crew', { pose: OFF_LEFT });
      const stop = Object.assign({ name: 'S&R Kawit' }, d.kit.place('S&R Kawit'));
      await d.phone('rider', { pose: OFF_RIGHT, store: { local: { 'wt-mystop': JSON.stringify(stop) } } });
      flyerBuses(d);
      await d.boot();
      d.gps('crew', { road: ROADS.whole, km0: 0.3, km1: 1.6, secs: 300 });

      // -- 0. The title
      await d.card('title', titleCard(P, { time: 'day', size: 54, eyebrow: 'COMMUNITY LIVE TRACKER · UNOFFICIAL',
        lines: ['A community-run', 'live bus tracker', '<em>for your route</em>'],
        lede: 'Not affiliated with, run by, or endorsed by Wonderful Transport. Free, with no ads, and open source.',
        note: 'The buses in this video are made up' }), { theme: 'maroon', instant: true });
      await d.wait(4.4);

      // -- 1. How riders find the bus today
      await d.wipeIn();
      await d.uncard('title');
      await d.card('chat', '<div style="flex:1"></div>' +
        '<div style="padding:0 30px"><div class="eyebrow rise">Today</div>' +
          '<div class="big mask" style="font-size:52px; margin-top:12px"><span class="d1">Riders ask the</span></div>' +
          '<div class="big mask" style="font-size:52px"><span class="d2"><em>group chat.</em></span></div></div>' +
        '<div class="convo" style="margin-top:36px">' +
          [['Nasaan na ang bus?', '#7a1f2b', 'A', '6:05 AM'], ['Dumaan na ba?', '#8c5905', 'J', '6:48 AM'],
           ['May bus pa ba pa-Ayala?', '#4f46b8', 'R', '9:12 AM'], ['Nasaan na po?', '#1d8a5f', 'M', '3:55 PM'],
           ['Paalis na ba sa Mendez?', '#b4532a', 'L', '5:20 PM'], ['Nasaan na ang bus?', '#7a1f2b', 'A', '7:10 PM']]
            .map((b, i) => '<div class="who"><span class="av pop" style="animation-delay:' + (0.6 + i * .42).toFixed(2) + 's; background:' + b[1] + '">' + b[2] + '</span>' +
              '<span class="bub" style="animation-delay:' + (0.66 + i * .42).toFixed(2) + 's">' + b[0] + '<small>' + b[3] + '</small></span></div>').join('') +
        '</div>' +
        '<div style="flex:1"></div>' +
        '<p class="lede rise" style="animation-delay:3.2s; margin:0 30px 54px; font-size:24px; color:var(--ink)">The same question, all day. <b>This answers it on a map.</b></p>', { theme: 'paper' });
      await d.wipeOut();
      await d.wait(5.8);

      // -- 2. One tap on the bus, and every rider sees it
      await d.wipeIn();
      await d.uncard('chat');
      await d.tag(SETTINGS_TAG.en);
      await d.label('crew', 'On the bus');
      await d.label('rider', 'Riders');
      await d.pose('crew', FLAT_LEFT, 0);
      await d.pose('rider', FLAT_RIGHT, 0);
      await d.title('t', T({ theme: 'dark', n: 1, kicker: 'For anyone on board', lines: ['One tap puts the bus', '<em>on every rider\'s map.</em>'], size: 44,
        sub: 'A rider, the conductor or the driver picks the direction and starts. No account, no name.' }));
      await d.wipeOut();
      await d.wait(.8);
      await startTrip(d, 'crew', '98019', { quick: true });
      await d.wait(1.0);
      await d.poll('rider');
      await d.wait(.4);
      // The rider taps the new bus's chip on the strip, and the map flies to
      // it and opens it, the way the tracker answers that tap.
      const chip = await pill(d, 'rider', '98019');
      await d.ring('new', { phone: 'rider', target: chip, color: 'live', pad: 7 });
      await d.wait(1.1);
      await d.unmark('new');
      await d.tap('rider', chip, { after: 1.7 });
      await d.expect('rider', '!!document.querySelector(".buspop .tybtn")', 'the new bus open on the rider\'s map');
      await d.callout('newc', { phone: 'rider', target: await marker(d, 'rider', '98019'), text: 'There it is', color: 'live', dx: -64, dy: 66 });
      await d.wait(2.2);
      await d.unmark('newc');
      await d.untitle('t');
      await d.title('t', T({ theme: 'dark', n: 2, kicker: 'While sharing', lines: ['Built for a phone', '<em>on the dashboard.</em>'], size: 44,
        sub: 'The screen goes dark, with one button: <b>Stop sharing</b>. On Android, an app keeps sharing with the screen locked.' }));
      await d.pose('rider', OFF_RIGHT, .9);
      await d.pose('crew', DASH, 1.1);
      await d.wait(1.2);
      await d.ring('stop', { phone: 'crew', target: '#onbusActive .btn-stop', color: 'live', pad: 7 });
      await d.wait(2.6);
      await d.unmark('stop');

      // -- 3. Salamat, from a rider to the person sharing
      await d.untitle('t');
      await d.title('t', T({ theme: 'dark', n: 3, kicker: 'Riders can say thanks', lines: ['Only the sharer', '<em>sees the salamat.</em>'], size: 44,
        sub: 'Deleted with the trip. <b>No score, no total, no ranking.</b>' }));
      await d.pose('crew', FLAT_LEFT, .9);
      await d.pose('rider', FLAT_RIGHT, .9);
      await d.wait(1.0);
      if (!(await d.app('rider', '!!document.querySelector(".buspop .tybtn")'))) await d.tap('rider', await marker(d, 'rider', '98019'), { after: .9 });
      await d.tap('rider', '.buspop .tybtn', { after: .3 });
      await flowersBetween(d, { phone: 'rider', target: '.buspop .tydone' }, { phone: 'crew', target: '#onbusStrip .buspill.me' }, 11);
      await d.wait(1.3);
      await d.poll('crew');
      await d.wait(.3);
      await d.expect('crew', '/1 rider said salamat/.test(document.getElementById("tyLine").textContent)', 'the sharing phone saying "1 rider said salamat"');
      await d.ring('ty', { phone: 'crew', target: '#tyLine', color: 'live', pad: 6 });
      await d.wait(2.6);
      await d.unmark('ty');

      // -- 4. Distance, never minutes
      await d.wipeIn();
      await d.label('crew', null);
      await d.label('rider', null);
      await d.pose('crew', OFF_LEFT, 0);
      await d.app('rider', 'map.closePopup(); resetView(); 1');
      await d.pose('rider', HERO, 0);
      await d.untitle('t');
      await d.title('t', T({ theme: 'dark', n: 4, kicker: 'What riders see', lines: ['Stops and km.', '<em>Never minutes.</em>'], size: 50,
        sub: 'An arrival time would need a record of past trips, and none is kept.' }));
      await d.wipeOut();
      await d.scroll('rider', { target: '#myStop', offset: 330 }, .8);
      await d.scrim(true);
      await d.focus('rider', '#myStop .ride', { s: 1.3, fx: 270, fy: 690, sec: 1.0 });
      await d.wait(.6);
      await d.expect('rider', '/about\\s*5\\s*stops before yours/.test(document.querySelector("#myStop .ride-big").textContent)',
        'the saved-stop card saying "about 5 stops before yours"');
      await d.ring('far', { phone: 'rider', target: '#myStop .ride-big', color: 'gold', pad: 8 });
      await d.wait(3.2);
      await d.unmark('far');

      // -- 5. Stop: the bus leaves every map
      await d.untitle('t');
      await d.title('t', T({ theme: 'dark', n: 5, kicker: 'When you get off', lines: ['Tap Stop. The bus', '<em>leaves every map.</em>'], size: 46,
        sub: 'The sharer gets a souvenir ticket, made on the phone and sent nowhere.' }));
      await d.scrim(false);
      await d.call('scrollTo', 'rider', 0);
      await d.label('crew', 'On the bus');
      await d.label('rider', 'Riders');
      await d.pose('crew', FLAT_LEFT, .9);
      await d.pose('rider', FLAT_RIGHT, .9);
      await d.ff('2 hours later', 'time');
      d.gps('crew', { road: ROADS.whole, km0: 59.5, km1: 60.0, secs: 150 });
      await d.skip(2 * 3600e3 + 26 * 60e3);
      await d.poll('rider');
      await d.wait(1.0);
      await d.ff(null);
      await d.ring('bye', { phone: 'rider', target: await pill(d, 'rider', '98019'), color: 'live', pad: 7 });
      await d.wait(.6);
      await d.tap('crew', '#onbusActive .btn-stop', { after: .4 });
      await d.unmark('bye');
      await d.poll('rider');
      await d.wait(.3);
      await d.expect('rider', '!BUSES.some(function(b){ return b.bus_label === "98019"; })', 'the bus gone from the rider\'s map');
      await d.expect('crew', '!document.getElementById("tktModal").classList.contains("hidden")', 'the salamat ticket on the sharing phone');
      await d.callout('gone', { phone: 'rider', target: '#trackStrip .track.nb', ax: .98, text: 'Gone from every map', color: 'ink', dx: -70, dy: 84 });
      await d.wait(3.0);
      await d.unmark('gone');

      // -- 6. What the database holds: one row, overwritten, then nothing
      await d.card('rows', '<div style="flex:1"></div>' +
        '<div style="padding:0 30px">' +
          '<div class="eyebrow rise">What it records</div>' +
          '<div class="big mask" style="font-size:50px; margin-top:12px"><span class="d1">No location history.</span></div>' +
          '<div class="big mask" style="font-size:50px"><span class="d2"><em>Anywhere.</em></span></div>' +
          '<div class="tbl rise d3" style="margin-top:30px">' +
            '<div class="th"><span>bus_positions</span><span class="cnt">1 row</span></div>' +
            '<div class="tr h"><span>bus</span><span>dir</span><span>position</span><span>updated</span></div>' +
            '<div class="tr r1"><span>98019</span><span>▲</span><span class="v pos">14.2912, 120.9068</span><span class="v age">2s ago</span></div>' +
          '</div>' +
          '<div class="lane rise d4" style="margin-top:16px"><i class="rail"></i>' +
            [0, 1, 2, 3, 4, 5, 6, 7].map(i => '<i class="stn" style="left:calc(20px + (100% - 40px) * ' + (i / 7) + ')"></i>').join('') +
            '<div class="bus" style="left:20px"></div>' +
          '</div>' +
          '<p class="lede rise d5" style="margin-top:12px; font-size:20px; color:var(--ink)">One row per bus sharing right now, <b>overwritten every few seconds</b>. No trail behind it.</p>' +
        '</div>' +
        '<div style="flex:1"></div>' +
        '<p class="fine rise d7" style="margin:0 30px 34px; font-size:16px">So it cannot be used to review a driver\'s <b>speed, breaks or route</b>. Not because we promise not to: the data is never written down.</p>',
        { theme: 'paper' });
      await d.tag(null);
      await d.call('inCard', 'rows', "card.querySelector('.bus').innerHTML = '<svg viewBox=\"0 0 24 24\"><use href=\"#i-coach\"/></svg>'; return 1;");
      // The bus runs along the line; the row is overwritten as it goes; what
      // it leaves behind fades at once.
      const lat0 = 14.2912, lng0 = 120.9068;
      let k = 0;
      await d.wait(5.2, async (t) => {
        k++;
        const f = Math.min(1, Math.max(0, (k - 24) / 120));
        if (k % 9 === 0 && f > 0 && f < 1) {
          const lat = (lat0 + f * .26).toFixed(4), lng = (lng0 + f * .11).toFixed(4);
          await d.call('inCard', 'rows',
            "var b = card.querySelector('.bus'), lane = card.querySelector('.lane');" +
            "var c = document.createElement('i'); c.className = 'crumb'; c.style.left = b.style.left; lane.appendChild(c);" +
            "setTimeout(function(){ c.remove(); }, 1000);" +
            "var p = card.querySelector('.pos'); p.textContent = '" + lat + ", " + lng + "'; p.classList.remove('flash'); void p.offsetWidth; p.classList.add('flash');" +
            "var a = card.querySelector('.age'); a.textContent = '1s ago'; return 1;");
        }
        await d.call('inCard', 'rows', "card.querySelector('.bus').style.left = 'calc(20px + (100% - 40px) * " + f.toFixed(4) + ")'; return 1;");
      });
      // Stop: the row goes, and nothing is left.
      await d.call('inCard', 'rows', "card.querySelector('.tr.r1').classList.add('go'); card.querySelector('.bus').style.opacity = 0; return 1;");
      await d.wait(.7);
      await d.call('inCard', 'rows', "card.querySelector('.cnt').textContent = '0 rows'; card.querySelector('.tr.r1').style.visibility = 'hidden'; return 1;");
      await d.wait(3.4);

      // -- 7. What we ask
      await d.card('ask', '<i class="dots"></i>' +
        '<div style="text-align:center; padding-top:56px">' + board(P, 'acb', 3.0, true) + '</div>' +
        '<div style="flex:1"></div>' +
        '<div style="padding:0 32px">' +
          '<div class="eyebrow rise d1">What we ask</div>' +
          '<div class="big mask" style="font-size:46px; margin-top:12px"><span class="d2">Tell us if you want it</span></div>' +
          '<div class="big mask" style="font-size:46px"><span class="d3"><em>changed or gone.</em></span></div>' +
          '<p class="lede rise d4" style="margin-top:18px">That needs nothing but a reply. And if you are willing: let the flyer go up where riders wait, and let crew mention it.</p>' +
          '<div class="row rise d5" style="margin-top:26px; align-items:center">' +
            '<div class="qrbig" style="width:150px; height:150px; padding:9px; position:relative; flex:0 0 auto">' + P.qr + '</div>' +
            '<div><div class="eyebrow" style="font-size:12px">Write to</div><div class="url" style="font-size:26px; margin-top:4px">' + P.email + '</div>' +
              '<div class="fine" style="margin-top:8px">The full briefing for the company:<br><b>' + P.url + '/for-operators.html</b></div></div>' +
          '</div>' +
        '</div>' +
        '<div style="flex:1"></div>' +
        '<p class="fine rise d7" style="text-align:center; margin:0 30px 14px"><b>Not affiliated with, run by, or endorsed by Wonderful Transport.</b> ' +
          'Free, with no ads, and open source, so every claim here can be checked.</p>' +
        '<div class="coachbar">' + road() + coach(P, 'day') + '</div>', { theme: 'maroon' });
      await d.wait(7.5);
    }
  }
};
