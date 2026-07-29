# Database

Supabase Postgres. Everything the app touches goes through `SECURITY DEFINER`
functions. The tables have RLS enabled with **no policies**, so the public anon
key cannot read or write them directly. This file exists so the schema never has
to be dumped from a phone mid-project again.

If it ever does need re-checking, these three queries in the Supabase SQL
editor give the full picture. Run all three, not just the functions, which is
the mistake that let a foreign key bug through in July 2026:

```sql
-- columns
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' order by table_name, ordinal_position;

-- constraints (do not skip this one)
select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid)
from pg_constraint where connamespace = 'public'::regnamespace;

-- function bodies (may contain secrets, skim before pasting)
select pg_get_functiondef(p.oid) from pg_proc p
join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public';
```

## Tables

### routes
One row per route. Holds every secret in the system.

| column | notes |
|---|---|
| `key` | the share key, primary key. Secret. |
| `slug` | public route name, unique, not null. Safe to publish. |
| `prev_key` | previous share key, kept for the rotation grace |
| `prev_key_expires` | when the old key stops working (rotation + 4 hours) |
| `admin_salt`, `admin_hash` | salted SHA-256 of the admin key. The key itself is never stored. |
| `pub_salt` | random per route, salts the `pub_id` that `get_positions` publishes instead of the session id. Never returned by anything. |
| `settings` | jsonb, see below |
| `notice_text`, `notice_updated`, `notice_expires` | the pinned notice |

### bus_positions
One row per sharing session, upserted in place. **No history table exists, by
design.** Unique on `(route_slug, session_id)`.

`route_key`, `route_slug`, `session_id`, `lat`, `lng`, `speed`, `direction`,
`bus_label`, `updated_at`.

### sightings
`sid` (identity, used by admin delete), `route_key`, `route_slug`, `body`,
`created_at`.

### watching_now
One row per tab with the tracker page open, upserted in place. `route_slug`,
`watcher_id`, `last_seen`, and nothing else. Rows are deleted three minutes
after the last beat, so the table only ever describes the present. See
"The watching count" below.

### Foreign keys, and a warning

`bus_positions.route_key` and `sightings.route_key` reference `routes(key)`
**ON UPDATE CASCADE**. The cascade is not optional: without it, every share key
rotation fails with a foreign key violation, because child rows still point at
the old key. `route_slug` is the real linkage now; `route_key` is carried for
continuity only.

## settings jsonb

```json
{
  "hours": {
    "north": [["06:00","10:00"], ["15:40","20:00"]],
    "south": [["06:00","10:00"], ["15:40","20:00"]]
  },
  "headway_min": 30,
  "bus_expiry_min": 10,
  "sighting_expiry_min": 120,
  "max_sessions": 25
}
```

Hours are **lists of departure windows** per direction, 24 hour `HH:MM`, 1 to 6
windows each, start before end. The list shape exists because the March 2026
poster splits the day. The app treats buses as possibly en route for 3.5 hours
after a window closes, so it only says "closed" once that has elapsed.

Ranges enforced server-side by `_check_settings`: headway 1 to 720, bus expiry 1
to 120, sighting expiry 5 to 1440, max sessions 1 to 200.

## RPC surface

### Public, slug only, no secret
| function | notes |
|---|---|
| `get_settings(p_slug)` | returns `{settings, notice}`. Notice is null when unset or expired. |
| `get_positions(p_slug, p_self)` | filters stale rows, deletes nothing. Returns `pub_id`, **not** the session id, see below. `p_self` is optional: pass your own session id and your own row comes back with `is_self` set, which is how the duplicate-sharer warning skips itself. |
| `get_sightings(p_slug)` | newest 8 within the expiry window |
| `add_sighting(p_slug, p_body)` | 1 to 140 chars; refuses a 6th post inside 60 seconds route-wide |
| `clear_bus_position(p_slug, p_session)` | takes the real session id, which only the sharer's own phone holds; keeps working across a rotation and from sendBeacon |
| `mark_watching(p_slug, p_watcher)` | the watching heartbeat, see below. Returns nothing and tells the caller nothing. |
| `ping()` | keep-alive target for the uptime monitor |

### Why `get_positions` does not return the session id

It did until July 2026, and the reason written down for `clear_bus_position`
needing no key was that the session id is unguessable, so the session id is the
credential. That reasoning was sound while reads needed the share key. It
stopped holding the moment watching became open to everyone, and nobody noticed
the two changes had met: `get_positions` was handing every anonymous visitor the
live session ids, and `clear_bus_position` accepts a session id and no key.
Reproduced against a real database: read the ids off the map, replay each into
`clear_bus_position`, and the whole route goes dark. The sharing phones
republish within seconds, so it is griefing rather than damage, but it is a loop
anyone could run.

`get_positions` now returns `pub_id`, a salted SHA-256 of the session id
truncated to 32 hex characters. It is stable for the length of a trip, which is
all the map needs it for (marker identity and clustering), it cannot be
reversed, and it will never match a real session id, so replaying it deletes
nothing.

Adding a key to `clear_bus_position` was the obvious alternative and is wrong:
the `sendBeacon` cleanup when a sharer closes the tab cannot set headers, and
the call has to keep working after a share key rotation.

The general lesson, which is worth more than the fix: **when an access rule
changes, re-read every rationale that depended on the old one.** Making reads
public was discussed on its own merits and was the right call. What it quietly
did was invalidate a sentence in this file about a different function.

### Share key required
| function | notes |
|---|---|
| `route_exists(p_key)` | true only for the **current** key |
| `set_bus_position(p_key, p_session, p_lat, p_lng, p_speed, p_direction, p_label)` | see checks below |

`set_bus_position` rejects, with these exact messages the client turns into
plain words: `invalid key`, `invalid session` (must match
`^[A-Za-z0-9\-]{8,64}$`), `invalid direction`, `label too long` (over 12),
`position off route` (outside lat 13.90 to 14.75, lng 120.70 to 121.15),
`implausible speed` (outside 0 to 60 m/s), `rate limited` (under 2 seconds since
that session's last write), `too many active sessions` (at `max_sessions`).

It also runs `_sweep()` afterwards, which is where all cleanup happens.

Rotation grace lives here: if the key matches `prev_key` and has not expired,
the write is allowed **only for a session that already exists**. A new session
on the old key gets `invalid key`.

### Admin key required
`admin_check`, `admin_set_settings`, `admin_set_notice(p_text, p_minutes)`,
`admin_rotate_share_key`, `admin_kick`, `admin_delete_sighting`,
`admin_change_key`, `admin_list_sharers`, `admin_list_blocked`,
`admin_unblock`, `admin_watching_count`. All take `(p_slug, p_admin, ...)` and
raise `invalid admin key` on failure.

`admin_list_sharers` is the only way to get real session ids back out of the
database, and the admin page needs it because `admin_kick` and `admin_unblock`
take one.

`admin_rotate_share_key` refuses `p_new_key` equal to the key already in use
(`that is already the current share key`). Without that check, rotating to the
current value copied it into `prev_key` as well, so the key the admin believed
they had just retired went on starting new sessions for the next four hours
through the grace path. Nobody does that deliberately; it happens when someone
is unsure whether the last rotation went through and pastes the key back in.

`admin_setup(p_slug, p_new_admin)` is the exception: it needs no admin key but
works **only while none is set**, so it cannot be used to take over a route.

### SQL editor only (execute revoked from anon)
`rename_route_slug(p_old, p_new)`, and the internal helpers `_hash_admin`,
`_pub_id`, `_require_admin`, `_check_settings`, `_sweep`, `_sweep_watching`,
`_watching_window`, `_watching_cap`.

## The watching count

`sql/06-watching-count.sql`. The admin page could see sharers and nothing else,
so the first question an organiser asks — is anyone using this? — had no answer.
Reads are anonymous and stay that way, so the count had to be built rather than
derived from something already stored.

The tracker page sends `mark_watching(slug, watcher_id)` every 60 seconds while
it is visible. `watcher_id` is a random string the tab invents for itself, kept
in `sessionStorage`, gone when the tab closes; it is not the sharing session id
and is not linked to it. `admin_watching_count(slug, admin)` returns
`(watching, capped)` — a total and a flag, never the ids behind it.

Design constraints, all of which are the point rather than details:

- **The window is 3 minutes**, in `_watching_window()`, against a 60 second
  beat, so one missed beat on a patchy connection does not drop a tab out of
  the count. `_sweep_watching` deletes anything past it, and `_sweep` calls it
  too, so a route nobody is watching does not sit on rows until the next
  watcher arrives. **The table therefore only ever holds the present.** There is
  no daily total, no peak, no yesterday — adding one means adding a history
  table, which is the thing this system does not do.
- **Nothing lists watchers.** No function returns a `watcher_id` to anyone, not
  even behind the admin key, because nothing needs one. `admin_kick` needed real
  session ids, which is why `admin_list_sharers` exists; there is no equivalent
  action for a watcher, so there is no equivalent function.
  `06-watching-tests.sql` fails if one is ever added.
- **`mark_watching` takes no key**, because a watcher has none. So anyone who
  reads the source can call it in a loop with invented ids and inflate the
  number. `_watching_cap()` (1000, far above the 200 at which the architecture
  notes say to revisit the whole design) bounds that to a fixed-size table
  rather than an unbounded one, and the count comes back with `capped` set so
  the admin page can say the number is saturated instead of quietly lying. This
  is a number for a volunteer's sense of demand; it is not evidence and the
  admin page says so.
- **It fails quietly.** A watcher beating faster than the client does is a
  no-op, not an error, and a beat past the cap writes nothing and still returns
  success. Nobody looking at a bus map should ever see a failure about a number
  they cannot see.
- **The name avoids `ping`, `track`, `stat` and `count`.** Those substrings in a
  request path are content-blocker filter targets, and a blocked heartbeat fails
  invisibly and undercounts. Same lesson as `shareBtn`, see
  `docs/ARCHITECTURE.md`.

## Setting up a fresh route

```sql
-- 1. run the migration (see project history), then:
select public.rename_route_slug(
  (select slug from public.routes limit 1), 'your-route-slug');

-- 2. choose an admin key, 12+ characters, write it down first
select public.admin_setup('your-route-slug', 'YOUR-ADMIN-KEY');

-- 3. confirm
select slug, admin_hash is not null as admin_ready from public.routes;
```

Then put `ROUTE_SLUG = your-route-slug` in config.txt.

## Your route's values

Record these somewhere private, not here:

- **Slug:** whatever you chose in setup step A. Public, also in config.txt.
- **Admin key:** yours alone. Recoverable only by setting `admin_hash` to null
  in Supabase and running `admin_setup` again.
- **Share key:** rotate it from the admin page. Never write it into a file in
  this repository.

## kicked_sessions

Stopping a sharer from the admin page removes their bus and blocks that session
from writing for 6 hours, because otherwise their phone rewrites a position
within seconds and the bus comes straight back.

The table holds `route_slug`, `session_id` and `until`. Nothing else: no
location, no name, nothing about a person. The no-history property is unchanged.
Expired rows are cleared by `_sweep`.

`admin_list_blocked` and `admin_unblock` let an admin see and undo blocks, since
a mis-tap should be reversible.

Honest limit: a blocked person can reload the page for a new session id. This
raises the effort from nothing to a deliberate act. Rotating the share key is
still the only real expulsion, and it affects everyone.
