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
`bus_label`, `keyless`, `updated_at`. `lat`, `lng` and `direction` refuse NULL.

`keyless` (since `11-open-sharing.sql`, default false) is true for a bus started
through `set_open_position`, without the share key. It exists so turning open
sharing off can take exactly those buses off the map, and so the admin page can
mark them. It says nothing about a person, and `get_positions` does not return
it: watchers are not told which buses had a key.

`speed` has been NULL in every row since `08-position-checks.sql`. It was kept
and handed to anyone with the slug, though no page ever read it and neither the
privacy panel nor the operators' briefing mentioned it, and it is the one field
the promise that this tool cannot be used to review a driver is about. The
column is left in place, and takes NULL now, which on the live database it did
not; nothing writes anything else to it and nothing returns it.

### sightings
`sid` (identity, used by admin delete), `route_key`, `route_slug`, `body`,
`created_at`.

### thanks_now
One row per rider who tapped Salamat on a bus that is sharing **right now**.
`route_slug`, `session_id`, `mark`, `created_at`, primary key on the first
three.

It is a child of `bus_positions (route_slug, session_id)` with **ON DELETE
CASCADE** and ON UPDATE CASCADE, and that is the whole design rather than a
detail — see "Saying salamat" below.

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
    "north": [["03:00","06:30",30], ["11:00","15:30"]],
    "south": [["06:00","07:00",40], ["15:40","20:00",40]],
    "weekend": {
      "north": [["04:00","06:00"], ["11:00","15:00"]],
      "south": [["06:00","07:00"], ["16:30","20:00"]]
    }
  },
  "headway_min": 30,
  "bus_expiry_min": 10,
  "sighting_expiry_min": 120,
  "max_sessions": 25,
  "sightings_enabled": true,
  "parol_enabled": true,
  "open_sharing": false
}
```

Hours are **lists of departure windows** per direction, 24 hour `HH:MM`, 1 to 6
windows each, start before end. The list shape exists because the March 2026
poster splits the day. The app treats buses as possibly en route for 4 hours
after a window closes, so it only says "closed" once that has elapsed. It was
3.5 until October 2026, when two months of the riders' group chat gave 61
timed trips: afternoon departures from Mendez reached One Ayala 208 to 238
minutes later. The constant is `EN_ROUTE_MIN` in `index.html`'s hours block.

**Saturday and Sunday may have their own windows** (October 2026,
`sql/10-weekend-hours.sql`), under an optional `hours.weekend` object of the
same shape as the weekday pair. That month's poster gives weekends narrower
hours ("limited bus operating on these days"), and three Sundays in the chat
ran a single bus. Absent means the weekday windows apply every day, which is
every settings object stored before this, so nothing migrated. Present, it is
held to exactly the weekday rules: both directions, 1 to 6 windows each. The
app decides the day on the phone (`hoursFor(dir)` in the hours block, the only
place that reads the object, and `test-hours.js` fails if anything else does),
so Friday night's "next trip" is Saturday's first, and the hours card names
which set it is showing with the other set in a line beneath.

**A window may carry its own interval** as an optional third field, in minutes
(October 2026, `sql/09-window-headway.sql`). The poster of that month runs the
pre-dawn trips to Makati every 30 minutes and the afternoon trips back every
40, which one `headway_min` for the route could not say. `headway_min` stays,
as the interval for every window that names none, so settings stored before
the field existed pass unchanged and an older page reads the first two fields
as it always did. The app reads it through `headwayAt(dir, mins)`, the one
place that decides which number is in force: it reaches the headline's "trips
every", the hours card, and how long a sighting stays drawn on the strip (one
interval, in the direction and at the time it was posted). Nothing else about
the shape changed; a window is `[start, end]` or `[start, end, minutes]` and a
fourth field is refused.

Ranges enforced server-side by `_check_settings`: headway 1 to 720 (a window's
own too), bus expiry 1 to 120, sighting expiry 5 to 1440, max sessions 1 to 200.
Both window sets go through the same loop, so a weekend error names
`hours.weekend.north` rather than failing silently.

The two booleans are display switches, set from `admin.html`, and **absent
means on** for both, so a route whose stored settings predate a switch keeps
what it already had. `sightings_enabled` shows or hides the sightings board
(`docs/ARCHITECTURE.md` has what "hidden" does and does not lock).
`parol_enabled` lets the tracker hang a parol and a string of lights in its
header from 1 September to 6 January; the season itself is worked out on the
reader's phone (`inParolSeason()`), so the setting is only ever a veto.
Neither needed a migration: `_check_settings` validates the keys it knows and
passes the rest through, and `get_settings` returns the whole object.

`open_sharing` is the opposite way round: **absent means off**, because it is
not a display switch. It lets a page with no share key put a bus on the map
(October 2026, `sql/11-open-sharing.sql`), so a route only gets it by an
organizer choosing it. `_check_settings` refuses anything but a JSON boolean,
and only a real `true` counts as on. Saving settings with it off, or absent,
deletes every `keyless` bus in the same transaction: see "Open sharing" below.

## RPC surface

### Public, slug only, no secret
| function | notes |
|---|---|
| `get_settings(p_slug)` | returns `{settings, notice}`. Notice is null when unset or expired. |
| `get_positions(p_slug, p_self)` | filters stale rows, deletes nothing. Returns `pub_id`, **not** the session id, see below, and no speed. `p_self` is optional: pass your own session id and your own row comes back with `is_self` set, which is how the duplicate-sharer warning skips itself. It also carries `thanks` on that row and `null` on every other, see "Saying salamat". |
| `get_sightings(p_slug)` | newest 8 within the expiry window |
| `add_sighting(p_slug, p_body)` | 1 to 140 chars; refuses a 6th post inside 60 seconds route-wide |
| `clear_bus_position(p_slug, p_session)` | takes the real session id, which only the sharer's own phone holds; keeps working across a rotation and from sendBeacon |
| `mark_watching(p_slug, p_watcher)` | the watching heartbeat, see below. Returns nothing and tells the caller nothing. |
| `say_thanks(p_slug, p_pub, p_watcher)` | one rider thanking one live bus, see "Saying salamat". Returns nothing and tells the caller nothing. |
| `set_open_position(p_slug, p_session, p_lat, p_lng, p_speed, p_direction, p_label)` | a bus with no share key, **only while `open_sharing` is on**; refused with `open sharing is off` otherwise, checked on every write so switching it off stops a trip already under way. Every check `set_bus_position` makes, by the same code. See "Open sharing". |
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
`^[A-Za-z0-9\-]{8,64}$`), `invalid direction` (anything but `north` or `south`,
missing included), `label too long` (over 12), `position off route` (missing,
or outside lat 13.90 to 14.75, lng 120.70 to 121.15), `implausible speed`
(outside 0 to 60 m/s; checked, never stored), `rate limited` (under 2 seconds
since that session's last write), `too many active sessions` (`max_sessions`
buses already on the map).

Two of those were holes until `08-position-checks.sql`. The checks did not name
NULL, a comparison with NULL is NULL, and plpgsql's IF reads that as false, so
a write with no position or direction got through every one of them. Leaflet
throws on such a row, which stopped every rider's bus list drawing, and the
admin page's live list threw on it too, so there was no Stop button to remove
it. And the cap counted every row however old, while a refusal rolls back the
sweep at the end of the function, so dead rows could refuse every new sharer
indefinitely with nothing on the map. The cap now counts only rows inside
`bus_expiry_min`, the same window `get_positions` draws.

It also runs `_sweep()` afterwards, which is where all cleanup happens.

Since `11-open-sharing.sql` every check after finding the route lives in
`_write_position()`, which `set_bus_position` and `set_open_position` both call,
so the keyed and keyless paths cannot drift apart. The messages, their order
and the rotation grace are unchanged.

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
`_watching_window`, `_watching_cap`, `_thanks_mark`, `_thanks_cap`,
`_write_position`. The last matters most: it trusts its caller to have decided
the write may happen, so callable from outside it would be a way round both
the key and the switch.

## Open sharing

Since October 2026 (`sql/11-open-sharing.sql`) an organizer can let anyone share
a bus without the key, from the OPEN SHARING card on the admin page. It is for
the tracker's real problem: most riders never see the link in the group chat.

What it costs, which the admin page says beside the switch:

- **Anyone on the internet can post a bus, not only riders.** The slug is public
  (it is in `config.txt`) and so is the anon key, so a short script is enough;
  nobody has to open the site.
- **The sharer cap becomes a way to lock real sharers out.** Made-up buses count
  towards `max_sessions` like any other.
- **Stopping one from the admin page barely helps.** It blocks one session id,
  and a script makes a new one each time. With no key there is no key to rotate.

What still holds: every check on a position (on the route, plausible speed, one
write in 2 seconds per session, the cap, a blocked session), and no history,
since a keyless bus is the same one row per trip as any other.

**The way out is the switch.** Turning it off does for keyless buses what
rotating the key does for keyed ones, at once and with no grace period:
`admin_set_settings` deletes every `keyless` row in the same transaction, and
`set_open_position` refuses their next write, so they cannot come back. Sharers
with the key are never touched, and the key works whether the switch is on or
off. The tracker uses the key whenever it has one, so a keyed trip is never
keyless and never removed by the switch.

`admin_list_sharers` returns `keyless` so the admin page can mark those buses
**no key**. `get_positions` does not, deliberately: a "no key" badge on the
public map would invite riders to distrust the riders the switch was turned on
for, and the honest statement is the one the privacy panel makes, that while it
is on a bus is somebody's report and anyone could have made it.

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

## Saying salamat

`sql/07-thanks.sql`. Sharing costs the person on board battery, data and an
hour of leaving the screen on, and nothing ever came back the other way. The
progress strip on the sharing tab was the first half of the answer — it proves
the bus reached the map. This is the second: proof that a person was on the
other end of it.

Every constraint below exists because a thank-you attached to a person is one
short step from a rating attached to a driver.

- **The count cannot outlive the trip, structurally.** `thanks_now` is a child
  of `bus_positions` by foreign key with `ON DELETE CASCADE`. Every path that
  ends a trip already deletes the parent — `clear_bus_position` from Stop and
  from `sendBeacon` on page close, `admin_kick`, the stale sweep in `_sweep` —
  so none of them mentions this table and none of them ever has to. The
  property is enforced by the schema, not by remembering. That matters more
  than the usual "we delete it": `for-operators.html` tells the bus company
  this tool cannot be used to review a driver, and a per-driver appreciation
  total is precisely the metric that promise is about. **There is nowhere to
  put one.** A sharer who stops and starts again begins at nothing, because
  the parent row was deleted and took the children with it.
- **A number is returned only to the person it is about.** `get_positions`
  fills `thanks` on the row where `session_id = p_self` and leaves `null`
  everywhere else — null rather than zero, so a reader cannot tell a
  much-thanked bus from a quiet one. Only the sharer's own phone holds that
  session id, and `get_positions` has not published session ids since July 2026
  (see above), so there is no way to ask on another bus's behalf. This is not
  only privacy: a count beside every bus on the map would rank the buses
  currently on the road in front of the riders choosing which to wait for, and
  put drivers in a competition nobody volunteered for.
- **Nothing stored says who was grateful.** The row holds `mark`, a salted
  SHA-256 of `(pub_salt, session_id, watcher_id)` — not the watcher id. So a
  row here cannot be matched against `watching_now`, which is the only other
  place a watcher id is ever written, and the same tab thanking two buses
  leaves two values with nothing in common. All it can do is collide with
  itself, which is exactly what a second tap should do. No function returns it
  to anyone, admin included, and `07-thanks-tests.sql` fails if one is added.
- **The bus is named by its `pub_id`**, which is what every watcher already has
  off the map, so the only buses that can be thanked are the ones the caller
  can already see. The real session id is never in a reader's hands and is not
  needed: `say_thanks` recomputes `_pub_id` over the route's live rows to find
  the trip, a scan of at most `max_sessions` rows.
- **A bus that has gone is not an error.** If the trip ended between the map
  drawing the bus and the thumb landing on it, `say_thanks` returns quietly.
  Putting an error in front of someone being kind would be graceless, and it
  would also turn the function into a way to test whether a given `pub_id` is
  still live.
- **`say_thanks` takes no key**, because a watcher has none — the same position
  the watching count is in, and the same honest limit. Anyone reading the
  source can call it in a loop with invented watcher ids. `_thanks_cap()` (50
  per trip) bounds that to a small fixed number rather than an unbounded table.
  It is a kind word, not evidence, and the difference between a number that can
  be exaggerated and a table that can be filled is the only thing the cap
  claims.
- **The name avoids `like`, `fav`, `thumb`, `heart`, `vote`, `star`, `rate`,
  `social` and `clap`**, in the RPC and in every id and class that draws it.
  Filter lists were written to kill Facebook Like buttons, and this is the most
  Like-shaped thing the app will ever ship. Same lesson as `shareBtn` and
  `mark_watching`, and worse than either, because it fails on the reader's side
  where nobody would report it. See `docs/ARCHITECTURE.md`.

One consequence to know before changing the direction guard: `onWrongDirection`
calls `clear_bus_position` to take the bus off the map while the question is
open, so a sharer who is asked which way they are going comes back with the
count reset to zero. That is the cascade being honest — the row really was
deleted — and the alternative is a count that outlives its row, which is the
one thing this table must not do.

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

Honest limit: a blocked person can open the tracker in a new tab for a new
session id. A reload keeps the old one, which lives in `sessionStorage`, and a
trip ended by a block is the one trip that does not get a fresh id at Stop.
This raises the effort from nothing to a deliberate act. Rotating the share key is
still the only real expulsion, and it affects everyone.
