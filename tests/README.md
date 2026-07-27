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
HTTP server. It covers a deploy with `assets/` deliberately missing, because
that is the most common way to break the site, and a `config-template.txt`
copied but never filled in.

## Database

Needs a local PostgreSQL. These never touch your live database.

Run each suite against its **own fresh database**. They are independent: every
suite pulls in `db/_prelude.sql`, which defines the assert helpers and runs
setup steps A and B. What they cannot share is a database, because each one
moves the seeded rows the next one expects.

Build a database, from this folder:

```
createdb bustest

psql -d bustest -f db/00-legacy-baseline.sql   # the pre-migration schema
psql -d bustest -f ../sql/01-base.sql
psql -d bustest -f ../sql/02-key-rotation-cascade.sql
psql -d bustest -f ../sql/03-kick-block.sql
psql -d bustest -f ../sql/04-session-id-privacy.sql
psql -d bustest -f ../sql/05-rotate-same-key.sql
```

Then run one suite against it:

```
psql -d bustest -f db/01-core-tests.sql        # 55 checks
psql -d bustest -f db/02-rotation-tests.sql    # 17 checks, key rotation
psql -d bustest -f db/03-kick-tests.sql        # 17 checks, stopping a sharer
psql -d bustest -f db/04-privacy-tests.sql     # 18 checks, session id privacy
psql -d bustest -f db/05-rotate-tests.sql      # 10 checks, rotation guard
```

`dropdb bustest` and build it again between suites. Apply **all** the migration
files every time, not only the one the suite is named after: the suites check
the database as it ends up, not as it was at each step.

`00-legacy-baseline.sql` reconstructs the schema as it existed before any of
this, so the migrations are tested as upgrades of real data rather than against
a clean slate. It also creates the `anon` and `authenticated` roles, which
Supabase provides and a plain local Postgres does not. That needs a superuser
connection; roles are cluster-wide, so it only really happens the first time.

The role step is load-bearing. Without it every migration file fails on its
closing `grant`, and since each file is a single transaction, the failure rolls
the whole file back. What you get is an empty database failing every later
check in a way that looks like a schema bug rather than a missing role.

## Two lessons worth keeping

The baseline was originally reconstructed from a dump of function definitions
only, so it had no foreign keys. Fifty-five checks passed and still missed that
`bus_positions.route_key` referenced `routes.key` and blocked every share key
rotation. **Before writing a migration, get the table constraints, not just the
function definitions.**

This file used to say to run `02` and `03` "against a fresh database rather
than after `01`". Neither worked: on a fresh database they had no assert
helpers, and after `01` the seeded rows they check were already gone, so
`02-rotation-tests.sql` had no sequence at all in which it could pass. Three
suites were documented, none of them runnable as written. **A runbook nobody
has followed end to end is not a runbook.**
