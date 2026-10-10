# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A community-run live bus tracker for one route in Cavite, Philippines
(Mendez/Tagaytay ⇄ One Ayala). Three static HTML files, no framework, no build
step, backed by Supabase Postgres. Deployed on Netlify from `main`.

Read `docs/ARCHITECTURE.md` and `docs/DATABASE.md` before changing anything.
Both record decisions that look arbitrary until you know why, and several were
made in response to bugs that had already shipped.

## Commands

The nine dependency-free JavaScript suites, run from the repository root:

```
node tests/test-hours.js      # split operating hours, the en-route allowance, the hours card, the parol season
node tests/test-guard.js      # wrong-direction detection on simulated trips
node tests/test-strip.js      # progress strip position and wording, the town lines in the popup
node tests/test-prompts.js    # idle, end-of-trip and direction prompts
node tests/test-mystop.js     # the saved stop: which bus is coming, how far, how many stops, the card
node tests/test-thanks.js     # saying salamat: the words, who is offered it, what it never draws; the ticket, the album
node tests/test-signboard.js  # the dot-matrix route board, the boards drawn into other pages, the mark
node tests/test-pictures.js   # the coach, the empty map's scenes, the marks, the checkpoint lines, the covers, the ticket's picture
node tests/test-tokens.js     # the design system: sizes, corners, shadows, speeds; the copied fonts and icons
```

These are also Netlify's build command, so a failure cancels the deploy.

The seventh suite loads both pages in a real DOM and needs jsdom, which is
installed nowhere in the repository (see "No package.json" below):

```
npm install --no-save jsdom@30
node tests/test-boot.js
```

Database suites need a local PostgreSQL. **Each suite needs its own fresh
database** — they are independent, every one pulls in `db/_prelude.sql`, and
each moves the seeded rows the next would expect. From `tests/`:

```
createdb bustest
psql -d bustest -f db/00-legacy-baseline.sql
psql -d bustest -f ../sql/01-base.sql          # then 02 through 07 in order
psql -d bustest -f db/01-core-tests.sql        # one suite only, then rebuild
```

`.github/workflows/tests.yml` runs both suites on every pull request and push
to `main`, deliberately using the same steps as `tests/README.md` so the
runbook is re-proven on every commit.

The Android app builds from `mobile/` (JDK 21 and the Android SDK needed);
`.github/workflows/android.yml` does it whenever `mobile/` changes:

```
cd mobile && npm ci && npx cap sync android
cd android && ./gradlew assembleDebug
```

Two scripts regenerate committed images from HTML sources. Neither runs at
deploy time and both need only a Chromium; they prefer `chrome-headless-shell`,
because full Chrome's headless screenshots leave the bottom 87 px unpainted:

```
sh tools/render-flyer.sh     # assets/flyer: poster PDF, briefing PDF, chat image
sh tools/render-icons.sh     # assets/icons: home-screen icons, link-preview picture
```

Two more rewrite committed text. `node tools/embed-fonts.js` copies the font
files in `assets/fonts/` into the three static pages as data URIs; run it after
replacing a font file. `node tools/make-pictures.js` draws the dot-matrix route
board into the guide, the flyer, the briefing and `tools/app-icons.html`, from
the words beside each board, the scenes that cover the three pages, and the
picture on the guide's ticket, with `index.html`'s own code; run it after
changing those words or the drawings.
`test-tokens.js`, `test-signboard.js` and `test-pictures.js` fail until you do.

## Architecture

**Five pages, one config file.** `index.html` is the tracker (watch + share),
`admin.html` the operator page, `how-to.html` a static guide, `flyer.html` the
adoption flyer handed to riders, and `for-operators.html` a briefing written for
the bus company. `config.txt` holds the Supabase URL, anon key, route slug,
source URL, checkpoints and stops — no secrets, which is why it is committed and
why a fork deploys straight from git.

The last two exist because the tracker's real problem is that nobody knows it is
there. Both are self-contained, load nothing, and print: `flyer.html` prints as a
one-page A4 poster for a terminal wall, `for-operators.html` as a document to
attach to an email. `tools/render-flyer.sh` drives headless Chromium to produce
both plus a chat-sized PNG, and `tools/make-qr.js` regenerates the flyer's QR
code as an inline path when the deployment URL changes. Neither tool runs at
deploy time and neither needs anything installed.

**It is called Bus Tracker**, never by the bus company's initials: a link
preview is read before the disclaimers are. `manifest.webmanifest` and
`assets/icons/` make "Add to Home screen" work (deliberately no service
worker: an offline map of where the buses were is worse than none). The icons
and the preview picture are rendered from `tools/app-icons.html`, and
`tools/write-preview-url.js` rewrites `og:image` to a full address at build
time — the second line of the published site that differs from the commit,
after the CARTO key. The mark is the coach every bus on the map is drawn as,
white on maroon with the gold trim and its signboard lit; every public page's
favicon is that mark, and the admin page's is the same coach on ink.

**The header's route board is a real dot matrix** (October 2026), drawn at load
by the SIGNBOARD block in `index.html` from the words in `header .route .ln`.
The words stay in the page, hidden from sight only, for screen readers, copy
and search, and a character the board has no dots for leaves the lettered CSS
board in place. The pages that run no drawing code carry boards drawn by
`tools/make-pictures.js` with the same block.

**Three credentials, not interchangeable.** The route slug is public and unlocks
reading. The share key lives only in the link posted to the community, and
unlocks putting a bus on the map. The admin key is stored as a salted SHA-256
hash and unlocks `admin.html`. All reads and writes go through `SECURITY DEFINER`
Postgres functions; tables have RLS enabled with no policies, so the anon key
cannot touch them directly.

**Watching is open to everyone** (changed July 2026). When an access rule
changes, re-read every rationale that depended on the old one — opening reads
silently invalidated the reasoning behind `clear_bus_position`, which had
treated an unguessable session id as a credential.

**Settings live in the database**, not config: operating hours, headway, expiry
times, sharer cap, and whether the sightings board is shown at all. Edited in `admin.html`, re-read by the app every 60 seconds,
so a schedule change never needs a redeploy.

**The reader can save a stop**, and the card directly under the map then says
how far the next bus still is from it and roughly how many stops.
Entirely client-side — no request, table or column was added — and measured
along the checkpoint chain, never straight-line, because across the Tagaytay
ridge hook a bus 1.2 km away as the crow flies is 3.5 km by road. Stops in
between are counted by projecting them onto the chain, never by `config.txt`
order, which is merged from two posters and is not route order. It reports
distance and stop counts only, never minutes: an ETA needs travel-time history
this system does not keep, and `test-mystop.js` fails if the wording drifts
towards implying one.

**A reader can thank a sharer**, once per bus, from the bus's popup on the
map. Deliberately narrow, and each narrowing is load-bearing: the count belongs
to one trip and `thanks_now` is a child of `bus_positions` with `ON DELETE
CASCADE`, so it *cannot* outlive it and nothing has to remember to delete it; it
is returned only on the sharer's own row, because a count beside every bus would
rank the buses on the road in front of the riders choosing between them; a zero
is never drawn, because "0" on the sharing screen for forty minutes turns
silence into a verdict; and nothing stored identifies the rider who tapped. A
running total per sharer is the driver metric `for-operators.html` promises
cannot be produced — if one is ever wanted, that is the deliberate conversation,
not a follow-up. `test-thanks.js` and `db/07-thanks-tests.sql` hold all of it.

**The sharer gets a ticket at Stop** (October 2026): a picture of where they got
on and off (the two places' marks as roadside signs, the coach between, the view
at the destination behind it, the sky from its stamps), how long the bus was on
the map, how many said salamat, a stamp or two. Made on the phone and sent nowhere. Fenced the same way as the count: no
stamp may be about how the bus was driven (speed, trip time, comparisons — the
driver metric again), no ticket for a trip under five minutes or one that never
reached the map, no zero. It is built from a six-field record in memory, and
`test-thanks.js` fails if that record grows a field or anything is ever appended
to it.

**A ticket is kept only if the sharer taps Keep**, and then only as a souvenir,
never a stopwatch: My tickets keeps six things per ticket in `wt-tickets` — the
day, the direction, the two ends' short names, the stamps by kind, and a yes or
no for salamat. No clock time, no duration, no bus number, no count, no
position, because anyone on board can share and a phone full of timed tickets
would be the conductor's timesheet. The album counts tickets, places passed and
stamps collected, and nothing that could rank anybody: no time on the map, no
salamat total (a flower per thanked ticket, never added up), nothing per bus,
no streak. Keeping is a tap on one ticket and never a default; `keepTicket()`
is the only thing that adds. `test-thanks.js` sections 15 to 17 hold all of it,
and `docs/ARCHITECTURE.md`, "Keeping the ticket", has the reasoning.

**A reader can send a link to one bus**: `#b=` plus the bus's public id, which
every map already has, so the link reveals nothing and dies with the trip. It is
`sendBusLink`/`.buslink`, never anything called share. The same popup tells one
line about the town the bus is passing, from an optional fifth field on each
`CHECKPOINT` in `config.txt`.

**The app keeps exactly four things between visits**, all on the device and
all named in the privacy panel: whether the guide has been opened, the
light/dark/system theme choice, the reader's saved stop, and the tickets a
sharer chose to keep. Adding a fifth means editing that panel in the same
commit — the panel is the promise, not the code. `test-boot.js` section 10 makes that mechanical: it fails if the set of
`localStorage` keys the app writes stops matching the set the panel names.
Per-visit switches go in `sessionStorage` for exactly this reason — the
location dot, and the saved-stop card's "buzz once" switch.

**The tracking tab reads picture first, words second.** Top to bottom: the
progress strip, the map, the saved stop, then the headline, the direction
filter and the bus chips, with the data statement at the foot of the tab. The
two things a reader opened the page for come before anything that describes
them; the headline is the chip list's empty state written out, so it sits with
that list; and the filter moves the strip, the map and the list together from
wherever it is placed. The cost is that "No buses live" — which carries the
operating hours and the next departures — is now below the fold on a phone, so
an empty map explains itself a scroll later than it used to. Most of that is
bought back by `renderMapNote()`, which says why the map is empty on the map
itself: next trips, the bus asleep (*tulog pa*) or waking, or nobody sharing
inside hours with a button to be the first.

**The map is this route's, not a map with pins on it.** CARTO's basemap is
split into its `nolabels` and `only_labels` layers with the stop marks
between them, the base is faded so the livery is the only strong colour,
stops are pips that hide below zoom 12, checkpoints are station marks
labelled with the strip's short names, and the bus badge is an inline SVG
rather than 🚌. No new request, storage or third party. **There is
deliberately no route line**: the road is not known well enough to draw and
a wrong line is worse than none. `docs/ARCHITECTURE.md` has the reasoning.
The strip above it is drawn in the same idiom: a line map with a station per
checkpoint, the drawn bus as its pills, and the reader's saved stop as a
station of their own.

**The sharing tab goes dark during a trip** (`:root.trip-on`, the token block
redefined, set by `syncTripMode()`), and **a parol hangs in the header** from 1
September to 6 January unless the admin page switches it off (`parol_enabled`
in settings, absent means on). It hangs between the two tabs, which part for it.

**Pictures only where the screen would be empty.** The working screens stay
quiet; illustration is for when there is nothing else to show. Closed, the
empty map's card is a scene — a generic provincial coach (no operator's livery
or lettering) parked above Taal Lake at night, dawn or midday — from
`sceneSvg()` in the tested PICTURES block, chosen by `mapNoteKind()`. The same
scene covers the guide, the flyer and the briefing. Each checkpoint can name a
drawn mark (`MARKS`) in an optional sixth field of its `CHECKPOINT` line; it is drawn beside
the town line in a bus's popup and on the stop of a sharer's ticket, whose
stamps sit beside what they stamp, never over the words. The ticket's own
picture is the marks of the trip's two ends (`ticketArtSvg()`) with the view at
the destination behind them, one per kind of place (`TICKET_VIEWS`, chosen by
the same sixth field), so every kept ticket in the album is a different card.
The flag view flies the Philippine flag blue above red, as in peace, and
`test-pictures.js` fails if it is ever drawn the other way up.

**Android sharers can use an app** (`mobile/`, October 2026) that keeps GPS
running with the screen locked. It is a Capacitor shell that loads the live
site, not a copy, and the only code that knows about it is `watchTripGps()`
and the notification helpers beside it in `index.html`: they take fixes from
the native background-geolocation plugin when `window.Capacitor` offers it,
and fall back to `navigator.geolocation` everywhere else. All trip logic stays
in the page, under the existing tests. Keep it that way: logic added to the
native side has no tests and no browser twin. `test-boot.js` section 11 boots
the page with a stand-in bridge. `mobile/README.md` has the signing rules.

**Colours come in fill/ink pairs.** `--maroon`/`--brand-ink`,
`--gold`/`--gold-deep`, `--lost`/`--lost-ink`, `--mine`/`--mine-ink`. The first of each pair is a
background with white or near-black text on it; the second is the same colour
used as text. They are nearly identical in the light theme and completely
different in dark, so pick by what the colour is doing — painting a shape, or
spelling a word. All five pages carry their own copy of the token block and
`test-boot.js` fails if they drift.

**Everything else is a token too** (October 2026): seven text sizes, three
corners, three heights, three speeds and two typefaces, defined in
`index.html`'s `:root`. `test-tokens.js` fails if `index.html` or `admin.html`
uses a literal size, corner, shadow, speed or typeface anywhere, including in
strings a script builds markup from; a deliberate exception goes in its list
with the reason. The type is Barlow Semi Condensed for labels, buttons, names
and numbers and Barlow for sentences, self-hosted in `assets/fonts/` and
inlined into the three static pages. The icons are one drawn family in a sprite
at the top of `index.html`'s body; no emoji is drawn by the interface, and a
page that needs an icon copies its `<symbol>` (the test fails if a copy
differs). `tools/styleguide.html` draws all of it from `index.html`'s own
stylesheet at load, so it is the reference and cannot go stale. The reasoning
is in `docs/ARCHITECTURE.md`, "The look".

## Invariants

These are load-bearing. Changing any of them needs a deliberate conversation,
not a judgement call mid-task.

**No location history.** `bus_positions` holds one row per sharing session,
upserted in place. There is no trail table, so the tool cannot be used to review
a driver's speed, breaks or route — the data does not exist. This is the single
most important property of the system. The wrong-direction guard tracks progress
in the sharing phone's memory only and it dies with the tab. A kept ticket is the
one thing that outlasts a trip, on the sharer's own phone and only on a tap, and
it holds a date and two checkpoint names, never a position or a time, so it
cannot grow into a trail either.

**No watcher location leaves the device, ever.** The reader can save a stop and
switch on a dot showing where they are; both are computed and stored on the
phone, and neither is transmitted. Nothing server-side knows where anybody
watching the map is, and no feature may change that — a public version of it
was considered and rejected, because reads need no key, so "public" means the
whole internet and it would broadcast that a given roadside has somebody
standing at it right now. If a request ever needs to carry a watcher's
position, that is the deliberate conversation, not a small follow-up.

**No package.json at the root.** Adding one makes Netlify run `npm install`
and publish `node_modules` alongside the site, which breaks the no-build-step
property. jsdom is installed only in CI, with `--no-save`. `mobile/package.json`
is the one exception and is safe only because it is not at the base directory;
nothing the website loads may come from it.

**No third-party code or fonts on the website.** Leaflet and supabase-js are vendored in
`assets/vendor/`; Barlow is served from `assets/fonts/` and carried inline by the
static pages, never linked from a font service. (The Android app compiles Capacitor and its two plugins
into the APK; the site itself loads none of it.) CARTO map tiles are the only remaining third party and are
disclosed to users in the app. Do not reintroduce CDN links.

**Nothing named `share*`, `help*`, `support*`, `chat*`, `widget*`, `like*`,
`fav*`, `thumb*`, `heart*`, `vote*`, `social*` or `clap*` in a DOM id, class or
`onclick`.** Brave Shields' cosmetic filtering hid the start button because its
id was `shareBtn`, leaving a page that looked completely normal with no way to
share. The failure is invisible from our side. `test-boot.js` sections 7 and 8
scan every page for these names, the flyer included: its whole purpose is one
call to action, and a filter list that hides it leaves a poster-shaped page
with no way to reach the tracker. The second half of the list arrived with the
salamat button, which is the most Like-shaped control this app will ever ship
and sits on the reader's side, where losing it to a filter would never be
reported. `star` is deliberately absent — it is inside `start`.

**Reads do not write.** Cleanup happens in `_sweep()`, called only from writes.
An earlier version ran a DELETE on every read and was documented as fixed long
before it actually was.

**Tests extract the shipped code.** Six of the JavaScript suites pull functions
out of `index.html` by comment markers and run them, so a passing test cannot
drift from the app; the seventh, `test-tokens.js`, reads the shipped styles. Keep the markers intact when editing those regions.

## Route-specific content

Everything adapts from `config.txt`, including the optional one-line story on
each `CHECKPOINT` — facts about Cavite, so a fork writes its own or leaves them
off, and the optional sixth field picks each one's drawn mark from a library of
kinds of place. The route's name on the boards does not come from config: it is
the words in each page's `header .route` (and in `tools/app-icons.html`, for
the link-preview picture), so a fork edits those, runs `tools/make-pictures.js`
and re-runs `tools/render-icons.sh`. The empty map's scene is this route's own
view, Taal from the Tagaytay ridge, in `sceneSvg()`: a fork redraws its ground
or keeps the volcano. The ticket's views are by kind of place, so they follow
`config.txt` like the marks, but the volcano one is Taal too: a fork whose
volcano has no lake redraws that one. `how-to.html` used to be the exception —
its screenshots and screen recordings showed this deployment, so a fork had to
recapture them or delete the page. Every figure on it is now drawn in HTML and
CSS from the same tokens as the app, and the page loads nothing over the
network. One figure's map is now a real cropped screenshot embedded as a data
URI — the same trade the flyer makes, for the same reason: a drawn basemap
reads as drawn. Everything else on the page is still drawn.

That trade is deliberate: the pictures cannot 404 or go stale silently, but
they are hand-maintained copies of the real UI, so **changing the tracker's
layout means updating the recreations in the same commit.** `test-boot.js`
section 8 defends the two halves of this that a machine can check — that the
page still loads nothing, and that its copied `:root` tokens still match
`index.html`'s.

The guide also redraws the sharing tab in trip mode and the salamat ticket, so
changing either means changing `how-to.html` in the same commit.

**That now costs three files, not one.** `flyer.html` and `for-operators.html`
each redraw the tracker's screen the same way, showing four buses live because
an empty map is what the tool looks like when nobody has heard of it. Every
string in those drawings is one the app would really print — the headline and
subtitle come from `renderBuses()`, the chip labels from `busPlace()`, the
checkpoints and distances off `config.txt`. Change either function and all
three recreations are wrong. Both drawings carry a visible "example screen"
label: a mock that could be mistaken for live data is the one thing this
project's own rules would not forgive.

**The map inside that mock is the one deliberate exception to "drawn, not
photographed."** Both on screen and in print it is a real cropped screenshot
of this route's own map (Leaflet + CARTO), embedded as a data URI so the page
still loads nothing over the network and can never 404 off a deploy — the
property that matters is preserved even though the technique changed. It is
real because a hand-drawn road looked like a hand-drawn road next to the rest
of the recreation, and the whole point of the mock is to look like the actual
product — a vector print fallback was tried and dropped for the same reason.
The honest cost: it ties that figure to Cavite, so a fork running a different
route has to recapture it — crop a fresh screenshot and recompute the bus
percentages against the checkpoint pixel positions, both described in a
comment above the figure in each page that carries one.

`how-to.html` carries one too, as of the same reasoning: its map figure was a
stylised SVG route on a flat panel and read as exactly that. It uses its own
landscape crop of the same screenshot, cut to that figure's shape, with the
single bus placed by interpolating along the Tagaytay–Amadeo leg from
`config.txt`. Its badge percentages are measured against an inner wrapper
sized to the image rather than to the figure box, because that box's shape
changes with the viewport and the image's does not. Every other figure on the
guide is still drawn, and the guide still loads nothing over the network.

`tools/make-route-figure.js` still generates a fully portable, geography-
agnostic vector version of the same figure — not used by any shipped page
now, but there for a fork that would rather not photograph anything.

**The poster prints as one landscape A4 sheet, in three columns.** Portrait
made it a tall single column that always broke across two pages with the
second barely a third full. Landscape is wide and short: wrong for one
column, right for three. The columns are headline + caveats, the example
screen, and the link with its QR plus the three steps.

The map drives that arrangement. Whatever column holds the headline also caps
how tall the mock can be, so the mock gets a column to itself spanning the
full page height — that is what keeps it near the size it had in portrait
rather than shrinking to fit under something. In the layout, only column one
stacks: columns two and three each hold a single item spanning every row,
because CSS grid shares row heights across columns and two independently
stacking columns would tie their items' heights together and open gaps. The
two side columns are `.pgroup` wrappers that are `display:contents` on
screen, so they generate no box there and the screen page and the chat image
are byte-for-byte unaffected by them.

Three traps worth knowing, all of which cost a render each: `grid-row:1/-1`
silently collapses to a zero-row span here because `-1` resolves against the
*explicit* grid and these rows are all implicit — use a large `span` instead.
The header band has to stay short enough that the grid fits beneath it,
because a grid this tall will not fragment: if it does not fit it moves to a
page of its own and leaves the header stranded on a blank sheet — and that is
exactly what a two-page render looks like, a near-empty first sheet and
everything on the second.

And **the mock column has no spare height.** It spans the full page, so it is
what decides one sheet or two, and anything added to the drawing has to be paid
for out of the furniture around it — the map is not allowed to shrink, because
it is the thing being made to look like the app, and its bus badges are
positioned as percentages of its own box. Adding the saved-stop row cost about
27 px and took a title size, two track heights and several paddings to buy
back. Measure before and after with a real render; `@media print` can be
flipped to `@media all` in a scratch copy to read the heights off the page
directly, but only the PDF page count is the truth.

The header strip and the "How your data is handled" panel both state that the
app is not affiliated with or endorsed by any bus company. `flyer.html` and
`for-operators.html` say it too, the latter before it asks for anything. Keep
that language intact everywhere — a community tool gets mistaken for an
official one otherwise, and a flyer is the thing most likely to cause it.

## Licence

AGPL-3.0-only. `SOURCE_URL` in config makes the app link to its own source,
which is how the network clause is met in practice.
