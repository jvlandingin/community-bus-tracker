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

## 2026-08-01 — Second pass on the UI

Follow-ups to yesterday's restructure, from the same review.

**Dark theme.** The southbound window closes at 8:00 PM, so a good share of
the time this page gets opened it is dark outside and the light theme is a
torch in the face. The map swaps to CARTO's `dark_all` — same provider, so
nothing changes in the privacy panel.

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
