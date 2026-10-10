# Journal

Progress that does not live in the code: how the tool is being introduced to the
community, what people said, what was decided and why. The commit log records
what changed in the software. This records what changed around it.

Newest entries at the top. Add one whenever something happens that a future
reader would otherwise have to be told in conversation.

## How people are referred to here

**No real names in this file.** The repository is public, the app links to it
from inside the privacy panel, and the project's whole claim is that it keeps no
names. Publishing community members' names and their chat messages here would
contradict that, and for the bus operators it is a concrete risk: they are
sharing positions without the company's involvement, and a searchable record
tying a named person to that is not ours to create.

So people appear by role and a stable label — Operator A, Commuter B — kept
consistent across entries so continuity is readable. Keep the label-to-name
mapping somewhere private, outside this repository.

**No keys in this file either.** The share key belongs in the link handed to the
community and in the database, nowhere else. Refer to "the current share key".

---

## 2026-10-10 — Keeping the ticket

The maintainer asked whether a sharer could collect the tickets of every ride,
with stats, kept on the phone and never sent: to make sharing, and watching,
more fun and more useful. The ticket had been built to be kept nowhere, so this
reversed a promise, and it was planned before anything was built. Three
decisions went to the maintainer with a recommendation each, and "sounds good,
let's implement" took all three:

- **The promise changes** from "never kept" to "kept only if you tap Keep, on
  this phone only". A kept copy is a souvenir, not a stopwatch: the day, the
  direction, the two places, the stamps, and whether anyone said salamat. No
  times, no duration, no bus number, no count, because anyone on board can
  share and a conductor's phone full of timed tickets is a timesheet.
- **Salamat in the album is a flower** on each ticket someone thanked, with no
  number anywhere, over a per-ticket count or a running total.
- **The album first**, the ideas for watchers after.

The maintainer then suggested art on each ticket depending on where the trip
started and ended, "so collecting makes more sense". That became the ticket's
picture: the two places' marks as roadside signs, the coach on the road between
them. One thing was added to it: the sky follows the stamps (dawn, night, or
day), so tickets differ more and a kept copy needs no clock to draw it. The
album counts the places on the route a sharer's kept trips have passed, the
four stamps, and the tickets themselves. Time on the map was left out on
purpose, because added up it is working hours.

Asked whether each place still had its art, "like Taal when arriving at
Tagaytay", it had, but only as the small drawing on the arrival sign. So the
picture now has the destination's view behind the coach: Taal Lake and the
volcano island for Tagaytay, towers for One Ayala, the terminal's wave of a
roof on the bay for PITX, coffee under a shade tree for Amadeo, a church, a
heritage house with its tower, shops at a crossing, and a monument with the
flag. They are by kind of place, like the marks, so the code names no town.
The flag is pinned the right way up by a test: blue above red.

**Left as it was:** the flyer's "Walang itinatagong history ng biyahe". It is
about what the system stores, its claim that no driver's route, speed or stops
are recorded still holds, and the poster has no room to spare. The briefing
and the guide do say it now.

**Not yet checked:** whether sharers notice Keep on a real phone; how the
picture's small signs read on a cheap screen in daylight; and whether the
Android app keeps its album across an app update, as WebView storage should
unless the app's data is cleared.

**Next, from the same plan, not built:** for watchers, "Sasakay ka na?" — when
the bus you are watching reaches your saved stop, offer to start sharing it,
on phones that opened the share link — and a saved stop for each direction,
for people who wait at one stop in the morning and another in the evening.

## 2026-10-10 — An art direction, agreed before it was built

The maintainer's next question was about the look rather than the features: it
read as generic templates, icons and shapes, and could it look professional.
The answer was planned before anything was built, as a page of drawn examples,
and four decisions were put to the maintainer with a recommendation each. All
four recommendations were taken:

- **The typeface:** Barlow Semi Condensed, over Atkinson Hyperlegible or
  staying with each phone's own font. It fits the strip's eight checkpoint
  names at a readable size, and it looks like transport signage without being
  any operator's lettering.
- **The coach's colours:** a cream body with the app's maroon and gold, over an
  all-maroon body or keeping the simple bus symbol.
- **The mark:** the coach seen from the front, over a signboard or route lines.
- **How far:** all four steps — the foundations and a style guide; the
  typeface, the icons and the map's buttons; the signboard and the mark; the
  coach and the pictures. A fifth, a basemap in the app's own colours, was left
  out as a decision of its own: it needs either a paid map style or map data
  hosted here, and both are bigger than everything else put together.

**Rules the work was held to**, stated in the plan and kept: nothing new from
anyone else (the font and the drawings are served from this site, so the
privacy panel stays true word for word); under 60 KB added to the tracker;
nothing that looks like the bus company's own livery, logo or lettering; text
stays text, so the signboard and every icon still read to a screen reader;
icon names follow the content-blocker rule; and the flyer, the briefing and the
guide change in the same commit as the app, with the poster still one sheet.

**Where it stands.** The first two steps are in: seven text sizes, three
corners and three heights where there had been twenty-one sizes, nineteen
corners and forty shadows, and three speeds with three curves where there had
been ten curves, all held by a test that fails on a new literal; a
style guide page that draws them from the tracker's own stylesheet; Barlow,
46 KB for five weights, cached for a year; and one drawn icon family with no
emoji left in the interface. Doing it turned up one bug that had shipped: the
first tap on a bus in the list could open its popup with the top cut off for a
few seconds.

The third step is in too: the header's route board is a real dot matrix,
built from lit dots five across and seven down like the boards on the buses,
and the coach is the mark, on the home screen, in every tab and on the link
preview. The board kept the rule the old one had: the route name is still
text in the page, and any character it cannot draw leaves the lettered board
instead.

And the fourth: the empty map is a picture now, the coach parked on the ridge
above Taal at night, at dawn or in the midday sun, with the next trips written
on its sky, and the same view covers the guide, the flyer and the briefing.
Each checkpoint can carry a small drawing of the kind of place it is, beside its
line in a bus's popup and on its stop on the ticket, chosen in config.txt so
the code names no town. Two things that had looked wrong for a while were put
right on the way: the ticket's stamps sat over "3 riders said salamat", and the
parol hung on the corner of the sharing tab.

**Not yet checked:** how Barlow renders on a real iPhone and a real low-end
Android, how the board's glow looks on a cheap screen in sunlight, and whether
riders read the sampaguita on the salamat button as a thank-you without the
words beside it. They always have the words beside it. The link preview with
the new picture has not been seen in an actual Messenger chat. The marks were
chosen from general knowledge of each town, like the town lines, and are worth
the same read-through before this is merged.

## 2026-10-10 — A redesign, and some fun

The maintainer asked whether the UI could be more beautiful, and then whether
the app could be more fun, after picking the salamat ticket for sharers out of
the first set of ideas as the one they liked best. Nine design ideas and seven
of nine fun ones were built in one go; the commit log has what each one is, and
`docs/ARCHITECTURE.md` why each one is shaped the way it is. This entry is the
parts that were decided rather than built.

**The name is Bus Tracker.** The previous entry noted that "WT Live" reads as
the bus company's initials in a link preview, before anyone has seen a
disclaimer. Settled: every title a reader sees says Bus Tracker, and the route
says the rest. The header line that names the company as UNOFFICIAL stays.

**Two fun ideas were left out on purpose.** Telling a sharer how many phones
have the map open ("10 people are watching") would change who can see the
watching count, which only the admin page can today; that is a decision about
the count, not a decoration, so it waits for one. And "Ingat po" as a second
kind of thank-you needs a database migration for what is really the same
gesture as salamat. Neither is ruled out.

**Two bugs turned up by using the thing, not by reading it.** Every afternoon
between the windows, the empty headline sent riders home until tomorrow's first
trip with a 3:40 PM bus due. And tapping salamat closed the popup before
"Salamat sent" appeared, so the rider never saw their thank-you land, though it
did. Both were live; both are fixed and pinned by tests that fail on the old
code.

**One rule that shaped the favourite.** The ticket is the most rewarding thing
the app shows anyone, which made it the most likely place for a driver metric
to creep in: "trip took 2 h 05 min" is a stopwatch on a driver with one more
step. So its stamps are about the trip's shape and the time of day only, it is
made on the phone and kept nowhere, and a test fails if the record it is built
from ever grows.

**Not yet checked:** the link preview picture in an actual Messenger chat (it
only gets its full address on a Netlify build), "Add to Home screen" and the
buzz on a real Android phone, and the seven one-line town stories, which were
written from general knowledge and are now printed to every rider: they are
the first thing to read over before this is merged.

## 2026-10-09 — If it were built again from scratch

A review rather than a change: what would come out the same if the whole thing
were rebuilt today, and what would not. Nothing in the code moved. It is written
down because the useful part was the list, and a list that lives only in a
conversation gets rebuilt from nothing next time.

**The core would come out the same.** One row per sharing session and no history
table; every read and write through `SECURITY DEFINER` functions over tables
with RLS and no policies; three separate credentials and open reads; polling
rather than Realtime; distance along the checkpoint chain and never minutes; a
stop picker instead of a location prompt; static pages, vendored libraries, no
framework; a Capacitor shell that loads the live site. These are the decisions
that make the project what it is, and none of them would be made differently.

**What a rider or driver would actually notice is small.** Four things:

- *The name.* The link preview and the browser tab say "WT Live", which reads as
  the bus company's initials. The header does say UNOFFICIAL, but the preview is
  seen in the group chat before anyone opens the page, and it carries no such
  word. A rebuild would use a name that does not borrow the company's.
  `for-operators.html` already calls it "Community bus tracker". Not decided:
  the name is the maintainer's call.
- *The pictures on the flyer and the guide would always match the app*, because
  they would be captured from a labelled demo mode of the real tracker by the
  headless-Chromium script that already exists, instead of drawn by hand. Today
  their map photos still show the old grey stop dots.
- *No sightings board.* It was switched off the same day it was redesigned, and
  the group chat already does its job. Riders see no difference, since it is
  off.
- *The Android app would have come first*, and been tried on a real trip before
  any of the design passes. Same app, about two months earlier. As of this entry
  `mobile/README.md` still lists that trip as not done.

**What only matters behind the scenes, or to another route:**

- **`sql/` cannot build an empty database.** `01-base.sql` opens with
  `alter table public.routes`; nothing in `sql/` creates `routes`,
  `bus_positions` or `sightings`, and nothing inserts a route row. Those exist
  only in `tests/db/00-legacy-baseline.sql`, the reconstruction of the original
  production database, which also seeds a test share key, fake buses and a spam
  sighting, so running it is not the answer either. Checked against a fresh
  PostgreSQL 16 by following the README exactly: `01` to `05` and `07` fail with
  `relation "public.routes" does not exist`, and the only table created is
  `watching_now`. All 187 database checks pass, but only as upgrades of the
  baseline, so CI has never tried a fresh install. This is the lesson from
  `tests/README.md` again: a runbook nobody has followed end to end is not a
  runbook. It matters if another community wants its own copy, and it matters
  to this route if its database ever has to be rebuilt.
- **The route is not all in `config.txt`.** `set_bus_position` hardcodes a
  Cavite bounding box (`sql/03-kick-block.sql`), so a deployment anywhere else
  would have every position refused, and the page would explain it as being
  outside "the Mendez to Makati route". The header, the direction destinations,
  the closing-hours sentence, the trip questions and the map's default centre are
  fixed text in `index.html`.
- **The code would be organised differently**, invisibly to anyone using it.
  ES modules instead of one long inline script, so the tests import the shipped
  code rather than cutting `index.html` apart at comment markers (one cut takes
  everything from `function haversineKm` up to `function timeAgo`, so it depends
  on the order the functions happen to be in). One shared token stylesheet
  instead of five copies and a drift test. The site published from a
  subfolder, which would make a root `package.json` harmless. Roughly half the
  rules in `CLAUDE.md` exist to compensate for these, and would not be needed.

**If one thing is done, it is the fresh install**: a schema file that builds the
database from empty plus a function that creates a route, and a CI job that
installs from nothing, so the README's setup steps are proven on every commit
the way the test runbook already is.

---

## 2026-09-15 — CARTO started charging rent, in watermarks

**What happened.** The live map began showing "API KEY REQUIRED" printed
diagonally across every tile. Not our doing: CARTO changed its terms in
late August 2026 and now watermarks any tile fetched without an API key.
It hit the deployed site and the redesign branch alike, because both ask
the same host for tiles. Nobody told us; it was noticed by looking.

**The fix.** A free key, no account needed, in `config.txt` as
`CARTO_API_KEY`, appended to the tile URL as `?key=`. Left blank the map
still works and stays watermarked, which is on purpose: a fork that has
not read the setup notes should see its own route on a recognisable map
rather than a broken one. The warning goes to the console, where the only
person who can act on it will be.

The key is public, like everything in that file. That is worth stating
plainly because the file's whole pitch has been "no secrets here": the
Supabase anon key unlocks nothing, but a copied CARTO key spends this
deployment's monthly tile allowance. Different kind of thing, same file.

**And then it moved to Netlify, which cost the repo a property.** Putting
the key in Netlify's build settings instead keeps it out of a public
repository, which is the theft route that actually happens — bots trawl
GitHub for keys, they do not read deployed config files. So
`tools/write-basemap-key.js` now runs first in the build and writes the
variable into `config.txt` on the way past.

Be clear about what that is and is not. It is not secrecy: `config.txt` is
fetched by the browser, so the key is one devtools panel away on the live
site, exactly as it was when it was committed. Hiding it from users means
proxying every tile through a function, which ties this to one host and
spends that host's bandwidth on map tiles — a bigger decision, not taken.

What it did cost is the sentence this repo has repeated since the move to
git deploys: *what gets published is the repository exactly as committed.*
That is now false by one line, and both `netlify.toml` and
`docs/ARCHITECTURE.md` say so rather than quietly keeping the old claim.
It is a small break and a real one: for the first time the deployed site
can differ from the commit, and the next person debugging a strange
production-only symptom needs to know that is possible.

**What was tried.** Drawing our own basemap, with no tile provider at all.
It got further than expected. A coastline traced out of the map screenshot
already embedded in `flyer.html`, georeferenced against the eight
checkpoints whose pixel positions are recorded in the comment above that
figure, came to 8.7 KB at about 56 m per pixel. At the whole-route zoom it
looked good and entirely on-brand.

Two things stopped it. Zoomed in, a drawn map has nothing to show, and
knowing which corner the bus is on is the one job the strip and the saved
stop do not already do. And the trace invents water: text labels and the
old grey marker dots in the screenshot read as coastline, which at zoom 13
put a lake across the route near Tagaytay. That is the same failure as the
route line crossing the sea, and it was rejected for the same reason.

The idea is not dead, it is blocked on data. Natural Earth is public domain
and reachable but has fourteen points for our whole coastline. The detailed
Philippine boundary set on GitHub is GADM-derived and its licence forbids
redistribution, so it cannot ship in an AGPL repo people fork.
OpenStreetMap has the right detail and the right licence and we already
credit it, and needs a tool run somewhere with network access to fetch the
corridor's coastline, major roads and place names. That is the next move if
the map is worth owning outright — and this week is the argument that it is.

## 2026-09-12 — The map becomes this route's map

A presentation pass on the map only. Nothing moved on the page, no request
changed, nothing new is stored, and CARTO is still the only third party —
the privacy panel's sentence about it is unchanged and still exactly true.

**What changed.** The basemap is now two CARTO layers, base without labels
under the app's own marks and labels alone above them, so place names sit
over the stop pips rather than under them. The base is faded so maroon and
gold are the only strong colours on the map. Stops became small pips in the
livery that hide below zoom 12; checkpoints became station marks with the
strip's short names beside them. The bus badge is a drawn SVG instead of an
emoji, and a live one breathes.

**What was tried and dropped.** A route line. The exact road is not known,
the public routers cannot be reached from where this was built, and a
straight line between checkpoints crossed water at the Manila Bay end. A
line that is wrong is worse than none, because a bus a kilometre beside it
reads as a bus off its route. Taken out the same day, tool and all.

**The honest costs.** The three recreations carry the new badge and the
checkpoint marks, but their basemap photos still show the old grey stop
dots, which is a recapture that needs a browser with CARTO access. And the
faded base is a CSS filter over the whole tile pane, which is one more
thing for an old phone to composite; if the map ever stutters on one, that
filter is the first suspect.

## 2026-09-01 — Third pass on the UI: depth and motion

A modernisation pass, all presentation: nothing moved, nothing was reworded,
and no request, key or stored thing changed, so the privacy panel's list of
three stands untouched.

**The buses actually move now.** The strip pill has carried `transition:left`
since July, and it turned out to be dead code: the pills were rebuilt with
`innerHTML` on every poll, and a brand-new element starts at its new position
with nothing to glide from, so every bus teleported every six seconds.
renderStrip now keeps each bus's pill element alive between draws, keyed by
bus id, and only touches its position and classes — the transition finally
has something to move. The map badges got the same treatment through the
other door: Leaflet reuses a divIcon's element across `setIcon`, so a
transition on the marker transform makes a badge glide to each new fix. One
trap cost a review round rather than a shipped bug: Leaflet removes its
zoom-animation class *before* it rewrites every marker's transform at the end
of a zoom, so a bare transition smears the badges across the map on every
pinch. The glide is gated by a steady-state class the map code drops at
zoomstart and restores ~80ms after zoomend.

**Depth.** The single 2px card shadow read as flat next to anything modern;
`--shadow` is now a hairline of contact plus a wide soft falloff, in every
page's token block, with dark still `none` — nothing there to cast onto. The
header band carries a gold trim line, like the buses do, on all five pages.
The active tab and the primary button wear the header's own gradient rather
than a maroon that nearly matches. Bus chips carry their direction on the
border as well as the arrow — border only, never a tinted fill, because
`--muted` was tuned to clear AA on paper and white and the ages inside the
chips are the smallest text on the page. And Leaflet's own chrome (zoom
buttons, attribution strip) now follows the tokens: it was the last white
panel left glaring on the dark map.

**Motion.** Entrances use a hard-decelerate curve and modals a whisper of
overshoot; colour changes on the small controls crossfade instead of
snapping; the headline rises when its words actually change (never the
subtitle, whose "updated 12s ago" changes every poll); the modal veil blurs
the page behind it where the browser can. Hover states exist now, gated to
`(hover:hover)` so nothing sticks half-pressed on a phone. Ages and
distances use tabular figures so the text stops shivering as 9 becomes 10.
The reduced-motion blanket flattens all of it, unchanged.

**Fewer words.** A follow-up trim, same day: the hints had grown until the
tracking tab read like a form with terms and conditions. Every hint now says
its one thing and stops — "Tap any 🚌 to see it up close and say salamat"
instead of naming the three places a bus can be tapped; the sharing tab's
strip card no longer repeats its own heading in prose. Nothing pinned by the
tests moved, no promise was weakened (the privacy row still carries the
never-leaves-your-phone and can-be-wrong clauses), and the privacy panel
itself is untouched — long is correct there, behind a tap, where someone has
asked to read it.

**The honest costs.** The three static recreations only needed their chip
borders and header bands touched — the glide, being motion, does not exist
in a drawing — but they are three more files in this commit all the same.
And pill layering is no longer DOM order (moving a node cancels its
transition, so your own pill can no longer be appended last): it is z-index
now, stated in the CSS, which is one more thing the recreations' visual
order silently depends on.

---

## 2026-08-31 — The map goes first

**What changed.** The tracking tab was rearranged. It now opens with the
progress strip and the map, then the saved stop, then the `No buses live`
headline and the direction filter with the bus chips under them. The "No
account. No name." data statement moved from above the card to the foot of the
tab.

**Why.** Everything that used to sit above the map was a description of the
map. Somebody opening the link is asking one question, and the answer was three
rows down. The headline is really the chip list's empty state in words, so it
now sits with that list; the filter moves the strip, the map and the list
together from anywhere, so where it sits was never load-bearing.

**What it costs.** When nothing is live, `No buses live` is the line that says
*outside operating hours, next departures 4:00am and 5:00am* — and it is now
below the fold on a phone. That is a real trade and it is written down in
`docs/ARCHITECTURE.md` rather than smoothed over: if the empty map turns out to
be what people mostly see, the fix is to hoist the headline only when the count
is zero, not to undo the order.

**Three drawings moved with it.** `flyer.html`, `for-operators.html` and
`how-to.html` each hand-draw this screen, and the guide's five numbered
callouts had to be renumbered and re-measured in a real browser. The poster
still prints as one landscape sheet — checked by rendering it, not by eye.

---

## 2026-08-20 — Saying salamat to whoever is carrying the phone

**What shipped.** Tapping a bus on the map opens its popup, and the popup now
ends with **🙏 Say salamat**. One tap. The person sharing that bus sees a line
under their progress strip: `🙏 3 riders said salamat`. Nobody else sees it, and
it goes when the trip does.

**Why it is worth having.** Sharing is unpaid work — battery, data, and the
discipline of leaving the screen unlocked for an hour so the GPS keeps running.
Until now the only thing a sharer got back was the progress strip added in
August, which proves the bus reached the map. That answers *is this working*.
It does not answer *does anyone care*, and for a volunteer those are different
questions.

**Why it took a database migration and four documents to add a button.** The
first design was the obvious one — a count per sharer, kept. It was rejected on
its own merits, and the reasoning is the part worth keeping:

*An appreciation total is a driver metric.* `for-operators.html` tells the bus
company, before it asks them for anything, that this tool cannot be used to
review a driver's speed, breaks, route deviation or working hours — **not
because we promise not to, but because the data is never written down**. A
running "salamat" total per person is exactly the kind of number a company
could later ask for, and the moment one exists, that paragraph stops being
true. So there is no total. A count belongs to one trip, and `thanks_now` is a
child of the position row by foreign key with `ON DELETE CASCADE` — it cannot
outlive the trip, and no future code path has to remember to delete it.

*A visible count is a ranking.* The count is returned only on the sharer's own
row. A number beside every bus on the map would rank the buses currently on the
road in front of the riders choosing which one to wait for. Nobody driving
signed up for that.

*A zero is worse than silence.* On a quiet run most trips will collect nothing,
and "0" parked on the sharing screen for forty minutes turns silence into a
verdict — the exact opposite of what the feature is for. The row is not drawn
until there is something to draw. `test-thanks.js` fails if that changes.

**The name was the other real decision.** The oldest and broadest cosmetic
rules in every content-blocker filter list exist to kill Facebook Like buttons.
This is the most Like-shaped control the app will ever ship, and it lives on the
*reader's* side, where somebody losing it to a filter has no reason to think
anything is missing and no way to tell us — strictly worse than the `shareBtn`
bug, which at least a sharer could describe as "the button is not there". Hence
`tybtn`, `tyrow`, `tydone`, `say_thanks`, and a third name scan in
`test-boot.js` section 8 covering `like`, `fav`, `thumb`, `heart`, `vote`,
`social` and `clap` across all five pages, in `onclick` as well as `id` and
`class`.

**Honest limits, both stated in the app.** `say_thanks` takes no key, because a
watcher has none, so anyone reading the source can inflate a bus's number with
invented ids; a cap of 50 per trip bounds it. And the count resets if the
wrong-direction guard pauses a trip, because that path clears the position row
and the cascade takes the thanks with it. Both are the design working, not
holes in it.

**Not decided.** Whether the sharer should be told anything at the *end* of a
trip, when the strip and the line both disappear with the row. A summary would
be the one thing this design refuses to keep, so if it is ever wanted it has to
be drawn on the phone from what that phone already saw, and never asked of the
server.

---

## 2026-08-17 — Your own stop, on your own phone

**What shipped.** The tracker can be told where you wait. Pick a stop from the
route's own list (or drop a pin), and the card between the bus chips and the
map answers the question people actually open the page with: `▲ Northbound ·
3.0 km away · about 5 stops before yours`. There is also an opt-in ➤ control on
the map that draws a dot where you are.

**Where this came from.** A proposal to add ETA prediction via federated
learning — train on each phone during a trip, send only model updates, use a
Bayesian prior so it works on little data. The Bayesian instinct was right and
the federated part was not, for a reason worth writing down: **federated
learning is a way to learn from data you are holding without moving it, and
this system holds none.** At ten sharing trips a day an "update" from one phone
is that trip, so it would have created the location history the project exists
without, in a form that reads as more private than a trail table rather than
less. It would also have needed an aggregator, a write endpoint that a share
key from a public group chat could poison invisibly, and on-device training
competing for the battery of a phone that already cannot survive a screen lock.

The second proposal — let watchers see their own location — was the good one,
and it needed no model, no server and no SQL at all.

**What was rejected, and why it matters more than what shipped.** The idea came
with "maybe this can be public or private". Public was rejected outright. Reads
need no key, so public here means the entire internet, and the feature would
have broadcast that a particular roadside has a person standing at it right
now — mostly commuters alone, at a route whose southbound window closes at
8:00 PM. That is a physical safety problem, not a privacy trade, and it is a
different category from a sharer: a sharer is an adult on a bus who opted in.
If demand data is ever genuinely wanted, the watching count is the precedent to
copy — a number with a floor under it, never a position.

**A stop picker beats a location prompt**, which was the useful surprise. Most
people check the page from a desk or a kitchen, not from the stop, so a GPS fix
would have put them somewhere useless. Picking from the 71 stops already in
`config.txt` is more accurate, persists for a daily commuter, and needs no
permission — which is why the privacy panel's strongest sentence survives for
everybody who never opts in.

**The panel moved in the same commit**, as the rule says. It used to promise
the app "never asks for your location" while watching, which is no longer true,
so it now says the thing that is: two places can use it, both only if you ask,
and neither sends it anywhere. The saved stop is the third remembered thing and
is named alongside the guide dot and the theme. `test-boot.js` now fails if the
`localStorage` keys the app writes stop matching the ones the panel lists,
which makes that rule mechanical instead of remembered.

**It says how far, never how long.** Distance and a stop count need no model.
Minutes would need travel-time history, and that is the conversation the
no-history invariant demands — so the test suite fails if a sentence on that
card ever starts implying an arrival time.

**Cost, honestly: the poster broke.** Adding one row to the mock pushed
`flyer.html` to two sheets — a near-empty first page with the header stranded
on it, exactly as `CLAUDE.md` warned. The mock column spans the page height, so
it is the thing that decides one sheet or two, and about 27 px had to be found
in the furniture around the map without touching the map. The guide's callout
dots also had to be re-measured, because they are percentages of a figure that
just got taller. Both are now written down as traps rather than left to be
rediscovered.

---

## 2026-08-01 — Parked the sightings board

**Decision.** The sightings board is switched off on this route for now, from
the admin page. It is the most complicated thing a first-time rider meets on
the page — a direction to pick, a landmark to pick, a note to maybe write — and
it arrived in the same week we started trying to win regular users. It also is
not finished. Nothing is deleted and nothing is uninstalled; the switch is in
`admin.html` and the app picks the change up within a minute.

**Cheaper than expected, and worth writing down why.** The settings validator
checks the keys it knows about but never rejects unknown ones, and
`get_settings` hands back the whole settings object, so a new flag reached
every client with no migration and nothing to run against the live database.
Any future setting is that cheap too.

**Absent means on**, so a fork that never opens the admin page still gets the
full app, and this route can turn it back on the day the feature is ready.

**Off hides, it does not lock**, and the admin page says so. Posting needs no
key, so someone who worked out the call could still add a sighting while the
board is off. Riders would never see it and it expires on its own — but it
would still turn up in the moderation list, which is exactly the sort of thing
that is baffling six months later if nobody wrote it down. Enforcing it in the
database is a one-function migration if it ever matters. It did not seem worth
one for what is really a display decision.

The guide asks the database whether to show its sightings section, with a plain
`fetch` rather than a script tag, so it still loads no files. Every failure path
— script off, config missing, network down, database unreachable — leaves the
section showing. Describing one feature too many is a much smaller problem than
hiding one that is really there.

---

## 2026-08-01 — Second pass on the UI

Follow-ups to yesterday's restructure, from the same review.

**Dark theme.** The southbound window closes at 8:00 PM, so a good share of
the time this page gets opened it is dark outside and the light theme is a
torch in the face. The map swaps to CARTO's `dark_all` — same provider, so
nothing changes there in the privacy panel.

It follows the device, and there is a ☀/☾/◐ control in the header to override
it. Three states, not two: a two-state toggle has no way back to "whatever my
phone is doing", so one tap and you are overriding your own system setting for
good. Shipped after being asked for — I had left it out on the grounds that a
rider opening a Messenger link for fifteen seconds should get the right theme
with no interaction, which is true, but it ignores the person who runs their
phone bright all day and wants a dark map at night.

The honest cost: the preference is stored, which makes it the second thing this
app keeps between visits. The privacy panel claimed nothing was kept once you
close the page — already untrue, because of the guide-seen dot, and nobody had
noticed. Both are now named there explicitly. Worth remembering that the panel
is the promise and the code is only the implementation; a third stored thing
means editing the panel in the same commit.

Doing it turned up something the light theme had been hiding: `--maroon` was
being used both as a fill with white text on it and as text in its own right.
Those are the same value in light and cannot be in dark, where maroon on a
near-black card is 1.7:1. Split into fill and ink pairs. Auditing the rendered
pages afterwards — measuring what actually painted, rather than reading the
CSS — caught three more: two places in the guide still colouring text with the
fill token, and a keyframe painting `#fff` on `--ink`, which in dark is white
on white. Also found `--muted` at 4.40:1 on the two tinted backgrounds; it had
only ever been checked against paper and white. Both themes now report no text
under AA on any of the four page/theme combinations.

**Sightings are picked, not typed.** Direction and nearest checkpoint are
pickers with an optional note. The guide used to have to *ask* people to write
"Northbound just passed Amadeo, 6:42am" instead of "Bus coming", which is a lot
to ask of someone typing one-handed at a stop. Now every sighting is specific
by construction, and because it comes back in a known shape, recent ones draw
on the progress strip as hollow dashed rings. That fills the gap the board
existed for: when nobody is sharing GPS the strip is no longer empty. Stored in
the same free-text column as before, so no migration, and old sightings still
render as the text they are.

The rings are dashed and hollow on purpose. A sighting is one person's word,
already minutes old, with no update coming — showing it as a solid bus would be
worse than showing nothing.

**Kawit.** Splits the 15.5 km Imus–PITX leg, which made a bus crossing CAVITEX
look stalled, and pulls the checkpoint chain onto the road, since the route
swings west into Kawit and back east. `docs/ARCHITECTURE.md` had suggested this
for a while. It also broke the tick labels immediately, exactly as the note
there predicted, so the label size is measured from the rendered strip now
instead of hardcoded — eight names fit, and a ninth will too.

**Smaller.** `aria-live` on the headline, which was rewriting itself every six
seconds and announcing none of it. Focus trapping in the modals. A
reduced-motion block for the app, which the guide has had all along. Bus chips
grouped by direction and ordered by progress. And `font-stretch:condensed`
deleted from all three pages — it had been reaching for a signboard look that
never rendered on any system font, so the CSS was implying an effect nobody
had ever seen.

One behaviour changed its mind: the sightings board opens itself when no buses
are live, and now never closes itself again. Auto-closing was symmetrical and
wrong — a bus coming live would have shut the board on someone part-way
through reading it, and posting a sighting closed it on the person who had just
posted. Taking something away is not as harmless as offering it.

---

## 2026-07-31 — Made the tracker readable at a glance

**Why.** The page answered its own question below the fold. Measured on a
390×844 phone, the headline sat 426 px down and the map 695 px down; with an
operator notice posted plus the first-visit accuracy banner, the map started at
834 px — off the bottom of the screen entirely. Someone opening the link while
standing at a stop saw three advisory boxes and a filter before a single bus.

**What changed.** The answer moved above the direction filter. The three
advisory blocks became one: the notice bar stays, and the accuracy warning
folded into the privacy line as a permanent clause, which retired a
localStorage flag — the warning is always true, so it should always be on
screen rather than dismissable once. Operating hours and sightings became
`<details>` cards whose summary lines carry the answer, so opening them is
usually unnecessary. The map grew from a flat 290 px to `min(58vh, 420px)`.
Headline now at 371 px and the map at 747 px **with a notice showing**; the
page is 21% shorter.

**Sightings open themselves when no buses are live.** Folding them
unconditionally would have hidden the only useful thing on the page at 5am.
A manual open or close by the reader wins for the rest of the visit.

**Defects fixed on the way.** Southbound bus badges had been rendering on top
of the AYALA and GEN.T labels — `.ticks` was pinned at 26px against 29px
content. `--muted` was 3.90:1 on white and carried nearly all the small text;
it and `--gold-deep` now clear WCAG AA. Tap targets went to 44px. Nothing on
either page was reachable by keyboard: no focus rings, no `<form>` anywhere so
Enter never submitted, tabs and bus chips were clickable `div`s. All fixed. In
the guide, the prompt-card stack had a hand-measured 186px min-height against
cards up to 319px, so on a narrow phone the prompts printed through the
paragraph below; both stacks are one-cell grids now and size themselves.

**The guide stopped using screenshots.** Every figure on `how-to.html` is drawn
in HTML and CSS from the same tokens as the app. That deletes 1.5 MB of media,
removes the last route-specific content in the repository — a fork no longer
has to reshoot anything — and kills a silent failure mode, since a screenshot
that no longer matches the app looks exactly like one that does. The cost is
honest: the recreations are hand-maintained copies, so a layout change means
updating them in the same commit. `test-boot.js` now checks the two halves a
machine can see: that the guide loads nothing, and that its copied `:root`
tokens still match `index.html`'s.

---

## 2026-07-29 — First live demo trip

**Plan.** Ride northbound from Gen. Trias to One Ayala on an afternoon
departure, share position for the whole trip, and post once to the group chat
with a screenshot and the link. Then go quiet until arrival.

**Why this shape.** Continuous narration is not possible while sharing:
switching to Messenger backgrounds the page and suspends GPS, so the bus drops
off everyone's map. Switching to the "Track buses" tab *within* the page is safe
— `switchTab` only toggles a CSS class and does not touch `watchPosition` or the
wake lock — so screenshotting your own bus mid-trip does not interrupt sharing.
One clean interruption at the start, one at the end.

**Operator approach decided.** Do not invite operators as a group and do not
invite them in the main group chat. DM each one separately, during the midday
gap between the morning and afternoon service windows, which is the only time
they are not driving. Do it *after* there is a completed trip to point at,
rather than asking them to trust an idea.

**Pitch framing decided.** Not "help us track the buses" but "you already type
your location all day; this does it in one tap". The operators are not being
asked to start doing something — they are being asked to stop doing something
tedious. Consent framing for anyone approached in person on the bus is about the
rider's own position, not the vehicle's: a passenger sharing where they are, not
the bus being tracked.

**Known gap.** A passenger holding a phone proves the watching side works. It
proves nothing about the driver's side — mounted phone, screen on for a whole
shift, battery, doing it while working. That case is still untested and should
not be presented as if today answered it. The way to answer it is to ride one
trip with an operator and set it up on their phone.

## 2026-07-28 — Announced to the commuter group chat

**What went out.** A post to the route's Messenger group chat: what the tool is,
the link, the current share key, and an explicit "this is an experiment, tell me
if it does not work". Framed as a fellow commuter, thanking the existing group
admins first, with no claim of affiliation with the bus company.

**Reception: warm.** 15 reactions, pinned by a group admin. One commuter replied
that it would be a big help for knowing where the bus is rather than chasing it.
One commuter asked publicly for an orientation session. One commuter worked out
the sharing concept unprompted and asked whether a person on board could share
their location. One **operator** asked how to use it.

**Adoption: none.** Through the rest of the day the group chat continued exactly
as before — the same "where is the bus" question asked over and over, answered
individually by operators typing their position. At least one commuter spent an
afternoon waiting at a stop unsure whether the bus had already passed, which is
the precise problem the tool solves. Nobody opened it. Warm reception and zero
adoption are two different results; only the second one is a problem.

**The structural finding.** The four operators active in the group chat already
broadcast their positions manually, in text, all day, for free. The tool does
not ask them to start doing something new — it asks them to stop typing. This
also inverts the expected privacy objection: they are currently announcing their
locations publicly under their own names, and the app is *more* private than
that, with no name attached and no history kept.

This reframes recruitment entirely. Earlier planning had assumed operators would
need to be won over to the idea of broadcasting position at all, and that the
surveillance concern would be the main obstacle. Neither is the situation.

**People, by label.**

| Label | Role | Notes |
|---|---|---|
| Operator A | operator | Asked how to use it, unprompted. Warmest operator lead. |
| Operators B, C, D | operators | Active daily in the group chat, answering position questions by hand. |
| Commuter E | commuter | Publicly asked for an orientation session. Natural first tester. |
| Admin F | group chat admin | Pinned the announcement; acts as the group's de facto dispatcher, relaying between commuters and operators. The person the tool most directly relieves. |
| Commuter G | commuter | Independently proposed the rider-shares-location idea. |

**Constraints surfaced by going public.**

*One share key for everyone.* There is no way to tell operator shares from rider
shares, and no way to revoke one person without revoking all of them — rotating
cuts off every sharer at once, with only the four-hour grace period. If
per-group revocation ever matters, that is a code change, and it should be
decided before the key is handed to two distinct groups.

*The share key is now effectively public.* It was posted in a large group chat,
which is the intended distribution method, but combined with reads being open to
everyone it means the key is the only thing preventing anyone from putting a
fake bus on the map. No action taken. Worth deciding deliberately before pushing
for wider adoption.

*The company does not know.* No approach has been made to the bus company. If
operators participate and the employer later objects, the operators carry that,
not the maintainer. Not yet decided either way.

**Loose end.** The how-to page exists, with screenshots and two screen
recordings, and was not linked when the operator asked how to use the app — the
answer was typed out longhand instead. Link and pin it.
