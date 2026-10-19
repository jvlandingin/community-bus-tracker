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
`netlify.toml` runs the ten dependency-free JavaScript suites as the build
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
| Share key | secret: a long key, or a PIN of 4 to 8 digits | the link posted in the group chat | putting a bus on the map, unless open sharing is on |
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

**Sharing can be opened to everyone** (October 2026). An organizer can switch
on `open_sharing` from the admin page, and a page with no key then shares by the
public slug through `set_open_position`. It is off unless chosen, and while it
is on the share key no longer keeps anyone off the map: the slug is in
`config.txt`, so anyone with a script can post a bus, made-up buses can fill the
sharer cap, and stopping one from the admin page is beaten by a new session.
Switching it off is the expulsion: every bus started without the key leaves the
map in the same transaction and cannot write again, and keyed sharers are never
touched. Applying the rule above to this change: `clear_bus_position` still
needs only the real session id, which a keyless sharer's phone holds as
privately as a keyed one's; the duplicate-sharer warning, the wrong-direction
guard and the cap all run the same either way; and the privacy panel now says
that while sharing is open a bus is somebody's report. `docs/DATABASE.md`,
"Open sharing", has the rest.

**The share key may be a PIN** (October 2026), easier to say on a bus. A PIN
can be guessed, so while the key is one, 20 wrong tries in 10 minutes pause
new trips on the route for 10 minutes, the right PIN included, and every key
check now carries the slug so a wrong one can be counted against a route
(`check_share_key`, `set_keyed_position`). The old `route_exists` and
`set_bus_position` refuse to test a PIN, since they could not count one.
Applying the rule above: the pause is a new way to stop real sharers starting,
which is why it exists only for a PIN and the admin page shows it; and
`check_share_key` writes, to count, so it is a write like `mark_watching`, not
a read, and the reads still write nothing.
`docs/DATABASE.md`, "A PIN for the share key", has the numbers.

**Outside the route area, a bus is its own phone's** (October 2026,
`sql/14-off-route-private.sql`). The server has always refused a position
outside a box around the route, so nothing from elsewhere reaches the riders'
map. Google Play then could not review sharing at all: its reviewers are
elsewhere, and it wants sign-in details that work regardless of location. A
reviewer key that skipped the check would have answered that and was refused,
because whoever held it, or found it, could put a made-up bus on the real map
from anywhere. Instead the position is kept, marked `off_route`, and
`get_positions` returns it only to the phone whose session it is. The sharer
sees their bus and the line "Outside the route area. Only you can see this
bus."; riders and the admin page's list never see it; the next write inside the
box puts the same bus on everyone's map. There is nothing to hand out and
nothing to leak, and the Play answer becomes that no part of the app is
restricted. Applying the rule above: the riders' map is still only what is
inside the box, so the open-sharing and cap reasoning stands; off-route buses
have ten places of their own per route and take none of the riders'; a hidden
bus's public id is never published, so nobody can thank it; and the page counts
only writes that reached the riders' map towards a trip, so a trip spent
outside the box draws no ticket and earns no parts (rule 17's reason, a bus on
everyone's map that isn't one, applied to a bus on nobody's). Nothing new is
kept: the same one row per trip, with one more yes or no on it.

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
answer itself never folds. The sightings board used to open itself when no
buses were live, as the only answer available; since October 2026 it stays
folded until tapped, because the strip draws every sighting as a glowing
stretch and the headline names the newest in words, so the answer is on screen
without the form, and the maintainer found the home screen overwhelming with
it open. Its summary line still says how many sightings are posted.

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

The preference is the second of the six things this app keeps between
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

**The interval belongs to the window, not the route** (October 2026). That
month's poster runs the pre-dawn trips to Makati every 30 minutes and the
afternoon trips back every 40, and the page had one number for both. A
departure window may now carry its own interval as a third field; the route's
`headway_min` stays as the interval for any window that names none, so nothing
stored had to change. `headwayAt()` in the tested hours block is the only place
that decides which number is in force at a given minute in a given direction,
and `test-hours.js` fails if anything outside that block reads the route-wide
number directly, because the first version of this had three readers and a
window's own interval would have reached only one of them.

**Weekends have their own windows** (October 2026, the same week). The same
poster gives Saturday and Sunday a narrower set, and the settings had one set
for every day, so a Saturday page said "departing" at 3:30 for a 4:00 bus. The
shape change was kept small: an optional `hours.weekend` object of the same
shape as the weekday pair, absent meaning the same hours every day. The day is
decided on the phone, in `hoursFor()`, which became the only reader of the
hours object the way `headwayAt()` is the only reader of the interval, and for
the same reason: six functions read `SET.hours` directly before, and a weekend
set would have reached some of them. Two details were deliberate. Past the last
window the next trip named is tomorrow's first, so on a Friday night it is
Saturday's 4:00 and not the weekday 3:00. And a weekend set missing one
direction falls back to that direction's weekday windows rather than to
"unknown", because the organizer did write hours for that day. Public
holidays are not a third set: the one in the chat ran a weekday-shaped
schedule, and a set nobody can predict is a set nobody will keep current.

**The en-route allowance is four hours**, not three and a half (October 2026).
It was a guess until two months of the riders' group chat gave 61 timed trips:
afternoon departures from Mendez reached One Ayala 208 to 238 minutes later,
so at 210 the page called the last bus arrived while it was still on Chino
Roces. `EN_ROUTE_MIN` in the hours block is the one place the number lives,
and `docs/JOURNAL.md` has the trips it came from.

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
  strip is refetched and re-measured at the two moments it becomes visible,
  and once more when the trip's first write lands (`refreshOnbusStrip`),
  rather than waiting out an interval — a hidden strip has no layout, so
  `fitTicks()` cannot size its labels until it is on screen. Only at those
  moments: `setShareUI()` runs on every GPS fix, and for a while it called
  `refreshOnbusStrip()` every time, which fetches past the throttle, so every
  fix was a read — about one a second where the throttle meant one every 18.

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
`parseSighting()` reads the shape back so recent ones can be drawn on the
strip. They were hollow dashed rings at the place seen; since October 2026
every sighting is a **glowing stretch**: a soft wash of the line's colour that
breathes slowly in the live badges' rhythm, never the bus glyph, because a sighting is one
person's word with no update coming after it. With a travel-time row for its
direction the stretch counts from the place the bus was seen and moves, the
same way a departure's does (below); without one, or seen past the row's last
place, it stays where it was seen and clears after one headway, which is when
the next bus has overtaken the claim. One look for all sightings, because two
marks meaning "someone saw a bus" was one more than a glance can learn. The
stripes the stretch first had were replaced by a travelling sheen the same
day, and the sheen by the breath the day after, chosen from seven treatments
drawn side by side on the real strip (a sheen, a breath, a cloud of dots, a
capsule with a roaming dot, a lit rail, a comet, a range bar with marks): the
breath keeps one rhythm across the whole strip, and the bus pills already had
it. **The glow is shaped like a bell**, at the maintainer's suggestion:
a mask makes it densest through the middle of the measured stretch and thins
it to nothing a quarter-stretch beyond each end, and `renderStrip()` lowers its
opacity as the stretch widens, so the same one bus spread over more road is
drawn as exactly that. Not a real distribution (the rows are a min and a max
across trips, nothing in between), but the honest picture of one: a reader
sees at once where the bus most likely is and how sure the page is. The guide
shows one sighting at three ages. Live bus pills on the strip breathe like the
map's live badges and their coach rocks at idle, so a bus that is reporting
right now looks like it.

**A sighting may say when** (October 2026, the day the departure report
shipped, because its first reader asked the obvious question). The composer
has a time field that opens at now and uses the phone's own clock picker, and
writes the time after the place when it was changed: `▲ Northbound at Amadeo,
3:05 PM`. A clock rather than "about 20 minutes ago", because the common case
is copying an exact time an operator posted in the group chat. A time ahead
of now is refused at the composer. `sightingTime()` reads it
against the post's own time and uses it for the ring's life and the band's
start, so a rider relaying an operator's "paalis na" ten minutes later still
starts the band at the departure. Two fences: a stated time after the post is
ignored, and so is one more than four hours before it, the length of a trip
and the same figure as `EN_ROUTE_MIN`, since a sighting older than a whole
trip describes a bus that has arrived. Inside that the band and the ring fade
on their own, and the long end matters: a rider three hours down the road
still gets the stretch a departure from that morning is probably on. (The cap
was an hour for a day; the maintainer pointed out who that shut out.) The
first version stamped every sighting at the moment of posting, which was
wrong for exactly the posts the board exists for.

**A sighting can say the bus has just left** (October 2026). The operators'
most common post is "paalis na" from the terminal and nothing after, and in
the riders' chat "where is it now" is 43% of every question asked about a bus.
So the composer has a second verb: `▲ Northbound left Mendez Crossing`, the
same body column, the same parser with `kind: 'left'`, no migration. What it
draws is not a bus. Two months of that chat gave 61 timed trips, and from
them, for each checkpoint, the earliest and latest minute after departure a
trip was seen to cross it, two rows because early buses and afternoon buses
are different roads. Those are the `TRAVEL` lines in `config.txt`, hand-written
numbers like the checkpoints, not a log (the trips themselves are not in the
repository). `departedSpan()` reads them: at any moment the bus is between
where the slowest past trip would be and where the fastest would, and the strip
shades that stretch, hatched in the line's ink, translucent, no glyph, under
the pills. The headline says it in places, "probably between Amadeo and Imus,
going by past trips", and never in minutes: `test-strip.js` fails if the span
code or the sentence ever speaks of a time to come, which is the same fence
the saved-stop card lives behind. Three edges were deliberate. The fastest
edge stops at the last checkpoint the row knows rather than extrapolating, and
the whole report is dropped once even the slowest trip would be past it (the
early row ends at Imus, because early runs were never reported arriving). A
"left" at any place but that direction's terminal is a plain sighting there,
because at One Ayala "paalis na" can precede departure by an hour of filling
up, and at Mendez it is departure within minutes. And without a row for a
direction, the report is a ring at the terminal like any other, which is what
southbound is until it has more than five pairs. A band was chosen over a ghost
bus because a bus drawn from a timetable is a drawing that reads as data; a
band is honest about being a range, and from the schedule alone the honest
range is the whole route. The journal has the full reasoning.

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

**The card draws the stops** (October 2026). With a bus coming, it first
put the bus at one end of a line and the stop at the other, with one dot for
every stop still between them, so "about 8 stops" was seen without being
counted. The stops it names are the counted stops — `namedStopKms()` projects
them exactly as `stopChainKms()` does, and `test-mystop.js` checks that one is
the other — in the order the bus will meet them, so the first is the "next
stop" the card names. The sentence the card used to print is still there for
screen readers, in a visually hidden span, with everything drawn
`aria-hidden` beside it.

**Then it drew the bus coming** (October 2026). The maintainer's verdict on
the dots was that the card looked the same however near the bus was: eight
dots and one were the same line, and nothing moved but a dot dropping off.
Of the sketches tried, a side view of the road, a view down it and a mix of
the two, they chose the view down the road (`stopViewSvg()`, in the tested
PICTURES block). Waiting, you stand at a shed and the bus grows as it comes
down the road towards you, on its own side, with a post at the roadside for
every stop still between and the bus's next stop's in gold; at Sakay na your
sign lights and you wave it down. On board, you look out of the windscreen
past what hangs from the mirror, and your stop's sign grows up the road on
the right, the side the bus pulls in on, with the posts before it. It is the
one working screen with a picture, by that decision: the rule that pictures
go only where the screen would be empty still holds everywhere else.

- **Six stops, one step each.** The picture holds the last six stops
  (`STOP_VIEW_STOPS`); further than that the bus is at the horizon, or the
  sign is. `stopProgress()`, in the MY STOP block, says where: an even step
  per stop, the step being the card's own count (`test-mystop.js` section
  11), and inside a step by the road, so every position that arrives moves
  it, which the dots never did. The posts are the counted stops, as the dots
  were (`test-pictures.js` section 9).
- **It moves when a position does, and only then.** The bus glides from
  where it was drawn to its new place in a second (`STOP_GLIDE_MS`, the
  `stopglide` animation) and stands there until the next position. It never
  creeps between them: a picture that moved on its own would be a guess at
  when the bus arrives, which the card has never made. The card is redrawn
  every few seconds, so a redraw on the way carries the glide on with a
  negative delay rather than restarting it, and a position that lands
  mid-glide starts from where the bus is drawn at that moment. The
  perspective is built so that CSS can glide it: everything on the road is
  drawn once at depth 1 and placed by `translate(vanishing point) scale(k)`,
  and a thing's place on the screen is linear in k, so interpolating the
  transform is the right path in depth.
- **The road on board goes by** at the popup's decorative pace (`STOP_ROAD_S`,
  about 60 km/h to the eye) and what hangs from the mirror sways. Both stop
  when the bus stands still or has gone quiet, by the signal the popup uses
  (`rideStand()`, `freshness()`). Neither says how fast the bus is going.
- **Dressed as the popup dresses it** (`busLookOf()`, shared with
  `popupRide()`): a coming bus as its sharer dressed it only if they chose to
  show it, a sharer's own bus as they dressed it, plain otherwise. Waiting it
  is seen from the front, a second drawing of the coach (`svCoachFront()`)
  wearing what a front shows; on board, from inside, what hangs there or sits
  on the dashboard. What is only on a bus's side (the mural, the map, the
  sunrise, the exhaust) shows from neither, as on a real one.
- **The sky is the clock's** (`skyNow()`), as in the popup; **the flag sits on
  the picture**, so the card is the same height with Malapit na and without;
  and the bus's number moved from the caption under the dots to the line
  under the count ("bus 98018", "your bus 98018").

The cost is height: the card went from about 230 px to about 290 px on a
phone. On a wide screen the picture is cut rather than grown past 200 px,
from the sky down waiting and at both edges on board.

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
The picture did it a third time. Drawn full width on paper it is about 125 px
tall in the poster's mock and 160 px in the briefing's, which sent the poster
to three sheets and split the briefing's example screen again, so on paper
both draw it small beside the count, where the line of dots was; on screen
they draw it full. In the guide's numbered screen the picture has a fixed
height, so the figure is one height at the widths its callouts were measured
at, and the callouts were measured again.

**Riding to your stop, not only waiting for it** (October 2026). The card
was built for the roadside: the nearest bus still coming. On board that is
the wrong bus whenever another one runs ahead of yours on the same road —
the card counted down on it while yours was still stops behind — and its
words were wrong too ("wave it down"). So the card has a second mode that
follows one bus, yours, to the stop you get off at: `aboardBus()` picks it,
`aboardInfo()` measures it in the same shape `approachInfo()` returns, so
`stopsBetween()` and `rideState()` read it unchanged. Its flags are
**Malapit na!** and **Bababa na!**, its bus wears the green ring that means
"yours" on the strip, and it ignores the direction filter, because it is the
reader's own bus.

Which bus is yours comes from one of two places, both already on the phone.
A sharer's is the cluster the server flags `is_self`, so a sharer taps
nothing. Anyone else taps **I'm on this bus** in the bus's popup, which keeps
the bus's public id in `sessionStorage` (`wt-aboard`) until the tab closes;
it is never sent, and it means nothing after the trip because the id dies
with it, so it is not a seventh remembered thing. Starting to share clears it,
since the server's answer supersedes it and it would otherwise come back
after Stop pointing at a trip the phone is not on. A fix up to 300 m past
the stop still counts as at it (`AT_STOP_KM`), because phones wobble and
buses pull in beyond the sign; further than that the card says the stop is
behind the bus and asks for the one being got off at, which is also what a
sharer riding away from their home stop sees.

**A sharer can watch, and the page now says so.** GPS never stopped when a
sharer switched to the map — the watch is not tied to the tab, and the
tracker's feed is the faster one — but the dark trip screen and the status
line live only on the sharing tab, so leaving it looked like stopping.
`syncTripMode()` now puts a breathing green dot (and the words "sharing now"
for screen readers) on the **I'm on the bus** tab for as long as a trip is
live, and the stop card is written into `#tripStop` on the sharing tab as
well, so a sharer never has to choose between watching their stop and seeing
their bus on the map. `setShareUI()` runs on every GPS fix, so it redraws the
card only on the transition, when that copy is still hidden.

The buzz still needs the page on screen: `navigator.vibrate` does nothing in
a pocket with the screen locked. That is the honest limit of the website; a
lock-screen alert would belong to the Android app's notification code, and
has not been built.

**Stop takes the bus off its sharer's own map at once** (October 2026). Until
then it stayed in `BUSES` until the next poll, so the card, back to waiting
the moment sharing ended, counted the bus just left as one coming to the
stop its sharer had just got off at: Sakay na!, and a buzz. `stopSharing()`
now drops this phone's own row before anything is redrawn, and keeps its
public id in `GONE`, in memory only, so a poll answered before
`clear_bus_position` lands cannot bring it back as somebody else's bus. Each
trip has a public id of its own, so one gone is gone for good. Found while
filming the showcase video; `test-boot.js` section 14 holds it.

## Following one bus, and the town lines

October 2026. **Send a link to this bus**, in a bus's popup, hands over a
`#b=` link that opens the map following that bus: centred on it, a chip
saying which bus, re-centred on every poll, and a Stop that clears the hash.
It is for "nasa bus na ako" to whoever is fetching you. The link carries the
bus's public id and nothing else — the same id every map already receives,
which `sql/04-session-id-privacy.sql` made something that cannot be turned
back into a session id — so it adds nothing to what anyone can see, and it
stops meaning anything when the trip ends, because the id dies with the row.
That needs a new session id for every trip, which `stopSharing()` provides
(`endSession()`). Until October 2026 the session id lasted as long as the tab,
so a link sent for the morning ride found the same person's evening ride, and
anyone reading the map could tie one phone's trips together. The one end that
keeps it is an organiser's Stop, because the block is on that id.
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

## Saying a bus or a sighting is wrong

October 2026. "Not a real bus?" sits at the end of the place line in a bus's
popup, and "Wrong?" under each sighting's age on the board. One tap tells the
organizers, and the count shows in red beside the Stop and Delete buttons on
the admin page, with the most-reported bus at the top of the list. Two reasons
it exists: a made-up bus leaves somebody at the roadside waiting for nothing,
and Google Play expects an app whose content comes from its users to let them
report it. Every bus on this map is a user's.

What it may not become, and why it is shaped the way it is:

- **It never acts on its own.** No number of taps hides anything. The call
  takes no key, because a watcher has none, so a threshold would let one
  person with a few tabs take a real bus off the map. The organizer decides.
- **Nobody but an organizer sees a count.** Beside a bus on the map it would
  read as a verdict, and riders would pick buses by it; on the sharer's screen
  it would be an accusation with nothing to do about it.
- **It cannot outlive what it is about**, by the same cascade salamat uses,
  so there is no list of reported sharers to keep, ask for or hand to the bus
  company. `docs/DATABASE.md`, "Saying something is wrong".
- **Remembered for the tab only** (`wt-wrong`, sessionStorage), so the button
  stops asking and the six things kept between visits stay six. A tap that
  did not land gives the button back, as salamat does.
- **Where it sits.** The popup was already the map's height on a phone, and a
  line of its own at the foot pushed "Send a link" out of the map, so it
  shares the place line. It is the quietest control in the popup, a muted
  underlined word, because it is for the rare bus that is wrong.
- **Named `wrong*`**, never `report*`, `flag*` or `abuse*`, in the DOM and in
  the request path, for the reason in "Content blockers" below.

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
- **The controls follow the trip too** (October 2026). A write that failed
  mid-trip used to swap Stop for Start while the trip ran on, and the next GPS
  fix put "Sharing live" back over the error while the writes went on
  failing. Tapping that Start opened a second GPS watch that Stop never ended,
  which in the Android app left the foreground service and its notification
  up after Stop. Now `setShareUI()` shows Stop for as long as `sharing` is
  true, an error stays up until a write lands, `beginWatch()` ends any watch
  it finds, and GPS giving up ends the trip through `stopSharing()` like any
  other end. The three refusals that retrying cannot change end the trip as
  well: a session an organiser stopped, a changed key and a full route. A
  changed key is also forgotten, address bar included, so the next Start opens
  the key box, which takes a whole pasted link as readily as the bare key.
- **The salamat ticket.** Stop hands the sharer a ticket for the trip — where
  they got on and off, how long their bus was on the map, how many riders said
  salamat, and a stamp or two for the trip's shape — made on the phone from
  what it saw and sent nowhere: it is gone when it is closed, unless the
  sharer taps Keep (see "Keeping the ticket" below). It is the most
  rewarding thing this app shows anybody, which is exactly why it is fenced:
  **no stamp is about how the bus was driven** (no speed, no trip time, nothing
  that compares one run with another — those are the driver numbers
  `for-operators.html` promises the tool cannot produce), a trip under five
  minutes, under a kilometre along the route between its two ends, or that
  never reached the map gets no ticket, and the salamat line goes through
  `thanksWords()`, so a quiet trip shows no zero. The kilometre came later in
  October 2026, when the maintainer saw the gap: half an hour waiting at the
  terminal with sharing on, then Stop, was a ticket for a trip that went
  nowhere. It is measured on the chain between the same two ends the ticket
  names (`ticketFacts()`), the start one number and the end read off the
  last fix, so the trip record did not grow; a route with no checkpoints to
  measure along leaves it to the time. The honest cost is a sharer who rides
  to the far end and back without stopping, who comes out near zero too, but
  a trip that ends where it began already counted for nothing on the bus
  (rule 14). **Every end of
  a trip draws it, not only Stop** (October 2026): GPS giving up, a key
  changed or open sharing switched off mid-trip, the end-of-line question left
  to stop by itself. Those ends used to pass `quiet` and show nothing, so a
  sharer who kept a bus on the map for an hour lost the ticket to a GPS
  timeout at the last stop; the maintainer asked that nobody who shared go
  without one because of an error along the way. Whether the trip was long
  enough is still `ticketWorthShowing()`'s alone, so a route already full at
  the first write shows nothing. The one end without a ticket is an
  organizer's Stop, because a bus taken off the map as wrong is not thanked
  for having been on it. The ticket is also drawn before `clear_bus_position`
  is sent rather than after it answers: it is made on the phone, and at the
  end of the line that request can take long enough to answer that the
  phone is back in a pocket first. The record it is
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
the figure the salamat design existed not to keep. (The sharer's bus now
keeps one, on their phone only, by a later decision: see "Collecting". The
album still adds up no flowers.) A stamp not yet collected is
printed faint with "not yet", never "×0". The album used to be offered only
once something had been kept, the no-zero rule again; since your bus arrived
it is always offered (see "Collecting"), worded without a number until there
is something in it.

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
privacy panel names, with "Start from scratch" in the album and Remove (asked twice)
on each kept ticket; removing the last ticket removes the key. The honest
limits, all stated in the album or the panel: it is in that one browser, so
clearing browser data loses it, and the Android app and Chrome on the same
phone keep separate albums. At first there was no backup, because a backup
is a copy somewhere else; there is one now, as a file the sharer makes and
keeps themselves (see "Dressing the bus"). There is no cap: a ticket is under a hundred bytes, so a
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

## When a trip is interrupted

October 2026. The maintainer asked that nobody who shared go without a ticket
"because of just one error along the way", and two gaps were found besides the
ends that used to pass `quiet`.

**GPS that drops out is waited out.** A covered terminal or a phone slow to
wake makes `watchPosition` report an error (no fix, or none within 20
seconds) and carry on watching. Any error used to end the trip there and then.
Now only "location off or blocked" (code 1, `NOT_AUTHORIZED` in the Android
plugin) ends it at once. Anything else is waited out for as long as the server
keeps a bus without an update (`bus_expiry_min`, 10 by default), with the
sharing tab saying the signal is lost. Meanwhile the heartbeat holds back: it
re-sends the last fix every 21 seconds so a bus idling at a stop stays live,
and re-sending a fix nobody has confirmed would keep a guess looking live on
everyone's map. Held back, the bus fades as "delayed" and then expires, which
is the truth. The first fix puts everything back; none ends the trip the way
Stop does, ticket included.

**A hidden page is waited out too.** A browser gives a hidden page no GPS at
all: the Geolocation standard holds every fix back until the page is on
screen again, Chrome, Safari and Firefox all do it in code, and the watch's
timeout pauses with it, so a locked screen or another app in front never
shows up as GPS lost. The page's timers can run on, for seconds on an iPhone
and up to minutes on Android, and the heartbeat used to spend them re-sending
the last fix: a bus that had driven on stayed live on everyone's map, standing
where the screen went off. Reproduced on this page in Chromium, hidden for 70
seconds while the bus moved 780 m: two writes went out, both from where it
was hidden. Now `hiddenSinceFix` is set when the page is hidden mid-trip and
cleared by the next fix, and neither the heartbeat nor an answered trip
question sends a fix from before it, so the bus fades and expires as it does
when the GPS is lost. Unlike lost GPS it never ends the trip: the GPS is back
the moment the sharer looks. The app's GPS runs with the screen off, so in the
app nothing changes. One side effect, already true on an iPhone: a second tab
finds a hidden tab's trip quiet after 45 seconds and offers to carry it on.
`test-boot.js` section 14 and `test-prompts.js` case 10 hold it.

**The trip outlives its page.** A reload, a browser that discarded the tab
behind another app, an app the phone closed: each lost the trip and its ticket
together, and left the bus on the map until it expired. `TRIP` is now also
kept in localStorage as `wt-trip` while the trip runs, with the session id, the
direction and the bus number, overwritten on every landed write and removed
the moment the trip ends. The record grew two fields, `lastAt` and `lastKm`,
when and where on the chain the last update landed: one number each, written
over every time, so still no trail. A page opened with a record in it asks
"Still on the bus?" while the bus would still be on the map: Keep sharing goes
on as the same trip and the same bus (the session id is restored, the welcome
is skipped), I got off clears the bus and draws the ticket as the trip stood
at its last update. Older than that, the ticket comes without a question. A
second tab of the same browser must not take over a trip the first is still
sharing, so a record from another tab whose last save is under 45 seconds old
is left alone and looked at again a minute later. The honest cost, stated in
the privacy panel: a page that closed mid-trip and is never opened again
leaves that one record, a start time and two numbers on the chain, on the
phone until it is.

**A request nobody waits for is never sent.** supabase-js builds a request and
sends it only when something asks for its answer (`then`). The wrong-direction
pause called `rpc('clear_bus_position', …)` and moved on, so the bus it was
meant to take off the map while the question was open had never left it.
It now ends in `.then`, and `test-boot.js` fails on any `rpc(` line that is
not awaited, assigned, returned or `.then`ed.

## Collecting: the ticket's luck and your bus

October 2026. Asked for "so it really feels like a collection": sometimes one
ticket, sometimes another; and milestones, "shared 3 times, shared 5 times".

**Luck, worked out rather than drawn** (rules 11 to 13 in the album block).
A ticket's paper (five pale colours), its punch (round, square, triangle,
diamond), what is on the road (a jeepney, a tricycle, a carabao with its
egret, a sorbetes cart, a fruit stand), in the sky (kites or birds), the
weather (fog, drizzle, a rainbow), the moon that night (its real phase, from
the date), the season (the parol from 1 September to Three Kings, as in the
header; banderitas in May; two flags on the coach for the flag days, 28 May to
12 June) and, one ticket in fifteen, gold foil with a shooting star or a double
rainbow. All of it follows from a hash of the four things a kept ticket keeps,
the day, the direction and the two ends, plus its stamps for the sky. That one
choice does three jobs: a kept copy draws the same picture with nothing new
stored; there is no re-roll, so starting and stopping short trips to fish for
a gold ticket (each one a bus on everyone's map) gets the same ticket every
time; and nothing about how the bus was driven, how long it took or how many
said salamat can reach it. `ticketLook()` decides, `TICKET_SIGHTS` and
`moonSvg()` draw, and `sightTile()` shows each sight on its own as a sticker
in My tickets, where the ones not yet spotted are faint with "not yet". The
plain picture, with no luck passed, is byte for byte what it was, so the guide
and the tests that pin it did not move.

**Your bus** (rules 14 to 16). Every trip that drew a ticket and went
somewhere, its two ends different places, kept or not, is counted on the
sharer's phone as `wt-bus`: trips, and how many were first on the map, end to
end, before 5 AM or after dark, which directions, and which places, plus
whether each tour was finished. Fifteen decorations are earned from those
counts (`DECOR`), from a sampaguita garland
for the first trip to a chrome horse for the hundredth, a rooster for being
first on the map three times, a stripe for a trip end to end, bumpers for both
directions; `BUS_DECOR` draws them over `COACH_SIDE` and `busSvg()` draws the
bus. A trip that earns one says so on its ticket, with the bus. Decided, each
for a reason:

- *Findable before the first trip.* My tickets, the row at the foot of the
  sharing tab, used to appear only once a ticket was kept, so a new sharer
  had no way to see what there was to earn. It is always there now. With
  nothing yet it says "Your first trip starts them", and opened it shows the
  plain bus with every decoration, and every place, stamp and sight, faint
  with "not yet": what is possible, shown without a single zero. Each
  decoration's card shows it on its own part of the bus (`decorTile()`, cut
  by `DECOR_BOX`): in colour once earned, and until then as a dashed outline
  over a faded coach, so a sharer can see what is coming.
- *The first ones come from the tours.* Finishing the map's tour hangs a bell
  by the door (Kampanilya, the one a rider rings for "Para po!"), finishing
  the sharing tour puts a route board in the windscreen (Plaka ng ruta). So a
  new user's bus has something on it before any trip, and they have seen how
  decorating works; for someone who only watches, it is a nudge towards
  sharing, which is the tool's real shortage. Finished means reaching the
  last step, tapping through included: it is a welcome, not a test. Earned
  once, kept as two yes-or-no counts on the bus, and stored only after the
  run is over (`walkFinished()` from `endWalk()`), because nothing is stored
  while a tour is on. A tour puts nothing on the map, so there is nothing to
  farm, unlike trips. A "New on your bus" card says what it earned, close
  up, and where My tickets is.

- *Numbers, not a list of dates.* A count of trips cannot say when anyone
  worked; a list of dated trips could, which is why kept tickets never held
  times and this never holds a list of days. It holds two single dates, each
  overwritten by the next: the week of the last trip, to count the streak
  from, and the day of the last trip that earned parts, for their daily cap
  (below).
- *Kept or not.* Milestones that needed Keep tapped every time would make Keep
  a default in practice. Counts with no list of dates are not the thing rule
  10 was protecting.
- *Only trips that went somewhere.* Otherwise sitting at a stop with sharing on
  for five minutes would dress the bus, and every such sitting is a bus on the
  map that isn't one. Since the kilometre rule above, such a sitting gets no
  ticket either.
- *Totals and streaks, on the phone only* (changed later in October 2026).
  At first there were no streaks, no salamat total and no time on the map
  summed: a streak on a crew member's phone is an attendance sheet, and
  "thanked 50 times" is the running total the salamat design existed not to
  keep. The maintainer decided otherwise, for two reasons: riders are likelier
  to come back to an app that keeps their score, and the company has its own
  ways of keeping track of its crews, so a total on a sharer's own phone adds
  no new way to watch them. What was kept from the old reasoning is the
  shape: each is one number (minutes on the map, salamat received, the week
  of the last trip, the streak and the best), never a list of days, times or
  trips, so they say how much and when last, never a timetable. The server still adds nothing
  up and `thanks_now` still dies with its trip. Streaks count weeks, because
  a commuter's weekend would break a daily one every Saturday, and the
  decorations follow the best streak, so breaking one takes nothing away.
  Eight decorations come from them: flowers, ribbons and a gold star at 10,
  50 and 100 salamat; luggage, curtains and a painted back window at 10, 50
  and 100 hours; fog lamps and a pennant at 4 and 12 weeks in a row. The
  ticket a trip ends with says what the bus has gathered in all.
- *On the sharer's phone only, unless they choose* (changed later in October
  2026). Decorations on the live map were refused at first: a decorated bus
  tells the road whose phone has shared most, and the same decorations on the
  same bus every morning would link one person's trips across days, a
  schedule kept by anyone watching. That is still true, and is now the
  sharer's to decide: see "Dressing the bus".

## Dressing the bus: spare parts, the shop, and showing it

Later in October 2026 the maintainer asked for coins earned by achievements
and spent on accessories, a change of colour, a backup and restore with a way
to start from scratch, riders seeing a sharer's decorated bus, and the bus
moving through scenery that follows where it is. With two conditions:
guardrails, so that nobody can farm any of it at everyone else's cost, and
nothing added to the tracking tab. Rules 17 to 19 in the album block hold it,
`test-thanks.js` section 20 tests the logic and `test-boot.js` the screens.

**Spare parts** (rule 17), *piyesa*. Each achievement gives parts once,
when it is earned (`DECOR`'s `pay`, 10 for the first trip up to 100 for the
hundredth; `paid` keeps which have), and a trip that drew a ticket and went
somewhere gives `PARTS_TRIP`, 5, for at most `PARTS_TRIPS_A_DAY`, 3, a day.
`busTripPay()` and `busSettle()` are the only things that add. The guardrails
are about the map, not the parts: every trip farmed for them would be a bus
on everyone's map that isn't one, so a trip earns little, earns nothing past
the third of a day, and only if it went somewhere, and the achievements give
most. Nothing a sharer can do with parts changes what anyone else sees except
through rule 19, which only carries presets. They are never bought with
money, never sent and cannot be given to anyone: there is no balance on the
server, so there is nothing to sell or steal. Someone who edits their own
storage, or a backup, can give themselves any amount, and a backup passed
round a group chat gives everyone who restores it the same bus; it changes
their own drawing and nothing else, which is why that is accepted rather
than prevented. Stopping it would take a record per sharer on the server,
which this app avoids on purpose.

They were *barya*, coins, at first. The maintainer saw that riders might
think real money was involved, so they became something that is plainly not
money, shown as a drawn steel nut beside a number (`partsTag()`, the
`i-part` icon), with the word for screen readers only and "Get" where a
button said "Buy". Stars were considered and turned down because a star
beside a trip reads as a driver's rating, the thing this app refuses, and
gems because in the Philippines they are what games sell for load;
`test-thanks.js` fails if barya, coins or buy appear anywhere on screen.

**The shop and the paint** (rule 18). Eight accessories (`SHOP`: dice, an
antenna, a visor, a chrome mirror, an exhaust stack, flames, a glow under the
bus, gold wheels) and seven paints (`PAINTS`, `BUS_PAINTS`; the first,
klasiko, is the livery and free). The achievements' own decorations are
trophies: earned, never for sale, so a bell still means a tour finished and a
horse a hundred trips. Presets only, with no colour picker and no text,
because rule 19 lets the bus be seen: nothing on it can be a word, an advert,
a phone number or anybody's colours. Buying takes two taps on the same
button; anything owned can be taken off and put back on; the paint chosen is
the bus's everywhere it is drawn.

**Showing it to riders** (rule 19). Off until the sharer switches it on, and
asked once, only when there is first something on the bus to show: on the
ticket of the trip that earned its first decoration, on the card at the end
of a tour that earned one, after the first thing bought, and as a switch in My
tickets. Never on the tracking tab: the maintainer asked for no clutter
there, and a question about showing nothing would be noise. While it is on,
each position carries `busLook()`: a digit for the paint and one letter per
thing worn, from the `id`s in `DECOR` and `SHOP`, sorted. The database keeps
only that shape (`^[0-9][A-Za-z]{0,40}$`, `sql/13-bus-look.sql`), storing
anything else as nothing rather than refusing the position, on the trip's own
row, so it is overwritten with every write and goes with the trip. A watcher's
popup reads it back with `lookRead()`, which ignores any letter it does not
know. The honest cost is the one that kept decorations off the map at first,
riders can tell the bus is the same sharer's from one trip to the next. It is
stated in the privacy panel and in `for-operators.html`, not at the question:
the question is one line, "Show customized bus to riders?", and the switch
says the same, because the maintainer's rule is that nobody reads a paragraph
in the middle of a moment like that (a first version explained the cost in
three sentences there and was cut). A sharer's own popup shows their bus as
they dressed it, whether or not they show it to anyone else.

Order of deployment does not matter. The two writers gain `p_look` with a
default, so a page from before it calls them as it always did and shows plain
buses. A page from after it, against a database without it, is refused for
the unknown argument (PostgREST's "Could not find the function"); the page
sends the same position again without the look and stops sending one for the
rest of its life (`LOOK_SENDS`), so a position is never lost to a look.

**The ride** (`rideSvg()` in the PICTURES block). In a bus's popup and at the
top of My tickets, the coach is on the road: the dashes, the posts and the
bushes scroll past, the wheels turn and the coach rocks a little, in front of
the view of the place it is nearest (`TICKET_VIEWS`, chosen by the nearest
checkpoint's mark) under the sky of the hour. In My tickets it drives past
each kind of place on the route in turn, five seconds each (`rideViews()`).
Decided:

- *A pace, not a speed.* The loops run at fixed durations (`RIDE_LOOPS`), never
  the bus's speed: a scene that sped up with the bus would put the driver
  metric on every rider's screen. The pace is about 60 km/h to the eye: the
  first version read as 20, and the maintainer asked for 60. No loop may be
  under 0.8 seconds (`test-tokens.js`), so each covers more road instead:
  78 units of dashes in 1.3 seconds, a post a second, the bushes behind at
  half that, three turns of the wheels a loop. `test-pictures.js` section 8
  holds the road, the posts and the wheels to the same 60 units a second and
  every loop to ending where it began.
- *Still when the bus has gone quiet.* A bus not heard from lately stops on
  the road, so the picture never claims movement the data does not.
- *Still when the bus is standing* (October 2026). A sharer can start at the
  terminal while the bus waits to leave, and its popup drove past the town
  all the while. The maintainer asked whether the picture could follow the
  bus's speed instead. It cannot, for the reason in the first point, and it
  did not need to: whether a bus is moving at all is a yes or no every rider
  can already read off the map, where its badge stays put. So the rider's
  page remembers one place and one time for each bus on the map, where it was
  when it was last seen to move and when, by the bus's own report times
  (`rideStand()`). Two minutes of reports within 150 m of that place and the
  picture stands still; the first from further on and it drives again. The
  place it remembers is never more than 150 m from where the bus is now, so
  it is "here, since then" and never a place the bus has left, and standing
  is never put into words: "standing for 12 minutes" would be a driver's
  breaks timed on every rider's screen, and `test-pictures.js` fails if
  anything but the popup's picture reads it. The positions come with every
  poll anyway, nothing is sent or kept, the record is rebuilt from each poll
  so a bus that leaves the map leaves nothing behind, and the speed the GPS
  reports is still thrown away before anything goes out (`p_speed: null`).
  A bus that stops reporting is not called standing, because its report time
  does not move: that stays `freshness()`'s to stop, as before. A page just
  opened needs those two minutes of reports before it can tell, so a bus
  that has waited for an hour still drives on in its popup for the page's
  first two minutes.
- *Phase-aligned.* The popup is redrawn with every refresh; each loop's
  negative `animation-delay` is worked out from the clock, so a redraw
  carries on where the last one was instead of jumping back.
- *Close up in the popup.* The popup is 240 pixels wide on a phone, and the
  map is too narrow for a wider one. Framed as My tickets frames it
  (`close`), the bus was about 114 pixels long and the dice a few pixels; the
  maintainer found a framing tight on the bus (212 pixels) too much, so the
  popup's own (`RIDE_FRAMES.popup`) leaves some road ahead and sky above, the
  bus about 180 pixels. The picture is taller, so the four lines under it
  became two ("▲ 98018 · live", then where it is) and the popup still fits
  the map.
- Under reduced motion the stylesheet's blanket ends every loop where it
  started, and My tickets does not cycle its views.

**Backup, restore and starting over.** There are no accounts, so a backup is
a file: "Save a backup" in My tickets, under Your progress, makes a small JSON
file of the kept tickets and the bus (`backupMake()`) and hands it to the
phone's share sheet where there is one, or downloads it; "Copy" puts the same
text on the clipboard for a chat or a note. Restore reads a file or pasted
text through `backupRead()`, which cleans every field the way storage is
cleaned and refuses anything that is not a backup (or is over 400,000
characters), then replaces what is on the phone, with a second tap if there
is anything to lose. "Start from scratch" (once "Remove all") deletes the
tickets and the bus, also on a second tap. The app never sends a backup
anywhere, it writes only the two keys it already had, so the six remembered
things stay six, and the privacy panel says what a backup is.

## Rules revisited, October 2026

The maintainer asked which rules could be changed and what changing them
would unlock. What changed, and what was kept and why:

- **Changed:** "the trip record lives only in memory" (it is now saved while
  the trip runs, so a reload no longer costs the trip or its ticket); "four
  remembered things" (six: your bus and the trip in progress were added, and
  the privacy panel names both); the ticket being the only thing a trip leaves
  on a phone (your bus's counts now outlast trips, as numbers with no list of
  dates);
  "the ticket is the same for the same trip" (it still is, but no two trips
  are drawn alike); `for-operators.html`'s "one thing can be kept" (now two,
  and it says what the second is).
- **Changed after that, by the maintainer:** a running salamat total, time on
  the map in all, and a streak (in weeks), all on the sharer's own phone
  only, as single numbers. See "Collecting" for why and what shape they keep.
- **And after that:** spare parts, a shop, paint, a backup, and a decorated bus on
  the live map, by the sharer's choice. See "Dressing the bus" for the
  guardrails.
- **Kept:** no location history; no watcher location leaves the device; no
  total of anything on the server; nothing about speed or a trip's length in
  any stamp, luck or decoration threshold beyond the time summed in all; no
  ETA in minutes (it needs the travel-time history the first invariant
  forbids); a decorated bus on the map only by its sharer's choice, off until
  they make it, and only from fixed lists; no picture that moves with the
  bus's speed.

## The guide and the tour

October 2026. The maintainer asked for the guide to be very clear, with no long
blocks of text, more pictures where they help, and for an onboarding tutorial
people can easily open: an interactive way to explore what the app does, with
the Arok app's tour as the model.

**The guide was ten thousand pixels of paragraphs on a phone.** About twelve
screens, with four-paragraph steps for the saved stop and the ticket, and the
same sharing screen drawn twice (once as a 24-second animated cycle, once
still). Every claim it made is still on the page; what changed is where. Each
idea is now one line and one picture, and anything a first reader does not
need (the buzz switch, why there are no minutes, what a kept ticket leaves out)
sits in a "More" fold under it, as a second question. New drawings were added
where a line would otherwise have had to describe a screen: a bus's popup as
`busPopupHtml()` prints it, a key to the strip's marks, the saved-stop card's
three flags. The two animated stacks went: a cycle makes a reader wait for the
step they wanted, and the prompts read better as a list of four.

**The tour runs on the real page, not on a copy of it.** A demo page would be a
fourth hand-maintained recreation of the tracker, and the guide already shows
what those cost. Steps are data (`WALKS`): a selector for what the ring goes
round, an optional tap, and the scene the step needs (which tab, the popup
open, the direction picked, the ticket open). A step sets its whole scene
rather than doing and undoing things, so Back is the same code as Next and a
run left halfway leaves nothing behind. `test-tour.js` fails if a selector stops
matching the page.

**It shows a practice bus, because the real map is usually empty.** A tour that
rings an empty strip and says "each badge is a bus" teaches nothing. So for the
length of a run `busesNow()` hands the strip, map, chips and card one practice
bus instead of the real ones, most of the way along the second leg, and the card
waits at the stop just past it, so the app's own code has something true to say
("Malapit na!"). Real buses and sightings are kept off the screen while it is up,
so the two can never be confused: a mock that could be mistaken for live data is
the one thing this project does not forgive. The practice bus is labelled
Practice wherever a bus number would show, every bubble carries a PRACTICE tag,
and the ticket says PRACTICE TICKET on its face.

**Nothing in a run can be sent or kept.** As in Arok's tour, a clear layer takes
every tap, and a step that asks for one lays a clear button over the real
control: the control itself never hears it. On top of that, every function that
sends or stores refuses while `WALK` is set (salamat, the bus link, "I'm on this
bus", the saved stop, Keep, Start, a sighting, the buzz), so even a bug in the
shade could not send a practice salamat to a stranger or replace the reader's
stop with the practice one. The only key a run touches is `wt-guide-seen`.

**A first visit is offered it; it does not start by itself.** Arok starts its
tour on first run. Here the page has one job, which is the bus, and a tour over
the map on arrival would stand between a rider at a roadside and the answer.
So a first visit gets a small "New here?" note at the foot of the screen, where
it covers nothing the page was opened for, and answering it either way is kept
under the guide dot's key: both mean "this phone has been shown around", and the
privacy panel's six things stay six. After that the tour is a quiet button at
the foot of each tab and two buttons at the top of the guide.

**Named `walk*`.** The content-blocker lesson again (see "Content blockers"):
filter lists carry cosmetic rules for onboarding libraries (intro.js, Shepherd,
Joyride and the generic tour and tooltip names), and a blocked bubble over a
dimmed page is a page with no way out. `test-tour.js` scans for those names.

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

**The icon is the sharer's ticket** (October 2026, the maintainer's choice
after twelve rounds of drafts; `docs/JOURNAL.md` has them). Three tickets
fanned on a morning coral, the ticket a sharer is given at the end of a trip:
the coach drives out through the front one's picture of Taal at dawn, the two
behind it are other trips, the lake and the city, and SALAMAT is stamped
across two. It replaced the front-on coach on maroon, which was generic at a
launcher's size and, coming straight at whoever looked at it, read as
something to get out of the way of. A ticket is the thing only this app has.
The app's front ticket is printed FIBI, the name under it on a phone; the
website's carries a line of print there instead, because the site is Bus
Tracker and its home-screen icon and link preview call it nothing else.

**The small mark is the same ticket punched through in the coach's shape**,
for where the icon is too small to read: the favicon on every public page, on
the icon's coral; the admin page's, on ink, so an organizer can tell its tab
from the tracker's; and in the Android app, the status bar's icon while a bus
is shared and the one-colour layer Android 13 tints for themed icons. It is
one path whose holes the even-odd rule cuts, so anything that can fill a path
draws it in one colour, and it leans as the tickets do everywhere but the
status bar, where a lean blurs at 24 dp. The map's badges stay the front-on
coach: a badge says where a bus is, and the mark says which app this is.

**Both are drawn, never copied by hand.** `tools/make-pictures.js` draws
every copy of the icon into `tools/app-icons.html`, between `appicon`
comments, with `index.html`'s own COACH_SIDE in the dawn scene's colours, and
writes the mark into the six pages' favicons and the app's two drawables.
`tests/test-signboard.js` section 6 fails if any of them stops matching, if
the app's icons stop saying FIBI or the website's start to, or if the stock
Material bus comes back to the app.

**Home screen.** `manifest.webmanifest` and the icons in `assets/icons/` make
"Add to Home screen" give the tickets on coral rather than a screenshot or a
letter. The maskable one draws the tickets smaller, inside the web's safe
circle of 80%, because Android may crop it to a circle. There is deliberately
no service worker: an offline copy of a live map would be a map of where the
buses were, which is worse than no map.

**The icons are rendered, not drawn by hand.** `tools/app-icons.html` is the
source, and `tools/render-icons.sh` screenshots it with headless Chromium at
each size, like `render-flyer.sh` does for the flyer: the website's into
`assets/icons/`, Play's into `mobile/store/`, and the app's launcher layers,
Android 7's own icons and the splash screen's picture into its `res/`
folders, at every density. The pictures with transparency in them are shot
on a page with no background, with Chromium told to paint none behind it.
Their pixels need a browser to check, but their sizes do not, and the wrong
size is how a render goes wrong, so section 7 of the test checks every one.
Both scripts prefer
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

**Google Play's pictures come from the same page.** The store's icon is
`mobile/store/play-icon-512.png`, the app's icon with FIBI on it, full-bleed
because Play rounds its corners. Play lists it as a 32-bit PNG and Chromium
writes a picture with no transparent pixel as 24-bit, so its top-left pixel is
drawn a step short of opaque, under the corner Play rounds off. Its feature
graphic, 1024 by 500, is the page's `#feature` picture, which the script
writes to `mobile/store/`: the preview's pieces laid out again, with FIBI by
the icon and words for the sharer on board. The preview's own words say "no
app", which is true of the site and wrong on a store page. It has a board of
its own, which `make-pictures.js` draws like the rest.

**Both are in the icon's morning colours** (October 2026), where they had
been the livery's maroon: the link preview is most riders' first sight of the
tracker, in a group chat, and it should look like the icon they will have on
their phone afterwards. On coral the print is the deep maroon, because white
on it is too faint, and the icon's tile has a cream edge, so it does not melt
into the coral behind it.

**The link preview's picture needs a full address**, because the crawlers that
build preview cards will not resolve a relative one, and `index.html` cannot
know its own address. So the committed `og:image` is relative, and
`tools/write-preview-url.js` rewrites it at build time from the address
Netlify gives every build — the second line of the published site that is not
the committed one, after the CARTO key. A host that does not set it gets a
preview with no picture and nothing else changes.

## The showcase video

`tools/render-video.sh` makes a one-minute vertical video (1080x1920, English
captions, the interface's own sounds) for Facebook, TikTok and Reels, where the riders who have
never heard of the tracker are. The story is one sharer's morning: wait at a
stop until the card says Sakay na!, get on and share the bus, riders say
salamat, the card says Bababa na!, Stop gives a ticket, the ticket goes into
My tickets, the bus gets a new paint, tries on five other paints and sets of
accessories for half a second each (the maintainer's ask: show how much can
be changed, without the taps), and "Show customized bus to riders" goes
on; the next morning another rider taps that bus and sees it dressed.

**Real screens, not a drawing of them.** The guide, the flyer and the
briefing redraw the tracker by hand and go stale when it changes. The video
films the real `index.html` instead, in headless Chromium at a phone's size,
so it cannot show a screen the app does not have; between scenes it shows
drawings made by the app's own SIGNBOARD and PICTURES blocks, run the way
`tools/make-pictures.js` runs them. When the screens change, the video is
out of date until it is rendered again.

**Nothing reaches the database.** Every request the page makes to Supabase
is answered by the script (`World` in `tools/video/render.js`) with made-up
buses, so no bus is put on anybody's real map, no watcher is counted and no
salamat is sent. The first renders carried "Demo · not real buses" on every
screen, the flyer's "example screen" rule; the maintainer took it out
(October 2026), so the video says nothing about the buses being made up.
The flyer keeps its label.

**Frame-exact.** Each phone's clock is Playwright's fake one, paused and moved
on one frame at a time, and every CSS animation on the page is paused and
set to the same time before the screenshot. So it never stutters, and two
renders look the same, though not to the bit: drawing leaves noise too faint
to see (52 dB or better between two renders, measured), and a tap still
reaches the page by the wall clock, so what it opens can show a frame
earlier or later. The buses move in
time-lapse, from positions
worked out from the video's time; the half hour of the trip passes inside
an interlude, in six-second steps so the page's own timers fire as they
would.

**The page's pace is the film's own.** The page polls twice a second in
the film rather than every six, so the buses move in small steps. Two
things in the page are paced for the slower feed. The saved stop's picture
glides to each new position in a second, easing in and out, so it started
and stopped twice a second. The sharing phone sends its position at most
every five seconds, so on board the card stood still and then jumped to
Bababa na!. The maintainer asked for both to move smoothly, for
presentation. So the copy of `index.html` the film is served (`filmPage()`
in `render.js`) glides for one poll at an even pace, and lets the phone
send a little oftener than the film polls. Nothing else in the page
differs from the commit, and the render stops if those lines change in
`index.html`, rather than quietly filming the stutter again.

**Saving the stop takes four seconds** (the maintainer's ask, October 2026).
The camera closes on the picker while the whole name is typed. After the
pick, it goes to the pin as it lands on the map, with rings going out from
it and the stop's name beside them, and stays there a second before the
card. It goes no closer than 1.35 times (`SHARP` in `film.js`). The phone
is filmed at three pixels a point and the stage draws it at 2.2, so a
closer camera enlarges the capture, and at 2.4 times the map blurred. The other scenes were each made a little shorter, so the video is
still about a minute.

**Choices the app forced.** The story waits at Javalera and gets off at SM
City General Trias because the card counts down to both one stop at a time;
at Dagatan it reads "8 stops" and then "2", which is right (the Tagaytay
hook) but looks like a fault. The sharer starts 700 m past the stop they
waited at: within 300 m (`AT_STOP_KM`) the card would say Bababa na! at
once and spend the trip's one buzz there. The stop to get off at is set while
the phone is swiped off the screen as they board. Near the end the GPS is
held still, so the page's next position (it sends one every five seconds at
most) goes out the moment the bus reaches the last stretch.

**What the captions may say.** One short plain sentence each, under the
same rules as the app's own words: no minutes and no arrival time, Bus
Tracker and never the company's initials, and the end card's
"Community-run. Not affiliated with the bus company." One caption is the
maintainer's own and breaks the spare-parts rule on purpose: "Earn coins and
dress up your bus." (October 2026). The app still says spare parts and draws
a nut; the video's word is coins. The stage draws a buzz only in the two
alarm scenes. Filming it found the page buzzing just after Stop too, for the
bus just left; that is fixed in the app ("The reader's own stop"). The parol is switched off in the made-up settings, so the
video still looks current after the season. The map needs `CARTO_API_KEY`;
the script writes it only into the copy of `config.txt` it serves, and keeps
the tiles in `video-out/.tiles` so a re-render asks CARTO for nothing.

**Its sounds are the interface's only.** Taps, the buzz in the app's own
on-off pattern, a pop for Malapit na!, a chime for Sakay na! and Bababa na!,
a sparkle for salamat, the ticket printing, a stamp for Keep, coins for the
paint, a click for the switch, and swipes between scenes. Each is made from
sine waves and noise by `tools/video/sounds.js`, so there is nothing to
license, and each is placed where the page was seen to do the thing on
screen (`LISTEN` in `film.js`), not where the script expected it to. Music,
the engine and the street are left for whoever edits the video: the track is
also written on its own, `bus-tracker-ui-sounds.wav`, peaking at -3 dBFS.

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
album `album*` and `.tktmini`, and the buzz switch `.buzz` (it lost its
`buzzBox` id when the card began to be written twice, onto both tabs).
Riding to your stop added `boardBus`/`leaveBus`, `aboard*`, `.ride-acts`,
`#tripStop` and the tab's `.tablive` dot. None of them is the kind of thing a filter list
hunts for, and the scan agrees.

A fourth list arrived with the line that offers the Android app. Fanboy's
Mobile Notifications List, the one behind Brave's blocking of "open in app"
prompts and part of Fanboy's Annoyance List, hides "get our app" banners by
name: `.mobile-app-banner`, `.open-app-banner`, `#bannerInstallApp`,
`.headerGetApp` and about forty more, each an exact name. So the line is
`#gpsAppLine`, named for the hint it sits in, and its link has no name at all.
The scan in `test-boot.js` section 8 asks for something broader than any one
rule: no name that puts "app" next to banner, install, download, get, open or
promo. In October 2026 that caught 38 of the list's 41 such names, and nothing
on the five pages. None of these lists hides a link by where it points, so a
link to Google Play is safe as long as it is not named like a banner.

## Known limitations

**Screen must stay on while sharing in a browser.** A browser gives a page no
GPS while the screen is locked or another app is in front: the Geolocation
standard keeps position updates "exclusively for fully-active visible
documents", every engine does the same, and nothing planned changes it, an
installed web app or a Trusted Web Activity included. This is a platform
restriction, not a bug. The page's JavaScript may keep running meanwhile,
which is how the heartbeat came to re-send stale fixes ("When a trip is
interrupted"). The page requests a screen wake lock and re-acquires it when
the page becomes visible again, but it cannot survive backgrounding. On
Android the answer is now the app in `mobile/` (see "The Android app" above).
On an iPhone it is still a mounted phone on a charger, and long term a
dedicated GPS tracker device.

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
next to the button: someone can open the tracker in a new tab for a new session
id, so this raises the effort from nothing to a deliberate act. A reload is not
enough, though this page said it was until October 2026: the id is kept in
`sessionStorage`, which survives one, and the trip a block ends is the one trip
that does not get a fresh id. Rotating the share key is
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
signing key that every APK handed out must share, publishing on Google Play,
and the real-trip checks that have not been done yet.

**Its icons** (October 2026) are the site's, in Android's shapes: the
launcher icon is an adaptive icon of three layers, the coral behind and the
tickets in front, both pictures at every density, and the small mark for
themed icons; Android 7, which has no adaptive icons, gets its own square and
round pictures. The splash screen is the tickets on the icon's coral. Android
shows a splash icon at 288 dp, more than twice a launcher's 108, so it has a
picture of its own at the largest density rather than the launcher's layer,
which would come out enlarged and soft. The status bar's icon while a bus is
shared is the small mark, upright and white. All of it comes from
`tools/app-icons.html` and `tools/make-pictures.js` ("The name, the icons and
the link preview", above), and none of it reaches a phone until a new bundle
goes through Play, unlike everything the site draws.

**Getting it** (October 2026). The app goes out through Google Play, and the
website offers it in one place: on the sharing tab, "Keep the screen on"
becomes "Keep the screen on, or get the app and lock it" (`renderAppLine()`).
Only in an Android browser, because an iPhone has no app and inside the app
the line would be offering itself. Only before a trip (`.trip-on` hides it),
because an app started mid-trip is a second bus beside the page's own until
that one goes stale. Never on the tracking tab: watching never needs the app,
and the flyer's promise is that there is nothing to download. The address is
`ANDROID_APP_URL` in `config.txt`, blank in the template, so a fork with no
app offers nothing; the guide's notes on sharing read the same line, and say
to ask the organizer without it.

Play, rather than an APK linked from the site, for three reasons. An APK from
a link in a chat is the shape of the scam apps riders here are rightly warned
about, and on the budget phones common on this route it means a warning, a
detour into settings and a scan before it installs; from Play it is one tap.
Play updates the shell by itself, where an APK stays whatever version it was.
And Google is closing the other way in: since 30 September 2026 the major
stores in Brazil, Indonesia, Singapore and Thailand install only apps from
developers who have verified their identity with Google, and Google's stated
plan takes that worldwide from 2027 and later to direct downloads. A developer
verified through Play Console can register an APK handed out directly as
well, so that stays possible as a fallback.

Play keeps the app's signing key (Play App Signing), and this project holds
only the upload key that proves a bundle came from here: a lost upload key is
reset in Play Console, where a lost signing key would strand every installed
copy. So every copy of the app comes from Play and carries Play's signature,
testers' included, through the internal and closed testing tracks. Nothing is
handed out as an APK signed any other way, because moving between the two
would mean an uninstall, which deletes everything the app's WebView keeps, My
tickets and the sharer's bus included. The upload key is checked before every
release build (`android-release.yml`, run only on demand), because Gradle only
reads it at the end of one and then says only that it could not.

**The privacy policy is the privacy panel.** Play asks every app for a
privacy policy at a public address and inside the app. `#privacy` opens the
panel (`privacyFromLink()`), and the panel says what Play asks a policy to
say: that it is the privacy policy, which app it covers, what is collected,
who sees it, how it travels and when it is deleted. One text for the site
and the app, so the two cannot disagree. Its line on the app says that Google
knows who installed it from Play, and that Play shows the organizer only
totals, never who.

**The closed test signs itself up.** A new personal account goes public only
after 12 testers have stayed in a closed test for 14 days in a row, and Google
refuses production when they installed and never used the app. `testers.html`
takes a rider through three taps on their own phone: join a Google Group that
anyone can join, which is the test's tester list in Play Console; tap Become a
tester on Play's page for the package; install. Nobody sends an email address
and the organizer adds nobody by hand. The group's posts are for members only,
so Google tells everyone else they have no permission, and Play says "App not
available" to an account not in the group yet: the page says both are normal
where they happen, because each is where a tester decides it is broken and
stops. It asks for riding, not installing. Like the guide it loads nothing;
unlike it, it runs no script, so a blocker or an old phone cannot leave three
buttons that do nothing. Nothing linked to it until the test opened; while it
runs, `ANDROID_APP_URL` in `config.txt` names it, so the sharing tab and the
guide offer the test, not a Play page that would say "App not available".

The background-geolocation plugin takes its fixes from Google Play services'
fused location provider, so a phone without Play services, like most Huawei
phones launched since 2019, cannot run the app from any source. That is not a
reason to keep an APK route: the APK would install and then get no GPS.

**What a website could assume and an app cannot** (October 2026). A review
before the closed test went through the page asking which of its habits only
hold in a browser, and found these, each now handled in the page with a
plugin carrying the call across:

- *Back.* A browser's back button leaves the site; an app's has to undo what
  is open. With no handler, Android 11 and older closed the app on back,
  which stopped a trip, and newer ones left it without closing a pop-up.
  `appBack()` closes the top layer, ends a tour, cancels picking a stop on the
  map, and otherwise puts the app in the background, never closing it. A trip
  question has no back-out: it waits for its answer.
- *Files and the share sheet.* A WebView has no `navigator.share` and drops a
  download without a word, so "Save a backup" said "Saved" and saved nothing,
  and the bus link fell back to the clipboard. Both go to the phone's share
  sheet now. The app has no Android backup either (`allowBackup` is off, so
  "on this phone only" stays true), which makes the backup file the only way a
  sharer's tickets and bus reach a new phone.
- *Vibration* needs a permission a browser never asks about; without it the
  WebView ignores `navigator.vibrate`.
- *The key in the link.* On the web the group chat's link carries the share
  key back with a tap. In the app that link opens the browser, and Android
  empties `sessionStorage` whenever it closes a backgrounded app, so the app
  keeps the key on the phone: the seventh remembered thing, app only, gone
  when the key stops working.
- *Closing.* Swiping the app away ends its screen, and the GPS plugin stops
  its service with it. That cannot be helped from the page, so the sharing
  notification says it.
- *Leaving the page.* In a browser, opening the guide mid-trip ends the trip
  and that is all. In the app the page's half ends but the plugin's does not:
  its notification and GPS stayed on for a page that had gone, and a later
  Stop never reached them. The watcher's id is now kept for the visit in
  `sessionStorage`, and the next page to open lets it go.
- *Words.* "Keep the screen on", "close the tab", "clear your browser data"
  are browser words. The tour's Start step and the privacy panel say what is
  true in the app as well.

And two that Google Play asks for. Sightings lost their typing box, because
text anyone can post and everyone can read is user-generated content, which
Play requires posting rules, reporting and moderation for; the board now
draws each post from its picked parts and never shows what was sent. And a
line under Start says the bus shows on the public map until Stop, where Play
wants an app to say what it does with a location before it asks for one.

**The website is the app**, which is the habit with the widest reach: a merge
to `main` reaches every installed copy with no review by Play. The answers
Play Console holds (data safety, permissions, the location declaration) are
kept in `mobile/README.md` and change in the same commit as anything that
changes what leaves a phone, as the privacy panel does.

## Testing

Nothing here is claimed without being checked. The suites live outside the
deploy folder:

- `test-guard.js`, `test-strip.js`, `test-prompts.js`, `test-hours.js`,
  `test-mystop.js`, `test-thanks.js`, `test-signboard.js`, `test-pictures.js` and `test-tour.js` extract the shipped code out of
  index.html by comment markers and run it, so a passing
  test cannot drift from the app. Since October 2026 they also hold the hours
  card and the parol season (`test-hours`), the stop-by-stop card and its two
  louder states (`test-mystop`), the town lines (`test-strip`), the
  ticket's rules and the album's, its luck and your bus (`test-thanks`), and
  the ticket's picture, its sights and the decorated bus (`test-pictures`); every one of those checks was watched
  failing against a deliberately broken copy of the page before it was
  trusted. They need Node, plus config-template.txt one
  level up. `test-tokens.js` runs no app code: it reads every page's styles
  and holds them to the design tokens (see "The look"). `test-boot.js`
  additionally loads both pages in a real DOM (jsdom)
  over a local HTTP server, including a deploy with `assets/` missing and a
  config.txt that was never filled in, and drives a whole trip against a
  stand-in for Supabase and the GPS (section 14).
- `tests/db/00-legacy-baseline.sql` reconstructs the pre-migration database.
  `01-core-tests.sql` runs 55 behavioural checks against it, `02-rotation-tests`
  17 for key rotation, `03-kick-tests` 17 for stopping a sharer,
  `04-privacy-tests` 18 for session id privacy, `05-rotate-tests` 10 for the
  rotation guard, `06-watching-tests` 32 for the watching count,
  `07-thanks-tests` 38 for saying salamat — almost entirely about what they
  refuse to keep, like the 06 suite — and `08-position-tests` 36 for what a
  position write refuses: no position, a cap filled by dead rows, a speed.
  Each runs against its own fresh database; see `tests/README.md`, which is
  now accurate about that.

Two lessons worth keeping. The reconstruction was built from a dump of function
definitions only, so it had no foreign keys, and 55 passing checks still missed
that `bus_positions.route_key` referenced `routes.key` and blocked every key
rotation. **Before writing a migration, get the table constraints, not just the
function definitions.** It happened again in October 2026: `bus_positions.speed`
refused NULL on the live database, nothing in the repository said so, and the
first `08-position-checks.sql` passed every suite here and failed there on the
statement that cleared it. One transaction meant it changed nothing. The
reconstruction now records the constraint.

And `tests/README.md` spent months describing a sequence for the database
suites that could not work: two of the three suites had no runnable order at
all. Passing tests are not the same as tests anyone can run. **A runbook nobody
has followed end to end is not a runbook.**
