# Database setup

Run these in the Supabase SQL editor, in order, each as one whole query. Every
file is wrapped in a transaction, so a failure applies nothing and is safe to
retry.

| file | what it does |
|---|---|
| `01-base.sql` | tables, settings, notice, the whole RPC surface |
| `02-key-rotation-cascade.sql` | makes the `route_key` foreign keys cascade, without which every share key rotation fails |
| `03-kick-block.sql` | makes stopping a sharer actually hold, instead of their phone rewriting the position seconds later |

If you are setting up fresh, run all three. They are separate files because they
were written in that order against a live deployment, and keeping the history
visible is more honest than pretending the first version was right.

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
