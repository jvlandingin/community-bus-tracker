// Checks the salamat button as shipped: the words it prints, who is offered
// it, and the several things it must never do — draw a zero, draw a number
// on somebody else's bus, or carry a name a content blocker hunts for.
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
const S = {};
new Function('S', src + 'S.thanksWords=thanksWords;S.thanksControl=thanksControl;' +
  'S.ticketStamps=ticketStamps;S.ticketWorthShowing=ticketWorthShowing;S.ticketGreeting=ticketGreeting;')(S);

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
check(/(no|never)[^.]*(running total|total)/i.test(panel),
  'and that no total is kept for anyone');
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
// The button lives in the bus popup, which nobody who has not tapped a bus
// knows exists. The whole discoverability budget is one muted line under the
// chips, drawn only when there is somebody to thank — the same rule as the
// count itself: nothing is shown when there is nothing to act on.
check(/id="chipNote"/.test(html) && /class="hint hidden" id="chipNote"/.test(html),
  'the hint exists and ships hidden, so an empty map stays as bare as before');
{
  const noteText = (html.match(/id="chipNote"[^>]*>([^<]*)</) || [])[1] || '';
  check(/salamat/i.test(noteText) && /tap/i.test(noteText),
    'and it says what to do, not just that a feature exists', noteText.slice(0, 60));
  check(!/(min|score|rank|rate)/i.test(noteText), 'without promising anything the system does not do');
}
check(/note\.classList\.toggle\('hidden', !shown\.some\(function\(b\)\{ return !b\.self; \}\)\)/.test(html),
  'it appears only when a live bus is somebody else\'s — nobody is invited to thank themselves');
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
}

console.log('\n=== 13. the ticket: when there is one at all ===');
// Rule 6: a trip too short to have helped anyone gets no ticket.
check(!S.ticketWorthShowing(null), 'no trip: no ticket');
check(!S.ticketWorthShowing({ mins: 4, writes: 9 }), 'four minutes: no ticket');
check(S.ticketWorthShowing({ mins: 5, writes: 1 }), 'five minutes with the bus on the map: a ticket');
check(!S.ticketWorthShowing({ mins: 90, writes: 0 }), 'an hour and a half that never reached the map: no ticket');
check(S.ticketGreeting(18 * 60 + 30) === 'Ingat pauwi!' && S.ticketGreeting(30) === 'Ingat pauwi!',
  'an evening or late-night trip: Ingat pauwi');
check(S.ticketGreeting(7 * 60) === 'Ingat sa biyahe!' && S.ticketGreeting(4 * 60) === 'Ingat sa biyahe!',
  'a morning one: Ingat sa biyahe');

console.log('\n=== 14. the ticket: made on the phone, kept nowhere ===');
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
  check(keys === 'maxThanks,others,polled,start,startKm,writes', 'the trip record is six numbers and flags', keys);
  const writes = [...html.matchAll(/TRIP\.([a-zA-Z]+)\s*(?:=[^=]|\+\+)/g)].map(m => m[1]);
  check(writes.length > 0 && writes.every(k => ['maxThanks', 'polled', 'writes'].includes(k)),
    'and nothing else is ever written into it', [...new Set(writes)].join(','));
  check(!/TRIP\.[a-zA-Z]+\.push\(/.test(html), 'nothing is appended to it, so no trail can grow there');
  const show = html.slice(html.indexOf('function showTicket('), html.indexOf('// ---- Trip mode'));
  check(/const ty = thanksWords\(trip\.maxThanks\);/.test(show) && /\(ty \?/.test(show),
    'the salamat line goes through thanksWords, so a quiet trip shows no zero');
  check(!/rpc\(|fetch\(|localStorage|sessionStorage/.test(show), 'drawing the ticket sends nothing and stores nothing');
  check(/if \(!\(opts && opts\.quiet\)\) showTicket\(trip, endCoords\);/.test(html) &&
        /await stopSharing\(\{ quiet:true \}\);\s*setShareUI\('error'/.test(html),
    'and a session the server has blocked ends on its error, not on a ticket');
}

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
