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

The ten dependency-free JavaScript suites, run from the repository root:

```
node tests/test-hours.js      # split operating hours, the en-route allowance, the hours card, the parol season
node tests/test-guard.js      # wrong-direction detection on simulated trips
node tests/test-strip.js      # progress strip position and wording, the town lines in the popup
node tests/test-prompts.js    # idle, end-of-trip, your-stop and direction prompts
node tests/test-mystop.js     # the saved stop: which bus is coming, how far, how many stops, the card, where sharing stops
node tests/test-thanks.js     # saying salamat: the words, who is offered it, what it never draws; the ticket, the album, its luck, your bus; spare parts, the shop, the look, backups
node tests/test-signboard.js  # the dot-matrix route board, the boards drawn into other pages, the icon and the mark
node tests/test-pictures.js   # the coach, the empty map's scenes, the marks, the checkpoint lines, the covers, the ticket's picture and sights, your bus, the ride, the saved stop's picture, the trip's first window
node tests/test-tokens.js     # the design system: sizes, corners, shadows, speeds; the copied fonts and icons
node tests/test-tour.js       # the tour: steps and words, the practice scene, the bubble's place, what a run may never do
```

These are also Netlify's build command, so a failure cancels the deploy.

The eleventh suite loads both pages in a real DOM and needs jsdom, which is
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
psql -d bustest -f ../sql/01-base.sql          # then 02 through 15 in order
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

The bundle for Google Play is built by `.github/workflows/android-release.yml`
("Android release bundle" in the Actions tab), only when run by hand: it
checks the upload key's four secrets, builds and verifies the signed `.aab`,
and publishes it to a prerelease of its own for the Play Console upload.

Two scripts regenerate committed images from HTML sources. Neither runs at
deploy time and both need only a Chromium; they prefer `chrome-headless-shell`,
because full Chrome's headless screenshots leave the bottom 87 px unpainted:

```
sh tools/render-flyer.sh     # assets/flyer: flyer PDF, briefing PDF, showcase poster PDF, chat image
sh tools/render-icons.sh     # assets/icons: home-screen icons, link-preview picture; mobile/store: Play's icon and feature graphic; the Android app's launcher icons and splash
```

Two more rewrite committed text. `node tools/embed-fonts.js` copies the font
files in `assets/fonts/` into the five static pages as data URIs; run it after
replacing a font file. `node tools/make-pictures.js` draws the dot-matrix route
board into the guide, the flyer, the briefing, the tester page, the poster and
`tools/app-icons.html`, from the words beside each board, the scenes that cover
those five pages, and the picture on the guide's ticket, with `index.html`'s
own code; run it after changing those words or the drawings. It also draws the
guide's pictures of your bus, from the decorations and paint named in each
`<!-- mybus keys=… paint=… -->` marker, the bus on the road in its popup, from
`<!-- ride views=… sky=… -->`, and the saved stop's picture in the guide, the
flyer, the briefing and the poster, from `<!-- stopview f=… sky=… -->` (or, on board,
`stop=… at=…`, measured from `config.txt`). And it draws the
icon into `tools/app-icons.html`, from `<!-- appicon id=… -->`, and the small
mark into every page's favicon and the Android app's status-bar and themed
icons. `test-tokens.js`, `test-signboard.js` and `test-pictures.js` fail until
you do.

One more makes the showcase video: about a minute of the real tracker on a phone,
with made-up buses, for posting where riders are. It needs ffmpeg, the map
key and Playwright, which never goes in a package.json: a global install, or
`npm install --no-save playwright-core@1.56` as CI does with jsdom. It writes
to `video-out/`, which is not committed:

```
CARTO_API_KEY=... sh tools/render-video.sh
sh tools/render-video.sh video-out --motion   # the animated cut: no screens, no key
```

## Architecture

**Seven pages, one config file.** `index.html` is the tracker (watch + share),
`admin.html` the operator page, `how-to.html` a static guide, `flyer.html` the
adoption flyer handed to riders, `for-operators.html` a briefing written for
the bus company, `testers.html` the Android app's closed test, and
`poster.html` a one-sheet showcase with a QR code for each.
`config.txt` holds the Supabase URL, anon key, route slug, source URL, the
Android app's address, checkpoints and stops — no secrets, which is why it is
committed and why a fork deploys straight from git.

The flyer and the briefing exist because the tracker's real problem is that
nobody knows it is there. Both are self-contained, load nothing, and print:
`flyer.html` prints as a one-page A4 poster for a terminal wall,
`for-operators.html` as a document to attach to an email.
`tools/render-flyer.sh` drives headless Chromium to produce both plus a
chat-sized PNG, and `tools/make-qr.js` regenerates the flyer's QR code as an
inline path when the deployment URL changes. Neither tool runs at deploy time
and neither needs anything installed.

**The flyer says each thing in a line** (October 2026, the maintainer's
"too wordy"): the app's English with its Tagalog, as the poster, steps of one
line each, and the five reassurances as chips with their reasons folded under
"Why". The "To be fair" box of caveats was then taken off too, at the
maintainer's word; the footer still says it is not an official schedule and
not the bus company's, and the app says the rest where it matters. On screen it also moves and
can be tried: a card opens the tracker's two tours (`#tour`, `#tour=share`),
and it animates only what the app animates, with the app's keyframes, which
`test-boot.js` section 8 compares: the one example bus under 45 seconds old
breathes and rocks on the strip and the map, and the saved stop's road runs.
Every frame is a picture the app could show, because the chat image is a
screenshot taken mid-loop; nothing moves on paper or for reduced motion.
Under its steps a second, smaller QR code offers the Android app to whoever
shares, the same code as the poster's and held to `ANDROID_APP_URL` by the
same test; watching still needs nothing installed.

**`poster.html` is the showcase poster** (October 2026): one portrait A4
sheet, `assets/flyer/poster-a4.pdf`, that shows rather than explains. The
flyer argues, with an example screen, steps and fine print; the poster is read
from across a terminal: the headline, four pictures with a line each (the
map, cropped from the flyer's screenshot, then three of the tracker's own
drawings: the saved stop, a sharer's ticket, your bus), and two QR codes, the tracker for everyone and the Android app for
whoever shares. The app's code is for `ANDROID_APP_URL`, the tester page while
the closed test runs, and `test-boot.js` section 8 fails while the two
disagree or either code is not what `tools/make-qr.js` draws for the address
its label names. It loads nothing and runs no script, like the flyer. Its
words are the app's: English, with the Tagalog the app itself uses, never
all Tagalog (the maintainer's call: "Dress your bus", not "Bihisan ang bus
mo").

**`testers.html` signs riders up for the closed test** (October 2026), in
three taps on their own phone: join the Google Group that is the test's tester
list, become a tester on Play, install. Nobody sends anybody an email address.
Its ask is riding, not installing, because Google refuses production when
testers installed and never used the app; since October 2026 the group's
welcome post makes that ask, the page's own "What I need from you" card taken
off at the maintainer's word. It loads nothing and runs no script at all.
**Google's "Get it on Google Play" badge** stands under its first line and is
step 3's button, and sits in the flyer's and the poster's app cards: Google's own PNG, unaltered
and inlined, linking to the app's listing, with Google's attribution line in
the page's footer; the trip's first window in `index.html` carries it too,
with that line under it. `test-boot.js` sections 8 and 15 hold every badge to
the bytes Google publishes. Never the bare Google Play logo: Google keeps that for its
own lockups and asks for the badge wherever people are sent to download. Each step shows Google's own screen with the tap ringed, inlined as a
data URI, with the maintainer's name, photo and email blurred or cut out;
those pictures go stale when Google redesigns, so retake them then. While the test runs, `ANDROID_APP_URL` names it, so the trip
window's app line and the guide send Android sharers there rather than to a Play
page that says "App not available"; the group's name and the package in its
links are this deployment's, so a fork edits them.
`test-boot.js` section 8 checks its Play links name the app's package.

**It is called Bus Tracker**, never by the bus company's initials: a link
preview is read before the disclaimers are. `manifest.webmanifest` and
`assets/icons/` make "Add to Home screen" work (deliberately no service
worker: an offline map of where the buses were is worse than none). The icons
and the preview picture are rendered from `tools/app-icons.html`, and
`tools/write-preview-url.js` rewrites `og:image` to a full address at build
time — the second line of the published site that differs from the commit,
after the CARTO key. **The icon is the sharer's ticket** (October 2026, the
maintainer's choice after twelve rounds): three tickets fanned on a morning
coral, the coach driving out of the front one's picture, SALAMAT stamped
across two. The app's front ticket says FIBI; the website's has a line of
print there instead, because the site is Bus Tracker. Where that is too small
to read, the small mark stands in, the ticket punched through in the coach's
shape: every public page's favicon on the coral, the admin page's on ink, and
the Android app's status-bar and themed icons. The link preview and Play's
feature graphic are in the same coral. `tools/make-pictures.js` draws all of
it, the icon with `index.html`'s own coach; the map's badges stay the
front-on coach. `test-signboard.js` sections 6 and 7.

**The header's route board is a real dot matrix** (October 2026), drawn at load
by the SIGNBOARD block in `index.html` from the words in `header .route .ln`.
The words stay in the page, hidden from sight only, for screen readers, copy
and search, and a character the board has no dots for leaves the lettered CSS
board in place. The pages that run no drawing code carry boards drawn by
`tools/make-pictures.js` with the same block.

**Three credentials, not interchangeable.** The route slug is public and unlocks
reading. The share key lives only in the link posted to the community, and
unlocks putting a bus on the map — unless an organizer has switched on open
sharing (`open_sharing` in settings, absent means off, `sql/11-open-sharing.sql`),
when a page with no key shares by the slug. Switching it off removes every bus
started without the key at once; keyed sharers are never touched. The share key
may be a PIN of 4 to 8 digits (`sql/12-share-pin.sql`); while it is, 20 wrong
tries in 10 minutes pause new trips on the route for 10 minutes, so every key
check carries the slug (`check_share_key`, `set_keyed_position`) and the old
`route_exists`/`set_bus_position` refuse to test a PIN. The admin key is stored as a salted SHA-256
hash and unlocks `admin.html`. All reads and writes go through `SECURITY DEFINER`
Postgres functions; tables have RLS enabled with no policies, so the anon key
cannot touch them directly.

**Outside the route area a bus is its own phone's** (October 2026,
`sql/14-off-route-private.sql`). A position outside the box around the route
used to be refused; it is now kept, marked `off_route`, and `get_positions`
returns it to its own phone only. So sharing works, and Google Play can review
it, from anywhere, while a made-up bus still never reaches the riders' map. A
reviewer key that skipped the check was refused: whoever held it could put a
bus on the real map from anywhere. The writers answer `private`, the sharing tab
says "Only you can see this bus.", and such writes never count towards a
ticket. `docs/DATABASE.md`, "Outside the route area".

**Watching is open to everyone** (changed July 2026). When an access rule
changes, re-read every rationale that depended on the old one — opening reads
silently invalidated the reasoning behind `clear_bus_position`, which had
treated an unguessable session id as a credential.

**Settings live in the database**, not config: operating hours (a weekday set
and, optionally, a weekend one; each window may carry its own interval),
headway, expiry times, sharer cap, and whether the sightings board is shown at
all. The hours block in `index.html` is the only reader of the hours object
and the interval, through `hoursFor()` and `headwayAt()`; `test-hours.js`
fails if anything outside it reads either directly. Edited in `admin.html`, re-read by the app every 60 seconds,
so a schedule change never needs a redeploy.

**The reader can save a stop**, and the card directly under the map then says
how far the next bus still is from it and roughly how many stops.
Entirely client-side — no request, table or column was added — and measured
along the checkpoint chain, never straight-line, because across the Tagaytay
ridge hook a bus 1.2 km away as the crow flies is 3.5 km by road. Stops in
between are counted by projecting them onto the chain, never by `config.txt`
order, which is merged from two posters and is not route order. **The card
draws the bus coming** (October 2026, the maintainer's choice over a line of
dots that looked the same however near the bus was): down the road to the
shed you wait at, or on board your stop's sign coming up to the windscreen
(`stopViewSvg()`), dressed by `busLookOf()`, the popup's rule. Waiting, a
post stands for every stop between, however many, each one even step of
depth by `stopsAway()`, so forty stops off is a speck at the end of a long
road and never looks like six, and the bus glides only when a position
arrives and never creeps between them, because a picture that moved on its
own would be a guess at an arrival. On board the road is drawn at its real
length (`stopsBack()`, in km) and seen wide from the front seat, about 150 m
of it, so what is close rushes past (the maintainer's ask, October 2026,
even at a sign at a time or none): a green sign every 100 m with the km
still to go, a power pole every 25 m across the road, the middle line 4 m of
paint every 20 m and, close by, the concrete's joints and the verges' grass,
painted on the ground (`svDashes()`, `svJoints()`, `svTufts()`), at every
stop a big sign with your stop's name and the km still to go from there, big
so it can be read as it comes on (the only words in the picture, the
maintainer's ask), your stop a pin on the
horizon until it is in sight, and the dashes, the signs, the poles and the
posts going by together, moved by the card itself 30 times a second on a
timer (`rideFrame()`) in true perspective (`svOnRoad()`), at one steady
speed: the view runs the feed and a poll behind the bus (12 s on the map
tab, 24 s on the sharing tab), reaching each position that long after its
report's own time, so it keeps the bus's pace however the reports fall and
never runs ahead. A stylesheet glide in four straight steps made it lunge
and stall. That is the one picture that moves at a bus's pace
(October 2026), because its viewer is on that bus. It is the one working
screen with a picture. It reports distance and stop counts only,
never minutes: an ETA needs travel-time history this system does not keep,
and `test-mystop.js` fails if the wording drifts towards implying one. **On board, the card follows your own bus** to the stop
you get off at instead of the nearest one coming: a sharer's is the row the
server flags `is_self`, anyone else's is picked with "I'm on this bus" in the
popup and kept in `sessionStorage` only. **And a sharer's trip stops there**
(October 2026, so the trip's first window could say so): arriving at the saved
stop asks "Getting off here?", and sharing stops a minute later with no
answer (`stopGuardUpdate()`), only once the stop has been well ahead of the
bus that trip, so boarding at it never counts. While sharing, the card shows on the
sharing tab too, with the road folded away until "Show the road" is
tapped, for that visit only (`wt-road` in `sessionStorage`), and that tab
carries a live dot so leaving it never looks like stopping. Everything that
loops on that tab rests after half a minute: the live dots, the strip's
pills, its sighting glows and the parol. A sharer's screen stays on all
trip, and any one thing moving keeps it redrawing; a dot breathing all trip
cost more battery than the rest of the screen together
(`docs/ARCHITECTURE.md`, "What it costs to keep moving").

**A reader can thank a sharer**, once per bus, from the bus's popup on the
map. Deliberately narrow, and each narrowing is load-bearing: the count belongs
to one trip and `thanks_now` is a child of `bus_positions` with `ON DELETE
CASCADE`, so it *cannot* outlive it and nothing has to remember to delete it; it
is returned only on the sharer's own row, because a count beside every bus would
rank the buses on the road in front of the riders choosing between them; a zero
is never drawn, because "0" on the sharing screen for forty minutes turns
silence into a verdict; and nothing stored identifies the rider who tapped. A
running total per sharer was refused as the driver metric until the
maintainer had that deliberate conversation (October 2026): the server still
keeps none, and the sharer's own phone now keeps theirs for their bus
(`wt-bus`), which never leaves it. `test-thanks.js` and `db/07-thanks-tests.sql` hold all of it.

**The sharer gets a ticket at Stop** (October 2026): a picture of where they got
on and off (the two places' marks as roadside signs, the coach between, the view
at the destination behind it, the sky from its stamps), how long the bus was on
the map, how many said salamat, a stamp or two. Made on the phone and sent nowhere. Fenced the same way as the count: no
stamp may be about how the bus was driven (speed, trip time, comparisons — the
driver metric again), no ticket for a trip under five minutes, under a kilometre
along the route between its two ends (a bus that waited at the terminal with
sharing on went nowhere), or one that never reached the map, no zero. Every
other end draws one, GPS failure and a refused
key included; only an organizer's Stop does not. GPS that drops out is waited
out for `bus_expiry_min` (only "location off" ends a trip at once), and a trip
outlives its page: kept as `wt-trip` while it runs, so a page opened again
mid-trip asks "Still on the bus?" and carries on as the same bus or hands over
the ticket. `docs/ARCHITECTURE.md`, "When a trip is interrupted". It is built from a six-field record in memory, and
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

**No two tickets are drawn alike, and trips decorate your bus** (October
2026). A ticket's paper, punch, sights, weather, moon, season and, one in
fifteen, gold foil are worked out by `ticketLook()` from the day, the direction
and the two ends a kept ticket already keeps: no new storage, no re-roll, and
never anything about driving, trip length or salamat (rules 11 to 13). Every
trip that drew a ticket and went somewhere, kept or not, is counted in
`wt-bus` as numbers with no list of dates, and fifteen decorations (`DECOR`, drawn by
`BUS_DECOR`) are earned from those counts, two of them for finishing the two
tours, so a new user's bus starts with something on it: shown in My tickets,
always offered on the sharing tab with the ones still to come as outlines,
and on the ticket that earns one, and on the live map only if its sharer
chooses (rules 14 to 16, and below). Since the maintainer's later decision
the bus also keeps the salamat received, the time on the map and a streak of
weeks, each a single number, with the week of the last trip to count the
streak from, and eight of the decorations come from them; the kept tickets
still add up none of it. `docs/ARCHITECTURE.md`, "Collecting", and "Rules
revisited" for what was changed to allow it and what was kept.

**Trips earn spare parts, which dress the bus, and a sharer may show it**
(October 2026, rules 17 to 19). Each decoration gives parts once, and a trip
that went somewhere gives 5 for at most 3 a day: every farmed trip would be a
bus on everyone's map that isn't one. `busTripPay()` and `busSettle()` are the
only things that add, and the day of the last trip that earned parts is the
one date kept for it. Parts are a drawn steel nut beside a number
(`partsTag()`), never coins and never named as money: they were *barya* until
riders might have thought real money was involved, and `test-thanks.js` fails
if barya, coins or buy appear on screen. Parts get the shop's accessories and
paint, presets only, never words or free colours; the decorations sharing
earns are trophies and never for sale.
"Show customized bus to riders" is off until switched on and asked only where there is
something to show: in My tickets, and when the first decoration or purchase
arrives, never on the tracking tab. While on, each position carries
`busLook()`, a paint digit and a letter per thing worn, kept on the trip's row
by `sql/13-bus-look.sql` in that shape only and gone with it; riders can tell
it is the same sharer's bus from trip to trip, which is why it is a choice.
A page against a database without that migration resends without the look
(`LOOK_SENDS`). A bus's popup and My tickets draw the bus moving through the
view of the place it is nearest (`rideSvg()`), at a fixed pace and never the
bus's speed (about 60 km/h to the eye, `test-pictures.js` section 8), and
still when the bus has gone quiet or is standing (`rideStand()`: two minutes of
its reports within 150 m of one place, worked out on the rider's phone, moving
or not and never how fast); the popup frames it closer than My tickets
does (`RIDE_FRAMES`). A backup is a file the
sharer saves or copies from My tickets and restores by file or paste, cleaned
like storage on the way in (`backupRead()`); "Start from scratch" deletes the
tickets and the bus. `docs/ARCHITECTURE.md`, "Dressing the bus".

**A rider can say a bus or a sighting is wrong** (October 2026,
`sql/15-say-wrong.sql`): "Not a real bus?" on the place line of a bus's popup,
"Wrong?" on each sighting. It is what Play's content rating means by
reporting, and it is fenced like salamat: a child of the bus row or the
sighting row by cascade, so it dies with them; a scrambled mark, never the
watcher id; a count for organizers only, beside Stop and Delete on the admin
page, never for riders or the sharer; and it never acts on its own, because the
call takes no key and a threshold would let one person take a real bus off the
map. Named `wrong*`, never `report*` or `flag*`. `db/13-say-wrong-tests.sql`
and `test-boot.js` section 16.

**A request nobody waits for is never sent.** supabase-js sends an `rpc()`
only when something awaits it or calls `.then`; a bare call is silently
dropped, which is how the wrong-direction pause never cleared its bus.
`test-boot.js` fails on a bare one.

**A reader can send a link to one bus**: `#b=` plus the bus's public id, which
every map already has, so the link reveals nothing and dies with the trip. It is
`sendBusLink`/`.buslink`, never anything called share. The same popup tells one
line about the town the bus is passing, from an optional fifth field on each
`CHECKPOINT` in `config.txt`.

**Every sighting is a glowing stretch on the strip** (October 2026): where
the bus someone saw probably is by now, between where the slowest and the
fastest past trip would be, counted from the place it was seen (the terminal,
for a "just left" post) using optional `TRAVEL` lines in `config.txt` (minutes
to each checkpoint, measured from the riders' chat, never logged by the app).
Without a row it stays where it was seen for one interval. It is a range drawn
under the pills, named in places and never in minutes; `test-strip.js` fails if
that code speaks of a time to come. Rows exist northbound only until southbound
has data. Live pills breathe. `docs/ARCHITECTURE.md` has why a stretch and not
a ghost bus. **Sightings are picked, never typed** (October 2026): direction,
place and time come from lists, and the board draws each post from those parts
with `sightingWords()`, never from the text that was sent. Free text anyone can
type and everyone can read is user-generated content on Google Play, which
then wants posting rules, a Report button and someone answering reports;
`test-strip.js` fails if a typing box or the sent text comes back.

**The app keeps exactly six things between visits**, and the Android app a
seventh (the share key, so a sharer is not asked for the PIN every trip after
Android closes the app; never in a browser, which may be shared), all on the
device and all named in the privacy panel: whether this phone has been shown around (the
guide or the tour), the light/dark/system theme choice, the reader's saved stop, the tickets a
sharer chose to keep, your bus (its counts, its parts and what it wears), and
the trip in progress while it runs. A backup is those tickets and that bus in
a file the sharer holds, never another stored key. Adding one means editing that panel in the same
commit — the panel is the promise, not the code. `test-boot.js` section 10 makes that mechanical: it fails if the set of
`localStorage` keys the app writes stops matching the set the panel names.
Per-visit switches go in `sessionStorage` for exactly this reason — the
location dot, the saved-stop card's "buzz once" switch, and its road shown
on the sharing tab.

**There is a tour, one per tab** (October 2026): a minute each, on the real
page, opened from the guide, from a quiet button at the foot of each tab
(hidden while a trip is on, when a tour cannot run), from
`#tour` or `#tour=share`, and once from a "New here?" note on a first visit.
The WALK block in `index.html` dims everything but one control, says one short
thing about it, and draws a practice bus and a practice stop in place of the
real ones through `busesNow()`; the reader's own stop, filter, tab, chosen bus
and map view come back on the way out. A clear layer takes every tap, and every
function that sends or stores refuses while `WALK` is set anyway, so a practice
salamat or Start can never fire. The first-visit note is answered under the
guide's own `wt-guide-seen` key, so the six remembered things stay six. DOM
names are `walk*`, never `tour`, `tooltip` or `onboard`: filter lists hide
onboarding libraries by those names, and a hidden bubble over a dimmed page has
no way out. `test-tour.js` holds the steps, the words and the refusals;
`test-boot.js` section 13 runs both tours on the booted page.

**Say it in a few words** (October 2026). The maintainer's rule: assume riders
will not read a paragraph, least of all at a bus stop or mid-trip. Every
message, prompt, hint and button says one short thing, with no reasons
attached ("Location is off. Turn it on, then tap Start.", "Show customized bus
to riders?"); the reasons live in the guide's "More" folds, in the privacy
panel and in these docs. The privacy panel is the one place that stays long,
because it is opened on purpose and it is the promise. A new feature's words
get the same treatment before they ship. A second round (October 2026, "the
app looks unnecessarily too wordy"): the sharing tab before a trip is its
labels and nothing else ("Direction", "Bus number (optional)", Start,
"Tutorial", "My tickets"), and what a sharer needs once a trip is on is said
then, in **the trip's first window** (`openTripNote()`): a picture and a line
for tapping Stop, or the saved stop that stops it, and for the screen, or the
app with Google's badge; for a sharer's first three trips only, counted by
`wt-bus`, never a resumed one. A third pass, from a look at every screen:
the Tutorial buttons hide while a trip is on (a tour cannot run over one); a
bus's popup has one big button, salamat, with "I'm on this bus" and "Send a
link" as a row of words under it, and is as wide as the map leaves beside
the zoom buttons (`popupWidth()`: a fixed 240 px ran 38 px off a 360 px
phone's map); with buses live the line under the headline is for screen
readers only, and nothing under the chips asks for a tap; on board the stop
card's line is the next stop alone; the sightings card says "Seen a bus? Post
it" and the organizers' link "Admin". The empty map's card inside hours is a pill
with its line alone, "Nobody is sharing right now", beside the sharing tab's
grey "Not sharing" dot: its I'm on the bus button went too, and the bus glyph
it had, which on a map where a bus means a live one said the opposite. "No
buses live" has nothing under it inside hours unless a sighting places a
bus. `docs/ARCHITECTURE.md`, "The trip's first window".

**The guide says it in a line and shows it in a picture** (October 2026).
`how-to.html` was paragraphs; it is now a line, a drawing and a "More" fold per
idea, with the two tour buttons and a list of links at the top. A new feature
gets the same: one line, one picture, its caveats folded.

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
itself: next trips, the bus asleep (*tulog pa*) or waking, or, inside hours,
that nobody is sharing right now.

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
quiet; illustration is for when there is nothing else to show. The saved
stop's card is one exception, by the maintainer's decision (October
2026, above), and the trip's first window the other (`tripNoteSvg()`), by
the same ("Add art if needed"). Closed, the
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
The other plugins only carry calls across too: the back button goes to
`appBack()`, which closes what is open and otherwise puts the app in the
background, never closing it, so a trip goes on; a backup and a bus link go to
the phone's share sheet through `appSendFile()` and the Share plugin, because
a WebView has no `navigator.share` and drops downloads silently. A browser API
that works in Chrome may do nothing in the app, so a feature that saves a
file, shares, vibrates or opens a link is tried in the app before it ships.
**It goes out through Google Play** (October 2026). Play keeps the app's
signing key and the repository's secrets hold only the upload key, which
`android-release.yml`, run by hand, checks before it builds the bundle; no
copy is handed out as an APK. The site offers it in one place only, `renderAppLine()` in the trip's
first window: in an Android browser, once a trip is on (the maintainer's call,
October 2026; going for it ends the page's trip first, `leaveForApp()`, so the
app's trip is not a second bus beside it), once `ANDROID_APP_URL` in
`config.txt` names it, with Google's badge where that is on Google Play or the
tester page and words alone anywhere else, and never inside the app, on an
iPhone or on the tracking tab. `#privacy` opens the privacy panel, which is Play's privacy
policy for the site and the app alike, naming the app as Play lists it
("Fibi: Bus Tracker PH"; "Fibi" under the icon). `test-boot.js` section 15
holds both; `docs/ARCHITECTURE.md`, "The Android app", has why Play and not an
APK link. **The website is the app**: a merge to `main` reaches the app's
users with no review by Play, so the Play answers in `mobile/README.md` (data
safety, permissions, the location declaration) change in the same commit as
anything that changes what leaves a phone, exactly as the privacy panel
does.

**Colours come in fill/ink pairs.** `--maroon`/`--brand-ink`,
`--gold`/`--gold-deep`, `--lost`/`--lost-ink`, `--mine`/`--mine-ink`. The first of each pair is a
background with white or near-black text on it; the second is the same colour
used as text. They are nearly identical in the light theme and completely
different in dark, so pick by what the colour is doing — painting a shape, or
spelling a word. All seven pages carry their own copy of the token block and
`test-boot.js` fails if they drift.

**Everything else is a token too** (October 2026): seven text sizes, three
corners, three heights, three speeds and two typefaces, defined in
`index.html`'s `:root`. `test-tokens.js` fails if `index.html` or `admin.html`
uses a literal size, corner, shadow, speed or typeface anywhere, including in
strings a script builds markup from; a deliberate exception goes in its list
with the reason. The type is Barlow Semi Condensed for labels, buttons, names
and numbers and Barlow for sentences, self-hosted in `assets/fonts/` and
inlined into the five static pages. The icons are one drawn family in a sprite
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
in the sharing phone's memory only and it dies with the tab. A rider's page keeps
one place and one time per bus on the map, in memory, to tell a standing bus
from a moving one (`rideStand()`): overwritten at every poll, dropped when the
bus leaves the map, never sent or stored. Two things outlast
a trip, both on the sharer's own phone: a kept ticket, only on a tap, holding a
date and two checkpoint names, and your bus's counts, numbers and place names
with no list of dates (only the week of its last trip and the day of its last
paid one, each overwritten). Neither holds a position or a time, so neither
can grow into a trail. The trip in progress (`wt-trip`) holds one start time and two numbers
on the chain, overwritten, and is gone when the trip ends.

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
static pages, never linked from a font service. (The Android app compiles Capacitor and its five plugins
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
reported. `star` is deliberately absent — it is inside `start`. Nor anything
named like a "get our app" banner, which a list behind Brave's "open in app"
blocking hides by name: no `app` beside `banner`, `install`, `download`,
`get`, `open` or `promo` (section 8 again). The line that offers the Android
app is `#gpsAppLine` for that reason.

**Reads do not write.** Cleanup happens in `_sweep()`, called only from writes.
An earlier version ran a DELETE on every read and was documented as fixed long
before it actually was.

**Tests extract the shipped code.** Nine of the JavaScript suites pull functions
out of `index.html` by comment markers and run them, so a passing test cannot
drift from the app; the tenth, `test-tokens.js`, reads the shipped styles. Keep the markers intact when editing those regions.

## Route-specific content

Everything adapts from `config.txt`, including the optional one-line story on
each `CHECKPOINT` — facts about Cavite, so a fork writes its own or leaves them
off, and the optional sixth field picks each one's drawn mark from a library of
kinds of place. The route's name on the boards does not come from config: it is
the words in each page's `header .route` (and in `tools/app-icons.html`, for
the link-preview picture), so a fork edits those, runs `tools/make-pictures.js`
and re-runs `tools/render-icons.sh`. The empty map's scene is this route's own
view, Taal from the Tagaytay ridge, in `sceneSvg()`: a fork redraws its ground
or keeps the volcano. So is the icon's front ticket, in `make-pictures.js`. The ticket's views are by kind of place, so they follow
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

The guide also redraws the sharing tab in trip mode, the salamat ticket, a
bus's popup (`busPopupHtml()`) and the saved stop's card, so changing any of
them means changing `how-to.html` in the same commit. The card's picture is
drawn into the guide, the flyer and the briefing by `tools/make-pictures.js`;
on paper the flyer and the briefing draw it small, beside the count, because
full width it pushed both onto another sheet. The tour points at the real page instead of
a copy, so it cannot go stale that way, but a step whose element is renamed or
removed rings nothing: `test-tour.js` fails if a step's selector stops matching
the page.

**The showcase video cannot go stale that way, but it can go out of date.**
`tools/render-video.sh` films the real `index.html`, so it never shows a
screen the app does not have. Its story, `tools/video/film.js`, taps the
tracker's controls by their ids and classes and names this route's stops, so
changing those screens means re-rendering it; a control renamed or moved
off the screen makes that step fail with its name rather than tap something
else. Every request the page makes is answered by the script, never by the
database, and the page is the commit's but for its pace: the saved stop's
picture glides for one of the film's half-second polls, at an even pace,
and the sharing phone sends its position that often, so the buses come on
smoothly (`filmPage()`). It carries no "demo" label and one caption says coins, both the
maintainer's decision (October 2026), and its only sounds are the
interface's, made by `tools/video/sounds.js`. **Three captions, one for
each part of the story, and the app's own words say the rest** (the
maintainer's choice, after a viewer of the first cut, which captioned every
step, was still reading when the screen changed). Under each, nothing
happens until it can have been read: the first tap is timed from it
(`read()`), and `rehearse()` stops the render if a tap, a camera move or a
scroll lands inside its reading time. **It is the app's video too**
(October 2026): the icon's coral, Play's feature graphic's "Nasaan na ang
bus?", and **one ending with the poster's two ways in**, the maintainer's
call over three endings picked at render time: the tracker's QR code for
watching, and the app's, for `ANDROID_APP_URL`, with Google's badge and
trademark line, for sharing with the phone locked, so a change there is a
render, not another cut. The sharer's phone is filmed as the app shows the
page (Android's plugins stood in for, its status bar), the other rider's as
a browser does. **The trip ends as the app ends one**: the
road comes up to the stop at the bus's pace and the app asks "Getting off
here?", since the road on board is drawn at its real length and a
time-lapse would make it jump. **There is an animated cut too**
(`tools/video/motion.js`, `--motion`, October 2026, the maintainer's ask):
drawn scenes and kinetic type and no screens, its pictures the app's own
drawn afresh each frame (the stage carries the PICTURES block), its words
the film's captions, the poster's and the app's, and the film's end card.
It films nothing, so a changed screen does not date it; a changed picture
or word in those blocks does, and it is a minute and a half to render.
`docs/ARCHITECTURE.md`, "The showcase video".

**That now costs three files, not one.** `flyer.html` and `for-operators.html`
each redraw the tracker's screen the same way, showing four buses live because
an empty map is what the tool looks like when nobody has heard of it. Every
string in those drawings is one the app would really print — the headline
comes from `renderBuses()` (the line under it is for screen readers only
while buses are live, so the drawings leave it out), the chip labels from
`busPlace()`, the checkpoints and distances off `config.txt`. Change either function and all
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

`poster.html` carries a third crop of the flyer's screenshot, around Kawit and
Imus with the flyer's two buses there, in a tile of the crop's own shape, and
labelled an example like the flyer's screen. A fork recrops it too.

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
