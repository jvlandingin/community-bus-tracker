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
