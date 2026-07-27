# Tests

Two suites, both designed so a passing test cannot quietly stop matching the
app.

## JavaScript

These read `index.html` directly and pull the shipped functions out by their
comment markers, then run them. If someone edits the app, the test runs the
edited code, not a copy.

Needs Node. Run from this folder with `index.html`, `admin.html` and
`config-template.txt` reachable one level up:

```
node test-hours.js      # split operating hours, the en-route allowance
node test-guard.js      # wrong-direction detection on simulated trips
node test-strip.js      # progress strip position and wording
node test-prompts.js    # idle, end-of-trip and direction prompts
node test-boot.js       # loads both pages in a real DOM (needs jsdom)
```

`test-boot.js` needs `npm install jsdom` and serves the real files over a local
HTTP server, including a case with `assets/` deliberately missing, because a
deploy without it is the most common way to break the site.

## Database

Needs a local PostgreSQL. These never touch your live database.

```
psql -f db/00-legacy-baseline.sql     # the pre-migration schema
psql -f ../sql/01-base.sql
psql -f ../sql/02-key-rotation-cascade.sql
psql -f ../sql/03-kick-block.sql
psql -f db/01-core-tests.sql          # 55 checks
psql -f db/02-rotation-tests.sql      # 17 checks, key rotation
psql -f db/03-kick-tests.sql          # 17 checks, stopping a sharer
```

Run `02` and `03` against a fresh database rather than after `01`, since `01`
mutates the seed rows they expect.

`00-legacy-baseline.sql` reconstructs the schema as it existed before any of
this, so the migrations are tested as upgrades of real data rather than against
a clean slate.

## A lesson worth keeping

That baseline was originally reconstructed from a dump of function definitions
only, so it had no foreign keys. Fifty-five checks passed and still missed that
`bus_positions.route_key` referenced `routes.key` and blocked every share key
rotation. **Before writing a migration, get the table constraints, not just the
function definitions.**
