# Community Bus Tracker

A live bus tracker that a community can run for itself, without an app, an
account, or any personal data.

It was built for one new bus route in Cavite, Philippines, where buses run about
every 30 minutes, no other company serves the corridor, and commuters find out
where the bus is by asking in a Messenger group chat. Anyone on board can share
the bus's position for a trip. Everyone else can watch. When nobody is sharing,
people can post text sightings instead.

It is not affiliated with, run by, or endorsed by any bus company. The app says
so itself, in the header strip and in "How your data is handled", because
leaving that to whoever posts the link is how a community tool starts getting
mistaken for an official one. If you deploy it for a route, edit those two
places, plus the `<title>` and the `og:` tags at the top of `index.html` that
name the route in link previews.

## What it does

- **Watch:** open a link, see live bus positions, direction, and how fresh each
  one is. No key, no sign-up, no location permission needed.
- **Share:** a driver, conductor, or volunteer rider taps "I'm on the bus" and
  shares the vehicle's position for that trip. Needs a community key. Stop
  anytime.
- **Your own stop:** save the stop you wait at and the page says how far the
  next bus still is from *it* — `▲ Northbound · 3.0 km away · about 5 stops
  before yours` — measured along the road rather than as the crow flies. Pick
  from the route's own stop list, or drop a pin. There is also an opt-in ➤
  control on the map that shows where you are. **All of this stays on your
  phone**: the stop is saved in the browser, the distance is worked out on the
  device from positions the page already has, and nothing about a person
  watching is ever sent anywhere.
- **Light and dark:** follows the device by default, with a ☀/☾/◐ control in
  the header to override it either way. The map's tiles follow too.
- **Sightings:** a board for when nobody is sharing GPS. Direction and nearest
  landmark are picked rather than typed, so recent ones also show on the
  progress strip as dashed marks — clearly not live GPS. Can be switched off
  per route from the admin page, which hides it from the tracker and the guide
  alike.
- **Admin page:** operating hours, a pinned notice, live sharers, sighting
  moderation, and key rotation. Needs a separate admin key.
- **How-to page:** `how-to.html`, reached from the ⓘ in the header. Explains
  watching and sharing. Its figures are drawn in HTML and CSS from the same
  design tokens as the app, so it loads nothing over the network. The one
  exception is the map inside the first figure, a real cropped screenshot of
  this route embedded inline — a fork recrops that, and nothing else.
- **Adoption flyer:** `flyer.html`, a one-page pitch for riders in the mix of
  Tagalog and English the group chat actually uses. It shows an example of the
  tracker with four buses live, labelled as an example, and prints as a single
  landscape A4 poster for a terminal wall — three columns: headline and
  caveats, the example screen, then the link with its QR and the three steps.
  Its map is a real screenshot of this route (see "Running it for your own
  route" below).
- **Operator briefing:** `for-operators.html`, written for the bus company. It
  leads with what the tool records and what it structurally cannot do, because
  "are you watching our drivers?" is the first question, then asks — in order —
  to be told if it should stop, for permission to post the flyer, and for
  whatever cooperation suits them, up to handing the whole thing over.

## What it deliberately does not do

**It keeps no location history.** One row per active sharing session, updated in
place. There is no trail table. This is the most important property in the
system: the tool cannot be used to review a driver's speed, breaks, or route,
because the data to do that does not exist. Do not add a history table without a
very deliberate conversation about it.

**It never records where anyone watching is.** A reader can save a stop and
switch on a dot showing their position, and both are computed and kept on their
own device — no request carries them and no column exists for them. There is
deliberately no way to show other people where riders are waiting: reads need no
key, so that would publish it to anyone at all.

**It says how far, not how long.** No arrival times. Predicting minutes needs a
record of how long past trips took, and that record is exactly what the point
above refuses to keep.

There are also no accounts, no names, no phone numbers, no third-party code, and
no analytics beyond one live number: the admin page can see how many devices have
the map open right now, counted from a random per-tab ID that is deleted three
minutes after the tab closes and never linked to a person. Nothing is kept. The only outside service the browser contacts is the map tile
provider, and that is disclosed to users inside the app.

## Running it for your own route

No code changes are needed. A different route is a config file and a database
migration.

1. **Create a Supabase project** (the free tier is enough).
2. **Run the SQL** in `sql/`, in numbered order, in the Supabase SQL editor.
   `sql/README.md` has the two setup commands you run afterwards to choose your
   public route slug and your admin key.
3. **Copy `config-template.txt` to `config.txt`** and fill in your Supabase URL,
   anon key, route slug, source URL, checkpoints and stops. Checkpoints are the
   handful of labels on the progress strip. Stops are every place the bus calls
   at, in route order.
4. **Deploy** to any static host. Netlify works well: point it at your fork and
   it publishes on every push to `main`. However you host it, the site must
   contain `index.html`, `admin.html`, `how-to.html`, `flyer.html`,
   `for-operators.html`, `config.txt` and
   `assets/`.
5. **Open `/admin.html`**, sign in with your admin key, and set your operating
   hours. Use the Generate button to make a share key, and post the link it
   gives you in your group chat. That link is the tracker with the key in the
   fragment, and it is what people tap to share from the bus.

`how-to.html` used to be a bigger exception to "no code changes" — its
screenshots and screen recordings showed this deployment, so a fork had to
reshoot all of them or delete the page. Its figures are drawn in HTML and CSS
now, so the checkpoint names in the example strip are cosmetic if left alone,
wrong only in the way a neighbouring town's name is wrong.

**Three pages carry a real exception, and it is not cosmetic: the map.**
`how-to.html`, `flyer.html` and `for-operators.html` all show a real cropped
screenshot of this route's own map (Cavite, in the current deployment),
embedded inline so the pages still load nothing over the network. A drawn
basemap reads as drawn, and these figures exist to show a reader what the app
looks like. A fork running elsewhere has to crop a fresh screenshot of its own
route and recompute the bus positions against it; both steps are documented in
a comment above each figure. `tools/make-route-figure.js` generates a fully
portable vector version of the same figure from `config.txt`, needing no
screenshot at all — not used by any shipped page currently, but there to run
by hand (`node tools/make-route-figure.js`) for a fork that would rather not
photograph anything.

The two adoption pages need two more edits by hand. A printed poster has no
runtime to ask what host it is on, so `flyer.html` states the deployment's URL
as text and carries a QR code drawn as an inline path; `for-operators.html`
names a contact address:

```
node tools/make-qr.js https://your-route.example    # prints a replacement <svg>
```

The poster prints as one landscape sheet with the map in a column of its own,
which is what lets it stay large without the headline above it capping its
height.

The route this was built for runs at
[community-bus-tracker.netlify.app](https://community-bus-tracker.netlify.app).

`config.txt` holds no secrets. The share key and the admin key live only in the
database, so committing your config is safe and lets a host deploy straight from
the repository.

## Documentation

- `docs/ARCHITECTURE.md` covers the access model, the client-side guards, the
  known limitations, and the scale reasoning.
- `docs/DATABASE.md` covers the tables, the RPC surface, and which calls need
  which key.

Both are written to be read before changing anything, and both record decisions
that look arbitrary until you know why.

## Tests

Nothing in the documentation is claimed without being checked. The JavaScript
suites extract the shipped code out of `index.html` by comment markers and run
it, so a passing test cannot drift from the app. The SQL suites rebuild the
database from scratch and run behavioural checks against it. See `tests/`.

All of them run in GitHub Actions on every pull request and every push to
`main`, and the ones that need nothing installed also run as Netlify's build
command, so a failure cancels the deploy. See `tests/README.md`, including the
one repository setting you have to change yourself for any of it to block a
merge.

## Licence

AGPL-3.0-only. See `LICENSE`.

Plain English: you can use it, run it, and change it. If you run a modified
version as a service for other people, you have to offer them your source too.
That is the point. This exists so communities can have it, not so it can be
enclosed. `SOURCE_URL` in the config makes the app show a link to your source,
which is how you meet that obligation.

Bundled third-party libraries keep their own licences. See
`THIRD-PARTY-NOTICES.md`.
