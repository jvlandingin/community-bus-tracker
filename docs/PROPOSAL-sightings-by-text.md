# Proposal: posting a sighting by WhatsApp message

**Status:** scoped, not built. Nothing here is decided until the maintainer
signs off on the "Decisions first" list below. When it is, the outcome goes in
`docs/JOURNAL.md` and this file either becomes the build plan or is deleted.

## The idea in one paragraph

A rider who sees a bus but is not on it texts a WhatsApp number something like
`north amadeo`. A small server function reads that one message, turns it into
the sighting shape the app already understands (`▲ Northbound at Amadeo`), posts
it through the existing `add_sighting` RPC, and answers
`Salamat! Posted: ▲ Northbound at Amadeo`. On the map it looks exactly like a
sighting posted from the page: a hollow dashed ring on the strip, gone after one
headway. People write to the number on purpose. **Nothing reads any group
chat**, and that is the line this proposal holds.

## Why this shape, and not "an AI reads the group chat"

- **It is the supported path.** Messages sent *to* a WhatsApp Business Platform
  (Cloud API) number arrive at a webhook. Reading an existing community group
  needs an unofficial WhatsApp Web clone (Baileys, whatsapp-web.js), which breaks
  WhatsApp's terms and gets the number banned without notice.
- **It keeps the watcher-location invariant.** A group message such as
  "naghihintay ako sa Silang" ("I'm waiting at Silang") was written for that
  group. Lifting it onto a map anyone on the internet can read is the broadcast
  CLAUDE.md rejects. A message sent to the bot is a deliberate post, and only the
  *bus* sighting is kept, never anything about the sender.
- **It fits Meta's January 2026 policy.** Since 15 January 2026, general-purpose
  AI assistants are barred from the Business API. A bot that does one job for one
  service is the case Meta still allows. This one never chats; it parses and
  confirms.
- **Nothing about the database changes.** No table, column or RPC is added. The
  feature is a new *writer* of an existing row shape.

## Decisions first (each needs the maintainer, not a judgement call mid-build)

1. **Un-park the sightings board.** It was switched off on 2026-08-01 because it
   was "the most complicated thing a first-time rider meets" and "not finished".
   Without the board, a sighting by text goes nowhere riders can see it. Turning
   it back on, or on for this pilot only, is a precondition.
   *Recommendation:* switch it on for a closed pilot (below), then decide.
2. **The first secret in the system.** `config.txt` holds no secrets, and that is
   why a fork deploys straight from git. The bot needs three: the WhatsApp access
   token, the app secret (to verify webhooks) and a verify token. They live only
   in Supabase's function secrets, never in the repository or `config.txt`.
   *Recommendation:* accept, and say so in ARCHITECTURE.md's access model.
3. **Meta in the privacy promise.** A rider who texts the bot tells Meta (as
   WhatsApp always does) and our function their phone number and message. We
   can promise not to *keep* it. We cannot promise it never reaches us. The
   privacy panel must say this in the same commit that publishes the number
   anywhere. *Recommendation:* accept, with the wording below.
4. **No free-text note in v1.** The page's composer allows an optional note
   after `·`. The bot drops everything except direction and place. Free text by
   text message is where a sender's own name, location or a slur would come
   through, unmoderated and at the speed of a phone keyboard.
   *Recommendation:* direction + place only. Revisit after the pilot.
5. **Which channel.** WhatsApp was asked for, but Messenger is what most riders
   on this route actually use (the project's own notes test previews "in an
   actual Messenger chat"). *Recommendation:* build the parser
   channel-agnostic, ship WhatsApp first, and add a Messenger adapter later if
   the pilot shows people use texting at all. Each adapter is about 50 lines.

## How it works

```
rider's WhatsApp ──► Meta Cloud API ──► webhook: Supabase Edge Function `sighting-by-text`
                                          1. verify X-Hub-Signature-256 (app secret)
                                          2. text messages only; ignore media, reactions, status callbacks
                                          3. get_settings: board off → reply "paused", post nothing
                                          4. parse → {direction, checkpoint} or null
                                          5. add_sighting(slug, '▲ Northbound at Amadeo')
                                          6. reply (inside the 24-hour window: free)
```

### Where it runs

A **Supabase Edge Function**, in `supabase/functions/sighting-by-text/`. The
function is written in plain JavaScript so the Node test suites can extract
from it the way they extract from `index.html`. Not a Netlify Function: that
would add a build step to the site, and Netlify's bundler is what tends to want
a `package.json`. A Supabase function leaves the website byte-for-byte as it is.

Note: Netlify publishes the whole repository (`publish = "."`), so the
function's source will also be served as a static file, the same as `sql/`
already is. That is harmless (the code is AGPL and public anyway) but worth
knowing.

The function calls `add_sighting` with the **anon key**, like the page does. It
gets no special privilege, so a bug in it can do nothing a visitor to the page
can't already do.

### The parser

A pure function, `parseTextSighting(text, checkpoints)`, that returns
`{ direction:'north'|'south', checkpoint:'Amadeo' }` or `null`.

- **Direction words**, case-insensitive: `north`, `nb`, `n`, `▲`, `pa-manila`,
  `pa-ayala`, `papuntang ayala`, `pa-makati`, `pa-pitx` → north; `south`, `sb`,
  `s`, `▼`, `pa-tagaytay`, `pa-mendez`, `pauwi` → south. Northbound means toward
  One Ayala, as on the page (`pickNorth`: "to One Ayala, Makati").
- **Places:** each `CHECKPOINT`'s full name and short name from `config.txt`
  (`Amadeo`/`AMADEO`, `Gen. Trias`/`GEN.T`, `Tagaytay`/`TGY`, …), plus a small
  alias list (`gentri`, `olivarez`, `mendez`). The function fetches `config.txt`
  from the live site at cold start, so the route has one source of truth.
- **Not in v1: stop names.** A stop can't simply be mapped to the nearest
  checkpoint in a straight line; across the Tagaytay ridge hook that picks the
  wrong one, which is why the saved-stop card measures along the chain.
  Mapping stops properly means reusing the chain projection. Do that once the
  pilot shows people actually type stop names.
- **Both or nothing.** A message missing either part gets a reply with an
  example (`Try: north Amadeo`) and nothing is posted.

**The tie that matters:** the body the bot writes must be one `parseSighting()`
in `index.html` reads back, or the post shows on the board but never on the
strip. The test checks this directly (below).

### AI is a fallback, not the engine

The parser above should handle most messages. An optional second pass can send
the *message text only* to a small model (Claude Haiku 5.5) when the parser
returns null. The model is asked for a JSON answer constrained to the enum of
checkpoint names and two directions, or `null`. The model's output is never
written to the database as text. It only selects from the same enum, and the
canonical body is built by our code.

*Recommendation:* ship v1 without it. Log nothing, but count parse failures in
memory and report the number in the function's health response. Add the model
only if failures are common, because it brings in a second third party and a
second secret.

### Replies

| Situation | Reply |
|---|---|
| posted | `Salamat! Posted: ▲ Northbound at Amadeo. It shows on the map for the next bus or so.` |
| can't parse | `Didn't catch that. Send direction + place, like: north Amadeo` |
| board off | `Sightings are paused on the tracker right now. Salamat pa rin!` |
| flood limit hit | `Lots of posts right now. Try again in a minute.` |
| `info` / `help` | what happens to the message, link to the privacy panel and `SOURCE_URL` |

Every reply goes back inside the 24-hour window the rider just opened.
Service replies there are free, and the bot **never** starts a conversation, so
it needs no paid templates. Meta's per-country rate card should be checked for
the Philippines before launch, but the design leaves nothing to pay for.

## Privacy

- **Stored:** the same `sightings` row a page post makes: route, body, time.
  Nothing else. The sender's phone number (`wa_id`), profile name and message id
  are used to send the reply and then dropped.
- **Logged:** nothing from the payload. Supabase Edge Function logs keep only what
  the code prints, so the function prints counts and error classes, never bodies
  or numbers. A test should grep the function source for a `console.*` call that
  takes the payload.
- **Meta:** keeps whatever WhatsApp keeps of any conversation with a business.
  That has to be said, not implied.
- **Privacy panel wording** (in `#privSightings`, shown only when the board is
  on): *"You can also post one by WhatsApp to [number]. Your message passes
  through WhatsApp (Meta) and our server to be read, and we keep only the
  sighting itself, never your number or what else you wrote."*
- **The "four things kept on the device" promise is untouched:** nothing new is
  written to `localStorage`.

## Abuse

- **Route-wide flood limit:** `add_sighting` already refuses a sixth post in 60
  seconds per route. That covers the bot too, which also means one person
  texting fast can use up every slot for a minute.
- **Per-sender limit, best effort:** a counter in function memory, keyed by a
  salted hash of the number, held for 10 minutes. It is lost whenever the
  function instance recycles, and that's acceptable for v1. Making it durable
  means storing an identifier for riders, which this system has never done. That
  is a deliberate conversation, not a fix.
- **Moderation:** sightings from the bot appear in `admin.html`'s existing list
  and can be deleted the same way. No admin block-by-sender exists, by design.
- **Webhook forgery:** every request is rejected unless its
  `X-Hub-Signature-256` matches the app secret.

## Tests

- `tests/test-text-sighting.js` (no network, nothing installed, so it can join
  the Netlify build list):
  - extracts `parseTextSighting` from the function by comment markers, as the
    other suites do from `index.html`;
  - runs a table of real-shaped messages (`nb amadeo`, `Pa-Manila na yung bus sa
    Gentri`, `SB TGY`, `bus!!!`, a message with only a place);
  - **round trip:** for every checkpoint and both directions, the body the bot
    builds is parsed by `parseSighting()` extracted from `index.html` back to the
    same checkpoint and direction;
  - the body never carries anything from the message except the matched
    direction and place;
  - the function source contains no `console.*` call that takes the payload, the
    sender or the body.
- No database suite is needed: no SQL changes. `tests/db/01-core-tests.sql`
  already covers `add_sighting`'s limits.

## What a rider sees

- A line in the sightings card, next to the composer: "Or text **north
  Amadeo** to [number] on WhatsApp", linking to `wa.me/<number>?text=north%20`.
- Class and id names avoid the blocklist (`chat*`, `share*`, `help*`, …), so
  call it `.bytext`, not `.whatsapp-chat`. `test-boot.js` section 7 enforces
  this.
- `how-to.html`'s sightings section gets one paragraph. The flyer stays as it is
  for the pilot. Adding anything to the flyer's mock column costs height it
  doesn't have.

## Setting it up (one-time, done by the maintainer)

1. A Meta Business portfolio and a WhatsApp Business app in Meta for Developers.
2. A phone number not registered on ordinary WhatsApp, and an approved display
   name ("Bus Tracker", never the operator's initials, per CLAUDE.md).
3. Meta's test number first: it messages up to five verified recipients, enough
   for the maintainer and a few commuters.
4. `supabase functions deploy sighting-by-text`, three secrets set, webhook URL
   and verify token entered in Meta's dashboard, subscribed to `messages`.

## Build order

1. **Parser + test suite.** No accounts needed. This is where most of the
   real-world wording gets settled.
2. **Edge function** on Meta's test number, used by the maintainer only.
3. **Pilot:** board on, three to five commuters (labelled in JOURNAL.md as
   usual, no names), two weeks. Questions: do people text at all, what do they
   type, does anything posted turn out to be wrong?
4. **Go/no-go**, recorded in JOURNAL.md. If go: privacy panel, how-to
   paragraph, the line in the card, a real number. If no-go: delete the function
   and this file. Nothing else in the system will have changed.
5. Later, only if earned: AI fallback, stop names, a Messenger adapter.

## Not in scope

Reading group chats; posting bus *positions* (a text is one person's word, and
it stays a hollow ring); any outbound message the rider didn't just prompt; any
storage of who sent what; a reply that says when the next bus will come (the
system keeps no travel-time history, and `test-mystop.js` exists to stop the
app implying an ETA).
