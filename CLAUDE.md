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

The four dependency-free JavaScript suites, run from the repository root:

```
node tests/test-hours.js      # split operating hours, the en-route allowance
node tests/test-guard.js      # wrong-direction detection on simulated trips
node tests/test-strip.js      # progress strip position and wording
node tests/test-prompts.js    # idle, end-of-trip and direction prompts
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

**Three pages, one config file.** `index.html` is the tracker (watch + share),
`admin.html` the operator page, `how-to.html` a static guide. `config.txt` holds
the Supabase URL, anon key, route slug, source URL, checkpoints and stops — no
secrets, which is why it is committed and why a fork deploys straight from git.

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
times, sharer cap. Edited in `admin.html`, re-read by the app every 60 seconds,
so a schedule change never needs a redeploy.

**Colours come in fill/ink pairs.** `--maroon`/`--brand-ink`,
`--gold`/`--gold-deep`, `--lost`/`--lost-ink`. The first of each pair is a
background with white or near-black text on it; the second is the same colour
used as text. They are nearly identical in the light theme and completely
different in dark, so pick by what the colour is doing — painting a shape, or
spelling a word. The three pages each carry their own copy of the token block
and `test-boot.js` fails if they drift.

## Invariants

These are load-bearing. Changing any of them needs a deliberate conversation,
not a judgement call mid-task.

**No location history.** `bus_positions` holds one row per sharing session,
upserted in place. There is no trail table, so the tool cannot be used to review
a driver's speed, breaks or route — the data does not exist. This is the single
most important property of the system. The wrong-direction guard tracks progress
in the sharing phone's memory only and it dies with the tab.

**No package.json.** Adding one makes Netlify run `npm install` and publish
`node_modules` alongside the site, which breaks the no-build-step property.
jsdom is installed only in CI, with `--no-save`.

**No third-party code or fonts.** Leaflet and supabase-js are vendored in
`assets/vendor/`. CARTO map tiles are the only remaining third party and are
disclosed to users in the app. Do not reintroduce CDN links.

**Nothing named `share*`, `help*`, `support*`, `chat*` or `widget*` in a DOM id
or class.** Brave Shields' cosmetic filtering hid the start button because its
id was `shareBtn`, leaving a page that looked completely normal with no way to
share. The failure is invisible from our side. `test-boot.js` section 8 scans
both pages for these names.

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
CSS from the same tokens as the app, and the page loads no media at all.

That trade is deliberate: the pictures cannot 404 or go stale silently, but
they are hand-maintained copies of the real UI, so **changing the tracker's
layout means updating the recreations in the same commit.** `test-boot.js`
section 8 defends the two halves of this that a machine can check — that the
guide still loads nothing, and that its copied `:root` tokens still match
`index.html`'s.

The header strip and the "How your data is handled" panel both state that the
app is not affiliated with or endorsed by any bus company. Keep that language
intact — a community tool gets mistaken for an official one otherwise.

## Licence

AGPL-3.0-only. `SOURCE_URL` in config makes the app link to its own source,
which is how the network clause is met in practice.
