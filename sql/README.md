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
| `08-position-checks.sql` | refuses a bus with no position, stops dead rows filling the sharer cap, and stops keeping or publishing speed |
| `09-window-headway.sql` | lets each departure window carry its own interval |
| `10-weekend-hours.sql` | lets Saturdays and Sundays have their own hours |
| `11-open-sharing.sql` | lets the admin page switch on sharing without the key, and off again with every keyless bus removed |
| `12-share-pin.sql` | lets the share key be a PIN of 4 to 8 digits, and pauses new trips after 20 wrong tries |
| `13-bus-look.sql` | lets a sharer who chooses to show their decorated bus to riders, as a short code that dies with the trip |
| `14-off-route-private.sql` | keeps a bus outside the route area for its own phone only, instead of refusing it, so sharing works (and can be reviewed) from anywhere |
| `15-say-wrong.sql` | lets a rider tap "Not a real bus?" on a bus or "Wrong?" on a sighting, counted for organizers only and gone with the trip or the sighting |

If you are setting up fresh, run all of them. They are separate files because
they were written in that order against a live deployment, and keeping the
history visible is more honest than pretending the first version was right.

`13` can be run in either order too. Until it is applied, a sharer who has
switched on "Show customized bus to riders" has their write refused for the argument the
database does not know yet; the page sends the same position again without it,
stops asking for the rest of the visit, and their bus shows plain. Pages that
send no look are untouched either way.

`14` can be run in either order too. Until it is applied, a page outside the
route area is refused as before and says "You seem to be off the route". A page
from before it, against it, reads the new `private` answer as a failed write,
which is what it saw for an off-route position anyway. Re-running `11`, `12` or
`13` after it puts back writers that call the old `_write_position`, which it
removes, so every write then fails: re-run `14` after any of them. Safe to
re-run.

`15` should be run **before** the pages from the same commit are deployed,
and after `14`, whose `off_route` column it reads. Until it is applied the
buttons are still drawn, the call behind them fails, the page gives the button
back instead of saying "Sent" and writes one line to the browser console
naming this file, and the admin page shows no counts. Nothing else is
affected. Safe to re-run.

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

`08` changes the shape of `get_positions` too, but only by dropping `speed`,
which no page has ever read, so it can run before or after the pages are
deployed. It deletes any bus row with no position, which nothing should have
written and which stopped the map drawing for everyone, and clears every stored
speed. Run it against a database that already has `01` through `07`; it is safe
to re-run.

`11` must be run **before** anyone turns open sharing on. The admin page can
save the setting against an older database, because `_check_settings` passes
unknown keys through, and every keyless page would then fail each write with
the generic "couldn't send" message until the migration runs. It changes the
shape of `admin_list_sharers` by one column, which an older admin page ignores
and the new one reads as false when missing, so the pages can deploy either
side of it. Re-running `08` after `11` puts the older `set_bus_position` and
`admin_list_sharers` back; re-run `11` after it. Safe to re-run.

`12` must be run **before** the pages from the same commit are deployed: they
check a key with `check_share_key` and share with `set_keyed_position`, which
it adds, and against an older database the gate says it cannot reach the
server and no keyed trip starts. Pages from before it keep working against it
for as long as the key is a long one, since it leaves `route_exists` and
`set_bus_position` as they were for any key that is not a PIN. Safe to re-run;
re-running `05` or `11` after it puts back the versions of
`admin_rotate_share_key` and `set_bus_position` that would test a PIN, so
re-run `12` after either.

**If the salamat button appears but nothing reaches the sharer**, this
migration has almost certainly not been run. The button is drawn by the page,
so it shows up whatever the database contains; the call behind it then fails,
and the sharing screen shows no row — which looks exactly like nobody having
tapped. Since August 2026 the page gives the button back instead of saying
"Salamat sent" over a tap that did not land, and writes one line to the browser
console naming this file. To check from the SQL editor:

```sql
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and proname in ('say_thanks');
```

No row means run `07-thanks.sql`. If it returns a row and the button still does
nothing, PostgREST is serving a stale schema; `notify pgrst, 'reload schema';`
forces it.

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
