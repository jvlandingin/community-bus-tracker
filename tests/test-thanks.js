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
new Function('S', src + 'S.thanksWords=thanksWords;S.thanksControl=thanksControl;')(S);

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

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
