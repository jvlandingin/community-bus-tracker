# Architecture

## Stack

- **Hosting:** Netlify (static). Free tier. Live at
  `https://community-bus-tracker.netlify.app`; the admin page is
  `/admin.html`, which Netlify also serves as `/admin`.
- **Backend:** Supabase (Postgres + PostgREST RPC). Free tier.
- **Map:** Leaflet 1.9.4, vendored locally. Tiles from CARTO light_all basemap.
- **Supabase client:** supabase-js 2.110.8, UMD build, vendored locally.
- **App:** three HTML files, no build step, no framework. `index.html` is the
  tracker, `admin.html` the operator page, `how-to.html` a static guide reached
  from the ⓘ in the header.
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
  config.txt          <- your route's own, holds no secrets, safe to commit
  assets/vendor/      <- leaflet.js, leaflet.css, supabase.js, images/
```

Deploys come from git: Netlify builds the repository on a push to `main`, and
`netlify.toml` runs the four dependency-free JavaScript suites as the build
command, so a failing one cancels the deploy. Nothing is compiled and nothing is
installed, so the no-build-step property holds — what gets published is the
repository exactly as committed. There is deliberately no `package.json`,
because it would make Netlify run `npm install` and publish `node_modules`
alongside the site.

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

**No location history, by design.** `bus_positions` holds one row per sharing
session, upserted in place. There is no trail table. This is the single most
important property of the system: it means the tool cannot be used to review a
driver's speed, breaks, or route, because the data to do so does not exist. Do
not add a history table without a very deliberate conversation about it.

Everything added since has been checked against this. The wrong-direction guard
tracks route progress **in the sharing phone's own memory only**, never sends or
stores it, and it dies with the tab.

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

## Progress strip

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

## Known limitations

**Screen must stay on while sharing.** Mobile browsers suspend JavaScript and
GPS when the screen locks or the user switches apps. This is a platform
restriction, not a bug. The app requests a screen wake lock and re-acquires it
when the page becomes visible again, but it cannot survive backgrounding.
Practical answer: a mounted phone on a charger. Long-term answer: a dedicated
GPS tracker device.

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

## Testing

Nothing here is claimed without being checked. The suites live outside the
deploy folder:

- `test-guard.js`, `test-strip.js`, `test-prompts.js`, `test-hours.js` extract
  the shipped code out of index.html by comment markers and run it, so a passing
  test cannot drift from the app. They need Node, plus config-template.txt one
  level up. `test-boot.js` additionally loads both pages in a real DOM (jsdom)
  over a local HTTP server, including a deploy with `assets/` missing and a
  config.txt that was never filled in.
- `tests/db/00-legacy-baseline.sql` reconstructs the pre-migration database.
  `01-core-tests.sql` runs 55 behavioural checks against it, `02-rotation-tests`
  17 for key rotation, `03-kick-tests` 17 for stopping a sharer,
  `04-privacy-tests` 18 for session id privacy, `05-rotate-tests` 10 for the
  rotation guard, `06-watching-tests` 32 for the watching count — most of them
  about what it refuses to keep. Each runs against its own fresh database; see
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
