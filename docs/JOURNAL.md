# Journal

Progress that does not live in the code: how the tool is being introduced to the
community, what people said, what was decided and why. The commit log records
what changed in the software. This records what changed around it.

Newest entries at the top. Add one whenever something happens that a future
reader would otherwise have to be told in conversation.

## How people are referred to here

**No real names in this file.** The repository is public, the app links to it
from inside the privacy panel, and the project's whole claim is that it keeps no
names. Publishing community members' names and their chat messages here would
contradict that, and for the bus operators it is a concrete risk: they are
sharing positions without the company's involvement, and a searchable record
tying a named person to that is not ours to create.

So people appear by role and a stable label — Operator A, Commuter B — kept
consistent across entries so continuity is readable. Keep the label-to-name
mapping somewhere private, outside this repository.

**No keys in this file either.** The share key belongs in the link handed to the
community and in the database, nowhere else. Refer to "the current share key".

---

## 2026-09-01 — Third pass on the UI: depth and motion

A modernisation pass, all presentation: nothing moved, nothing was reworded,
and no request, key or stored thing changed, so the privacy panel's list of
three stands untouched.

**The buses actually move now.** The strip pill has carried `transition:left`
since July, and it turned out to be dead code: the pills were rebuilt with
`innerHTML` on every poll, and a brand-new element starts at its new position
with nothing to glide from, so every bus teleported every six seconds.
renderStrip now keeps each bus's pill element alive between draws, keyed by
bus id, and only touches its position and classes — the transition finally
has something to move. The map badges got the same treatment through the
other door: Leaflet reuses a divIcon's element across `setIcon`, so a
transition on the marker transform makes a badge glide to each new fix. One
trap cost a review round rather than a shipped bug: Leaflet removes its
zoom-animation class *before* it rewrites every marker's transform at the end
of a zoom, so a bare transition smears the badges across the map on every
pinch. The glide is gated by a steady-state class the map code drops at
zoomstart and restores ~80ms after zoomend.

**Depth.** The single 2px card shadow read as flat next to anything modern;
`--shadow` is now a hairline of contact plus a wide soft falloff, in every
page's token block, with dark still `none` — nothing there to cast onto. The
header band carries a gold trim line, like the buses do, on all five pages.
The active tab and the primary button wear the header's own gradient rather
than a maroon that nearly matches. Bus chips carry their direction on the
border as well as the arrow — border only, never a tinted fill, because
`--muted` was tuned to clear AA on paper and white and the ages inside the
chips are the smallest text on the page. And Leaflet's own chrome (zoom
buttons, attribution strip) now follows the tokens: it was the last white
panel left glaring on the dark map.

**Motion.** Entrances use a hard-decelerate curve and modals a whisper of
overshoot; colour changes on the small controls crossfade instead of
snapping; the headline rises when its words actually change (never the
subtitle, whose "updated 12s ago" changes every poll); the modal veil blurs
the page behind it where the browser can. Hover states exist now, gated to
`(hover:hover)` so nothing sticks half-pressed on a phone. Ages and
distances use tabular figures so the text stops shivering as 9 becomes 10.
The reduced-motion blanket flattens all of it, unchanged.

**The honest costs.** The three static recreations only needed their chip
borders and header bands touched — the glide, being motion, does not exist
in a drawing — but they are three more files in this commit all the same.
And pill layering is no longer DOM order (moving a node cancels its
transition, so your own pill can no longer be appended last): it is z-index
now, stated in the CSS, which is one more thing the recreations' visual
order silently depends on.

---

## 2026-08-31 — The map goes first

**What changed.** The tracking tab was rearranged. It now opens with the
progress strip and the map, then the saved stop, then the `No buses live`
headline and the direction filter with the bus chips under them. The "No
account. No name." data statement moved from above the card to the foot of the
tab.

**Why.** Everything that used to sit above the map was a description of the
map. Somebody opening the link is asking one question, and the answer was three
rows down. The headline is really the chip list's empty state in words, so it
now sits with that list; the filter moves the strip, the map and the list
together from anywhere, so where it sits was never load-bearing.

**What it costs.** When nothing is live, `No buses live` is the line that says
*outside operating hours, next departures 4:00am and 5:00am* — and it is now
below the fold on a phone. That is a real trade and it is written down in
`docs/ARCHITECTURE.md` rather than smoothed over: if the empty map turns out to
be what people mostly see, the fix is to hoist the headline only when the count
is zero, not to undo the order.

**Three drawings moved with it.** `flyer.html`, `for-operators.html` and
`how-to.html` each hand-draw this screen, and the guide's five numbered
callouts had to be renumbered and re-measured in a real browser. The poster
still prints as one landscape sheet — checked by rendering it, not by eye.

---

## 2026-08-20 — Saying salamat to whoever is carrying the phone

**What shipped.** Tapping a bus on the map opens its popup, and the popup now
ends with **🙏 Say salamat**. One tap. The person sharing that bus sees a line
under their progress strip: `🙏 3 riders said salamat`. Nobody else sees it, and
it goes when the trip does.

**Why it is worth having.** Sharing is unpaid work — battery, data, and the
discipline of leaving the screen unlocked for an hour so the GPS keeps running.
Until now the only thing a sharer got back was the progress strip added in
August, which proves the bus reached the map. That answers *is this working*.
It does not answer *does anyone care*, and for a volunteer those are different
questions.

**Why it took a database migration and four documents to add a button.** The
first design was the obvious one — a count per sharer, kept. It was rejected on
its own merits, and the reasoning is the part worth keeping:

*An appreciation total is a driver metric.* `for-operators.html` tells the bus
company, before it asks them for anything, that this tool cannot be used to
review a driver's speed, breaks, route deviation or working hours — **not
because we promise not to, but because the data is never written down**. A
running "salamat" total per person is exactly the kind of number a company
could later ask for, and the moment one exists, that paragraph stops being
true. So there is no total. A count belongs to one trip, and `thanks_now` is a
child of the position row by foreign key with `ON DELETE CASCADE` — it cannot
outlive the trip, and no future code path has to remember to delete it.

*A visible count is a ranking.* The count is returned only on the sharer's own
row. A number beside every bus on the map would rank the buses currently on the
road in front of the riders choosing which one to wait for. Nobody driving
signed up for that.

*A zero is worse than silence.* On a quiet run most trips will collect nothing,
and "0" parked on the sharing screen for forty minutes turns silence into a
verdict — the exact opposite of what the feature is for. The row is not drawn
until there is something to draw. `test-thanks.js` fails if that changes.

**The name was the other real decision.** The oldest and broadest cosmetic
rules in every content-blocker filter list exist to kill Facebook Like buttons.
This is the most Like-shaped control the app will ever ship, and it lives on the
*reader's* side, where somebody losing it to a filter has no reason to think
anything is missing and no way to tell us — strictly worse than the `shareBtn`
bug, which at least a sharer could describe as "the button is not there". Hence
`tybtn`, `tyrow`, `tydone`, `say_thanks`, and a third name scan in
`test-boot.js` section 8 covering `like`, `fav`, `thumb`, `heart`, `vote`,
`social` and `clap` across all five pages, in `onclick` as well as `id` and
`class`.

**Honest limits, both stated in the app.** `say_thanks` takes no key, because a
watcher has none, so anyone reading the source can inflate a bus's number with
invented ids; a cap of 50 per trip bounds it. And the count resets if the
wrong-direction guard pauses a trip, because that path clears the position row
and the cascade takes the thanks with it. Both are the design working, not
holes in it.

**Not decided.** Whether the sharer should be told anything at the *end* of a
trip, when the strip and the line both disappear with the row. A summary would
be the one thing this design refuses to keep, so if it is ever wanted it has to
be drawn on the phone from what that phone already saw, and never asked of the
server.

---

## 2026-08-17 — Your own stop, on your own phone

**What shipped.** The tracker can be told where you wait. Pick a stop from the
route's own list (or drop a pin), and the card between the bus chips and the
map answers the question people actually open the page with: `▲ Northbound ·
3.0 km away · about 5 stops before yours`. There is also an opt-in ➤ control on
the map that draws a dot where you are.

**Where this came from.** A proposal to add ETA prediction via federated
learning — train on each phone during a trip, send only model updates, use a
Bayesian prior so it works on little data. The Bayesian instinct was right and
the federated part was not, for a reason worth writing down: **federated
learning is a way to learn from data you are holding without moving it, and
this system holds none.** At ten sharing trips a day an "update" from one phone
is that trip, so it would have created the location history the project exists
without, in a form that reads as more private than a trail table rather than
less. It would also have needed an aggregator, a write endpoint that a share
key from a public group chat could poison invisibly, and on-device training
competing for the battery of a phone that already cannot survive a screen lock.

The second proposal — let watchers see their own location — was the good one,
and it needed no model, no server and no SQL at all.

**What was rejected, and why it matters more than what shipped.** The idea came
with "maybe this can be public or private". Public was rejected outright. Reads
need no key, so public here means the entire internet, and the feature would
have broadcast that a particular roadside has a person standing at it right
now — mostly commuters alone, at a route whose southbound window closes at
8:00 PM. That is a physical safety problem, not a privacy trade, and it is a
different category from a sharer: a sharer is an adult on a bus who opted in.
If demand data is ever genuinely wanted, the watching count is the precedent to
copy — a number with a floor under it, never a position.

**A stop picker beats a location prompt**, which was the useful surprise. Most
people check the page from a desk or a kitchen, not from the stop, so a GPS fix
would have put them somewhere useless. Picking from the 71 stops already in
`config.txt` is more accurate, persists for a daily commuter, and needs no
permission — which is why the privacy panel's strongest sentence survives for
everybody who never opts in.

**The panel moved in the same commit**, as the rule says. It used to promise
the app "never asks for your location" while watching, which is no longer true,
so it now says the thing that is: two places can use it, both only if you ask,
and neither sends it anywhere. The saved stop is the third remembered thing and
is named alongside the guide dot and the theme. `test-boot.js` now fails if the
`localStorage` keys the app writes stop matching the ones the panel lists,
which makes that rule mechanical instead of remembered.

**It says how far, never how long.** Distance and a stop count need no model.
Minutes would need travel-time history, and that is the conversation the
no-history invariant demands — so the test suite fails if a sentence on that
card ever starts implying an arrival time.

**Cost, honestly: the poster broke.** Adding one row to the mock pushed
`flyer.html` to two sheets — a near-empty first page with the header stranded
on it, exactly as `CLAUDE.md` warned. The mock column spans the page height, so
it is the thing that decides one sheet or two, and about 27 px had to be found
in the furniture around the map without touching the map. The guide's callout
dots also had to be re-measured, because they are percentages of a figure that
just got taller. Both are now written down as traps rather than left to be
rediscovered.

---

## 2026-08-01 — Parked the sightings board

**Decision.** The sightings board is switched off on this route for now, from
the admin page. It is the most complicated thing a first-time rider meets on
the page — a direction to pick, a landmark to pick, a note to maybe write — and
it arrived in the same week we started trying to win regular users. It also is
not finished. Nothing is deleted and nothing is uninstalled; the switch is in
`admin.html` and the app picks the change up within a minute.

**Cheaper than expected, and worth writing down why.** The settings validator
checks the keys it knows about but never rejects unknown ones, and
`get_settings` hands back the whole settings object, so a new flag reached
every client with no migration and nothing to run against the live database.
Any future setting is that cheap too.

**Absent means on**, so a fork that never opens the admin page still gets the
full app, and this route can turn it back on the day the feature is ready.

**Off hides, it does not lock**, and the admin page says so. Posting needs no
key, so someone who worked out the call could still add a sighting while the
board is off. Riders would never see it and it expires on its own — but it
would still turn up in the moderation list, which is exactly the sort of thing
that is baffling six months later if nobody wrote it down. Enforcing it in the
database is a one-function migration if it ever matters. It did not seem worth
one for what is really a display decision.

The guide asks the database whether to show its sightings section, with a plain
`fetch` rather than a script tag, so it still loads no files. Every failure path
— script off, config missing, network down, database unreachable — leaves the
section showing. Describing one feature too many is a much smaller problem than
hiding one that is really there.

---

## 2026-08-01 — Second pass on the UI

Follow-ups to yesterday's restructure, from the same review.

**Dark theme.** The southbound window closes at 8:00 PM, so a good share of
the time this page gets opened it is dark outside and the light theme is a
torch in the face. The map swaps to CARTO's `dark_all` — same provider, so
nothing changes there in the privacy panel.

It follows the device, and there is a ☀/☾/◐ control in the header to override
it. Three states, not two: a two-state toggle has no way back to "whatever my
phone is doing", so one tap and you are overriding your own system setting for
good. Shipped after being asked for — I had left it out on the grounds that a
rider opening a Messenger link for fifteen seconds should get the right theme
with no interaction, which is true, but it ignores the person who runs their
phone bright all day and wants a dark map at night.

The honest cost: the preference is stored, which makes it the second thing this
app keeps between visits. The privacy panel claimed nothing was kept once you
close the page — already untrue, because of the guide-seen dot, and nobody had
noticed. Both are now named there explicitly. Worth remembering that the panel
is the promise and the code is only the implementation; a third stored thing
means editing the panel in the same commit.

Doing it turned up something the light theme had been hiding: `--maroon` was
being used both as a fill with white text on it and as text in its own right.
Those are the same value in light and cannot be in dark, where maroon on a
near-black card is 1.7:1. Split into fill and ink pairs. Auditing the rendered
pages afterwards — measuring what actually painted, rather than reading the
CSS — caught three more: two places in the guide still colouring text with the
fill token, and a keyframe painting `#fff` on `--ink`, which in dark is white
on white. Also found `--muted` at 4.40:1 on the two tinted backgrounds; it had
only ever been checked against paper and white. Both themes now report no text
under AA on any of the four page/theme combinations.

**Sightings are picked, not typed.** Direction and nearest checkpoint are
pickers with an optional note. The guide used to have to *ask* people to write
"Northbound just passed Amadeo, 6:42am" instead of "Bus coming", which is a lot
to ask of someone typing one-handed at a stop. Now every sighting is specific
by construction, and because it comes back in a known shape, recent ones draw
on the progress strip as hollow dashed rings. That fills the gap the board
existed for: when nobody is sharing GPS the strip is no longer empty. Stored in
the same free-text column as before, so no migration, and old sightings still
render as the text they are.

The rings are dashed and hollow on purpose. A sighting is one person's word,
already minutes old, with no update coming — showing it as a solid bus would be
worse than showing nothing.

**Kawit.** Splits the 15.5 km Imus–PITX leg, which made a bus crossing CAVITEX
look stalled, and pulls the checkpoint chain onto the road, since the route
swings west into Kawit and back east. `docs/ARCHITECTURE.md` had suggested this
for a while. It also broke the tick labels immediately, exactly as the note
there predicted, so the label size is measured from the rendered strip now
instead of hardcoded — eight names fit, and a ninth will too.

**Smaller.** `aria-live` on the headline, which was rewriting itself every six
seconds and announcing none of it. Focus trapping in the modals. A
reduced-motion block for the app, which the guide has had all along. Bus chips
grouped by direction and ordered by progress. And `font-stretch:condensed`
deleted from all three pages — it had been reaching for a signboard look that
never rendered on any system font, so the CSS was implying an effect nobody
had ever seen.

One behaviour changed its mind: the sightings board opens itself when no buses
are live, and now never closes itself again. Auto-closing was symmetrical and
wrong — a bus coming live would have shut the board on someone part-way
through reading it, and posting a sighting closed it on the person who had just
posted. Taking something away is not as harmless as offering it.

---

## 2026-07-31 — Made the tracker readable at a glance

**Why.** The page answered its own question below the fold. Measured on a
390×844 phone, the headline sat 426 px down and the map 695 px down; with an
operator notice posted plus the first-visit accuracy banner, the map started at
834 px — off the bottom of the screen entirely. Someone opening the link while
standing at a stop saw three advisory boxes and a filter before a single bus.

**What changed.** The answer moved above the direction filter. The three
advisory blocks became one: the notice bar stays, and the accuracy warning
folded into the privacy line as a permanent clause, which retired a
localStorage flag — the warning is always true, so it should always be on
screen rather than dismissable once. Operating hours and sightings became
`<details>` cards whose summary lines carry the answer, so opening them is
usually unnecessary. The map grew from a flat 290 px to `min(58vh, 420px)`.
Headline now at 371 px and the map at 747 px **with a notice showing**; the
page is 21% shorter.

**Sightings open themselves when no buses are live.** Folding them
unconditionally would have hidden the only useful thing on the page at 5am.
A manual open or close by the reader wins for the rest of the visit.

**Defects fixed on the way.** Southbound bus badges had been rendering on top
of the AYALA and GEN.T labels — `.ticks` was pinned at 26px against 29px
content. `--muted` was 3.90:1 on white and carried nearly all the small text;
it and `--gold-deep` now clear WCAG AA. Tap targets went to 44px. Nothing on
either page was reachable by keyboard: no focus rings, no `<form>` anywhere so
Enter never submitted, tabs and bus chips were clickable `div`s. All fixed. In
the guide, the prompt-card stack had a hand-measured 186px min-height against
cards up to 319px, so on a narrow phone the prompts printed through the
paragraph below; both stacks are one-cell grids now and size themselves.

**The guide stopped using screenshots.** Every figure on `how-to.html` is drawn
in HTML and CSS from the same tokens as the app. That deletes 1.5 MB of media,
removes the last route-specific content in the repository — a fork no longer
has to reshoot anything — and kills a silent failure mode, since a screenshot
that no longer matches the app looks exactly like one that does. The cost is
honest: the recreations are hand-maintained copies, so a layout change means
updating them in the same commit. `test-boot.js` now checks the two halves a
machine can see: that the guide loads nothing, and that its copied `:root`
tokens still match `index.html`'s.

---

## 2026-07-29 — First live demo trip

**Plan.** Ride northbound from Gen. Trias to One Ayala on an afternoon
departure, share position for the whole trip, and post once to the group chat
with a screenshot and the link. Then go quiet until arrival.

**Why this shape.** Continuous narration is not possible while sharing:
switching to Messenger backgrounds the page and suspends GPS, so the bus drops
off everyone's map. Switching to the "Track buses" tab *within* the page is safe
— `switchTab` only toggles a CSS class and does not touch `watchPosition` or the
wake lock — so screenshotting your own bus mid-trip does not interrupt sharing.
One clean interruption at the start, one at the end.

**Operator approach decided.** Do not invite operators as a group and do not
invite them in the main group chat. DM each one separately, during the midday
gap between the morning and afternoon service windows, which is the only time
they are not driving. Do it *after* there is a completed trip to point at,
rather than asking them to trust an idea.

**Pitch framing decided.** Not "help us track the buses" but "you already type
your location all day; this does it in one tap". The operators are not being
asked to start doing something — they are being asked to stop doing something
tedious. Consent framing for anyone approached in person on the bus is about the
rider's own position, not the vehicle's: a passenger sharing where they are, not
the bus being tracked.

**Known gap.** A passenger holding a phone proves the watching side works. It
proves nothing about the driver's side — mounted phone, screen on for a whole
shift, battery, doing it while working. That case is still untested and should
not be presented as if today answered it. The way to answer it is to ride one
trip with an operator and set it up on their phone.

## 2026-07-28 — Announced to the commuter group chat

**What went out.** A post to the route's Messenger group chat: what the tool is,
the link, the current share key, and an explicit "this is an experiment, tell me
if it does not work". Framed as a fellow commuter, thanking the existing group
admins first, with no claim of affiliation with the bus company.

**Reception: warm.** 15 reactions, pinned by a group admin. One commuter replied
that it would be a big help for knowing where the bus is rather than chasing it.
One commuter asked publicly for an orientation session. One commuter worked out
the sharing concept unprompted and asked whether a person on board could share
their location. One **operator** asked how to use it.

**Adoption: none.** Through the rest of the day the group chat continued exactly
as before — the same "where is the bus" question asked over and over, answered
individually by operators typing their position. At least one commuter spent an
afternoon waiting at a stop unsure whether the bus had already passed, which is
the precise problem the tool solves. Nobody opened it. Warm reception and zero
adoption are two different results; only the second one is a problem.

**The structural finding.** The four operators active in the group chat already
broadcast their positions manually, in text, all day, for free. The tool does
not ask them to start doing something new — it asks them to stop typing. This
also inverts the expected privacy objection: they are currently announcing their
locations publicly under their own names, and the app is *more* private than
that, with no name attached and no history kept.

This reframes recruitment entirely. Earlier planning had assumed operators would
need to be won over to the idea of broadcasting position at all, and that the
surveillance concern would be the main obstacle. Neither is the situation.

**People, by label.**

| Label | Role | Notes |
|---|---|---|
| Operator A | operator | Asked how to use it, unprompted. Warmest operator lead. |
| Operators B, C, D | operators | Active daily in the group chat, answering position questions by hand. |
| Commuter E | commuter | Publicly asked for an orientation session. Natural first tester. |
| Admin F | group chat admin | Pinned the announcement; acts as the group's de facto dispatcher, relaying between commuters and operators. The person the tool most directly relieves. |
| Commuter G | commuter | Independently proposed the rider-shares-location idea. |

**Constraints surfaced by going public.**

*One share key for everyone.* There is no way to tell operator shares from rider
shares, and no way to revoke one person without revoking all of them — rotating
cuts off every sharer at once, with only the four-hour grace period. If
per-group revocation ever matters, that is a code change, and it should be
decided before the key is handed to two distinct groups.

*The share key is now effectively public.* It was posted in a large group chat,
which is the intended distribution method, but combined with reads being open to
everyone it means the key is the only thing preventing anyone from putting a
fake bus on the map. No action taken. Worth deciding deliberately before pushing
for wider adoption.

*The company does not know.* No approach has been made to the bus company. If
operators participate and the employer later objects, the operators carry that,
not the maintainer. Not yet decided either way.

**Loose end.** The how-to page exists, with screenshots and two screen
recordings, and was not linked when the operator asked how to use the app — the
answer was typed out longhand instead. Link and pin it.
