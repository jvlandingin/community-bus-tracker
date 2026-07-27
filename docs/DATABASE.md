# Database

Supabase Postgres. Everything the app touches goes through `SECURITY DEFINER`
functions. The tables have RLS enabled with **no policies**, so the public anon
key cannot read or write them directly. This file exists so the schema never has
to be dumped from a phone mid-project again.

If it ever does need re-checking, these two queries in the Supabase SQL editor
give the full picture. Run all three, not just the functions, which is the
mistake that let a foreign key bug through in July 2026:

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
| `get_positions(p_slug)` | filters stale rows, deletes nothing |
| `get_sightings(p_slug)` | newest 8 within the expiry window |
| `add_sighting(p_slug, p_body)` | 1 to 140 chars; refuses a 6th post inside 60 seconds route-wide |
| `clear_bus_position(p_slug, p_session)` | the unguessable session id is the credential; keeps working across a rotation and from sendBeacon |
| `ping()` | keep-alive target for the uptime monitor |

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
`admin_change_key`. All take `(p_slug, p_admin, ...)` and raise
`invalid admin key` on failure.

`admin_setup(p_slug, p_new_admin)` is the exception: it needs no admin key but
works **only while none is set**, so it cannot be used to take over a route.

### SQL editor only (execute revoked from anon)
`rename_route_slug(p_old, p_new)`, and the internal helpers `_hash_admin`,
`_require_admin`, `_check_settings`, `_sweep`.

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
