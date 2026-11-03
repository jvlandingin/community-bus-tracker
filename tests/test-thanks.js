// Checks the salamat button as shipped: the words it prints, who is offered
// it, and the several things it must never do — draw a zero, draw a number
// on somebody else's bus, or carry a name a content blocker hunts for. Then
// the ticket a sharer gets at Stop, and the album of tickets they chose to
// keep: what a kept one may hold and what the album may add up.
//
// The code under test is pulled straight out of index.html by its comment
// markers, like the other suites, so a passing run here cannot drift from
// what the app does. Keep the markers intact when editing that region.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const src = html.slice(html.indexOf('// ---- SAYING SALAMAT (unit tested)'),
                       html.indexOf('// ---- END SALAMAT'));
const albumSrc = html.slice(html.indexOf('// ---- THE TICKET ALBUM (unit tested)'),
                            html.indexOf('// ---- END ALBUM'));
const S = {};
new Function('S', src + albumSrc + 'S.thanksWords=thanksWords;S.thanksControl=thanksControl;' +
  'S.ticketStamps=ticketStamps;S.ticketWorthShowing=ticketWorthShowing;S.TICKET_MIN_KM=TICKET_MIN_KM;S.ticketGreeting=ticketGreeting;' +
  'S.STAMPS=STAMPS;S.albumEntry=albumEntry;S.albumClean=albumClean;S.albumPlaces=albumPlaces;S.albumStats=albumStats;' +
  'S.ticketSky=ticketSky;S.keptGreeting=keptGreeting;S.keptDate=keptDate;S.keptSince=keptSince;' +
  'S.tripStamps=tripStamps;S.SIGHTS=SIGHTS;S.ticketLook=ticketLook;S.moonPhase=moonPhase;S.ticketSeason=ticketSeason;S.albumSights=albumSights;' +
  'S.DECOR=DECOR;S.busClean=busClean;S.busAdd=busAdd;S.busCount=busCount;S.busGoal=busGoal;S.busEarned=busEarned;S.busToured=busToured;' +
  'S.weekIndex=weekIndex;S.busStreak=busStreak;S.SHOP=SHOP;S.PAINTS=PAINTS;S.WEAR_ORDER=WEAR_ORDER;S.PARTS_TRIP=PARTS_TRIP;S.PARTS_TRIPS_A_DAY=PARTS_TRIPS_A_DAY;' +
  'S.dayIndex=dayIndex;S.busSettle=busSettle;S.busTripPay=busTripPay;S.busOwns=busOwns;S.busBuy=busBuy;S.busWear=busWear;S.busUsePaint=busUsePaint;' +
  'S.busWorn=busWorn;S.busHasLook=busHasLook;S.busLook=busLook;S.lookRead=lookRead;S.backupMake=backupMake;S.backupRead=backupRead;S.busIsNew=busIsNew;S.decorShown=decorShown;' +
  'S.postcardFacts=postcardFacts;S.tktKicker=tktKicker;')(S);
// The drawings the luck and the bus are drawn with, from the same file.
const P = require(path.join(ROOT, 'tools', 'make-pictures.js')).renderer();
new Function('P', html.slice(html.indexOf('// ---- THE PICTURES (unit tested)'), html.indexOf('// ---- END PICTURES')) +
  'P.BUS_DECOR=BUS_DECOR;P.busSvg=busSvg;P.DECOR_BOX=DECOR_BOX;P.decorTile=decorTile;P.BUS_PAINTS=BUS_PAINTS;P.rideSvg=rideSvg;')(P);
// The part of the page around the ticket and the album, cut at the next
// function so a check about one function reads that function alone.
const fn = name => {
  const a = html.indexOf('function ' + name + '(');
  return a < 0 ? '' : html.slice(a, html.indexOf('\nfunction ', a + 1));
};

let fail = 0;
const check = (c, label, note) => {
  console.log((c ? 'PASS  ' : 'FAIL  ') + label + (note ? '   ' + note : ''));
  if (!c) fail++;
};

console.log('=== 1. a zero is never drawn ===');
// The rule this defends: on a quiet run most trips collect nothing, and a
// "0" parked on the sharing screen for an hour turns silence into a verdict.
// Nothing yet has to look like nothing, not like a score of nil.
check(S.thanksWords(0) === '', 'none yet prints nothing at all');
check(S.thanksWords(null) === '', 'and so does a missing number');
check(S.thanksWords(undefined) === '', 'and an absent one');
check(S.thanksWords(-3) === '', 'and a nonsense one, rather than a minus sign on screen');
check(!/\b0\b/.test(S.thanksWords(0) + S.thanksWords(null)), 'no zero reaches the screen by any route');

console.log('\n=== 2. the words are people, and only people ===');
check(S.thanksWords(1) === '1 rider said salamat', 'one is singular');
check(S.thanksWords(2) === '2 riders said salamat', 'two is plural');
check(S.thanksWords(50) === '50 riders said salamat', 'and it just keeps counting');
// Same discipline as the saved-stop card refusing to print minutes: the
// wording must not drift into claiming something the system does not know.
// A rate, a rank or a share of anything would all be inventions.
for (const n of [1, 2, 7, 50]) {
  const w = S.thanksWords(n);
  check(!/(min|hour|%|per |rank|best|top |score|out of|average|rating)/i.test(w),
    `${n}: says nothing about rate, rank or score`, w);
}

console.log('\n=== 3. nobody is offered the chance to thank themselves ===');
check(S.thanksControl('abc123', true, false) === '', 'your own bus gets no button');
check(S.thanksControl('abc123', true, true) === '', 'and no button after the fact either');
check(S.thanksControl('abc123', false, false) !== '', 'anyone else\'s bus does');

console.log('\n=== 4. the control carries no count, on any bus ===');
// The reason this is a test and not a comment: a count beside every bus
// would rank the buses on the road in front of the riders choosing between
// them. The server already sends null for everyone else's row; this is the
// second lock, on the side that draws the pixels.
for (const done of [false, true]) {
  const out = S.thanksControl('abc123', false, done);
  check(!/\d/.test(out.replace(/abc123/g, '')),
    `${done ? 'after' : 'before'} tapping: not a digit in it`, out);
}

console.log('\n=== 5. a tap is remembered, and the button stops asking ===');
const before = S.thanksControl('abc123', false, false);
const after = S.thanksControl('abc123', false, true);
check(/<button/.test(before), 'an unthanked bus offers a button');
check(!/<button/.test(after), 'a thanked one does not offer a second');
check(/tydone/.test(after) && /salamat/i.test(after), 'it says so instead', after);
check(before.includes("sayThanks('abc123')"), 'the button names the bus it belongs to');

console.log('\n=== 6. nothing here is named like a social widget ===');
// The shareBtn lesson, on the side nobody would report it from: a filter
// list that hides this button leaves a popup that looks entirely normal.
// Filter lists match attribute names and values, never visible text, which
// is why "Say salamat" is fine and class="like-button" would not be.
// 'star' is left out for the reason test-boot.js section 8 gives: it is a
// substring of 'start'. 'rate' stays, because nothing here is named for one.
const BANNED = /(like|fav|thumb|heart|rate|vote|social|clap|widget|share|help|support|chat)/i;
const controls = [S.thanksControl('abc123', false, false), S.thanksControl('abc123', false, true)];
for (const out of controls) {
  const attrs = out.match(/(?:id|class|onclick)="[^"]*"/gi) || [];
  const bad = attrs.filter(a => BANNED.test(a));
  check(bad.length === 0, 'no id, class or handler reads as one', bad.join(' ') || attrs.join(' '));
}
// And the same for the row the sharer sees, which lives in the markup.
{
  const bad = (html.match(/(?:id|class)="[^"]*ty[^"]*"/gi) || []).filter(a => BANNED.test(a));
  check(bad.length === 0, 'and neither does the line on the sharing tab', bad.join(' ') || 'clean');
  check(/id="tyLine"[^>]*class="[^"]*hidden|class="tyline hidden"/.test(html),
    'which ships hidden, so an empty trip shows no empty box');
}

console.log('\n=== 7. the panel is the promise ===');
// A watcher's device now sends one more thing than it used to, and it only
// does it when a person taps. That has to be written where the reader can
// read it, in the same commit as the code that sends it.
const panel = html.slice(html.indexOf('id="privModal"'), html.indexOf('id="dupModal"'));
check(/salamat/i.test(panel), 'the privacy panel names the tap');
check(/(deleted|disappear|gone)[^.]*trip|trip[^.]*(ends|over)/i.test(panel),
  'and says it does not outlive the trip');
check(/no running total is kept for any driver or any bus on the server/i.test(panel),
  'and that no total is kept for anyone on our side: the only one is on the sharer\'s own phone');
// The count is the sharer's, so the sharing half of the panel has to say so.
const sharing = panel.slice(panel.indexOf('If you share from the bus'));
check(/salamat/i.test(sharing) && /only you/i.test(sharing),
  'and the sharing half tells them the number is theirs alone');

console.log('\n=== 8. the popup asks for it, and the trip owns it ===');
check(/thanksControl\(b\.id, b\.self, thanksDone\(b\)\)/.test(html),
  'busPopupHtml draws the control rather than a count');
check(/MY_THANKS = mine \? \(mine\.thanks\|0\) : 0;/.test(html),
  'the number is only ever read off our own row');
check(/MY_THANKS = 0;[\s\S]{0,80}renderBuses\(\);/.test(html),
  'and is dropped the moment sharing stops');
// No new localStorage key: test-boot section 10 fails on a fourth remembered
// thing, and this suite runs on every deploy where that one does not.
check(!/localStorage\.(setItem|removeItem)\(\s*'wt-ty'/.test(html),
  'the tab\'s memory of its taps is not kept between visits');
check(/sessionStorage\.setItem\('wt-ty'/.test(html), 'it is kept for the visit only');

console.log('\n=== 9. a tap that never landed must not claim it did ===');
// Found by testing it for real against a database that had not had
// sql/07-thanks.sql applied: the button drew, the call 404'd, and the popup
// still said "Salamat sent" while the sharer saw nothing. Optimistic paint is
// right -- a thank-you should not wait on a patchy connection -- but a tap
// that failed has to give the button back rather than bank a delivery that
// never happened.
check(/if \(res && res\.error\)\{ failed = true;/.test(html),
  'a failed call is noticed rather than swallowed whole');
check(/members\.forEach\(function\(m\)\{ delete t\[m\]; \}\);/.test(html),
  'and the tap is un-remembered, so the button comes back');
check(/thanksWarned/.test(html) && /07-thanks\.sql/.test(html),
  'and the one cause worth naming is named, once, where a maintainer will see it');
check(/if \(mine && !\('thanks' in mine\)\) thanksTrouble/.test(html),
  'the sharing side notices an older get_positions too, rather than showing a quiet zero');
// The rider still gets no error dialog: the returned button is the message.
check(!/alert\(|showAsk\([^)]*salamat/i.test(html.slice(html.indexOf('async function sayThanks'),
                                                          html.indexOf('// Everything the badge no longer says'))),
  'and is still never shown an error for being kind');

// Found in October 2026 by watching it in a real browser: the redraw ran
// inside the button's own click, took the button out of the page, and Leaflet
// then read the tap as a tap on the map and closed the popup. The thank-you
// still went through; the rider just never saw it land. The fix is to let the
// click finish first, and this pins that it stays first.
{
  const body = html.slice(html.indexOf('async function sayThanks'), html.indexOf('// Everything the badge no longer says'));
  const wait = body.indexOf('await new Promise(function(r){ setTimeout(r, 0); });');
  const redraw = body.indexOf('renderBuses();');
  check(wait > 0 && redraw > 0 && wait < redraw,
    'the popup is not redrawn until the tap that opened it has finished');
}

console.log('\n=== 10. every RPC the pages call exists in a migration ===');
// The same failure one step earlier: a page that calls a function no
// migration defines is a feature that is silently dead on arrival, and
// nothing else here would catch it. Cheap, so it covers every call, not
// just this feature's.
{
  const sqlDir = path.join(ROOT, 'sql');
  const sql = fs.readdirSync(sqlDir).filter(f => f.endsWith('.sql'))
    .map(f => fs.readFileSync(path.join(sqlDir, f), 'utf8')).join('\n');
  const admin = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
  const called = [...new Set([...(html + admin).matchAll(/rpc\(\s*'([a-z_]+)'/g)].map(m => m[1]))].sort();
  // Anchored on "create ... function", not just "function": a grant line
  // names the function too, so the looser pattern matched the grant and the
  // check could never fail. Caught by renaming a function and watching it
  // stay green.
  const missing = called.filter(fn =>
    !new RegExp('create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.' + fn + '\\s*\\(', 'i').test(sql));
  check(missing.length === 0,
    `all ${called.length} are defined in sql/`, missing.length ? 'MISSING: ' + missing.join(' ') : called.join(' '));
  // and each is actually reachable by the anon key the pages carry: a
  // function that exists but was never granted fails exactly as invisibly.
  const grants = (sql.match(/grant execute on function[\s\S]*?to\s+anon/gi) || []).join('\n');
  const ungranted = called.filter(fn => !new RegExp('public\\.' + fn + '\\s*\\(').test(grants));
  check(ungranted.length === 0, 'and every one of them is granted to anon',
    ungranted.length ? 'NOT GRANTED: ' + ungranted.join(' ') : 'all granted');
}

console.log('\n=== 11. the feature is findable without shouting ===');
// The button lives in the bus popup, which every way of tapping a bus opens.
// It used to have one muted line under the chips as well, "Tap any bus to see
// it up close and say salamat", which went in October 2026 with the rest of
// what the screen said twice (the maintainer: fewer words). The map's tour
// says it now, on the popup itself, and nothing on the tracker asks for it.
check(!/id="chipNote"/.test(html) && !/Tap any bus to see it up close/.test(html),
  'no line under the chips asks for a tap');
{
  const walks = html.slice(html.indexOf('const WALKS = {'), html.indexOf('const WALK_ALT'));
  check(/id:'popup'[^}]*<b>Say salamat<\/b>/.test(walks), 'the map\'s tour says it, on the popup itself');
}
check(/onclick="focusBus\(\\''\+b\.id\+'\\'\)"/.test(html.slice(html.indexOf('function renderBuses'))),
  'and a chip opens its bus\'s popup, as the badge on the map does');
// The other road to the popup: the tracker's strip pills are buttons that
// focus their bus. Guarded properly in test-boot section 9 with a real DOM;
// this only pins that the wiring is the popup, not a second salamat control.
check(/onclick="focusBus\(/.test(html.slice(html.indexOf('function renderStrip'))),
  'a strip pill routes to the map popup rather than growing its own button');
check(!/tybtn/.test(html.slice(html.indexOf('function renderStrip'), html.indexOf('function renderBuses'))),
  'and no salamat control is drawn on the strip itself');

console.log('\n=== 12. the ticket: stamps are never about the driving ===');
// Rule 5 in index.html. The ticket at Stop is the most rewarding thing the
// app shows a sharer, which is exactly why it must not become the driver
// metric for-operators.html promises this tool cannot produce: no speed, no
// trip time, nothing that compares one run with another.
{
  const M = (h, m) => h * 60 + m;
  const trip = (o) => Object.assign({ fromIdx: 2, toIdx: 4, lastIdx: 7, fromShort: 'AMADEO', toShort: 'IMUS',
                                      startMins: M(9, 0), endMins: M(10, 30), othersAtStart: 3 }, o);
  const names = st => st.map(x => x.t).join(',');
  check(S.ticketStamps(trip({})).length === 0, 'an ordinary midday trip in the middle of the route: no stamps');
  const full = S.ticketStamps(trip({ fromIdx: 0, toIdx: 7, fromShort: 'MENDEZ', toShort: 'AYALA' }));
  check(names(full) === 'Buong ruta' && full[0].s === 'MENDEZ → AYALA', 'end to end: Buong ruta', full[0] && full[0].s);
  check(names(S.ticketStamps(trip({ fromIdx: 7, toIdx: 0 }))) === 'Buong ruta', 'and the same the other way');
  check(names(S.ticketStamps(trip({ startMins: M(4, 10), endMins: M(6, 0) }))) === 'Madaling araw', 'before 5 AM: Madaling araw');
  check(names(S.ticketStamps(trip({ startMins: M(17, 0), endMins: M(19, 0) }))) === 'Gabi na', 'ending after 6:30 PM: Gabi na');
  check(names(S.ticketStamps(trip({ startMins: M(23, 0), endMins: M(0, 40) }))) === 'Gabi na', 'and a trip that runs past midnight');
  check(names(S.ticketStamps(trip({ othersAtStart: 0 }))) === 'Unang bus', 'nobody else on the map when it started: Unang bus');
  const many = S.ticketStamps(trip({ fromIdx: 0, toIdx: 7, startMins: M(4, 0), endMins: M(7, 0), othersAtStart: 0 }));
  check(many.length === 2, 'never more than two, so the ticket stays a ticket', names(many));

  // Duration cannot change a stamp. Same shape, same time of day, from an
  // hour to three: the stamps come out identical, so nothing on the ticket
  // can be read as "this one was quick".
  for (const base of [trip({}), trip({ fromIdx: 0, toIdx: 7 }), trip({ othersAtStart: 0 })]) {
    const outs = [60, 95, 140, 180].map(d => names(S.ticketStamps(Object.assign({}, base, { endMins: base.startMins + d }))));
    check(outs.every(o => o === outs[0]), 'an hour or three, the stamps are the same', outs[0] || '(none)');
  }
  const words = [];
  for (const f of [0, 7]) for (const t of [0, 7]) for (const sm of [M(4, 0), M(9, 0), M(17, 0), M(23, 0)]) for (const o of [0, 2]) {
    S.ticketStamps(trip({ fromIdx: f, toIdx: t, fromShort: f ? 'AYALA' : 'MENDEZ', toShort: t ? 'AYALA' : 'MENDEZ',
                          startMins: sm, endMins: (sm + 120) % 1440, othersAtStart: o }))
      .forEach(x => words.push(x.t + ' ' + x.s));
  }
  const badW = words.filter(w => /(fast|quick|slow|speed|km\/h|kph|\bmin|hour|record|rank|score|best|on time|late\b|delay)/i.test(w));
  check(words.length > 0 && badW.length === 0, 'and no stamp says anything about how the bus was driven',
    badW.length ? badW.join(' / ') : [...new Set(words)].join(' / '));
  check(S.ticketStamps(trip({ fromIdx: 0, toIdx: 7 })).every(x => ['red', 'blue', 'green'].includes(x.c)),
    'every stamp has an ink the ticket knows how to draw');
  // A kept ticket stores its stamps by kind, so every stamp a ticket can get
  // has to be one of the kinds, and the album prints each kind's own words.
  const kinds = Object.keys(S.STAMPS);
  check(kinds.join(',') === 'full,dawn,night,first', 'four kinds of stamp, each under the name a kept ticket stores', kinds.join(','));
  check(S.ticketStamps(many.length ? trip({ fromIdx: 0, toIdx: 7, startMins: M(4, 0), othersAtStart: 0 }) : trip({}))
          .concat(S.ticketStamps(trip({ startMins: M(17, 0), endMins: M(19, 0), othersAtStart: 0 })))
          .every(x => kinds.includes(x.k) && S.STAMPS[x.k].t === x.t),
    'every stamp a ticket gets carries its kind');
  const kindWords = kinds.map(k => S.STAMPS[k].t + ' ' + S.STAMPS[k].s);
  check(kindWords.every(w => !/(fast|quick|slow|speed|km\/h|kph|\bmin|hour|record|rank|score|best|on time|late\b|delay)/i.test(w)),
    'and the words the album prints for each kind say nothing about the driving either', kindWords.join(' / '));
}

console.log('\n=== 13. the ticket: when there is one at all ===');
// Rule 6: a trip too short to have helped anyone gets no ticket.
check(!S.ticketWorthShowing(null), 'no trip: no ticket');
check(!S.ticketWorthShowing({ mins: 4, writes: 9, km: 6 }), 'four minutes: no ticket');
check(S.ticketWorthShowing({ mins: 5, writes: 1, km: 3 }), 'five minutes with the bus on the map: a ticket');
check(!S.ticketWorthShowing({ mins: 90, writes: 0, km: 40 }), 'an hour and a half that never reached the map: no ticket');
// And a trip that went nowhere: on the map for as long as it liked, waiting
// at the terminal with sharing on, then stopped where it started.
check(!S.ticketWorthShowing({ mins: 35, writes: 90, km: 0.2 }), 'thirty-five minutes on the map, 200 m along the route: no ticket');
check(S.TICKET_MIN_KM === 1 && !S.ticketWorthShowing({ mins: 12, writes: 30, km: 0.95 }) && S.ticketWorthShowing({ mins: 12, writes: 30, km: 1 }),
  'under a kilometre between its two ends: none; a kilometre: a ticket');
check(S.ticketWorthShowing({ mins: 12, writes: 30, km: null }) && S.ticketWorthShowing({ mins: 12, writes: 30, km: NaN }),
  'a route with no checkpoints to measure along leaves it to the time, as before');
{
  const facts = fn('ticketFacts');
  check(/const km = Number\.isFinite\(trip\.startKm\) && Number\.isFinite\(endKm\) \? Math\.abs\(endKm - trip\.startKm\) : null;/.test(facts) &&
        /const fromIdx = nearestCheckpoint\(trip\.startKm\), toIdx = nearestCheckpoint\(endKm\);/.test(facts) && /km:km,/.test(facts),
    'measured along the route\'s chain between the same two ends the ticket names, from numbers the trip already keeps');
  const asks = 'ticketWorthShowing({ mins:f.mins, writes:trip.writes, km:f.km })';
  check(fn('showTicket').includes(asks) && fn('endTicket').includes(asks) && [...html.matchAll(/ticketWorthShowing\(\{/g)].length === 2,
    'and the ticket and the count on your bus both ask it, so a trip that went nowhere earns neither');
}
check(S.ticketGreeting(18 * 60 + 30) === 'Ingat pauwi!' && S.ticketGreeting(30) === 'Ingat pauwi!',
  'an evening or late-night trip: Ingat pauwi');
check(S.ticketGreeting(7 * 60) === 'Ingat sa biyahe!' && S.ticketGreeting(4 * 60) === 'Ingat sa biyahe!',
  'a morning one: Ingat sa biyahe');

console.log('\n=== 14. the ticket: made on the phone, kept only if asked ===');
// The ticket is built from a handful of numbers the sharing phone keeps for
// the trip, never a trail of positions. "No location history" is the system's
// first rule; a feature that needed one on the device would be the thin end
// of it, so the record's shape is pinned here.
{
  const begin = html.slice(html.indexOf('function tripBegin('), html.indexOf('function nearestCheckpoint('));
  // Top-level keys only: the start is worked out by a call whose argument
  // is an object of its own, and that object is not kept.
  const lit = ((begin.match(/TRIP = \{([\s\S]*?)\n  \};/) || [])[1] || '').replace(/\{[^{}]*\}/g, '');
  const keys = [...lit.matchAll(/(?:^|[,\s])([a-zA-Z]+)\s*:/g)].map(m => m[1]).sort().join(',');
  // Eight since the trip learned to outlive its page: when and where on the
  // chain the last update landed, each overwritten by the next, so the end
  // is one number like the start and never a list.
  check(keys === 'lastAt,lastKm,maxThanks,others,polled,start,startKm,writes', 'the trip record is eight numbers and flags', keys);
  const writes = [...html.matchAll(/TRIP\.([a-zA-Z]+)\s*(?:=[^=]|\+\+)/g)].map(m => m[1]);
  check(writes.length > 0 && writes.every(k => ['maxThanks', 'polled', 'writes', 'lastAt', 'lastKm'].includes(k)),
    'and nothing else is ever written into it', [...new Set(writes)].join(','));
  check(!/TRIP\.[a-zA-Z]+\.push\(/.test(html), 'nothing is appended to it, so no trail can grow there');
  const save = fn('saveTrip');
  check(/localStorage\.setItem\('wt-trip', JSON\.stringify\(\{ trip:TRIP, session:getSessionId\(\), dir:shareDir,/.test(save) && !/push\(|concat\(|getItem/.test(save),
    'kept on the phone as wt-trip, the record and what carrying on needs, written over each time');
  check(/TRIP = null; RESUME = null;\s*dropTrip\(\);/.test(fn('stopSharing')) && /dropTrip\(\);/.test(fn('endLostTrip')),
    'and removed the moment the trip ends, however it ends');
  const show = fn('showTicket');
  check(/const ty = thanksWords\(trip\.maxThanks\);/.test(show) && /\(ty \?/.test(show),
    'the salamat line goes through thanksWords, so a quiet trip shows no zero');
  check(show.length > 0 && !/rpc\(|fetch\(|localStorage|sessionStorage|saveAlbum|keepTicket/.test(show),
    'drawing the ticket sends nothing and stores nothing');
  check(/TKT_KEEP = albumEntry\(\{ when:now, dir:shareDir, fromShort:tktPlace\(fromIdx\), toShort:tktPlace\(toIdx\),\s*stamps:stamps, thanked:trip\.maxThanks > 0 \}\);/.test(show),
    'what Keep would keep is albumEntry() of the trip: the ends, the stamps, and only whether anyone thanked');
  // Every end of a trip gets its ticket but one. The sharer asked for this:
  // a trip that kept a bus on the map should not lose its ticket to a GPS
  // error or a key changed under it. Whether it was long enough is still
  // ticketWorthShowing()'s to say, so a route already full at the first
  // write still shows nothing.
  const stop = fn('stopSharing');
  check(/if \(!\(opts && opts\.blocked\)\)\{ try\{ endTicket\(trip, endCoords\); \}catch\(e\)\{\} \}/.test(stop) &&
        !/opts\.quiet/.test(stop) && !/quiet\s*:/.test(html),
    'every end of a trip draws its ticket, with no quiet way round it');
  check(/await stopSharing\(\{ blocked:true \}\);\s*setShareUI\('error'/.test(html),
    'except a session an organizer stopped, which ends on its error, not on a ticket');
  check(/await stopSharing\(\);\s*if \(raw\.indexOf\('invalid key'\)>=0\) forgetKey\(\);\s*setShareUI\('error'/.test(html),
    'a trip refused for a changed key mid-trip gets its ticket, then says why it ended');
  check(/function gpsGaveUp\(msg\)\{\s*gpsFound\(\);\s*stopSharing\(\)\.then/.test(html),
    'and so does a trip whose GPS gave up');
  check(stop.indexOf('endTicket(') > 0 && stop.indexOf('endTicket(') < stop.indexOf("rpc('clear_bus_position'"),
    'the ticket is drawn before the network is asked anything, so a slow line cannot hold it back');
}

console.log('\n=== 15. a kept ticket: the souvenir, not the stopwatch ===');
// Rule 8. Anyone on board can share, the conductor and the driver included,
// so a pile of kept tickets with their clock times on would be a timesheet
// on that phone: trip times, breaks, a day's runs. A kept ticket is six
// things, and none of them is a time, a duration, a bus number or a count.
{
  const when = new Date(2026, 9, 9, 7, 31);
  const stamps = [{ k: 'full', t: 'Buong ruta', s: 'MENDEZ → AYALA', c: 'red' }, { k: 'dawn', t: 'Madaling araw', s: 'before 5 AM', c: 'blue' }];
  // Everything showTicket() knows about the trip, handed over at once: the
  // entry has to take the six things and drop the rest on its own.
  const e = S.albumEntry({ when, dir: 'north', fromShort: 'MENDEZ', toShort: 'AYALA', stamps, thanked: true,
    mins: 171, startMins: 280, endMins: 451, label: '98019', maxThanks: 7, startKm: 0.4, times: '4:40–7:31 AM' });
  check(Object.keys(e).sort().join(',') === 'd,dir,from,st,to,ty', 'six things, and only those six', Object.keys(e).sort().join(','));
  check(e.d === '2026-10-09' && e.dir === 'n' && e.from === 'MENDEZ' && e.to === 'AYALA', 'the day, the direction and the two ends', JSON.stringify(e));
  check(e.st.join(',') === 'full,dawn', 'the stamps, by kind', e.st.join(','));
  check(e.ty === true, 'and that somebody said salamat, as a yes', String(e.ty));
  const json = JSON.stringify(e);
  check(!/98019|171|280|451|4:40|7:31|\b7\b|0\.4/.test(json) && Object.values(e).every(v => typeof v !== 'number'),
    'no bus number, no minutes, no clock, no count, no position anywhere in it', json);
  check(S.albumEntry({ when, dir: 'south', fromShort: 'AYALA', toShort: 'MENDEZ', stamps: [], thanked: false }).ty === false &&
        S.albumEntry({ when, dir: 'south', stamps: [] }).dir === 's', 'a trip nobody thanked keeps no flower; southbound is s');
  check(S.albumEntry({ when, dir: 'north', stamps: [{ k: 'toString' }, { k: 'fastest' }] }).st.length === 0,
    'a stamp that is not one of the four is not kept');
  // The day is all the clock it may keep: nothing in the block reads a time.
  check(!/getHours|getMinutes|getSeconds|getTime|Date\.now|toISOString|toTimeString/.test(albumSrc),
    'nothing in the album block reads the time of day, only the date');
  check(S.ticketSky(['full', 'dawn']) === 'dawn' && S.ticketSky(['night']) === 'night' && S.ticketSky(['first']) === 'day' && S.ticketSky() === 'day',
    'its picture\'s sky comes from its stamps, so it needs no clock to draw it again');
  check(S.keptGreeting(['night']) === 'Ingat pauwi!' && S.keptGreeting(['dawn', 'first']) === 'Ingat sa biyahe!',
    'and so does its goodbye');
  check(S.keptDate('2026-10-09') === 'FRI 9 OCT' && S.keptSince('2026-08-21') === 'AUG 2026' && S.keptSince('') === '',
    'the day it prints is the ticket\'s own date format', S.keptDate('2026-10-09'));
  check(JSON.stringify(S.albumClean(JSON.parse(JSON.stringify([e])))) === JSON.stringify([e]),
    'and it comes back out of storage exactly as it went in');
  const kept = fn('showKeptTicket');
  check(kept.length > 0 && !/clockText|tkt-dur|tkt-big|busLabel|BUS /.test(kept),
    'a kept ticket drawn again has no times line, no duration and no bus number to draw');
  check(/e\.ty \? '<div class="tkt-ty">[^']*Someone said salamat/.test(kept) && !/thanksWords/.test(kept),
    'and its flower says somebody thanked, never how many');
}

console.log('\n=== 16. the album adds up nothing that ranks anybody ===');
// Rule 9. It counts tickets, places and stamps. No time on the map (summed,
// that is working hours), no salamat total (the driver metric again),
// nothing per bus, no streak to keep alive.
{
  const cps = ['MENDEZ', 'TGY', 'AMADEO', 'GEN.T', 'IMUS', 'KAWIT', 'PITX', 'AYALA'].map(short => ({ short, name: short }));
  const list = [
    { d: '2026-09-29', dir: 'n', from: 'AMADEO', to: 'PITX', st: [], ty: false },
    { d: '2026-10-02', dir: 's', from: 'PITX', to: 'AMADEO', st: ['night'], ty: true },
    { d: '2026-08-21', dir: 'n', from: 'TGY', to: 'TGY', st: ['first'], ty: true },
  ];
  const st = S.albumStats(list, cps);
  check(Object.keys(st).sort().join(',') === 'north,of,places,since,south,stamps,tickets',
    'tickets, directions, places, stamps and the first day: nothing else', Object.keys(st).sort().join(','));
  check(st.tickets === 3 && st.north === 2 && st.south === 1 && st.places === 6 && st.of === 8 && st.since === '2026-08-21',
    'counted the way they read', JSON.stringify(st));
  check(Object.keys(st.stamps).join(',') === Object.keys(S.STAMPS).join(',') && st.stamps.night === 1 && st.stamps.first === 1 && st.stamps.full === 0,
    'one count per kind of stamp', JSON.stringify(st.stamps));
  const flipped = list.map(e => Object.assign({}, e, { ty: !e.ty }));
  check(JSON.stringify(S.albumStats(flipped, cps)) === JSON.stringify(st),
    'whether anyone said salamat changes no number in it: the flowers are never added up');
  check(S.albumPlaces(list, cps).join(',') === '1,2,3,4,5,6', 'a place counts once a kept trip has passed it, the two ends included',
    S.albumPlaces(list, cps).join(','));
  check(S.albumPlaces([{ d: '2026-01-01', dir: 'n', from: 'GONE', to: 'IMUS', st: [], ty: false }], cps).join(',') === '4' &&
        S.albumPlaces([{ d: '2026-01-01', dir: 'n', from: 'GONE', to: 'NOWHERE', st: [], ty: false }], cps).length === 0 &&
        S.albumPlaces([], cps).length === 0,
    'an end config.txt no longer has is skipped rather than guessed at');
  const render = fn('renderAlbum');
  const tyUses = [...render.matchAll(/\.ty\b(.{0,3})/g)].map(m => m[1]);
  check(render.length > 0 && tyUses.length > 0 && tyUses.every(u => u === ' ? '),
    'the album only ever draws a flower for it, one ticket at a time', tyUses.join('|'));
  check(/n \? '×' \+ n : 'not yet'/.test(render) && !/×0/.test(render),
    'a stamp not collected yet says so, never ×0');
  // The row on the sharing tab is its name and nothing else (October 2026):
  // the counts are inside, so there is no number on the tab to be a zero.
  const sync = fn('syncAlbumRow');
  check(/row\.classList\.remove\('hidden'\);/.test(sync) && !/textContent|innerHTML/.test(sync) &&
        /<span class="lbl">My tickets<\/span>/.test(html),
    'My tickets is always offered, so what there is to collect can be found, by its name alone: no number on the tab to be a zero');
  // The kept tickets still add up none of these. The totals and the streak
  // the maintainer asked for belong to the bus (section 19), not to them.
  const albumOnly = ['albumEntry', 'albumClean', 'albumPlaces', 'albumStats'].map(fn).join('');
  check(albumOnly.length > 0 && !/streak|ranking|leader|best|fastest|average|mins|maxThanks|total/i.test(albumOnly.replace(/^\s*\/\/.*$/gm, '')),
    'no streak, no ranking, no best, average or total in what the kept tickets add up');
}

console.log('\n=== 17. keeping is a tap, and only Keep adds a ticket ===');
// Rule 10. Nothing is kept unless the sharer taps Keep on that ticket, and
// what is stored is exactly what albumEntry() made.
{
  check(S.albumClean('nope').length === 0 && S.albumClean(null).length === 0 && S.albumClean({}).length === 0,
    'storage that is not a list of tickets reads as no tickets');
  const junk = [
    { d: '2026-10-09', dir: 'n', from: 'A', to: 'B', st: ['full', 'fastest', 'dawn', 'night'], ty: 1, mins: 171, label: 'X', times: '4:40' },
    { d: 'yesterday', dir: 'n', from: 'A', to: 'B', st: [] },
    { d: '2026-13-45', dir: 'n', from: 'A', to: 'B', st: [] },
    { d: '2026-10-09', dir: 'up', from: 'A', to: 'B', st: [] },
    { d: '2026-10-09', dir: 's', from: 'A'.repeat(500), to: 7, st: [] },
    { d: '2026-10-09', dir: 's', from: 'A'.repeat(500), to: 'B', st: [] },
    null, 'x', 42,
  ];
  const clean = S.albumClean(junk);
  check(clean.length === 2, 'only well-formed tickets come back out of storage', String(clean.length));
  check(clean.every(e => Object.keys(e).sort().join(',') === 'd,dir,from,st,to,ty'),
    'each with its six things and anything else dropped', clean.map(e => Object.keys(e).join(',')).join(' | '));
  check(clean[0].st.join(',') === 'full,dawn' && clean[0].ty === true && clean[1].from.length === 24,
    'unknown stamps dropped, at most two kept, a flag kept as a yes or no, a name kept short', JSON.stringify(clean));
  const writes = [...html.matchAll(/localStorage\.(setItem|removeItem)\(\s*'wt-tickets'/g)];
  check(writes.length === 2 && writes.every(m => fn('saveAlbum').includes(m[0])),
    'the album is written in one place, saveAlbum()');
  // Keep adds, Remove takes one away, Start from scratch empties it, and a
  // restore puts back what a backup the sharer made had kept.
  const callers = ['keepTicket', 'dropKeptTicket', 'clearAlbum', 'restoreBackup'];
  const calls = [...html.matchAll(/saveAlbum\(/g)].length - 1;
  check(calls === callers.length && callers.every(c => fn(c).includes('saveAlbum(')),
    'which only Keep, Remove, Start from scratch and a restore call', String(calls) + ' calls');
  check([...html.matchAll(/\.push\(TKT_KEEP\)/g)].length === 1 && /list\.push\(TKT_KEEP\);/.test(fn('keepTicket')),
    'and only Keep adds, with exactly the six things showTicket() made');
  // Comments may name it; code may not call it.
  const code = html.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');
  check([...code.matchAll(/keepTicket\(/g)].length === 2 && /onclick="keepTicket\(\)"/.test(code),
    'Keep runs from its button and from nowhere else: keeping is never a default');
  const sets = [...html.matchAll(/TKT_KEEP = ([^;]+);/g)].map(m => m[1].trim());
  check(sets.filter(v => v !== 'null').length === 1 && /^albumEntry\(/.test(sets.find(v => v !== 'null')),
    'what Keep would keep is only ever albumEntry() of the ticket on screen', sets.join(' | '));
  check(/function closeTicket\(\)\{\s*TKT_KEEP = null;/.test(html),
    'and closing the ticket forgets it, so a ticket nobody kept leaves nothing behind');
}

console.log('\n=== 18. a ticket\'s luck: worked out, never a score ===');
// Rules 11 to 13. The paper, the punch and what is in the picture follow
// from the day, the direction and the two ends, so a kept copy draws the same
// and a trip cannot be re-rolled; none of it follows how the bus was driven
// or how many said salamat.
{
  const entry = (o) => Object.assign({ d: '2026-10-15', dir: 'n', from: 'MENDEZ', to: 'AYALA', st: [], ty: false }, o);
  const same = (a, b) => JSON.stringify(S.ticketLook(a)) === JSON.stringify(S.ticketLook(b));
  check(same(entry(), entry()), 'the same ticket always has the same luck');
  check(same(entry({ ty: false }), entry({ ty: true })), 'whether anyone said salamat changes nothing about it');
  const look = fn('ticketLook') + fn('ticketSeed') + fn('luck');
  check(!/Math\.random|Date\.now|new Date|\bty\b|thank|mins|writes|speed|duration|label/.test(look),
    'and nothing but the ticket\'s day, direction, ends and stamps goes into it: no clock, no randomness, no salamat, no trip length');
  const all = [];
  for (let m = 1; m <= 12; m++) for (let d = 1; d <= 28; d += 3) for (const dir of ['n', 's']) for (const st of [[], ['dawn'], ['night']])
    for (const [from, to] of [['MENDEZ', 'AYALA'], ['TGY', 'IMUS'], ['AMADEO', 'GEN.T']])
      all.push(entry({ d: '2026-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'), dir, from, to, st }));
  const looks = all.map(e => ({ e, l: S.ticketLook(e) }));
  const seen = new Set(looks.flatMap(x => x.l.sights));
  check(Object.keys(S.SIGHTS).every(k => seen.has(k)), 'over a year of trips every sight turns up', seen.size + ' of ' + Object.keys(S.SIGHTS).length);
  const rare = looks.filter(x => x.l.rare).length / looks.length;
  check(rare > 1 / 30 && rare < 1 / 9, 'and about one ticket in fifteen is gold', (rare * 100).toFixed(1) + '%');
  check(new Set(looks.map(x => x.l.paper)).size === 5 && new Set(looks.map(x => x.l.punch)).size === 4, 'on five papers, with four punches');
  check(looks.every(x => x.l.sights.every(k => k in S.SIGHTS)) && looks.every(x => new Set(x.l.sights).size === x.l.sights.length),
    'every sight it names is one the album knows, and none twice');
  const night = looks.filter(x => S.ticketSky(x.e.st) === 'night');
  check(night.every(x => !['carabao', 'sorbetes', 'stall'].includes(x.l.road) && !x.l.air && x.l.weather !== 'double' && x.l.moon >= 0),
    'at night: nothing by the roadside, nothing flying, no rainbow, and the moon of that night');
  check(looks.filter(x => x.l.meteor).every(x => S.ticketSky(x.e.st) === 'night'), 'a shooting star only at night');
  check(looks.every(x => !(x.l.weather === 'rain' && x.l.air) && !(x.l.season && x.l.air)), 'nothing flies in the rain or among the season\'s decorations');
  check(S.moonPhase('2024-04-08') === 0 && S.moonPhase('2025-01-13') === 4 && S.moonPhase('2024-04-23') === 4 && S.moonPhase('2026-10-26') === 4,
    'the moon is the real one: new on 8 April 2024, full on 13 January 2025');
  const hours = html.slice(html.indexOf('function inParolSeason('), html.indexOf('// ---- END operating hours'));
  const inParol = new Function(hours + 'return inParolSeason;')();
  let agree = true;
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 86400000) {
    const d = new Date(t), key = d.toISOString().slice(0, 10), local = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    if ((S.ticketSeason(key) === 'parol') !== inParol(local)) agree = false;
  }
  check(agree, 'the parol is on a ticket on exactly the days it hangs in the header');
  check(S.ticketSeason('2026-05-27') === 'banderitas' && S.ticketSeason('2026-05-28') === 'flags' && S.ticketSeason('2026-06-12') === 'flags' &&
        S.ticketSeason('2026-06-13') === '', 'banderitas in May, the flags from 28 May to Independence Day');
  const sg = S.albumSights(all.slice(0, 40));
  check(sg.gold === all.slice(0, 40).filter(e => S.ticketLook(e).rare).length && Object.values(sg.seen).every(n => n > 0),
    'the album counts what its tickets show, and the gold ones');
  check(Object.keys(P.TICKET_SIGHTS).sort().join(',') === Object.keys(S.SIGHTS).sort().join(','), 'every sight has its drawing, and every drawing its name');
  const render = fn('renderAlbum');
  check(/\(n \? \(x\.rare \? 'rare · ' : ''\) \+ '×' \+ n : 'not yet'\)/.test(render), 'a sight not yet spotted says so, never ×0');
  check(/'<div><b>' \+ spotted \+ '<small>\/' \+ skeys\.length/.test(render), 'and the album counts how many it has spotted of all there are');
}

console.log('\n=== 19. your bus: counted, never a timesheet ===');
// Rules 14 to 16. Every trip that drew a ticket and went somewhere counts,
// kept or not, as numbers and place names: no day, no time, nothing per bus,
// nothing about salamat. A trip that went nowhere counts for nothing.
{
  const cps = 'MENDEZ TGY AMADEO GEN.T IMUS PITX AYALA'.split(' ').map(short => ({ short, name: short }));
  let b = S.busClean(null);
  check(JSON.stringify(b) === JSON.stringify({ places: [], n: 0, first: 0, full: 0, dawn: 0, night: 0, north: 0, south: 0, tw: 0, ts: 0, mins: 0, ty: 0, wk: 0, streak: 0, best: 0,
                     c: 0, day: 0, dayn: 0, show: 0, asked: 0, own: [], paints: [], off: [], paid: [], paint: 'klasiko' }),
    'an empty bus is counts and a list of places, nothing else', JSON.stringify(b));
  check(S.busEarned(b, cps).length === 0, 'and wears nothing');
  b = S.busAdd(b, { dir: 'north', stamps: ['first'], fromIdx: 2, toIdx: 2 }, cps);
  check(b.n === 0, 'a trip that began and ended at the same place counts for nothing');
  b = S.busAdd(b, { dir: 'north', stamps: ['full', 'dawn', 'first'], fromIdx: 0, toIdx: 6 }, cps);
  check(b.n === 1 && b.full === 1 && b.dawn === 1 && b.first === 1 && b.north === 1 && b.places.length === 7,
    'a whole-route trip counts once, with every stamp it earned and every place it passed', JSON.stringify(b));
  check(S.busEarned(b, cps).join(',') === 'sampaguita,stripe,route', 'and puts on the garland, the stripe and the route', S.busEarned(b, cps).join(','));
  check(Object.keys(b).sort().join(',') === 'asked,best,c,dawn,day,dayn,first,full,mins,n,night,north,off,own,paid,paint,paints,places,show,south,streak,ts,tw,ty,wk',
    'what is kept is counts, totals, place names and what the bus owns and wears: never a list of days or times, no bus number', Object.keys(b).sort().join(','));
  for (let i = 0; i < 4; i++) b = S.busAdd(b, { dir: 'south', stamps: ['night'], fromIdx: 5, toIdx: 1 }, cps);
  const earned = S.busEarned(b, cps);
  check(b.n === 5 && earned.includes('horns') && earned.includes('bumpers') && earned.includes('string') && !earned.includes('fringe'),
    'five trips: the horns, both directions, the lights after dark, and the fringe not yet', earned.join(','));
  const dirty = S.busClean({ n: -3, first: 'x', full: 2.7, dawn: Infinity, night: 1e12, north: 1, south: 0, places: ['A', 'A', 7, 'B'.repeat(40)], when: '2026-10-15', minutes: 90, days: ['2026-10-15'] });
  check(dirty.n === 0 && dirty.first === 0 && dirty.full === 2 && dirty.dawn === 0 && dirty.night === 1e6 && dirty.places.length === 2 &&
        dirty.places[1].length === 24 && !('when' in dirty) && !('minutes' in dirty) && !('days' in dirty),
    'whatever comes back out of storage is cleaned to counts and short names, and anything else is dropped', JSON.stringify(dirty));
  check(S.DECOR.every(d => /^[a-z]+$/.test(d.k)) && S.DECOR.concat(S.SHOP).map(d => d.k).sort().join(',') === Object.keys(P.BUS_DECOR).sort().join(','),
    'every decoration and every shop item has its drawing, and every drawing is one or the other');
  check(S.DECOR.every(d => ['n', 'first', 'full', 'dawn', 'night', 'ways', 'places', 'tw', 'ts', 'ty', 'hours', 'best'].includes(d.c)),
    'and each is earned by a count, a total, the best streak or a finished tour');
  // The tours: one decoration each, once, and nothing else changes.
  let t = S.busToured(S.busClean(null), ['watch']);
  check(t.tw === 1 && t.ts === 0 && t.n === 0 && S.busEarned(t, cps).join(',') === 'bell',
    'finishing the map\'s tour hangs the bell, and counts no trip', S.busEarned(t, cps).join(','));
  t = S.busToured(S.busToured(t, ['share', 'watch']), ['watch']);
  check(t.tw === 1 && t.ts === 1 && S.busEarned(t, cps).join(',') === 'bell,placard',
    'the sharing tour puts up the route board, and a tour taken again adds nothing');
  const walk = fn('walkFinished');
  check(/if \(WALK \|\| !names \|\| !names\.length\) return;/.test(walk) && /walkFinished\(finished\);\s*\}/.test(fn('endWalk')) &&
        /if \(last && WALK\.finished\.indexOf\(WALK\.name\) < 0\) WALK\.finished\.push\(WALK\.name\);/.test(fn('walkShow')),
    'a tour counts once it reaches its last step, and is stored only after the run is over, never during it');
  const banned = /share|help|support|chat|widget|like|fav|thumb|heart|vote|social|clap/i;
  check(!S.DECOR.some(d => banned.test(d.k)) && !Object.keys(S.SIGHTS).some(k => banned.test(k)),
    'no decoration or sight is named like a social widget');
  const svg = P.busSvg(S.DECOR.map(d => d.k));
  check(/^<svg class="mybus" viewBox="0 0 400 170" aria-hidden="true"/.test(svg) && !/ id="|<text|https?:|href=/.test(svg) &&
        S.DECOR.every(d => svg.includes(P.BUS_DECOR[d.k])) && P.busSvg([]).length < svg.length,
    'the bus draws what it has earned and nothing else, with no ids, no words and nothing loaded');
  // The counting happens at the end of a trip, outside the drawing.
  const end = fn('endTicket');
  check(/busAdd\(before, \{ dir:shareDir, stamps:f\.all\.map/.test(end) && /if \(!WALK && ticketWorthShowing/.test(end),
    'counted once per trip that earned a ticket, and never on a practice one');
  const saves = [...html.matchAll(/localStorage\.(setItem|removeItem)\(\s*'wt-bus'/g)];
  const busWriters = ['endTicket', 'walkFinished', 'setShowBus', 'albumBuy', 'albumWear', 'albumPaint', 'openAlbum', 'restoreBackup'];
  check(saves.length === 2 && saves.every(m => (fn('saveBus') + fn('dropBus')).includes(m[0])) &&
        [...html.matchAll(/saveBus\(/g)].length === busWriters.length + 1 && busWriters.every(c => /saveBus\(/.test(fn(c))) &&
        /saveBus\(after\)/.test(fn('endTicket')) && /saveBus\(after\)/.test(fn('walkFinished')) &&
        [...html.matchAll(/dropBus\(/g)].length === 2 && /dropBus\(\)/.test(fn('clearAlbum')),
    'written in one place, by a trip, a tour, the garage or a restore, and removed only by Start from scratch');
  check(busWriters.filter(c => c !== 'endTicket' && c !== 'walkFinished').every(c => /if \(WALK\) return;|if \(!WALK\)/.test(fn(c))),
    'and none of the garage\'s or the backup\'s writes happens during a tour');
  check(/n \? n \+ ' of ' \+ g : 'not yet'/.test(fn('albumBusHtml')), 'a decoration not yet earned is "not yet", never 0 of anything');
  // Each card shows its decoration on its own part of the bus, earned or
  // not: the ones still to come as an outline, a look at what is coming.
  check(/'<li class="' \+ \(got \? 'got' : 'yet'\) \+ \(on \? ' on' : ''\) \+ '">' \+ decorTile\(d\.k\)/.test(fn('albumBusHtml')) &&
        /'<li class="' \+ \(owned \? 'got' : 'yet'\) \+ \(on \? ' on' : ''\) \+ '">' \+ decorTile\(x\.k\)/.test(fn('albumBusHtml')),
    'every trophy\'s card and every shop item\'s carries its picture, owned or still to come');
  const tiles = S.DECOR.map(d => P.decorTile(d.k));
  check(tiles.every((t, i) => t.startsWith('<svg class="decor-art" viewBox="' + P.DECOR_BOX[S.DECOR[i].k] + '"') &&
        t.includes('<g class="dg">' + P.BUS_DECOR[S.DECOR[i].k] + '</g>') && !/ id="|<text|https?:|href=/.test(t)),
    'drawn on the coach with nothing else on it, no ids, no words, nothing loaded');
  check(Object.values(P.DECOR_BOX).every(b => { const v = b.split(' ').map(Number); return v[2] === 2 * v[3]; }) &&
        Object.keys(P.DECOR_BOX).sort().join(',') === Object.keys(P.BUS_DECOR).sort().join(','),
    'every decoration has its corner of the bus, all cut to the same shape so the cards line up');
  // A box past the sky behind the coach leaves a strip of card showing through.
  const sky = (/<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(P.decorTile('mirror')) || []).slice(1).map(Number);
  const outside = Object.keys(P.DECOR_BOX).filter(k => {
    const v = P.DECOR_BOX[k].split(' ').map(Number);
    return !(sky.length === 4 && v[0] >= sky[0] && v[1] >= sky[1] && v[0] + v[2] <= sky[0] + sky[2] && v[1] + v[3] <= sky[1] + sky[3]);
  });
  check(!outside.length, 'and every card is sky to its edges, none cut past it', outside.join(' '));
  check(/\.alb-decor li:not\(\.got\) \.decor-art \.dg \*\{fill:none; stroke:var\(--ti\);/.test(html),
    'and one not owned yet is only its outline');
  check(!/label|getHours|getMinutes|getDate|toISOString|Date\.now|new Date|push\(t\.|\.week\s*\]/.test(fn('busAdd') + fn('busClean') + fn('busCount')),
    'and nothing in the counting knows the bus number, a day or a clock time, or keeps a list of them');

  // The totals and the streak (the maintainer's decision, October 2026):
  // one number each, the streak in weeks, and a broken one takes nothing.
  const wk = d => S.weekIndex(new Date(d[0], d[1] - 1, d[2]));
  check(wk([2026, 10, 12]) === wk([2026, 10, 18]) && wk([2026, 10, 19]) === wk([2026, 10, 18]) + 1,
    'a week runs Monday to Sunday', wk([2026, 10, 12]) + ' ' + wk([2026, 10, 18]) + ' ' + wk([2026, 10, 19]));
  const go = (b, week, mins, thanks) => S.busAdd(b, { dir: 'north', stamps: [], fromIdx: 0, toIdx: 3, mins, thanks, week }, cps);
  let z = S.busClean(null);
  z = go(z, 100, 95, 3); z = go(z, 100, 40, 0);
  check(z.mins === 135 && z.ty === 3 && z.streak === 1 && z.wk === 100, 'two trips in a week: their minutes and salamat added, a streak of one', JSON.stringify(z));
  z = go(z, 101, 60, 2); z = go(z, 102, 60, 0); z = go(z, 103, 60, 5);
  check(z.streak === 4 && z.best === 4 && z.ty === 10 && S.busEarned(z, cps).includes('foglamps') && S.busEarned(z, cps).includes('flowers'),
    'four weeks in a row: the fog lamps; ten salamat: the flowers');
  z = go(z, 106, 60, 0);
  check(z.streak === 1 && z.best === 4 && S.busEarned(z, cps).includes('foglamps'), 'a week missed starts the streak again, and takes nothing away');
  z = go(z, 104, 600, 0);
  check(z.streak === 1 && z.wk === 106 && Math.floor(z.mins / 60) >= 10 && S.busEarned(z, cps).includes('luggage'),
    'a ticket handed over late from an older week leaves the streak alone; ten hours on the map: the luggage');
  check(S.busStreak(z, 106) === 1 && S.busStreak(z, 107) === 1 && S.busStreak(z, 108) === 0, 'a streak is alive this week and the next, then gone');
  const nowhere = S.busAdd(z, { dir: 'south', stamps: [], fromIdx: 2, toIdx: 2, mins: 500, thanks: 40, week: 107 }, cps);
  check(JSON.stringify(nowhere) === JSON.stringify(z), 'and a trip that went nowhere adds no time, no salamat and no week');
}

console.log('\n=== 20. spare parts: earned, capped, spent, never farmed ===');
// Rules 17 to 19, with the guardrails the maintainer asked for: parts come
// from achievements (once each) and from a few trips a day, the trophies are
// never for sale, and what a rider can see of somebody's bus is a code of
// letters from fixed lists.
{
  const cps = 'MENDEZ TGY AMADEO GEN.T IMUS KAWIT PITX AYALA'.split(' ').map(short => ({ short, name: short }));
  const trip = (b, from, to) => S.busAdd(b, { dir: 'north', stamps: [], fromIdx: from, toIdx: to, mins: 30, thanks: 0, week: 100 }, cps);
  let b = S.busClean(null);
  // Every achievement pays once.
  b = trip(b, 0, 3);
  let r = S.busSettle(b, cps);
  check(r.got === 10 && r.keys.join(',') === 'sampaguita' && r.b.c === 10 && r.b.paid.join(',') === 'sampaguita',
    'the first trip\'s garland gives 10 parts', JSON.stringify(r.keys) + ' ' + r.got);
  r = S.busSettle(r.b, cps);
  check(r.got === 0 && r.b.c === 10, 'and settling again pays nothing: an achievement pays once');
  // A trip's parts: a few a day, then nothing.
  b = r.b;
  const pays = [];
  for (let i = 0; i < 6; i++){ const t = S.busTripPay(b, 20000); b = t.b; pays.push(t.got); }
  check(pays.join(',') === [5, 5, 5, 0, 0, 0].join(',') && b.c === 25 && S.PARTS_TRIP === 5 && S.PARTS_TRIPS_A_DAY === 3,
    'trips give 5 parts, for three a day at most: a fourth trip that day gives nothing', pays.join(','));
  const t2 = S.busTripPay(b, 20001);
  check(t2.got === 5 && t2.b.dayn === 1, 'and the next day pays again');
  b = t2.b;
  check(S.dayIndex(new Date(2026, 9, 15)) + 1 === S.dayIndex(new Date(2026, 9, 16)), 'days are counted on the phone\'s calendar');
  // The shop.
  check(S.busBuy(b, 'goldrims') === null, 'gold wheels cost more parts than there are: not got');
  check(S.busBuy(b, 'horse') === null && S.busBuy(b, 'sampaguita') === null && S.SHOP.every(x => !S.DECOR.some(d => d.k === x.k)),
    'a trophy can never be bought, and the shop sells none of them');
  let after = S.busBuy(b, 'dice');
  check(!!after && after.c === b.c - 10 && after.own.join(',') === 'dice' && S.busWorn(after, cps).includes('dice'),
    'dice got for 10 parts, and put straight on the bus');
  check(S.busBuy(after, 'dice') === null, 'and cannot be bought twice');
  after = S.busBuy(after, 'dagat');
  check(!!after && after.paint === 'dagat' && after.paints.join(',') === 'dagat' && after.c === b.c - 20, 'a paint job bought is the one on the bus');
  check(S.busUsePaint(after, 'klasiko').paint === 'klasiko' && S.busUsePaint(after, 'ginto').paint === 'dagat',
    'the plain paint is always there to go back to; one not bought cannot be used');
  check(S.busBuy(S.busClean({ c: 9 }), 'dice') === null && S.busBuy(S.busClean({ c: 1e6 }), 'nothing') === null,
    'nine parts get nothing worth ten, and nothing unknown can be got');
  // Wearing.
  let w = S.busWear(after, 'sampaguita', false, cps);
  check(!S.busWorn(w, cps).includes('sampaguita') && S.busOwns(w, 'sampaguita', cps), 'a trophy taken off goes to the garage and is still owned');
  w = S.busWear(w, 'sampaguita', true, cps);
  check(S.busWorn(w, cps).includes('sampaguita'), 'and goes back on');
  check(JSON.stringify(S.busWear(w, 'goldrims', true, cps)) === JSON.stringify(w), 'something not owned cannot be put on');
  check(S.busWorn(S.busClean({ own: ['underglow', 'dice'], n: 1 }), cps).join(',') === 'underglow,sampaguita,dice',
    'worn in drawing order: the glow under it first, the trophies, then the shop\'s');
  // What riders see.
  const look = S.busLook(w, cps);
  check(look === '1Fc', 'the look is a digit for the paint and a letter for each thing worn', look);
  const back = S.lookRead(look);
  check(!!back && back.paint === 'dagat' && back.worn.join(',') === 'sampaguita,dice', 'and reads back as the same bus', JSON.stringify(back));
  check(S.lookRead('1<b>hi</b>') === null && S.lookRead('hello') === null && S.lookRead('') === null && S.lookRead(null) === null &&
        S.lookRead('1' + 'a'.repeat(41)) === null, 'a code with anything but a digit and letters, or too long, is no bus at all');
  check(S.lookRead('1Fz').worn.join(',') === 'dice' && S.lookRead('9a').paint === 'klasiko', 'a letter or paint it does not know is skipped');
  const ids = S.DECOR.concat(S.SHOP).map(x => x.id);
  check(new Set(ids).size === ids.length && ids.every(i => /^[A-Za-z]$/.test(i)) && S.PAINTS.every(p => /^[0-9]$/.test(p.id)) &&
        new Set(S.PAINTS.map(p => p.id)).size === S.PAINTS.length, 'every item has its own letter and every paint its own digit');
  check(S.PAINTS.map(p => p.k).sort().join(',') === Object.keys(P.BUS_PAINTS).sort().join(',') && S.PAINTS[0].k === 'klasiko' && S.PAINTS[0].price === 0,
    'every paint has its colours, and the plain one is free');
  check(!S.busHasLook(S.busClean(null), cps) && S.busHasLook(S.busClean({ paints: ['lila'], paint: 'lila' }), cps) && S.busHasLook(w, cps),
    'there is something to show once something is worn or painted, and not before');
  // Storage and backups, cleaned on the way in.
  const dirty = S.busClean({ c: -5, own: ['dice', 'horse', 'dice', 7], paints: ['klasiko', 'lila', 'pink'], paint: 'ginto', off: ['x', 'dice'],
                             paid: ['sampaguita', 'dice'], show: 7, asked: 'yes' });
  check(dirty.c === 0 && dirty.own.join(',') === 'dice' && dirty.paints.join(',') === 'lila' && dirty.paint === 'klasiko' &&
        dirty.off.join(',') === 'dice' && dirty.paid.join(',') === 'sampaguita' && dirty.show === 1 && dirty.asked === 0,
    'storage holds only shop items, paints, names and flags it knows: a trophy cannot be smuggled in as bought', JSON.stringify(dirty));
  const list = [{ d: '2026-10-09', dir: 'n', from: 'MENDEZ', to: 'AYALA', st: ['full'], ty: true }];
  const text = S.backupMake(list, w, new Date(2026, 9, 15));
  const restored = S.backupRead(text);
  check(!!restored && JSON.stringify(restored.tickets) === JSON.stringify(S.albumClean(list)) && JSON.stringify(restored.bus) === JSON.stringify(S.busClean(w)),
    'a backup reads back as the same tickets and the same bus');
  check(/"made":"2026-10-15"/.test(text) && !/\d\d:\d\d|"mins":\s*\[/.test(text.replace(/"made":"[^"]*"/, '')), 'dated by the day it was made, with nothing finer');
  check(S.backupRead('nonsense') === null && S.backupRead('{"app":"other","v":1,"tickets":[],"bus":{}}') === null &&
        S.backupRead(JSON.stringify({ app: 'bus-tracker', v: 2, tickets: [], bus: {} })) === null && S.backupRead('x'.repeat(400001)) === null,
    'anything that is not one of these backups is refused');
  const forged = S.backupRead(JSON.stringify({ app: 'bus-tracker', v: 1, tickets: [{ d: 'never' }], bus: { own: ['horse'], c: 'lots', paint: 'gold' } }));
  check(!!forged && forged.tickets.length === 0 && forged.bus.own.length === 0 && forged.bus.c === 0 && forged.bus.paint === 'klasiko',
    'and one edited by hand is cleaned like storage: no trophy bought, no parts from nowhere');
  // My tickets lists the trophies nearest first within each kind, whatever
  // order they are drawn in.
  const shown = S.decorShown();
  const climbs = shown.every((d, i) => i === 0 || shown[i - 1].c !== d.c || shown[i - 1].goal <= d.goal);
  const grouped = shown.every((d, i) => i === 0 || shown[i - 1].c === d.c || !shown.slice(0, i - 1).some(x => x.c === d.c));
  check(shown.length === S.DECOR.length && new Set(shown.map(d => d.k)).size === S.DECOR.length && climbs && grouped &&
        /decorShown\(\)\.map/.test(fn('albumBusHtml')),
    'the trophies are listed by kind, each kind from the nearest to the furthest: 10 hours, 50, then 100',
    shown.filter(d => d.c === 'hours').map(d => d.goal).join(' '));
  // Restoring replaces what is on the phone, so it asks twice whenever there
  // is anything at all to lose, not only trips or parts.
  check(S.busIsNew(null) && S.busIsNew({}) && S.busIsNew({ c: 0, own: ['horse'] }) &&
        !S.busIsNew({ tw: 1 }) && !S.busIsNew({ own: ['dice'] }) && !S.busIsNew({ paints: ['dagat'], paint: 'dagat' }) &&
        !S.busIsNew({ asked: 1 }) && !S.busIsNew({ places: ['IMUS'] }),
    'a bus is new only with nothing earned, bought, chosen or counted: a tour\'s bell spent on dice is still something to lose');
  check(/busIsNew\(loadBus\(\)\)/.test(fn('restoreBackup')), 'and restoring asks twice over anything that is not new');
  // Parts are never named as money: drawn as a nut beside a number, with the
  // word for a screen reader, and no coin or barya anywhere a rider can read.
  check(/PART_GLYPH/.test(fn('partsTag')) && /class="vh"> parts/.test(fn('partsTag')) && /<symbol id="i-part"/.test(html),
    'parts are a drawn nut and a number, and a screen reader hears "parts"');
  const onScreen = html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
  check(!/barya|\bcoins?\b|\bbuy\b/i.test(onScreen.replace(/data-buy|albumBuy|busBuy|ALB_BUY_ARMED|alb-act buy|\.buy\b/g, '')),
    'and nothing on screen says barya, coins or buy', (onScreen.match(/.{30}(?:barya|\bcoins?\b|\bbuy\b).{30}/i) || [''])[0]);
  // The page asks before it shows, and only sends while sharing.
  check(/args\.p_look = /.test(fn('writePosition')) && /bus\.show/.test(fn('writePosition')),
    'the look goes with a position only when the sharer has said to show it');
}

console.log('\n=== 21. a ticket\'s postcard: the souvenir, sent only by hand ===');
// Rule 20. Send a picture turns a ticket into a picture for a chat, Facebook
// or Instagram: the one way anything of a ticket leaves the phone, and only
// at its sharer's tap. It is drawn from the six things a kept ticket keeps,
// whichever ticket it is sent from, so the timesheet rule 8 keeps off a crew
// member's phone cannot be posted on their page either.
{
  const cps = [['MENDEZ', 'crossing'], ['TGY', 'volcano'], ['AMADEO', 'coffee'], ['GEN.T', 'church'], ['IMUS', 'flag'],
               ['KAWIT', 'shrine'], ['PITX', 'terminal'], ['AYALA', 'towers']].map(([short, mark]) => ({ short, name: short + ' town', mark, lat: 14.2, lng: 120.9 }));
  const six = { d: '2026-10-09', dir: 'n', from: 'MENDEZ', to: 'AYALA', st: ['full', 'dawn'], ty: true };
  // Everything a live ticket knows, handed over with the six.
  const f = S.postcardFacts(Object.assign({ label: '98019', mins: 171, maxThanks: 7, times: '4:40–7:31 AM', startKm: 0.4 }, six), cps);
  const keys = Object.keys(f || {}).sort().join(',');
  check(keys === 'date,dir,from,fromMark,greet,kick,look,one,sky,stamps,stops,to,toMark,ty', 'the drawing is handed these, and nothing else', keys);
  const json = JSON.stringify(f);
  check(!/98019|171|4:40|7:31|"label"|"mins"|"maxThanks"|"times"|"startKm"|14\.2|120\.9|town/.test(json),
    'and none of what a live ticket knows besides the six: no bus number, no minutes, no clock, no count, no position', json.slice(0, 100));
  check(f.date === 'FRI 9 OCT' && f.dir === 'n' && f.from === 'MENDEZ' && f.to === 'AYALA' && f.fromMark === 'crossing' && f.toMark === 'towers' && f.one === false,
    'the day, the way, and the two ends with their marks');
  check(f.stamps.map(s => s.k).join(',') === 'full,dawn' && f.stamps[0].s === 'MENDEZ → AYALA' && f.ty === true && f.sky === 'dawn' && f.greet === 'Ingat sa biyahe!',
    'its stamps, its flower as a yes, and the sky and the goodbye they give it');
  check(f.stops.length === 8 && f.stops.filter(s => s.on).map(s => s.name).join(',') === 'MENDEZ,AYALA' &&
        f.stops.every(s => Object.keys(s).sort().join(',') === 'mark,name,on'),
    'every stop on the route, by its short name and mark, the two ends punched');
  check(JSON.stringify(f.look) === JSON.stringify(S.ticketLook(six)) && f.kick === S.tktKicker(f.look),
    'and the ticket\'s own luck, worked out from the same six, never drawn afresh');
  check(S.postcardFacts({ d: 'yesterday', dir: 'n', from: 'A', to: 'B', st: [] }, cps) === null && S.postcardFacts(null, cps) === null,
    'something that is not a kept ticket makes no postcard');
  // The page: the picture is made from the six things of the ticket on
  // screen, and nothing stores it or sends it but the phone's own sheet.
  const fnA = name => {
    const a = html.indexOf('function ' + name + '(');
    if (a < 0) return '';
    const m = /\n(?:async )?function |\n\/\/ ----/.exec(html.slice(a + 1));
    return html.slice(a, m ? a + 1 + m.index : html.length);
  };
  const cardSets = [...html.matchAll(/TKT_CARD = ([^;]+);/g)].map(m => m[1]);
  check(cardSets.every(v => ['TKT_KEEP', 'e', 'null'].includes(v)) && cardSets.includes('TKT_KEEP') && cardSets.includes('e') &&
        /TKT_KEEP = albumEntry\([\s\S]*?\);\s*\/\/[^\n]*\n\s*TKT_CARD = TKT_KEEP;/.test(fn('showTicket')) &&
        /const e = loadAlbum\(\)\[i\];/.test(fn('showKeptTicket')) && /TKT_CARD = e;/.test(fn('showKeptTicket')),
    'the ticket a postcard is made from is only ever six things: what Keep would keep, or what was kept', cardSets.join(' '));
  const make = fnA('makePostcard'), send = fnA('sendPostcard'), show = fnA('postcardShow'), fonts = fnA('postcardFonts');
  check(/postcardFacts\(e, CHECKPOINTS\)/.test(make) && !/TRIP|busLabel|clockText|maxThanks|shareDir|Date\.now/.test(make + send),
    'makePostcard draws postcardFacts() of it, and reads nothing about the trip');
  check(/const e = TKT_CARD/.test(send) && /^\s*if \(WALK\) return;/m.test(send.split('\n').slice(1, 3).join('\n')),
    'Send a picture takes the ticket on screen, and refuses during a tour');
  check(!/rpc\(|sendBeacon|XMLHttpRequest|localStorage|sessionStorage|fetch\(/.test(make + send + show + fnA('postcardDrop')),
    'nothing in the making or the sending stores it, or sends it anywhere but to the phone\'s sheet');
  check((fonts.match(/fetch\(/g) || []).length === 1 && /fetch\(want\[w\]\)/.test(fonts) && /@font-face/.test(fonts) && !/localStorage|sessionStorage/.test(fonts),
    'the one request it makes is for the app\'s own font files, as the page\'s @font-face rules name them');
  // The panel is the promise.
  const panel = html.slice(html.indexOf('id="privModal"'), html.indexOf('id="dupModal"'));
  check(/Send a picture/.test(panel) && /never the times, how long, the bus number or how many thanked you/.test(panel) &&
        /goes only where you send it/.test(panel) && /the app keeps none of it/.test(panel),
    'the privacy panel says what a postcard shows, what it never does, and who sends it');
  check(/Send the tracker/.test(panel) && /not your key or PIN, not your stop, not a bus/.test(panel),
    'and that the tracker\'s link is its address and nothing more');
}


console.log('\n=== 22. tips: only a QR Ph code, only to a rider who rode it, nothing counted ===');
// sql/16-tips.sql and the TIPS block. A sharer who switches on "Accept tips?"
// sends the QR their payment app saves; a rider who rode the bus is offered
// it when they get off. What is held here: the code can only ever be a QR Ph
// account, by the same rule the server applies; the offer is made only after
// a ride and only from "I got off"; the code is drawn again on the rider's
// phone, correctly at every size it can be; and nothing about a tip is ever
// sent, kept or added up.
{
  const tipsSrc = html.slice(html.indexOf('// ---- TIPS (unit tested)'), html.indexOf('// ---- END TIPS'));
  const T = {};
  new Function('T', tipsSrc + 'T.qrPhKey=qrPhKey;T.qrPhOk=qrPhOk;T.qrCrc=qrCrc;T.qrHasNumber=qrHasNumber;T.tipOffered=tipOffered;' +
    'T.TIP_KM=TIP_KM;T.TIP_WORDS=TIP_WORDS;T.QRPH_IDS=QRPH_IDS;T.qrMatrix=qrMatrix;T.qrSvg=qrSvg;T.QR_VERSIONS=QR_VERSIONS;')(T);
  // The same made-up codes as tests/db/14-tips-tests.sql, read from it, so
  // the page and the server are held to one list.
  const dbTest = fs.readFileSync(path.join(ROOT, 'tests', 'db', '14-tips-tests.sql'), 'utf8');
  const Q = {};
  for (const m of dbTest.matchAll(/when '([A-Z0-9]+)'\s+then '([^']+)'/g)) Q[m[1]] = m[2];
  check(['A', 'A2', 'B', 'M', 'AMT', 'SG', 'NOG'].every(k => typeof Q[k] === 'string'), 'the database suite\'s sample codes, read from it');
  check(T.qrCrc('123456789') === '29B1' && T.qrCrc(Q.A.slice(0, -4)) === 'DBEA',
    'the checksum is CRC-16/CCITT-FALSE, by its check value and on a whole code');
  check(T.qrPhOk(Q.A) && T.qrPhOk(Q.A2) && T.qrPhOk(Q.B) && T.qrPhOk(Q.M), 'person-to-person and merchant QR Ph codes are taken');
  check(T.qrPhKey(Q.A) === T.qrPhKey(Q.A2) && T.qrPhKey(Q.A) !== T.qrPhKey(Q.B),
    'the account is the same whatever the city or name around it, and two accounts differ');
  const wrongSum = Q.A.slice(0, -4) + (Q.A.slice(-4) === 'DBEB' ? 'DBEC' : 'DBEB');
  const refusedCodes = { 'a fixed amount': Q.AMT, 'another country': Q.SG, 'no QR Ph identifier': Q.NOG, 'a wrong checksum': wrongSum,
    'anything after the checksum': Q.A + '0102XX', 'fields mangled': Q.A.toLowerCase(), 'half a code': Q.A.slice(0, 40),
    'a link': 'https://example.com/pay?to=me', 'words': 'Salamat po sa inyo lahat', 'nothing': '', 'markup': '000201<b>x</b>',
    'anything longer than any code': '000201' + '9'.repeat(600) };
  const taken = Object.keys(refusedCodes).filter(k => T.qrPhOk(refusedCodes[k]));
  check(taken.length === 0 && !T.qrPhOk(null) && !T.qrPhOk(undefined) && !T.qrPhOk(42),
    'and nothing else: ' + Object.keys(refusedCodes).join(', '), taken.join(', ') || 'all refused');
  // One rule in two places: the page refuses what the server would store as
  // nothing, so they must name the same schemes, limits and refusals.
  const mig = fs.readFileSync(path.join(ROOT, 'sql', '16-tips.sql'), 'utf8');
  const sqlIds = ((/guid in \(([^)]*)\)/.exec(mig) || [])[1] || '').match(/'[^']+'/g) || [];
  check(sqlIds.map(x => x.slice(1, -1)).join(',') === T.QRPH_IDS.join(','), 'the page and sql/16-tips.sql accept the same schemes', sqlIds.join(' '));
  check(/n < 30 or n > 512/.test(mig) && /s\.length < 30 \|\| s\.length > 512/.test(tipsSrc) &&
        /if t = '54' then return null/.test(mig) && /x\[0\] === '54'\) return null/.test(tipsSrc) &&
        /country is distinct from 'PH'/.test(mig) && /country === 'PH'/.test(tipsSrc) &&
        /'\^\[ -~\]\+\$'/.test(mig) && /\/\^\[ -~\]\+\$\//.test(tipsSrc),
    'and the same length, characters, country and no fixed amount');
  check(T.qrHasNumber(Q.A) && !T.qrHasNumber(Q.B) && !T.qrHasNumber(Q.M),
    'a code with a mobile number in it is told apart from one without');
  check(T.TIP_KM === 1 && !T.tipOffered(0, 0.99) && T.tipOffered(0, 1) && T.tipOffered(7.5, 4) &&
        !T.tipOffered(null, 3) && !T.tipOffered(3, null) && !T.tipOffered(NaN, 9) && !T.tipOffered(undefined, undefined),
    'a rider is asked only after the bus has gone a kilometre along the route since they got on, either way');
  check(T.TIP_WORDS.sw === 'Accept tips?' && T.TIP_WORDS.ask === 'Say thanks to sharer with a tip/donation?' &&
        T.TIP_WORDS.fine === 'Not the fare. Not the bus company.',
    'the words are the maintainer\'s');
  check((html.match(/<label class="qrswitch"><span>Accept tips\?<\/span><input type="checkbox" onchange="qrSwitch\(this\)"><\/label>/g) || []).length === 2 &&
        html.includes('</svg>' + T.TIP_WORDS.ask + '</h3>') && html.includes('<p class="qrfine">' + T.TIP_WORDS.fine + '</p>'),
    'and they are the ones on the page: the switch twice, the question and the line under the QR');

  // Only from "I got off", only after a ride, never on the map.
  const fnA = name => {
    const a = html.indexOf('function ' + name + '(');
    if (a < 0) return '';
    const m = /\n(?:async )?function |\n\/\/ ----/.exec(html.slice(a + 1));
    return html.slice(a, m ? a + 1 + m.index : html.length);
  };
  const calls = [...html.matchAll(/[^\w]offerTip\(/g)].length;
  check(calls === 2 && /if \(id && !sharing && tipOffered\(from, now\)\) offerTip\(id\);/.test(fnA('leaveBus')),
    'the offer is made in one place, "I got off", for a rider who is not sharing and has ridden far enough');
  check(/ABOARD_KM = busKmNow\(ABOARD\);/.test(fnA('boardBus')) && !/localStorage|sessionStorage/.test(fnA('busKmNow') + fnA('leaveBus')),
    'measured from where the bus was when they got on, in memory only');
  const mapCode = fnA('renderBuses') + fnA('busPopupHtml') + fnA('renderStrip') + fnA('aboardControl');
  check(!/qrPh|qrMatrix|get_bus_qr|TIP_WORDS|offerTip|tyqr/.test(mapCode), 'nothing on the map, the chips, the strip or a popup is about tips');
  const offer = fnA('offerTip'), save = fnA('saveTyQr');
  check((offer.match(/rpc\(/g) || []).length === 1 && /rpc\('get_bus_qr', \{ p_slug:CFG\.ROUTE_SLUG, p_bus:id \}\)/.test(offer) &&
        /qrPhOk\(res\.data\)/.test(offer) && !/rpc\(|fetch\(|sendBeacon/.test(save),
    'the rider\'s phone asks for that one bus\'s code, checks it is QR Ph, and sends nothing else, whatever they do next');
  check(!/localStorage|sessionStorage/.test(offer + save + fnA('qrCanvas')),
    'and keeps nothing about it: no amount, no tap, no record of whom they thanked');
  // The sharer's picture never leaves the phone: read by the phone's own
  // reader, with nothing loaded to read it.
  const reading = fnA('readTipQr') + fnA('qrReadPicture') + fnA('qrImage') + fnA('tipSetup') + fnA('tipSetupGo') + fnA('tipUse');
  check(!/rpc\(|fetch\(|sendBeacon|XMLHttpRequest|<script|createElement\('script'\)/.test(reading) && /BarcodeDetector/.test(reading),
    'the sharer\'s QR picture is read by the phone\'s own reader, and neither it nor any reader is sent or fetched');
  check(/qrReadPicture[\s\S]*back\.some\(function\(f\)\{ return f && f\.rawValue === code; \}\)/.test(fnA('qrReadPicture')),
    'and a code is used only once the phone has read this page\'s redraw of it back as the same text');
  const write = fnA('writePosition');
  check(/const tipQr = QR_SENDS \? loadTipQr\(\) : null;\s*if \(tipQr\) args\.p_qr = tipQr;/.test(write) &&
        /function loadTipQr\(\)\{[\s\S]*return qrPhOk\(v\) \? v : null;/.test(html),
    'a position carries the code only while "Accept tips?" is on, and only a QR Ph one');
  check(!/wt-qr/.test(fnA('backupMake') + fnA('backupRead')), 'a backup never holds it');
  check(/get_bus_qr/.test(mig) && !/function public\.\w*(tip|donat)\w*\(/i.test(mig) &&
        ![...html.matchAll(/rpc\(\s*'([a-z_]+)'/g)].some(m => /tip|donat/.test(m[1])),
    'and no request path says tip or donate, which content blockers could match');

  // Drawn again on the rider's phone. Versions 1 to 10 are tools/make-qr.js's,
  // whose codes are printed on the flyer and the poster: held to the same modules.
  const cp = require('child_process');
  const toolMatrix = url => {
    const out = cp.execFileSync(process.execPath, [path.join(ROOT, 'tools', 'make-qr.js'), url], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const n = +/viewBox="0 0 (\d+)/.exec(out)[1] - 4, d = /d="([^"]+)"/.exec(out)[1];
    const g = Array.from({ length: n }, () => new Array(n).fill(0));
    for (const [, xs, ys, ws] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) for (let i = 0; i < +ws; i++) g[+ys - 2][+xs - 2 + i] = 1;
    return g;
  };
  const urls = ['https://community-bus-tracker.netlify.app', 'https://community-bus-tracker.netlify.app/testers.html',
                'https://example.com/' + 'a'.repeat(150), 'x'.repeat(213)];
  const differ = urls.filter(u => { const a = T.qrMatrix(u).matrix, b = toolMatrix(u); return a.length !== b.length || a.some((r, y) => r.some((v, x) => v !== b[y][x])); });
  check(differ.length === 0, 'up to version 10 the page draws exactly what tools/make-qr.js draws', differ.length ? 'differ: ' + differ.join(' ') : urls.length + ' codes, module for module');
  // Every version, read back by a decoder written here from the standard,
  // apart from the page's: the geometry, the format and version words from
  // its tables, Reed-Solomon checked by its syndromes, and the text itself.
  const EXP = [], LOG = [];
  for (let i = 0, x = 1; i < 255; i++){ EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
  const mul = (a, b) => (a && b) ? EXP[(LOG[a] + LOG[b]) % 255] : 0;
  const FORMAT_M = ['101010000010010', '101000100100101', '101111001111100', '101101101001011',
                    '100010111111001', '100000011001110', '100111110010111', '100101010100000'];
  const VERSION_WORD = { 7: '000111110010010100', 8: '001000010110111100', 9: '001001101010011001', 10: '001010010011010011',
    11: '001011101111110110', 12: '001100011101100010', 13: '001101100001000111', 14: '001110011000001101', 15: '001111100100101000' };
  const CAPACITY_M = [0, 14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412];
  const REMAINDER = v => v === 1 ? 0 : v <= 6 ? 7 : v <= 13 ? 0 : 3;
  const alignAt = v => {
    if (v === 1) return [];
    const n = Math.floor(v / 7) + 2, last = 4 * v + 10, step = Math.ceil((last - 6) / (n - 1) / 2) * 2;
    const out = [6];
    for (let i = n - 2; i >= 0; i--) out.splice(1, 0, last - i * step);
    return out.slice(0, 1).concat(out.slice(1).sort((a, b) => a - b).slice(-(n - 1)));
  };
  const MASKS = [(r, c) => (r + c) % 2 === 0, r => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
    (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0, (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0];
  const decode = (M, v) => {
    const n = M.length;
    if (n !== 4 * v + 17) return 'size';
    const fn = Array.from({ length: n }, () => new Array(n).fill(false));
    const mark = (r, c) => { if (r >= 0 && c >= 0 && r < n && c < n) fn[r][c] = true; };
    for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) for (let r = -1; r < 8; r++) for (let c = -1; c < 8; c++) mark(r0 + r, c0 + c);
    for (let i = 0; i < n; i++){ mark(6, i); mark(i, 6); }
    const al = alignAt(v);
    for (const r of al) for (const c of al){
      if ((r === 6 && c === 6) || (r === 6 && c === n - 7) || (r === n - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++){
        if ((Math.max(Math.abs(dr), Math.abs(dc)) === 1) === !!M[r + dr][c + dc]) return 'alignment';
        mark(r + dr, c + dc);
      }
    }
    for (let i = 0; i < 9; i++){ mark(8, i); mark(i, 8); }
    for (let i = 0; i < 8; i++){ mark(8, n - 1 - i); mark(n - 1 - i, 8); }
    if (!M[n - 8][8]) return 'dark module';
    let word = '';
    if (v >= 7){
      let bl = 0, tr = 0;
      for (let i = 0; i < 18; i++){
        const r = Math.floor(i / 3), c = i % 3;
        bl |= M[n - 11 + c][r] << i; tr |= M[r][n - 11 + c] << i;
        mark(n - 11 + c, r); mark(r, n - 11 + c);
      }
      word = bl.toString(2).padStart(18, '0');
      if (word !== VERSION_WORD[v] || tr !== bl) return 'version word ' + word;
    }
    let f1 = 0, f2 = 0;
    for (let i = 0; i < 15; i++){
      f1 |= (i < 6 ? M[i][8] : i === 6 ? M[7][8] : i === 7 ? M[8][8] : i === 8 ? M[8][7] : M[8][14 - i]) << i;
      f2 |= (i < 8 ? M[8][n - 1 - i] : M[n - 15 + i][8]) << i;
    }
    const mask = FORMAT_M.indexOf(f1.toString(2).padStart(15, '0'));
    if (mask < 0 || f1 !== f2) return 'format word';
    let free = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!fn[r][c]) free++;
    const [total, ec, g1, g2] = T.QR_VERSIONS[v];
    if (Math.floor(free / 8) !== total || free % 8 !== REMAINDER(v)) return 'codeword count ' + free;
    const bits = [];
    let up = true;
    for (let right = n - 1; right > 0; right -= 2){
      if (right === 6) right = 5;
      for (let i = 0; i < n; i++){
        const r = up ? n - 1 - i : i;
        for (const c of [right, right - 1]) if (!fn[r][c]) bits.push(M[r][c] ^ (MASKS[mask](r, c) ? 1 : 0));
      }
      up = !up;
    }
    const words = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) words.push(bits.slice(i, i + 8).reduce((a, b) => a * 2 + b, 0));
    const blocks = g1 + g2, dataLen = Math.floor((total - ec * blocks) / blocks);
    const lens = Array.from({ length: blocks }, (_, b) => dataLen + (b < g1 ? 0 : 1));
    const parts = lens.map(() => []);
    let k = 0;
    for (let i = 0; i < dataLen + 1; i++) for (let b = 0; b < blocks; b++) if (i < lens[b]) parts[b].push(words[k++]);
    for (let i = 0; i < ec; i++) for (let b = 0; b < blocks; b++) parts[b].push(words[k++]);
    for (const p of parts) for (let i = 0; i < ec; i++){
      let syn = 0;
      for (const w of p) syn = mul(syn, EXP[i]) ^ w;
      if (syn) return 'error correction';
    }
    const data = [].concat(...parts.map((p, b) => p.slice(0, lens[b])));
    const dbits = [].concat(...data.map(w => w.toString(2).padStart(8, '0').split('').map(Number)));
    const take = len => dbits.splice(0, len).reduce((a, b) => a * 2 + b, 0);
    if (take(4) !== 4) return 'mode';
    const count = take(v >= 10 ? 16 : 8);
    return String.fromCharCode(...Array.from({ length: count }, () => take(8)));
  };
  const bad = [];
  for (let v = 1; v <= 15; v++){
    const text = (Q.A + Q.B + Q.M + 'https://community-bus-tracker.netlify.app/').repeat(4).slice(0, CAPACITY_M[v]);
    const q = T.qrMatrix(text);
    const got = q ? decode(q.matrix, q.version) : 'nothing drawn';
    if (!q || q.version !== v || got !== text) bad.push(v + ': ' + (q ? 'v' + q.version + ' ' : '') + (got === text ? '' : String(got).slice(0, 30)));
    const over = T.qrMatrix(text + 'x');
    if (v < 15 && (!over || over.version !== v + 1)) bad.push(v + ': one byte more is not version ' + (v + 1));
  }
  check(bad.length === 0, 'every version from 1 to 15 reads back as its text, at exactly the capacity the standard gives level M',
    bad.join('; ') || '15 versions, ' + CAPACITY_M.slice(1).join('/') + ' bytes');
  check(T.qrMatrix('y'.repeat(413)) === null, 'and a text too long for version 15 draws nothing rather than a broken code');
  const svg = T.qrSvg(T.qrMatrix(Q.A).matrix, 'QR code to tip the sharer');
  check(/^<svg viewBox="0 0 (\d+) \1"/.test(svg) && +/viewBox="0 0 (\d+)/.exec(svg)[1] === T.qrMatrix(Q.A).size + 8 &&
        /<rect width="\d+" height="\d+" fill="#fff"\/>/.test(svg) && /fill="#000"/.test(svg),
    'drawn black on white, with the four modules of white round it that scanners need');
}

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
