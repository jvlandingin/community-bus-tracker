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

The five dependency-free JavaScript suites, run from the repository root:

```
node tests/test-hours.js      # split operating hours, the en-route allowance
node tests/test-guard.js      # wrong-direction detection on simulated trips
node tests/test-strip.js      # progress strip position and wording
node tests/test-prompts.js    # idle, end-of-trip and direction prompts
node tests/test-mystop.js     # the saved stop: which bus is coming, how far, how many stops
```

These are also Netlify's build command, so a failure cancels the deploy.

The fifth suite loads both pages in a real DOM and needs jsdom, which is
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
psql -d bustest -f ../sql/01-base.sql          # then 02, 03, 04, 05 in order
psql -d bustest -f db/01-core-tests.sql        # one suite only, then rebuild
```

`.github/workflows/tests.yml` runs both suites on every pull request and push
to `main`, deliberately using the same steps as `tests/README.md` so the
runbook is re-proven on every commit.

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

**The reader can save a stop**, and the card between the bus chips and the map
then says how far the next bus still is from it and roughly how many stops.
Entirely client-side — no request, table or column was added — and measured
along the checkpoint chain, never straight-line, because across the Tagaytay
ridge hook a bus 1.2 km away as the crow flies is 3.5 km by road. Stops in
between are counted by projecting them onto the chain, never by `config.txt`
order, which is merged from two posters and is not route order. It reports
distance and stop counts only, never minutes: an ETA needs travel-time history
this system does not keep, and `test-mystop.js` fails if the wording drifts
towards implying one.

**The app keeps exactly three things between visits**, all on the device and
all named in the privacy panel: whether the guide has been opened, the
light/dark/system theme choice, and the reader's saved stop. Adding a fourth
means editing that panel in the same commit — the panel is the promise, not the
code. `test-boot.js` section 10 makes that mechanical: it fails if the set of
`localStorage` keys the app writes stops matching the set the panel names.

**Colours come in fill/ink pairs.** `--maroon`/`--brand-ink`,
`--gold`/`--gold-deep`, `--lost`/`--lost-ink`, `--mine`/`--mine-ink`. The first of each pair is a
background with white or near-black text on it; the second is the same colour
used as text. They are nearly identical in the light theme and completely
different in dark, so pick by what the colour is doing — painting a shape, or
spelling a word. All five pages carry their own copy of the token block and
`test-boot.js` fails if they drift.

## Invariants

These are load-bearing. Changing any of them needs a deliberate conversation,
not a judgement call mid-task.

**No location history.** `bus_positions` holds one row per sharing session,
upserted in place. There is no trail table, so the tool cannot be used to review
a driver's speed, breaks or route — the data does not exist. This is the single
most important property of the system. The wrong-direction guard tracks progress
in the sharing phone's memory only and it dies with the tab.

**No watcher location leaves the device, ever.** The reader can save a stop and
switch on a dot showing where they are; both are computed and stored on the
phone, and neither is transmitted. Nothing server-side knows where anybody
watching the map is, and no feature may change that — a public version of it
was considered and rejected, because reads need no key, so "public" means the
whole internet and it would broadcast that a given roadside has somebody
standing at it right now. If a request ever needs to carry a watcher's
position, that is the deliberate conversation, not a small follow-up.

**No package.json.** Adding one makes Netlify run `npm install` and publish
`node_modules` alongside the site, which breaks the no-build-step property.
jsdom is installed only in CI, with `--no-save`.

**No third-party code or fonts.** Leaflet and supabase-js are vendored in
`assets/vendor/`. CARTO map tiles are the only remaining third party and are
disclosed to users in the app. Do not reintroduce CDN links.

**Nothing named `share*`, `help*`, `support*`, `chat*` or `widget*` in a DOM id
or class.** Brave Shields' cosmetic filtering hid the start button because its
id was `shareBtn`, leaving a page that looked completely normal with no way to
share. The failure is invisible from our side. `test-boot.js` sections 7 and 8
scan every page for these names, the flyer included: its whole purpose is one
call to action, and a filter list that hides it leaves a poster-shaped page
with no way to reach the tracker.

**Reads do not write.** Cleanup happens in `_sweep()`, called only from writes.
An earlier version ran a DELETE on every read and was documented as fixed long
before it actually was.

**Tests extract the shipped code.** The JavaScript suites pull functions out of
`index.html` by comment markers and run them, so a passing test cannot drift
from the app. Keep the markers intact when editing those regions.

## Route-specific content

Everything adapts from `config.txt`. `how-to.html` used to be the exception —
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
