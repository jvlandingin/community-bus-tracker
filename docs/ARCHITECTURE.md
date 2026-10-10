# Architecture

## Stack

- **Hosting:** Netlify (static). Free tier. Live at
  `https://community-bus-tracker.netlify.app`; the admin page is
  `/admin.html`, which Netlify also serves as `/admin`.
- **Backend:** Supabase (Postgres + PostgREST RPC). Free tier.
- **Map:** Leaflet 1.9.4, vendored locally. Tiles from CARTO's Positron and
  Dark Matter basemaps, each split into its `nolabels` and `only_labels`
  layers. Since late August 2026 CARTO watermarks tiles fetched without an
  API key; the key is free, lives in `config.txt` as `CARTO_API_KEY`, and is
  deliberately optional — no key means watermarked tiles, not a broken map.
- **Supabase client:** supabase-js 2.110.8, UMD build, vendored locally.
- **Typeface:** Barlow and Barlow Semi Condensed (SIL Open Font License),
  served from `assets/fonts/` and carried inline by the three static pages.
  See "The look" below.
- **App:** five HTML files, no build step, no framework. `index.html` is the
  tracker, `admin.html` the operator page, `how-to.html` a static guide reached
  from the ⓘ in the header, `flyer.html` the adoption flyer for riders and
  `for-operators.html` a briefing for the bus company. None of the last three
  loads anything over the network: every figure on them is drawn in HTML and CSS from
  the same design tokens as the tracker. The two adoption pages also carry
  `@media print` rules — the flyer prints as one A4 poster, the briefing as a
  few-page document — and `tools/render-flyer.sh` drives headless Chromium to
  produce those plus a chat-sized PNG. It is run by hand, never at deploy time.
- **Config:** a plain `config.txt` the user edits on a phone. It now holds no
  secrets at all: only the Supabase URL, the anon key, the public route slug,
  the source code URL, the checkpoints and the stops. Because it holds nothing
  secret it can be committed, which is what allows a host to deploy straight
  from the repository.
- **Licence:** AGPL-3.0-only. `SOURCE_URL` in config makes the app show a link
  to its own source inside the privacy panel, which is how the network clause is
  met in practice.

Folder that gets deployed:

```
community-bus-tracker/
  index.html          <- the tracker
  admin.html          <- the admin page
  how-to.html         <- the guide
  flyer.html          <- the rider flyer, also the printable poster
  for-operators.html  <- the briefing for the bus company
  config.txt          <- your route's own, holds no secrets, safe to commit
  assets/vendor/      <- leaflet.js, leaflet.css, supabase.js, images/
  assets/fonts/       <- Barlow, five cut-down woff2 files and their licence
```

Deploys come from git: Netlify builds the repository on a push to `main`, and
`netlify.toml` runs the nine dependency-free JavaScript suites as the build
command, so a failing one cancels the deploy. Nothing is compiled and nothing is
installed. There is deliberately no `package.json` at the root, because it
would make Netlify run `npm install` and publish `node_modules` alongside the
site. The one in `mobile/` is for the Android app and is outside that: Netlify
only installs from the base directory, so it never runs at deploy time.

**One line of the published site is no longer the committed one**, as of
September 2026. `tools/write-basemap-key.js` runs first and writes the CARTO
basemap key into `config.txt` from the `CARTO_API_KEY` environment variable in
Netlify's build settings. The point is narrow and worth stating exactly: it
keeps the key out of a public repository, where bots trawl for exactly this
kind of thing, and it lets the key be rotated without a commit. It does **not**
make the key secret from users — `config.txt` is fetched by the browser, so the
key is one devtools panel away on the deployed site. Anyone who wants that would
have to proxy every tile through a function, which ties the project to one host,
spends that host's bandwidth on tiles, and is a different decision from this
one. Unset, the script is a no-op and the map is watermarked, so a fork
deploying straight from git still works. Everything else published is the
repository exactly as committed.

It used to be drag-and-drop, which replaced the entire site in one go, so all
four items above had to be in the folder every time. Deploying index.html alone
broke the site, and a deploy without `assets/` produced "supabase is not
defined". That is why both pages still detect a missing vendor file and say so
in plain words: git deploys make it far less likely, not impossible, and the
check costs nothing.

**Netlify serves `admin.html` at `/admin` as well**, and can redirect between
the two. The admin page builds the sharer link from its own path, so that
mattered: stripping the literal string `admin.html` did nothing on `/admin` and
produced a link to the admin page, with the share key in the fragment, that
looked entirely plausible in a group chat. `trackerBase()` now strips either
form. Anything else that derives a URL from `location.pathname` has to assume
the same.

## Access model

Three separate credentials, deliberately not interchangeable.

| | What it is | Where it lives | What it unlocks |
|---|---|---|---|
| Route slug | public name, e.g. `wonderful-mendez-ayala` | config.txt, shipped publicly | reading positions, sightings, settings |
| Share key | secret | the link posted in the group chat | putting a bus on the map |
| Admin key | secret, stored only as a salted SHA-256 hash | the maintainer's notes, nowhere else | the admin page |

**Watching is open to everyone.** This changed in July 2026. Gating reads never
added real security, since anyone with the group link had the key, and it meant
rotating the key cut off watchers as well as sharers. The honest consequence,
which the app and the FAQ both now state plainly: anyone who opens the site can
see live bus positions, and rotating the key no longer changes that.

It had a consequence nobody traced at the time. `get_positions` returned the
sharing session ids, and `clear_bus_position` takes a session id and no key,
on the reasoning that the id was unguessable and therefore was the credential.
Public reads made it guessable by simply asking, so any visitor could clear
every bus off the map on a loop. `get_positions` now returns an unreversible
per-route hash instead, and only `admin_list_sharers`, behind the admin key,
returns real ids. See `docs/DATABASE.md` for the full reasoning. **When an
access rule changes, re-read every rationale that depended on the old one** —
the decision to open reads was right, and it still invalidated a sentence about
a different function.

**Writing still needs a key, enforced server-side.** All reads and writes go
through `SECURITY DEFINER` Postgres functions. The tables have RLS enabled with
no policies, so the public anon key cannot touch them directly. The admin key is
verified inside every admin function against a stored hash; the admin page being
publicly reachable is therefore harmless.

**Key rotation has a grace period.** Rotating moves the old key to `prev_key`
with a 4 hour expiry. A session that was already sharing keeps working on the
old key until then; a new session cannot start on it. This was a deliberate
choice: nobody gets cut off mid-trip.

## Key decisions and why

**Polling, not Supabase Realtime.** Realtime would need an RLS SELECT policy
exposing positions to the raw anon key. Reads poll every 6 seconds instead. At
one-route scale the delay is imperceptible. If concurrency ever exceeds ~200,
revisit with a realtime channel plus a matching security model.

**One question above the fold, everything else folded.** The tracker answers
"where is the bus" in its first screenful and puts the rest behind native
`<details>` — operating hours, the sightings board, and the legend and notes
under the map. `<details>` rather than a scripted accordion because it is
focusable, keyboard-operable and announced for free, and still opens if the
script never runs. The rule for what may fold: only a second question. The
answer itself never folds, which is why the sightings board opens itself when
no buses are live (see `revealSightings` in `index.html`) — with nobody sharing
GPS it stops being a footnote and becomes the only answer available.

**Colours come in fill/ink pairs.** `--maroon`, `--gold`, `--lost` and
`--mine` are fills, with white or near-black text sitting on them.
`--brand-ink`, `--gold-deep`, `--lost-ink` and `--mine-ink` are the same
colours used *as* text. In the light theme each pair is nearly the same value,
which is why one token did both jobs for a year. In dark they diverge
completely — maroon reading on a near-black card is 1.7:1 — so a new use of any
of them has to be chosen by what the colour is doing: painting a shape, or
spelling a word. All five pages share the token block, and `test-boot.js` fails
if they drift apart.

`--mine` is the newest and is a fourth pair rather than a reuse of one of the
other three on purpose: gold and maroon are already spelling "which direction"
and `--lost` is spelling "stale", so a saved stop — which belongs to the person
reading rather than to the route — needed a colour that was not already saying
something else.

**Dark theme, because half the service runs after sunset.** The southbound
window closes at 8:00 PM. `prefers-color-scheme` swaps the token block, and
`basemapUrl()` swaps Leaflet's tiles to CARTO's `dark_all` — the same provider
already disclosed in the privacy panel, so no new third party. The tiles are
the one part CSS cannot reach, and a light map inside a dark page is the exact
glare the theme exists to prevent. `.leaflet-container` is themed too, so a
slow or blocked tile load does not leave a bright panel mid-screen.

The reader can override the device: the ☀/☾/◐ control in the tracker's header
cycles light, dark and follow-the-device. Three states rather than two because
a two-state toggle has no way back — one tap and you are overriding your own
system setting permanently, with no control that says "never mind".

Three details make it work:

- **The choice is stored, so the palette must be selectable two ways.** Each
  page states its dark values twice: under `@media (prefers-color-scheme: dark)`
  scoped to `:root:not([data-theme="light"])`, and again under
  `:root[data-theme="dark"]`. CSS cannot express that as one rule without
  `light-dark()`, which is too new for the phones this has to run on — an older
  browser would drop every token at once and render something unreadable rather
  than merely wrong. `test-boot.js` asserts the two copies stay identical.
- **A tiny inline script in `<head>` applies the stored choice before anything
  paints.** Loaded any later and the page flashes the other theme first, which
  is worst at night, which is when it matters. It is the only script in the
  head of any of the three pages, and it is deliberately three lines.
- **The control lives only on the tracker**, but all three pages read the
  preference, because they share an origin and therefore `localStorage`. A copy
  in the guide and admin headers would be two more things to look at for no
  more control.

The preference is the second of the four things this app keeps between
visits, after the
guide-seen dot. Both are named in the privacy panel — the panel used to claim
nothing was kept once you close the page, which the guide dot had already made
untrue.

**No location history, by design.** `bus_positions` holds one row per sharing
session, upserted in place. There is no trail table. This is the single most
important property of the system: it means the tool cannot be used to review a
driver's speed, breaks, or route, because the data to do so does not exist. Do
not add a history table without a very deliberate conversation about it.

Everything added since has been checked against this. The wrong-direction guard
tracks route progress **in the sharing phone's own memory only**, never sends or
stores it, and it dies with the tab. The reader's saved stop (August 2026) is
the same shape of decision: it is a location, it belongs to a *watcher* rather
than a bus, and it is kept in `localStorage` and read only by the device that
wrote it. No request carries it and no column exists for it.

**Saying salamat is present tense only, and enforced by the schema.** August
2026 let a reader tap a bus to thank whoever is carrying the phone. It was
checked against the rule above and it is the case where the check changed the
design: an appreciation *total* per sharer is exactly the driver metric that
`for-operators.html` promises cannot be produced, so there isn't one. A count
belongs to a single trip and dies with it, and `thanks_now` is a child of
`bus_positions` by foreign key with `ON DELETE CASCADE` — so it is not swept
away when the trip ends, it *cannot outlive it*, and no future code path has to
remember the table exists. Two consequences worth knowing before touching it:
the count is returned only on the caller's own row, because a number beside
every bus would rank the buses on the road in front of the riders choosing
between them; and the direction-guard pause calls `clear_bus_position`, so a
sharer who is asked which way they are going comes back with the count reset.
That is the cascade being honest rather than a bug — the row really was
deleted. Full reasoning in `docs/DATABASE.md`.

**The watching count is present tense only.** July 2026 added the one thing in
the system that observes watchers at all: the tracker page beats every 60
seconds with a random per-tab id, and the admin page can see how many devices
have the map open right now. It was checked against the rule above and built to
stay on the right side of it — rows are deleted three minutes after the last
beat, so there is no daily total, no peak, no yesterday, and nothing to
subpoena. **A watching count is a live gauge, not a log.** Turning it into a
graph over time means adding a history table, and that is the conversation the
paragraph above demands, not a small follow-up. Full reasoning, including why
nothing lists watcher ids and why the endpoint needs no key, is in
`docs/DATABASE.md`.

**Settings live in the database.** Operating hours, headway, expiry times and
the sharer cap moved out of config.txt in July 2026. The company's own poster
says information "may change anytime without prior notice", so a schedule change
must not require a redeploy. The app re-reads settings every 60 seconds.

**Reads do not write.** An earlier version ran a DELETE on every read. That was
documented as fixed long before it actually was: the deployed SQL still swept on
read until the July 2026 migration. It is now genuinely true. Cleanup happens
inside `_sweep()`, called only from writes.

**No third-party code or fonts.** Leaflet and the Supabase client are served
from the site itself, and the UI uses system fonts. CARTO map tiles are the only
remaining third party, and that is disclosed to users inside the app. Do not
reintroduce CDN links.

## Client-side guards

Three ways a sharer can broadcast wrong information without meaning to. All
three ask rather than decide.

**Wrong direction.** The sharer picks a direction by hand, and picking the wrong
one is the most damaging mistake the tool allows, because commuters then wait
for a bus moving away from them. Progress is measured by projecting the position
onto the **checkpoint chain** (the comment above `buildRouteChain` in index.html
explains why not the stop list: the stop order is merged from two posters and
is not strictly geographic, which reads as kilometres of reversal on a perfectly
normal trip). Thresholds: 3.5 km of net travel against the chosen direction,
compared against the furthest-along point in a 25 minute window, held for 60
seconds, with no verdict in the first 4 minutes. On firing, publishing pauses,
the bus is removed from everyone's map immediately, and the sharer is asked.

Measured on simulated trips over the real stops with GPS noise: never fires on a
correct trip at 25, 15, 8 or 5 km/h, and catches a wrong direction after roughly
4 to 7 km, about 11 to 20 minutes. The threshold is deliberately high because a
false accusation aimed at a driver costs more trust than a late one.

**Long idle.** If the bus has not moved 250 m in 20 minutes, the app asks "still
on the bus?" and does nothing on its own. A real bus can sit in Makati traffic
that long.

**Trip finished.** Within 500 m of the destination checkpoint and stationary for
5 minutes, the app asks, and stops by itself after 5 more minutes with no
answer. This is the only automatic stop, because a bus parked at its own
destination has finished by definition.

## Order on the tracking tab

August 2026. The tab used to open with the headline and the direction filter,
then the strip, the chips, the saved stop and the map — words first, picture
after. It now reads: **progress strip, map, saved stop, headline, direction
filter, bus chips**, with the data statement moved from above the card to the
foot of the tab.

The reasoning is that the strip and the map are the answer to the question the
page was opened to ask, and everything that used to sit above them was a
description of them. The headline is the chip list's empty state written out in
words (`renderBuses()` writes both from the same branch), so it belongs beside
that list rather than at the top of the page; the filter moves the strip, the
map and the list together wherever it is placed, so its position is free. The
data statement is a standing promise about the whole tab, not a warning about
any one part of it, so it reads as a footnote — the operator's notice bar stays
at the top, because that one is time-sensitive and only ever appears when
something has actually been posted.

**The cost, stated plainly.** `No buses live` carries the operating hours and
the next departures when nothing is on the map, and it is now below the fold on
a phone: an empty map explains itself a scroll later than it used to. It is
still a live region, so a screen reader announces it from wherever it sits.
Hoisting the headline above the strip only when the count is zero would buy
that back, and is the obvious follow-up if the empty case turns out to be the
one people are actually looking at.

October 2026 paid most of it back without moving anything: an empty map now
says why on the map itself, where the reader is already looking (see "The
empty map says when" below). The headline still says it too, a scroll later.

A hairline above the headline marks the split: over the line is where the buses
are, under it is what the app has to say about them.

**This is one of the changes that costs four files.** `flyer.html`,
`for-operators.html` and `how-to.html` each redraw this screen by hand, so all
three were reordered in the same commit, and the guide's five numbered callouts
were renumbered and re-measured against a real 430 px render — they are
percentages of a figure whose rows just moved.

## The map

September 2026. The map used to be CARTO's stock tiles with grey dots for
the stops and an emoji for each bus, which is what any map with pins on it
looks like. Four changes, none of which adds a request, a stored thing or a
third party:

- **The basemap is two tile layers from the one provider.** CARTO serves
  its Positron and Dark Matter styles as `nolabels` and `only_labels`
  variants. The base goes in Leaflet's own tile pane; the labels go in a
  pane above the stop marks and below the bus badges, so place names float
  over what the app draws instead of being painted over by it. Same host,
  same attribution line, and the sentence in the privacy panel is still
  exactly true.
- **The base tiles are faded** by a CSS filter on the tile pane alone, so
  the livery is the only strong colour on the map. The label pane is
  separate and stays crisp. Dark fades less, because it is already dim.
- **Stops are pips and checkpoints are stations.** The 71 stops are small
  paper-filled circles with a maroon ring, hidden below zoom 12 by a class
  on the map container (`data-z`) rather than by adding and removing 71
  paths. The checkpoints are larger marks with the strip's own short names
  beside them as permanent tooltips, on the side away from their neighbours
  along the chain so MENDEZ and TGY, a thumb apart at the whole-route zoom,
  do not collide. Both are coloured by CSS class, not by Leaflet options,
  so they follow the theme.
- **The bus badge is drawn.** An inline SVG bus, white on the disc, with
  the windscreen and lamps cut in the disc's own colour. 🚌 was a different
  picture on every phone and a blurry one on most. A live badge breathes
  with a ring in its own colour; stale ones hold still; the reduced-motion
  blanket flattens it.

**The basemap needs a key now, and that is a standing risk.** CARTO started
watermarking keyless tiles in late August 2026, with no warning to anyone
relying on them, and the deployed site carried the watermark until a key was
added. The key is free within a fair-use allowance and goes in `config.txt`,
which means it is published: unlike the Supabase anon key, which unlocks
nothing because the tables have RLS with no policies, a copied CARTO key
spends this deployment's tile allowance. `warnIfNoBasemapKey()` says so in
the console rather than on screen, because it is the maintainer's problem
and riders cannot act on it.

The broader lesson is the one worth keeping: **the basemap is the only part
of this app that somebody else can change the terms of.** Everything else is
vendored, self-hosted, or in a database we control. A drawn basemap built
from open data we ship ourselves would close that gap, and was prototyped —
see the journal entry for 2026-09-15 for what it looked like and why it is
not here yet.

**There is deliberately no route line.** One was built and taken out the
same day: the road is not known precisely enough to draw, a straight line
between checkpoints put the route across water, and a line that is wrong is
worse than none — riders would read a bus beside it as off its route. If
one is ever wanted, it needs real road geometry that somebody has checked
on the ground, not a router's guess.

The three static recreations carry the same checkpoint marks and the same
drawn badge, so they still match the app. Their basemap photos still show
the old grey stop dots, because the photo is a photo; recapturing it needs
a browser that can reach CARTO and is the one part of this that could not
be done in the same commit.

## The empty map says when

October 2026. Nobody sharing is what most visitors see, and a blank map reads
as a broken one. `renderMapNote()` lays one card over the map whenever no bus
is live, in one of four voices, decided from the operating hours alone:

- **inside operating hours**: nobody is sharing right now, with the last
  trips possibly still on the road if the window has just closed, and a
  button to the sharing tab — the empty map is also the best moment to ask
  someone on a bus to be the first;
- **closed in the middle of the day**: "No buses until 3:20 PM", the earlier
  of the two directions' next departures, with both listed under it;
- **closed at night**: *Tulog pa ang bus* — the bus is asleep — with the
  first trips of the morning;
- **within the hour before the first trip**: *Gising na ang bus*, waking up.

It is not drawn until the first positions answer has landed, so a page that
is still loading never claims the map is empty, and it carries nothing the
page did not already know.

**The three closed voices are pictures** (October 2026, the art direction's
fourth step). The card becomes the start of the line, a provincial coach
parked on the Tagaytay ridge above Taal Lake, at the time of day it is: asleep
under a moon with a street lamp on, its lights coming on at dawn, parked in the
sun through the midday break. The words sit on the picture's own sky. One
drawing, three sets of colours, made by `sceneSvg()` in the tested PICTURES
block; `mapNoteKind()` decides which from the clock and is tested at its
edges. Inside operating hours the card stays the plain one with the button,
because then the map underneath is still worth seeing. The coach is generic on
purpose, cream with the app's maroon and gold and no lettering, because a copy
of an operator's livery would make the tool look official. The scene is this
route's view, so a fork either redraws its ground or lives with a volcano.

The same scene, drawn by `tools/make-pictures.js` with the same code, is the
cover of the guide (dawn), the flyer (dawn) and the briefing (midday). The
flyer's cover pushed its link off the foot of the chat-sized picture
`render-flyer.sh` makes from the top of the page, so that picture is taller
now; the script's header says what to measure.

The folded hours card answers before it is opened, too: a status line
(departing, last buses still on the road, or closed until a time) and the
day drawn as a band of the departure windows with a mark at now.
`serviceState()` decides the line and is tested to agree with
`withinWindows()` — which decides the headline — at every minute of the day,
because a card saying the last buses are on the road over a headline saying
the service has stopped would leave a rider believing whichever they read
second.

**Two wrong times were found on the way.** The empty headline named the day's
first departure whatever the hour, so every afternoon between the windows it
sent riders home until tomorrow's 6:00 AM with a 3:40 PM trip due;
`nextTrip()` now looks forward from now. And the map's own sentence first
named the northbound time whatever the southbound one said, which is the
later bus whenever the southbound window opens first; `firstNextTrip()` takes
the earlier. Both are in `test-hours.js`, and the first one fails on the old
code.

## Progress strip

**It is drawn as a line map** (October 2026): each direction a solid line in
its own livery colour, a station at every checkpoint with the terminals a size
bigger, and the map's drawn bus as the pill instead of 🚌. Two pale rails with
emoji on them read as a progress bar rather than as a route. The stations sit
at the same evenly spaced positions as the names between the lines, so nothing
below about spacing changed. A reader with a saved stop sees it as a station
of its own on both lines, in their colour, placed by `busPlace()` exactly as a
bus at that spot would be, so a bus coming down the line visibly closes on it
— on the tracker's strip only, because the person on the sharing tab is on a
bus, not waiting for one.

The strip snapped each bus to its nearest checkpoint until July 2026, so a bus
anywhere between PITX and One Ayala sat on the PITX tick until it jumped the
whole 6 km leg at once. The pill now sits at its true fraction of the leg.

Labels remain **evenly spaced on purpose**. True distance spacing would put
MENDEZ and TGY about 40 px apart on a phone and the labels would collide. So
distances between labels are not to scale, but a bus's position relative to them
is honest. The legs are very uneven (Mendez to Tagaytay 4.8 km, Imus to PITX
15.5 km), so a bus crossing CAVITEX looks slow. The fix, if it matters, is
adding a checkpoint in the long gaps (Kawit is the obvious one), which is a
config.txt edit needing no code change.

Two pieces of the strip's geometry are load-bearing and were both wrong until
July 2026. `.ticks` must stay taller than a `.tick`: it was pinned at 26 px
against 29 px of content, so every label overflowed into the southbound track
below and the southbound bus badges rendered on top of the words. And the label
type has to leave a gap between the two longest neighbouring names — at the old
8.5px/.04em, MENDEZ and TGY met at exactly 0 px and read as one word.

That second one is no longer a fixed number, because it cannot be: how many
labels there are and how long they are are both `config.txt` decisions, so any
size hardcoded in CSS is wrong for somebody. `fitTicks()` measures the rendered
strip and steps `--tick-fs` down from 8 px to 6 px until neighbours clear each
other, then, if 6 px still is not enough, drops every other label and keeps
every mark. Adding Kawit — an eighth checkpoint — is what proved this was
needed, and it now costs nothing.

**The strip ships twice**, as of August 2026: on the tracker, and on the
sharing tab while a trip is live. A sharer's own tab says "Sharing live"
whether or not a single byte reached anybody, so before this there was nothing
on it that could tell working from broken — and the guide had been drawing a
strip inside the sharing card since long before the app did it. Three
consequences worth knowing:

- **One function draws both.** `renderStrip()` takes the container, so
  everything it writes into is found by class (`.pills.nb`, `.ticks`, and
  `data-i` on each tick) rather than by id, which can only name one of them.
  `#ticks` survives on the tracker's copy because `test-boot.js` waits on it
  to decide the page has booted.
- **The sharing tab's copy ignores the direction filter.** Someone who left
  the tracker filtered to Northbound and then shares a southbound trip would
  otherwise watch their own bus fail to appear, and would be right to conclude
  the app was broken.
- **Your own bus is ringed, and the server says which one it is.**
  `get_positions` has taken `p_self` and answered with `is_self` since
  `sql/04-session-id-privacy.sql` — it was built for the duplicate-sharer
  warning, and the tracker now passes it while sharing. Nothing is guessed
  from coordinates, which would go wrong exactly when it matters: two buses
  in the same place. Clustering ORs the flag, so two people sharing one bus
  get one pill that is correctly theirs. The mark is a ring in the live
  dot's green rather than a different fill, a wider pill or a `YOU` label:
  gold and maroon are carrying the direction, and at 390 px a pill that
  grows in either dimension lands on its neighbour or on the direction
  label. Because that leaves colour doing the talking, the line under the
  strip names it in words, and the tracker's own colour legend gains a row
  saying the same — shown only while sharing, since a legend for a mark
  nobody can see is noise. The flag is dropped and the strips redrawn the
  moment sharing ends, in `setShareUI()`, so a ring can never outlive the
  trip it describes.
- **It cost the biggest polling saving in the app.** A sharer sitting on the
  sharing tab used to skip the positions feed entirely — roughly 40% of a
  sharing phone's traffic over a trip. A strip fed by nothing is worse than no
  strip, so the skip became a throttle: `shouldPoll()` lets that case through
  once every 18 seconds instead of every 6, keeping two thirds of the saving.
  A sharer is watching for reassurance, not for a countdown. Both feeds pass
  their own last-fetch time, so each is throttled against itself, and the
  strip is refetched and re-measured at the two moments it becomes visible
  (`refreshOnbusStrip`) rather than waiting out an interval — a hidden strip
  has no layout, so `fitTicks()` cannot size its labels until it is on screen.

**The whole board can be switched off**, per route, from `admin.html`
(`sightings_enabled` in the settings JSON). Off hides the card, the composer,
the ghost markers, the legend row and the paragraph in the privacy panel, stops
the 15-second poll entirely, and hides the guide's sightings section too. It was
switched off during the first push for regular users: sightings are the most
complicated thing a newcomer meets on the page, and the feature is not finished.

Two things about it are worth knowing before touching it:

- **Absent means on.** A route whose stored settings predate the switch keeps
  the board it already has. Nobody loses a feature by upgrading, and a fork
  that never opens the admin page gets the full app.
- **Off hides, it does not lock.** `add_sighting` is still open to anyone with
  the route slug, so a post made by calling the RPC directly would be invisible
  to riders and would expire on its own — but it still reaches the admin
  moderation list. That is stated on the admin page rather than left to be
  discovered. Enforcing it in the database is a one-function migration if it
  ever matters; it did not seem worth one for a display decision.

No SQL was needed for any of this: `_check_settings` validates the keys it knows
about but never rejects unknown ones, and `get_settings` returns the whole
`settings` object, so a new flag reaches every client for free. Worth
remembering the next time a setting is proposed.

**Sightings that the strip can place.** A sighting is posted through a
direction and checkpoint picker rather than as free text, and the composer
writes one canonical shape (`▲ Northbound at Amadeo · optional note`) into the
same free-text `body` column the board has always had. Deliberately not a
schema change: no migration, the admin page still shows a readable sentence,
and every sighting posted before this existed still renders as the text it is.
`parseSighting()` reads the shape back so recent ones can be drawn on the strip
as hollow dashed rings — never solid, never the bus glyph, because a sighting
is one person's word with no update coming after it. They clear from the strip
after one headway, which is when the next bus has overtaken the claim.

**The tracker's pills are buttons; the sharing tab's are not.** Tapping a
pill flies the map to that bus and opens its popup — one function draws both
strips, and a fourth argument separates them, because on the sharing tab the
map is on the other tab and a tappable pill there would do something
invisible. This is also how "say salamat from the strip" works without
touching the strip's appearance: the popup is the one home the salamat button
has, so the strip routes to it rather than growing a second control — a
count or a button on the strip would need the three static recreations of it
redrawn, and pills are far too small and too overlapping to carry a 44px
target anyway (their tap area is an invisible pseudo-element for the same
reason). The pill id goes through a strict character check before it is
interpolated into the handler; anything unexpected draws a plain pill.

## The reader's own stop

August 2026. The page could say where the buses were and not where they were
relative to the person reading, which is the question a commuter actually
arrives with. A reader can now save a stop, and the card
directly under the map answers in the app's own terms: `▲ Northbound · 3.0 km away ·
about 5 stops before yours`.

**Nothing about a watcher leaves the device, and no SQL was written.** The stop
lives in `localStorage`, the distance is computed on the phone from positions
the page had already fetched, and no request, table or column was added. This
was the whole design constraint: a watcher's location is the one thing this
system has never held, and the feature that finally mentions one must not
change that. A *public* version of this — showing other people where riders are
waiting — was considered and rejected outright: reads need no key, so "public"
means the whole internet, and broadcasting that a named stop has somebody
standing at it after dark is a safety problem, not a privacy trade.

**A stop picker, not a location prompt.** The primary path is picking from the
71 stops already in `config.txt`, which needs no permission at all — and is the
better answer anyway, because a commuter deciding whether to leave the office
is not at the stop yet, so a GPS fix would place them at their desk. Location
is offered twice, both opt-in and both local: "Use my current location" picks
the nearest stop, and the ➤ control on the map draws a dot. Neither transmits.
The dot's on/off state is kept in `sessionStorage` deliberately, so it dies
with the tab and never becomes a fourth remembered thing.

**Distance is measured along the checkpoint chain, never straight-line.** The
same projection the direction guard uses. Across the Tagaytay ridge hook a bus
1.2 km away as the crow flies is 3.5 km by road — a 2.9x error, and worst
exactly where the route bends hardest. Buses that have already passed the stop
are skipped rather than reported as very close, which straight-line distance
cannot express at all, since it has no sign.

**Stops in between are counted by projection, not by list order.** The stop
list is merged from two posters and is not in strict route order — the trap
that made the guard use the checkpoints instead — so every stop is projected
onto the chain once at boot and counted by distance. `test-mystop.js` asserts
that the two orders really do differ, so the reason for this cannot be
forgotten.

**It never says minutes.** Distance and a stop count need no model. An ETA
needs to know how fast this road runs at this hour, and the honest version of
that needs travel-time history the system deliberately does not keep — so the
card says how far, not how long, and the test suite fails if a sentence ever
starts implying otherwise.

**The card draws the stops** (October 2026). With a bus coming, it puts the
bus at one end of a line and the stop at the other, with one dot for every
stop still between them, so "about 8 stops" is seen without being counted.
The dots are the counted stops — `namedStopKms()` projects them exactly as
`stopChainKms()` does, and `test-mystop.js` checks that one is the other —
and they run in the order the bus will meet them, so the first is the "next
stop" the card names. Past eleven they no longer fit a phone, so the line
keeps the next five and the last three with an ellipsis between; the number
beside it stays exact. The sentence the card used to print is still there for
screen readers, in a visually hidden span, with everything drawn
`aria-hidden` beside it.

It speaks up twice, and only twice: **Malapit na!** at two stops or fewer,
and **Sakay na!** when yours is the next stop and the bus is inside 2 km
(`rideState()`). Both are counts, like everything else on the card. A phone
that can vibrate also gets a switch to buzz once per bus when either happens,
kept in `sessionStorage` like the location dot's switch, so it dies with the
tab and never becomes a fourth remembered thing; the flag pops only on the
draw where the state changes, because the card is rebuilt on every poll and a
pop that replays every six seconds stops meaning anything.

**It cost three more files.** `flyer.html`, `for-operators.html` and
`how-to.html` all redraw the tracker's screen, so all three gained the row.
Two things that cost a render each and are worth knowing before touching it
again: the flyer went to two sheets the moment the row was added, and had to
buy the height back out of the mock's own furniture (the poster's mock column
spans the full page height, so it is what decides one sheet or two); and the
guide's callout dots are percentages of a figure that just got taller, so
adding a row there means re-measuring every dot below it, not nudging them.
The October card did it all again: the poster's copy drops the Change button
and the two captions under the line on paper, and the line map paid for the
rest by being shorter than the old rails. The briefing's example screen was
already taller than an A4 page and had always printed split across two; it
now prints at phone width, whole, on one.

## Following one bus, and the town lines

October 2026. **Send a link to this bus**, in a bus's popup, hands over a
`#b=` link that opens the map following that bus: centred on it, a chip
saying which bus, re-centred on every poll, and a Stop that clears the hash.
It is for "nasa bus na ako" to whoever is fetching you. The link carries the
bus's public id and nothing else — the same id every map already receives,
which `sql/04-session-id-privacy.sql` made something that cannot be turned
back into a session id — so it adds nothing to what anyone can see, and it
stops meaning anything when the trip ends, because the id dies with the row.
It goes to the phone's own sending sheet where there is one and to the
clipboard everywhere else. The function is `sendBusLink` and the button
`.buslink`, never anything with `share` in it, for the reason in "Content
blockers" below.

The popup also carries one line about the town the bus is passing, or the next
one it will reach — *Kwento ng ruta*: "Passing Amadeo, the coffee capital of
the Philippines". The lines are an optional fifth field on each `CHECKPOINT`
in `config.txt`, so a fork writes its own or leaves them off and the popup says
nothing. `storyFor()` picks the same checkpoint the strip's pill points at.
Keep each one a single checked fact: a wrong one is printed to every rider on
the route.

Beside the line is a small drawing of the kind of place it is — a cup for
Amadeo, the shrine's balcony for Kawit, towers for One Ayala — and the same
drawings mark each stop on a sharer's ticket. They are a library of generic
places (`MARKS`: crossing, volcano, coffee, church, flag, shrine, terminal,
towers), not this route's landmarks, and an optional sixth field on each
`CHECKPOINT` picks one, so nothing in `index.html` names a town. A place can
have a mark and no line: leave the fifth field empty. `parseCheckpoint()`
reads the line and is tested with four, five and six fields.

## Small celebrations, and what they may not become

October 2026. Four small things, each of which had to be checked against the
rules above before it was built.

- **The bus says beep beep.** Tapping salamat makes the bus on the rider's own
  map hop and say so. Nothing is sent for it and nothing waits on it: it is the
  tap being seen. Reduced motion turns it off.
- **The thank-you floats up the sharer's strip** when their count rises, once
  per rise and never on the first draw of a trip, so it means "somebody just
  did this" rather than replaying a number they already had.
- **Trip mode.** While a trip is live and the sharing tab is on screen, the tab
  goes black and the strip glows: a phone on a dashboard is read in glances,
  and on the OLED screens most mid-range Androids have, black costs less
  battery. It is the token block redefined under `:root.trip-on`, so every card
  follows without a rule each, tied to `sharing` rather than to the status line
  so a passing error mid-trip does not flash it back to daylight.
- **The salamat ticket.** Stop hands the sharer a ticket for the trip — where
  they got on and off, how long their bus was on the map, how many riders said
  salamat, and a stamp or two for the trip's shape — made on the phone from
  what it saw and sent nowhere: it is gone when it is closed, unless the
  sharer taps Keep (see "Keeping the ticket" below). It is the most
  rewarding thing this app shows anybody, which is exactly why it is fenced:
  **no stamp is about how the bus was driven** (no speed, no trip time, nothing
  that compares one run with another — those are the driver numbers
  `for-operators.html` promises the tool cannot produce), a trip under five
  minutes or that never reached the map gets no ticket, and the salamat line
  goes through `thanksWords()`, so a quiet trip shows no zero. The record it is
  made from is six numbers and flags in one variable — when the trip started,
  roughly where on the chain, how many other buses were on the map, whether a
  write landed, the highest count seen — and `test-thanks.js` fails if it grows
  a seventh, or if anything is ever appended to it: a ticket that needed a
  trail on the phone would be the thin end of "no location history".
  Since the art direction each stop on it carries its place's mark, and the
  stamps sit beside the time and the goodbye rather than over them: placed
  at a fixed height, they had covered "3 riders said salamat", the one line
  a sharer most wants to read.
- **A parol.** From 1 September — the "ber" months, when the country starts
  decorating — to Three Kings on 6 January, the header hangs a parol and a
  string of lights. The season is worked out on the reader's phone; the admin
  page can switch it off (`parol_enabled`, absent means on). It hangs in the
  middle, and the two tabs part to make room for it: hung at the right, it sat
  on the corner of the sharing tab.

## Keeping the ticket

October 2026. The maintainer asked whether a sharer could collect their
tickets, with some stats, kept on the phone and never sent: a reason to share
again, and to open the app at all. The ticket had been made deliberately to be
kept nowhere, so this reversed a promise, and it was decided as one. What was
agreed is a collection that keeps the souvenir and leaves the stopwatch
behind.

**Why that line.** Anyone on board can share: a rider, the conductor, the
driver. The ticket at Stop prints the clock times and "on the map for 2 h 51
min". Kept after every run on a conductor's phone, that would be a list of
trip times, breaks and working days that a supervisor could ask to see — the
driver numbers `for-operators.html` promises this tool cannot produce, moved
from the server to a pocket. So a kept ticket is six things (rule 8 in the
album block of `index.html`):

- the day, as a date and nothing finer;
- the direction;
- where the trip was boarded and where it was left, as checkpoint short
  names: never a position, so nothing to draw a route from;
- its stamps, by kind (`full`, `dawn`, `night`, `first`), which are about the
  shape of the trip and the time of day and were already fenced by rule 5;
- whether anyone said salamat, as a yes or no.

It leaves out the clock times, the duration, the bus number and the count.
`albumEntry()` makes those six from everything `showTicket()` knows and drops
the rest, `albumClean()` takes only those six back out of storage, and nothing
in the album block reads the time of day.

**Keeping is a tap, never a default** (rule 10). The ticket at Stop gets a
Keep button, like pocketing a paper ticket; closing it without one leaves
nothing behind, which is what happened to every ticket before. A crew member
who wants no record simply never taps it. `keepTicket()` is the only thing that
adds to the album and runs only from that button.

**The album adds up nothing that could rank anybody** (rule 9). It counts
tickets, the places on the route that kept trips have passed (both ends and
everything between, worked out from the two names against `config.txt`), the
four stamps, and northbound against southbound. It does not count time on the
map (summed, that is working hours), anything per bus, or streaks, which
punish a missed day and on a crew member's phone are an attendance sheet. The
flower is drawn on each thanked ticket and never added up: decided over a
per-ticket count (summable by hand) and over a running total, which is exactly
the figure the salamat design exists not to keep. A stamp not yet collected is
printed faint with "not yet", never "×0", and the album is not offered at all
until something has been kept, which is the no-zero rule again.

**Every ticket has its own picture**, so the album reads as a collection rather
than a pile of the same card. `ticketArtSvg()` draws the two ends as roadside
signs carrying their places' marks, boarded on the left and left on the right,
with the coach on the road between them heading for the second: read like the
ticket, rather than like the map, because a ticket is read as from → to.
Behind the coach is the view at the destination, asked for by the maintainer
("like Taal when arriving at Tagaytay"): one per kind of place in `MARKS`
(`TICKET_VIEWS`), chosen by the same sixth field of the destination's
`CHECKPOINT` line, so nothing names a town. The volcano is Taal Lake with the
island in it, the towers a skyline, the terminal a long wave of a roof on the
bay, coffee the shrubs in rows under a shade tree, the church a bell tower and
a stone front among the town's roofs, the shrine a heritage house with its
balcony and tower, the crossing shops under awnings with the wires overhead,
and the flag a monument with the Philippine flag over it. That one is held to
the flag's own rules: blue above red, because red on top means a state of
war, the triangle at the hoist, twice as long as it is high, and lit by a lamp
after dark, the way a flag flown at night is. The coach sits left of centre
so the view has the middle of the picture, where the eye goes and nothing
stands in front of it, and at night the views have their lights on like the
coach. An end with no mark keeps the plain hills. The
sky comes from the stamps (`ticketSky()`: dawn for Madaling araw, night for Gabi
na, day otherwise), so a kept copy draws the same picture from what it keeps
and needs no clock. At night the coach has its windows lit and its lamp on,
because it is driving, not parked for the night like the empty map's. The
picture has no ids, so a page of them never collides. A trip that began and
ended by the same checkpoint gets one sign, and a place with no mark gets the
strip's plain station ring.

**Where it lives.** `wt-tickets` in `localStorage`, the fourth thing the
privacy panel names, with "Remove all" in the album and Remove (asked twice)
on each kept ticket; removing the last ticket removes the key. The honest
limits, all stated in the album or the panel: it is in that one browser, so
clearing browser data loses it, and the Android app and Chrome on the same
phone keep separate albums; there is no backup, because a backup is a copy
somewhere else. There is no cap: a ticket is under a hundred bytes, so a
commuter riding twice a day for years stays far inside the browser's storage,
and a collection that silently drops its oldest tickets would be worse than a
large one.

**Names.** The album is `albumModal`, `albumRow`, `.tktmini`, `tktKeep` and
`tktDrop`, with the `i-tkt` icon: nothing a content-blocker list hunts for.

**What this changed elsewhere.** The privacy panel's ticket paragraph and its
list of remembered things; the ticket's own small print; `how-to.html`'s ticket
(its picture is drawn into it by `tools/make-pictures.js`), its step 6 and its
privacy card; and `for-operators.html`, whose keystone now ends "not even on
a sharer's own phone (below)" and which explains the souvenir in a short
section under its table. That placement is forced by print: the keystone and
the table share a page and the table never splits, so the first attempt, a
paragraph in the keystone and a row in the table, sent the whole table to a
page of its own and the briefing to eight pages. The pointer had to fit on the
keystone's last line. The flyer's "Walang itinatagong history ng biyahe" was
left as it is: it is about what the system stores, and its claim that no
driver's route, speed or stops are recorded still holds.

## The name, the icons and the link preview

October 2026. The tracker had been called by the bus company's initials,
which is the one name a community tool should not carry: a link preview is
read before anyone opens the page and its disclaimers. Every title a reader
sees now says **Bus Tracker**, and the route says the rest. The header carries
the route name on the amber LED board a bus has above its windscreen.

**The board is a real dot matrix.** The first version was bold text seen
through a mask of dots, and the curves of the letters gave it away. Now every
letter is built from lit dots on a fixed grid, five across and seven down, the
way the boards on provincial buses do it, beside the dark dots that are not
lit. The SIGNBOARD block in `index.html` draws it at load as one small SVG:
the unlit dots are a pattern, and every lit one is a zero-length stroke with
round ends, drawn twice, blurred under sharp, for the glow, which keeps a
two-line board under 3 KB of markup. The words it shows are the words in
`header .route .ln`, and they stay in the page, hidden from sight only, so a
screen reader, a search engine and someone copying the route still read text.
An accented letter is drawn as its plain letter, as real boards do, and Ñ has
a letter of its own, because Parañaque is not Paranaque. A character the board
has no dots for does not leave a hole: the whole board falls back to the
lettered version, which is also what shows if the script never runs.

The guide, the flyer and the briefing run no drawing code, so
`tools/make-pictures.js` draws their boards into the files, with the same
block taken out of `index.html` by its markers, from the words beside each
board. The flyer carries two: two lines on a screen, one on the printed poster,
whose header has no height to spare. `tests/test-signboard.js` fails if a
board stops matching its words, if the words stop being text, or if the
renderer starts drawing anything for a character it has no dots for.

**The mark** is the coach every bus on the map is drawn as, front on, white on
the livery's maroon with the gold trim along the foot and its signboard lit.
It is the favicon on every public page and the home-screen icon; the admin
page's favicon is the same coach on ink, so an organizer can tell its tab from
the tracker's. The test fails if a copy of it stops matching the drawing.

**Home screen.** `manifest.webmanifest` and the icons in `assets/icons/` make
"Add to Home screen" give the coach on maroon rather than a screenshot or a
letter. There is deliberately no service worker: an offline copy of a live map
would be a map of where the buses were, which is worse than no map.

**The icons are rendered, not drawn by hand.** `tools/app-icons.html` is the
source, and `tools/render-icons.sh` screenshots it with headless Chromium at
each size, like `render-flyer.sh` does for the flyer. Both scripts prefer
`chrome-headless-shell`: full Chrome's headless mode lays the page out in a
viewport about 87 px shorter than the window and still returns a picture the
full size, so the bottom of every screenshot comes out unpainted. On the
flyer's chat image that had been a strip of plain paper colour, unnoticed; on
an icon it is a black band. `app-icons.html` paints a warning across the
picture if it finds itself in a short viewport, so the failure cannot ship
quietly. It is set in the site's own Barlow, which a file can only load from a
neighbouring file when Chromium is told to allow it, so the script passes
`--allow-file-access-from-files`. The preview picture names this route on its
board, so a fork edits the words there, runs `make-pictures.js`, and re-runs
the script.

**The link preview's picture needs a full address**, because the crawlers that
build preview cards will not resolve a relative one, and `index.html` cannot
know its own address. So the committed `og:image` is relative, and
`tools/write-preview-url.js` rewrites it at build time from the address
Netlify gives every build — the second line of the published site that is not
the committed one, after the CARTO key. A host that does not set it gets a
preview with no picture and nothing else changes.

## The demo videos

October 2026. Two portrait videos of about a minute, for posting where
riders and crews already are: `assets/flyer/demo-riders.mp4`, in the flyer's
mix of Tagalog and English, and `assets/flyer/demo-operators.mp4`, in the
briefing's English. They are rendered by `tools/render-demo.js`, not recorded,
for the reason the icons are: a screen recording goes stale the day the layout
changes and looks exactly like one that has not, and a render is redone in a
few minutes. Their captions use the flyer's and the briefing's own lines
wherever those have one, so the videos promise nothing those two documents do
not.

**The tracker in them is the real one.** The script builds a stage page, with
the captions, a phone and the label, and runs `index.html` in a phone-sized
frame on it, then taps, types and scrolls it through the browser's own input
events, the way a person would. Nothing on the phone's screen is drawn for the
video. A step that cannot find what it is told to tap stops the render and
says which, and a few steps check that the tracker is showing what the caption
above it claims ("about 5 stops before yours", "Next stop is yours", trip
mode, the ticket), so a change to the app cannot leave a caption contradicting
the screen beneath it.

**The buses are made up, and every frame says so.** They are the flyer's
example ones: 98018 five stops before S&R Kawit, 98104 at Amadeo, two sharers
at Tagaytay, 98077 near Gen. Trias, so the riders' video is the flyer's
example screen set moving. The rule is the flyer's: a picture of this tool
that could be mistaken for live data is the one thing it may not publish. The
line above the phone says "Halimbawa · example screen" on every frame that
shows the tracker, both covers say the buses are made up, and the two
stretches that are sped up (a bus coming up to the saved stop, and two hours
of a trip) carry a chip that says so.

**Nothing reaches the database.** A script runs in the page before its own
(`prelude()` in the tool) and answers every call the tracker makes to Supabase
from what the script has put there; anything else addressed to Supabase is
refused, and the browser is told to block the host besides. Rendering cannot
put a bus on anybody's real map. The map tiles are CARTO's real ones, so the
render reads `CARTO_API_KEY` from the environment the way the build does, and
without it the map is watermarked: fine for a draft, not for a post.

**The page's clock is replaced.** Date, the timers, animation frames and the
GPS move only when the renderer advances them, one video frame at a time, and
every CSS animation is paused when it first appears and placed by hand on each
frame after. That is what keeps the videos smooth on a slow machine and the
same on every run, what lets a bus cover three kilometres in eight seconds
while its badge still takes its own second to glide, and what lets the trip
jump two and a half hours to the ticket. A jump fires each timer that came due
once, as a phone does when it wakes, which is why the trip's welcome line is
gone on the far side of it, and why the script moves the GPS before jumping:
the idle guard would otherwise wake to a bus that had not moved in two hours
and ask whether anybody was still on it.

**No sound.** Most video in a group chat plays muted, and music or a voice is
the one thing a person adds better than a script, so the captions carry
everything and a sound track is left to whoever posts it.

**What a fork changes.** The captions name this route's places and the scripts
drive its stops by name (`ROADS` in the tool), so a fork rewrites those two
scripts, or deletes the videos. The words on the boards, the link and its QR
code come from the same places as the flyer's, so they follow it.

## The look: one system, one typeface, one set of icons

October 2026. The app worked and looked assembled: twenty-one text sizes,
nineteen corner radii and forty shadows, each one a reasonable choice in the
commit that made it, and emoji standing in for icons, which are a different
picture on every phone. The art direction that replaced them was planned
first and agreed before any of it was built; this is what it left behind.

**Tokens.** Seven text sizes (`--fs-cap` 11 to `--fs-number` 34), three
corners (`--r-s/m/l`; a circle is 50% and a pill 999px), three heights
(`--sh-1` a card resting on the page, `--sh-2` something floating over it,
`--sh-3` an overlay) and three speeds with three curves (`--dur-1/2/3`,
`--ease`, `--ease-pop`, `--ease-move`). Anything longer than a beat — a beep,
a breathing badge, the parol's sway — states its own length, because it is a
moment rather than a transition. They are defined once, in `index.html`'s
`:root`, and copied into the other four pages like the colours always were.

**`tests/test-tokens.js` holds them.** It reads every declaration of a size,
corner, shadow, timing or typeface in `index.html` and `admin.html`, wherever
it is written, including the strings scripts build markup from, and fails on
a literal. The point is mechanical rather than aesthetic: values that are
close but not the same read as careless even when nobody can say why, and
this is how the old count of twenty-one sizes accumulated. One literal is
allowed, in an exceptions list that carries its reason, and an exception that
stops matching anything fails too. The guide, the flyer and the briefing are
not held strictly, because their drawings of the app are the app at a smaller
scale; their own text and cards use the tokens, and the test checks they carry
every one with the app's values.

**`tools/styleguide.html` draws all of it**, and keeps no copy of any of it:
at load it reads `index.html`, takes its stylesheet and icon sprite, and draws
the colours, the type scale, the corners, heights and speeds, every icon and
a set of real parts with them. The tables, including which rules use each
token, are computed from that stylesheet, so the page cannot drift. Browsers
will not let a file opened from disk read another file, so it is opened
through a server: the deployed site, or `python3 -m http.server` at the root.

**Barlow, in two widths.** Barlow Semi Condensed (500, 600, 700) for anything
that is a label, a button, a name or a number; Barlow (400, 600) for
sentences. It was chosen for the strip: eight checkpoint names have to fit
across a phone, and a condensed face fits them at a size that can be read.
It also has the plain, engineered look of road and transport signage without
copying any one operator's lettering. Each file is cut down to the characters
these pages use and has its hinting removed, about 9 KB a weight, 46 KB for
all five. They are served from this site, so the privacy panel's "everything
else is served from this site itself" stays true, and the `.v1` in each name
lets `netlify.toml` tell phones to keep them for a year: change a file, change
its name. `font-display:swap` shows the phone's own font while they load, and
`fitTicks()` measures the strip again once they arrive, because the names fit
differently in the two. Leaflet's stylesheet sets its own font on the map, so
`.leaflet-container` sets it back, or the popups stay in Helvetica.

**The three pages that load nothing carry the fonts inline**, as data URIs
written by `tools/embed-fonts.js` between two marker comments. That costs
about 62 KB a page, on pages read once rather than every morning, and keeps
the property that they cannot 404 off a deploy. `test-tokens.js` decodes each
inline copy and fails if it is not byte for byte the file.

**Icons.** One family, drawn for the app on a 24-point grid with a 2-point
stroke and round ends, kept as `<symbol>`s in a sprite at the top of
`index.html`'s body and used by reference. Every emoji the interface used to
draw is one of these now: the lock, the info mark, the theme, the map's
buttons, the prompt titles, the chevrons, the close buttons, and the salamat
button, which is a sampaguita (`i-ty`) because the flower strung into
garlands to honour someone says thank you here, and because nothing about it
can be named like a social widget (see "Content blockers"). The coach is the
one filled drawing: front-on, with rabbit-ear mirrors, its windscreen, lamps
and signboard cut through so they show the colour behind, and the signboard
lit pale on gold and amber on maroon wherever a bus is drawn. Pages that need
an icon copy its `<symbol>` from `index.html`, and `test-tokens.js` fails if a
copy differs or a page draws one it does not carry.

**Found while doing it.** Tapping a bus in the list opened its popup while
the map was still flying to it, so Leaflet worked out how far to pan from
the wrong place and the popup's top sat under the edge of the map for a few
seconds. It now opens on `moveend`, with a timer as a backstop for a view
that does not move.

## Duplicate sharer handling

Two people sharing from one bus would show as two buses, which is worse than
showing none. Two layers handle this:

1. **Warning before starting.** On tapping Start the app takes one GPS fix,
   checks for an active sharer within 150 m going the same direction, and asks
   whether it is the same bus. Nothing is published until the user answers.
2. **Clustering on the map.** Identical bus numbers always merge. Conflicting
   bus numbers never merge. Otherwise, within 100 m and same direction, merge
   and display the count ("2 sharing") rather than hiding it.

Known limitation: two *unlabelled* buses queued within 100 m at a terminal going
the same direction will merge into one marker. This is why the bus number field
is actively encouraged in the UI.

## Content blockers

Reported from a real phone: on Brave, the whole "I'm on the bus" tab rendered
except the one button that starts sharing. Brave Shields does cosmetic
filtering, and a social-widget rule matched the button's id, `shareBtn`. The
element stayed in the DOM with `display:none` injected, so the page looked
completely normal, the surrounding input and hints were all there, and the only
way to share had silently gone. A sharer cannot diagnose that, and nothing
reaches us.

Two things changed. The DOM ids in that tab no longer contain "share"
(`onbusStartBtn`, `onbusSetup`, `onbusView`, and so on) so the false positive
does not match, and `checkControlsVisible()` reads the computed style of the
start button whenever that tab is shown and says plainly what happened if it
has been hidden anyway. The names are worth keeping neutral: **anything called
`share*` in a class or id is a filter-list target**, and this failure is
invisible from our side.

The same reasoning decided how the guide link is built. Filter lists also carry
rules for live-chat and support widgets, so the ⓘ in the header is `guideLink`
rather than anything containing `help`, `support`, `chat` or `widget`, and it is
an `<a href>` rather than a button: if a blocker hides it anyway, the page it
points at is still a plain URL that works. `test-boot.js` section 8 checks both
pages for those names, alongside the `share*` scan.

And a third list, which is the one that decided the salamat button's name. The
oldest and broadest cosmetic rules in every filter list exist to kill Facebook
Like buttons and the social bars around them, and they match on names like
`like`, `fav`, `thumb`, `heart`, `vote`, `social` and `clap`. A thank-you
control is the single most filter-shaped thing this app could ever ship, so it
is `tybtn`, `tyrow`, `tydone` and `tyLine`, and the RPC is `say_thanks`. This
one is worse than `shareBtn` in one specific way: it lives on the *reader's*
side, where the person who loses it has no reason to think anything is missing
and no way to tell us. `test-boot.js` section 8 scans all five pages for those
names in `id`, `class` and `onclick` — `onclick` too, because the control is
built in a JS string that a DOM scan never sees, and a filter can match an
attribute's value as readily as its name. `star` is deliberately not on the
list: it is a substring of `start`, and a scan that cries wolf on
`onbusStartBtn` is a scan somebody eventually deletes.

The October controls were named the same way: the follow link is
`sendBusLink` and `.buslink`, its chip `followchip`, the ticket `tkt*`, the
album `album*` and `.tktmini`, and the buzz switch `buzzBox`. None of them is the kind of thing a filter list
hunts for, and the scan agrees.

## Known limitations

**Screen must stay on while sharing in a browser.** Mobile browsers suspend
JavaScript and GPS when the screen locks or the user switches apps. This is a
platform restriction, not a bug. The page requests a screen wake lock and
re-acquires it when the page becomes visible again, but it cannot survive
backgrounding. On Android the answer is now the app in `mobile/` (see "The
Android app" above). On an iPhone it is still a mounted phone on a charger,
and long term a dedicated GPS tracker device.

**Nothing detects a wrong vehicle going the right way.** A car, a jeepney, or
another company's bus on the same corridor is indistinguishable from a Wonderful
Transport bus in the data. The bus number field is the only real answer.

**The wrong-direction guard needs distance.** In stop-start traffic it takes far
longer, and a bus that barely moves may not be caught before the trip ends.

**The 7-day pause.** Supabase pauses free projects after seven days with no
database request, and unpausing is manual. A keep-alive monitor pointed at the
`ping()` function is required, not optional.

**Seven stop coordinates are approximate** and flagged `L` in config. They are
drawn hollow on the map with "(approx.)" in the tooltip.

**Map tiles come from CARTO's public basemap service with no API key.** Fine at
this scale, but it is someone else's fair-use policy. At real volume, get a
MapTiler or Stadia key.

**Stopping a sharer holds for 6 hours, then lapses.** The first version only
deleted the row, and the sharing phone rewrote a position within seconds, so the
bus came straight back. `admin_kick` now also records the session in
`kicked_sessions` until a time, `set_bus_position` refuses writes from it, and
the sharer's app tells them an organiser stopped the share and stops cleanly.
Blocks are listed in the admin page and can be undone, because a mis-tap should
be reversible.

That table stores a random session id and an expiry, no location and nothing
about a person, so the no-history property is intact. The honest limit, printed
next to the button: someone can reload the page for a new session id, so this
raises the effort from nothing to a deliberate act. Rotating the share key is
still the only real expulsion, and it affects everyone. Per-sharer codes would
be the proper fix if abuse ever becomes real; they are not worth the admin
overhead before then.

## Scale notes

Measured and reasoned, not guessed:

- A commuter checks for 2 to 3 minutes, so 100 people aware of the tool is maybe
  10 to 20 concurrent at rush hour. Comfortably fine.
- Sharers are the heavier users. A three-hour trip generates roughly 4,700
  requests. Ten buses sharing daily is around 1.3 GB per month against a 5 GB
  free-tier egress limit.
- Physical ceiling on sharers: with 30-minute headways and roughly three-hour
  trips, about 6 buses per direction are on the road at once, so around 12
  total. The concurrent-session cap is an admin setting, currently 25.
- Thresholds: under 30 concurrent viewers, no changes needed. 50 to 100, fine as
  currently built. Beyond 200, move to realtime or add an edge cache.
- Reads no longer write, which matters much more now that reads are public.
- The first two numbers above were reasoned, never measured, because nothing
  counted watchers. The watching count now measures the first one directly, so
  when a decision here turns on concurrency, read it off the admin page instead
  of re-deriving it. It costs one write per watcher per minute against six reads
  per watcher per minute, so it is under 3% on top of what a watcher already
  sends.

## The Android app

`mobile/` is a Capacitor shell for sharers, added October 2026, because the
first known limitation below was the one that kept costing buses: a sharer
who locked the screen or opened Messenger dropped off the map. A browser
cannot fix that, and neither can an installable web app or a Trusted Web
Activity, which is still Chrome and is still suspended. Only native code can
run an Android foreground service.

It loads the live site rather than bundling a copy, so a deploy updates the
app's screens with no new APK. Inside it, `watchTripGps()` in `index.html`
finds `window.Capacitor.Plugins.BackgroundGeolocation` and takes fixes from
the plugin's foreground service instead of `navigator.geolocation`.
Everything downstream is unchanged and shared with the browser: the same
`writePosition`, heartbeat and trip guards, under the same tests. That was
the reason for Capacitor over a hand-written Kotlin app, which would have
needed its own copy of the guards with no tests watching it.

What the app adds, and only inside it: no screen wake lock (keeping the
screen on is the cost it exists to remove), the notification permission
Android 13 needs before the sharing notification can show, and a
notification whenever a trip question is asked with the app in the
background. That last one matters most for the wrong-direction guard, which
takes the bus off the map until it is answered: without the notification a
sharer with the screen off would stop sharing and never know why.

Nothing about the data model changes. No new request, no new table, no
location kept on the phone, and no `ACCESS_BACKGROUND_LOCATION`: the service
only starts from a tap on Start with the app on screen, and its notification
cannot be dismissed while it runs. `mobile/README.md` has the build, the
signing key that every APK handed out must share, and the real-trip checks
that have not been done yet.

## Testing

Nothing here is claimed without being checked. The suites live outside the
deploy folder:

- `test-guard.js`, `test-strip.js`, `test-prompts.js`, `test-hours.js`,
  `test-mystop.js`, `test-thanks.js`, `test-signboard.js` and `test-pictures.js` extract the shipped code out of
  index.html by comment markers and run it, so a passing
  test cannot drift from the app. Since October 2026 they also hold the hours
  card and the parol season (`test-hours`), the stop-by-stop card and its two
  louder states (`test-mystop`), the town lines (`test-strip`), the
  ticket's rules and the album's (`test-thanks`) and the ticket's picture
  (`test-pictures`); every one of those checks was watched
  failing against a deliberately broken copy of the page before it was
  trusted. They need Node, plus config-template.txt one
  level up. `test-tokens.js` runs no app code: it reads every page's styles
  and holds them to the design tokens (see "The look"). `test-boot.js`
  additionally loads both pages in a real DOM (jsdom)
  over a local HTTP server, including a deploy with `assets/` missing and a
  config.txt that was never filled in.
- `tests/db/00-legacy-baseline.sql` reconstructs the pre-migration database.
  `01-core-tests.sql` runs 55 behavioural checks against it, `02-rotation-tests`
  17 for key rotation, `03-kick-tests` 17 for stopping a sharer,
  `04-privacy-tests` 18 for session id privacy, `05-rotate-tests` 10 for the
  rotation guard, `06-watching-tests` 32 for the watching count and
  `07-thanks-tests` 38 for saying salamat — the last two almost entirely about
  what they refuse to keep. Each runs against its own fresh database; see
  `tests/README.md`, which is now accurate about that.

Two lessons worth keeping. The reconstruction was built from a dump of function
definitions only, so it had no foreign keys, and 55 passing checks still missed
that `bus_positions.route_key` referenced `routes.key` and blocked every key
rotation. **Before writing a migration, get the table constraints, not just the
function definitions.**

And `tests/README.md` spent months describing a sequence for the database
suites that could not work: two of the three suites had no runnable order at
all. Passing tests are not the same as tests anyone can run. **A runbook nobody
has followed end to end is not a runbook.**
