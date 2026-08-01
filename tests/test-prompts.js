// Exercises the trip-guard state machine as shipped, with a fake clock and a
// stub DOM. Checks that prompts appear when they should, once, and that the
// only automatic stop is a bus parked at the end of its own route.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const block = html.slice(html.indexOf('// ---- Trip guards:'), html.indexOf('// ---- Duplicate-sharer guard'));

let fail = 0;
function check(cond, label) { console.log((cond ? 'PASS  ' : 'FAIL  ') + label); if (!cond) fail++; }

function build(dirHit) {
  const log = { rpc: [], ui: [], writes: [], stopped: 0, ask: null, modalHidden: true, timers: [] };
  let now = 0;
  const els = {};
  const doc = { getElementById: id => els[id] || (els[id] = {
    textContent: '', classList: { add: c => { if (id === 'askModal' && c === 'hidden') { log.modalHidden = true; } },
                                  remove: c => { if (id === 'askModal' && c === 'hidden') { log.modalHidden = false; } },
                                  toggle: () => {} } }) };
  const prelude = `
    let sharing=true, lastCoords=null, shareDir='north', lastWrite=0;
    const accessKey='key';
    const CFG={ ROUTE_SLUG:'test-route' };
    const CHECKPOINTS=__CP__, ROUTE_CHAIN=__CHAIN__;
    function getSessionId(){ return 'sess'; }
    function rpc(fn,args){ __log__.rpc.push(fn); return Promise.resolve({}); }
    function setShareUI(s,m){ __log__.ui.push(s+'|'+m); }
    // showAsk/hideAsk go through the shared modal helpers, which live outside
    // this block because they also manage focus for the privacy dialog. Same
    // boundary as rpc and setShareUI: stubbed, not extracted.
    function openModal(id){ if (id==='askModal') __log__.modalHidden=false; }
    function closeModal(id){ if (id==='askModal') __log__.modalHidden=true; }
    function pickDir(d){ shareDir=d; }
    function writePosition(c){ __log__.writes.push(c); }
    function stopSharing(){ __log__.stopped++; sharing=false; }
    function makeDirGuard(){ return {off:false}; }
    function dirGuardReset(g){}
    function dirGuardUpdate(g){ return (g && g.off) ? null : __dirHit__; }
    function metresBetween(a,b){
      const R=6371000,d2r=Math.PI/180;
      const dLat=(b.lat-a.lat)*d2r,dLng=(b.lng-a.lng)*d2r;
      const h=Math.sin(dLat/2)**2+Math.cos(a.lat*d2r)*Math.cos(b.lat*d2r)*Math.sin(dLng/2)**2;
      return 2*R*Math.asin(Math.sqrt(h));
    }
    const Date={ now:function(){ return __clock__(); } };
    function setTimeout(fn,ms){ __log__.timers.push({fn:fn,at:__clock__()+ms}); return __log__.timers.length; }
    function clearTimeout(id){ __log__.timers=[]; }
  `;
  const tail = `
    __out__.check=checkTripGuards;
    __out__.askYes=askYes; __out__.askNo=askNo;
    __out__.setDir=function(d){ shareDir=d; };
    __out__.setCoords=function(c){ lastCoords=c; };
    __out__.armGuard=function(){ dirGuard=makeDirGuard(); };
    __out__.state=function(){ return {sharing:sharing, shareDir:shareDir, guardPaused:guardPaused,
                                      askOpen:askOpen, idleMin:idleRef?( __clock__()-idleRef.t)/60000:null }; };
  `;
  const out = {};
  const CP = [{ lat: 14.0997, lng: 120.9145 }, { lat: 14.1187, lng: 120.9540 }, { lat: 14.1701, lng: 120.9221 },
              { lat: 14.2912, lng: 120.9068 }, { lat: 14.3897, lng: 120.9196 }, { lat: 14.5101, lng: 120.9913 },
              { lat: 14.5505, lng: 121.0279 }];
  const src = (prelude + block + tail)
    .replace('__CP__', JSON.stringify(CP)).replace('__CHAIN__', JSON.stringify([0, 5, 8, 20, 32, 48, 57]));
  new Function('document', '__log__', '__out__', '__clock__', '__dirHit__', src)(
    doc, log, out, () => now, dirHit || null);
  out.tick = ms => { now += ms; log.timers.filter(t => t.at <= now).forEach(t => { log.timers = log.timers.filter(x => x !== t); t.fn(); }); };
  out.now = () => now;
  out.log = log;
  out.CP = CP;
  return out;
}

const MIN = 60000;
const midRoute = { latitude: 14.2912, longitude: 120.9068 };
const ayala = { latitude: 14.5505, longitude: 121.0279 };
const nearby = (c, dlat) => ({ latitude: c.latitude + dlat, longitude: c.longitude });

// 1. a moving bus is never interrupted
{
  const t = build(null);
  for (let i = 0; i < 60; i++) { t.tick(MIN); t.check({ latitude: 14.20 + i * 0.004, longitude: 120.93 }); }
  check(t.log.modalHidden && t.state().askOpen === false, 'moving bus: no prompt over 60 minutes');
}

// 2. stationary mid route: prompt at 20 minutes, only once
{
  const t = build(null);
  t.check(midRoute);
  for (let i = 0; i < 19; i++) { t.tick(MIN); t.check(midRoute); }
  const early = t.log.modalHidden;
  t.tick(2 * MIN); t.check(midRoute);
  check(early === true, 'parked mid route: silent at 19 minutes');
  check(t.log.modalHidden === false, 'parked mid route: asks at 21 minutes');
  check(t.log.stopped === 0, 'parked mid route: does not stop by itself');
  // answering "still on the bus" resets the clock and does not ask again soon
  t.setCoords(midRoute); t.askYes();
  t.tick(10 * MIN); t.check(midRoute);
  check(t.log.modalHidden === true, 'answered yes: quiet again for the next 10 minutes');
  t.tick(15 * MIN); t.check(midRoute);
  check(t.log.modalHidden === false, 'answered yes: asks again after another 20 minutes');
}

// 3. stationary mid route, answering "stop sharing"
{
  const t = build(null);
  t.check(midRoute); t.tick(21 * MIN); t.check(midRoute);
  t.setCoords(midRoute); t.askNo();
  check(t.log.stopped === 1, 'parked mid route: answering Stop actually stops');
}

// 4. parked at the far terminal: asks at 5 minutes, auto stops 5 minutes later
{
  const t = build(null); t.setDir('north');
  t.check(ayala);
  t.tick(4 * MIN); t.check(ayala);
  const early = t.log.modalHidden;
  t.tick(2 * MIN); t.check(ayala);
  check(early === true, 'parked at One Ayala: silent at 4 minutes');
  check(t.log.modalHidden === false, 'parked at One Ayala: asks at 6 minutes');
  check(t.log.stopped === 0, 'parked at One Ayala: nothing stopped yet');
  t.tick(5 * MIN + 1000);
  check(t.log.stopped === 1, 'parked at One Ayala: stops by itself 5 minutes after no answer');
}

// 5. parked at the terminal it started from is not "finished"
{
  const t = build(null); t.setDir('north');
  t.check({ latitude: 14.0997, longitude: 120.9145 });
  t.tick(6 * MIN); t.check({ latitude: 14.0997, longitude: 120.9145 });
  check(t.log.modalHidden === true, 'waiting at Mendez to depart northbound: no finished prompt');
}

// 6. "still going" keeps sharing and is not asked again
{
  const t = build(null); t.setDir('north');
  t.check(ayala); t.tick(6 * MIN); t.check(ayala);
  t.setCoords(ayala); t.askNo();
  check(t.log.stopped === 0, 'still going: keeps sharing');
  t.tick(6 * MIN); t.check(ayala);
  check(t.log.modalHidden === true, 'still going: not asked the finished question twice');
  check(t.log.timers.length === 0, 'still going: the auto stop timer was cancelled');
}

// 7. wrong direction: pauses, clears the bus, offers the switch
{
  const t = build({ km: 4.2 }); t.setDir('north'); t.armGuard();
  t.setCoords(midRoute);
  t.check(midRoute);
  check(t.log.modalHidden === false, 'wrong direction: asks');
  check(t.state().guardPaused === true, 'wrong direction: pauses publishing');
  check(t.log.rpc.indexOf('clear_bus_position') >= 0, 'wrong direction: takes the bus off the map');
  const before = t.log.writes.length;
  t.askYes();
  check(t.state().shareDir === 'south', 'wrong direction: switching flips to southbound');
  check(t.state().guardPaused === false, 'wrong direction: sharing resumes after the answer');
  check(t.log.writes.length === before + 1, 'wrong direction: resumes by publishing the current position');
}

// 8. wrong direction, sharer says the direction is right
{
  const t = build({ km: 4.2 }); t.setDir('north'); t.armGuard(); t.setCoords(midRoute);
  t.check(midRoute); t.askNo();
  check(t.state().shareDir === 'north', 'kept direction: stays northbound');
  check(t.state().guardPaused === false, 'kept direction: sharing resumes');
  t.check(midRoute);
  check(t.log.modalHidden === true, 'kept direction: does not nag again');
}

console.log(fail ? `\n${fail} FAILED` : '\nALL PASS');
process.exit(fail ? 1 : 0);
