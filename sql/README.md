# Database setup

Run these in the Supabase SQL editor, in order, each as one whole query. Every
file is wrapped in a transaction, so a failure applies nothing and is safe to
retry.

| file | what it does |
|---|---|
| `01-base.sql` | tables, settings, notice, the whole RPC surface |
| `02-key-rotation-cascade.sql` | makes the `route_key` foreign keys cascade, without which every share key rotation fails |
| `03-kick-block.sql` | makes stopping a sharer actually hold, instead of their phone rewriting the position seconds later |
| `04-session-id-privacy.sql` | stops publishing live session ids to every watcher, which let anyone clear the whole route off the map |
| `05-rotate-same-key.sql` | refuses a share key "rotation" to the key already in use, which used to leave that key working |
| `06-watching-count.sql` | lets the admin page see how many devices have the map open right now, without recording who |
| `07-thanks.sql` | lets a rider tap Salamat on a live bus, with no total kept for anyone |

If you are setting up fresh, run all of them. They are separate files because
they were written in that order against a live deployment, and keeping the
history visible is more honest than pretending the first version was right.

`06` is the one that can be run in either order relative to the pages: until it
is applied the heartbeat call fails and is swallowed, and the admin page says it
could not read the count. Nothing else is affected, and it corrects itself one
beat after the migration runs.

`04` and `07` both change the shape of `get_positions`, so deploy
`index.html` and `admin.html` from the same commit as either migration. An old
page against the new function shows no buses; a new page against the old
function shows none either. Nothing is lost either way, and one poll after the
pages catch up it is right again, but do not leave it in that state.

`07` also adds a foreign key onto `bus_positions`, which is what makes a thank
you impossible to keep after the trip that earned it. Run it against a database
that already has `01` through `06`; it is safe to re-run.

## Then two setup commands

Run each on its own, after editing the values.

**A. Choose your public route slug.** This is not a secret. It goes in
`config.txt` and identifies your route. Lowercase letters, digits and hyphens.

```sql
select public.rename_route_slug(
  (select slug from public.routes limit 1),
  'your-route-slug');
```

If you have more than one route row, replace the subquery with the exact old
slug rather than relying on `limit 1`.

**B. Choose your admin key.** At least 12 characters. Write it down before you
run this: it is stored only as a salted hash and cannot be shown again. It is a
different key from the share key.

```sql
select public.admin_setup('your-route-slug', 'YOUR-ADMIN-KEY');
```

**Confirm both worked:**

```sql
select slug, admin_hash is not null as admin_ready from public.routes;
```

## The share key

The share key is the row's `key` column. Rotate it from the admin page rather
than by hand, because rotation also sets the grace window that lets anyone
mid-trip finish. Never write it into a file in this repository.

## Keep-alive

Supabase pauses a free project after seven days with no database request, and
unpausing is manual. Point an uptime monitor at the `ping()` function every two
or three days:

```
POST https://YOUR-PROJECT.supabase.co/rest/v1/rpc/ping
header: apikey: YOUR-ANON-KEY
```

This is required, not optional. Without it a quiet week takes the tracker
offline.
