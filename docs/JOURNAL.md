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

## 2026-10-20: Fewer words, and the trip's first window

The maintainer, from three screenshots of a phone: "The app looks
unnecessarily too wordy." Then a list. The bus number's "(optional, but it
helps)" just "optional"; "Which direction is this bus going?" just
"Direction"; the two lines under Start, "Your bus shows on the public map
until you tap Stop." and "Anyone on the bus can share. Keep the screen on, or
get the app and lock it.", said only once sharing has started, perhaps in a
window with a picture for each, the app's line with Google Play's logo,
"making it more official"; "First time? Try a practice run. Nothing is
shared" and "New here? Take the 1-minute tour" just "Tutorial"; the tickets
row just "My tickets"; the empty map's card just "Nobody is sharing right
now" and its button; and "Nobody is sharing right now. Seen one? Post it
below." gone. "Remember less words! Add art if needed."

All of it is done as asked, and three things came with it.

The window's first line, in the maintainer's words, was to be "remember to
tap Stop, or set your stop below so it stops sharing automatically once you
arrive", and until now that was not true: sharing stopped by itself only at
the end of the route. Now it does at the saved stop. Arriving there asks
"Getting off here?", and with no answer sharing stops a minute later, which
is about as long as stepping off takes. It only counts once the stop has been
well ahead of the bus that trip, so a commuter who saved the stop they wait at
and boards there is never asked on the way to work, and on the way home it
stops them at their door.

The app's line had been kept before a trip on purpose: started mid-trip, the
app's trip is a second bus beside the browser's, and the app's own Start,
finding that one nearby, asks whether it is the same bus, where "yes" shares
nothing. So going for the app from the window now ends the browser's trip
first, and says to start it in the app. The badge is Google's own, as on the
tester page, the flyer and the poster; while the closed test runs it goes to
the tester page.

And the line under Start had been the Play disclosure: what is shared, with
whom and until when, said before the location is asked for. It went at the
maintainer's word. The button still says what is shared, and the rest comes
once the trip is on, in the window, the welcome line and the strip's
EVERYONE CAN SEE THIS. If Play's review asks for it, it can go back, as a
line or in the button's own words.

The window shows for a sharer's first three trips, counted by the bus the
phone already keeps, and never for a trip carried over: at every Start it
would be one more tap between a regular and the road. That is a call made
with the change, not one the maintainer made, and easy to change.

Looking at the result, the maintainer took the empty map's I'm on the bus
button off too: the card says "Nobody is sharing right now" and nothing
else. It had been there to ask whoever is on a bus to be the first; the tab
of that name, at the top of the page, is the way in. Then they asked whether
the bus icon left beside the line was the most appropriate. It was not: it
was the map's own bus glyph, kept from when the card had a button, and on a
map where a bus means a live one it said the opposite of the line. The card
is now a pill with the grey dot the sharing tab shows by "Not sharing", the
app's own sign for exactly this, and it covers less of the map.

## 2026-10-20: The road seen from the front seat

With the road at one steady speed, the maintainer found the ride still
looked slow, and asked for it to look faster, with the dashes further
apart: a sign at a time was fine, and none for a few seconds too. The pace
had to stay the bus's, since the picture is behind the bus and never ahead,
so the eye moved instead. It had seen as a long lens does, as if from 22 m
behind the front, and a pole took ten seconds at 30 km/h to grow from a
quarter of its size to full; from the front seat, seeing wide, it takes two
and a half, and the near things sweep out of the glass. About 150 m is in
sight instead of 260. The middle line went from a dash every 12 m to 4 m of
paint every 20 m, drawn on the ground so it stretches as it nears, and the
near road got joints across the concrete every 4.5 m and grass on the
verges, which stream past at the foot of the glass. Measured, it costs what
the long lens did.

The maintainer liked it, but the sign at each stop with their stop's name
went by too fast to read. Keeping the speed, it became three times the
size, on two legs by the road, readable from about 25 m off, two and a half
seconds at 30 km/h, where before it could be read for a third of one.

## 2026-10-20: The trip screen comes to rest

The maintainer asked how the green dots on the sharing tab compared with the
picture of the bus driving, for a sharer who has to keep the page open.
Measured again in Chromium at a phone's size, each on its own, over whole
feeds with a bus moving all the while: the screen at rest about 1% of a CPU
core, the picture about 6%, the two dots breathing all trip about 20%.

The measuring found something else. The sharing tab is fed every 18 seconds,
not every 6, and the picture took six seconds to reach each position, so on
the screen sharers watch most it drove for six seconds and stood for twelve:
the stillness the maintainer had already asked about. It now goes on until
the next position comes, which doubles its cost and leaves it well under the
dots'. Behind that was a second fault: fed every 18 seconds, a bus faster
than about 50 km/h goes further than the 260 m in sight between positions,
and every such move was drawn at once, so on the highway the picture jumped
instead of driving. A glide now drives as far as a bus at 110 km/h goes in
its time.

The maintainer suggested the dots breathe less often, or only for the first
30 seconds and then stop or go slower. Measured: slower cost exactly the
same, since anything moving is a repaint every frame however slowly it
moves; one breath every twelve seconds still half; half a minute and then
still, nothing at all after it. So they breathe for half a minute and hold
still, green, and breathe again when that means something: the status dot
when the sharing tab or the GPS comes back, the tab's dot each time the
sharer goes to watch the map. With a bus moving all the while, the trip
screen went from 35% of a core to 16%, its picture moving the whole time.

Still looping on a trip are the coach rocking on the strip, about 7%, and
the sampaguita a sharer has from their first trip on, swinging from the
mirror, about 6%.

Then the maintainer asked how the picture looked now, whether it still
moved slowly and stopped, and whether folding it away until tapped would
save battery. The preview page had been timed for the map tab and never
showed the sharing tab's 18 seconds; rebuilt at that pace it drove all the
time, but slow it still looked, because at the bus's real pace things stay
specks until the last 50 m. Folding the road alone saved only a third: one
thing moving costs most of what several do. The maintainer chose the road
folded on the sharing tab until "Show the road" is tapped, for that visit
only; the strip's rocking bus to rest after half a minute like the dots;
and, for the look, a power pole every 25 m with bigger km signs, and, their
own idea, a sign at every stop with the stop's name and the km still to
go, like "2.5 km One Ayala". Those signs are the first words written in a
picture, other than the night's z z Z. The rest of what loops on that tab
rests too: the other buses' pills, the sighting glows and the parol, which
is up from September. In parol season, with another bus on the strip, the
trip screen a minute into a trip went from 46% of a core to 2%, and to 19%
with the road open.

Watching it, the maintainer saw the road go slow, fast, slow, and asked
whether one steady speed was impossible. It was the stylesheet's glide:
each thing went straight between four points of its way, and over the
sharing tab's 24-second glides its speed on the screen swung between about
20 and 60 km/h every six seconds for a bus going 30. Reports arriving
unevenly would have made each glide faster or slower than the last as
well. Now the card moves the road itself, 30 times a second, every thing
where perspective has it at that moment, and the view runs a fixed lag
behind each report's own time, so it keeps the bus's pace: measured on the
page, 30 km/h every second for a bus at 30, and 100 for one at 100. Three
other ways were tried and measured first and cost from a quarter more to
five times as much; this one costs what the glide did. Watching it at
highway speed turned up one more fault, as old as the glide: only what was
in sight at either end of a move was drawn, so above about 40 km/h on the
sharing tab the road went bare halfway, for seconds at 90. Everything on
the way is drawn now, and the card keeps what is still further off than
the eye reaches out of sight until the bus comes within it.

## 2026-10-20: The Google Play badge, and a shorter tester page

The maintainer asked for Google Play's logo on the flyer and the tester page,
so it is obvious the app is on Play, in testing at least, and looks the part.
Google asks for its badge, not its bare logo, wherever people are sent to
download, and for the badge unaltered, linked to the app, with its
attribution line. So it is Google's own "Get it on Google Play" PNG, inlined
like everything else on these pages: under the tester page's first line,
beside "Early access, for testers", as that page's install button, and in the
flyer's app card above "Testers only for now. Join first". A test holds the
bytes to Google's. Play shows the listing to testers only until the app is
public, which is why every badge has a line beside it saying so.

The poster's app card got the same badge next, which cost it a line of
footer and a few spacings to stay on one sheet, with 11.5 mm clear at the
foot.

The tester page's "What I need from you" card went at the same time. The
group's welcome post asks for the 14 days of riding now.

## 2026-10-20: The flyer, in fewer words

The maintainer found the flyer wordy and asked for some motion or something
to try. Its words are now the app's English with its Tagalog, as the poster's:
each step is a line, the five reassurances are chips with their reasons folded
under "Why", and the four caveats stay, a line each. It now has a card with
the guide's two buttons into the tracker's own one-minute tours, and the
example screen moves as the app does: the one bus fresh enough to be live
breathes and rocks, and the saved stop's road runs, with the app's keyframes,
which a test now holds to index.html's.

Re-rendering it showed the chat image had been ending at the top edge of the
link's card since the saved stop joined the example screen, so the picture
meant to carry the link and its QR code carried neither. It is 1826 points
tall now and ends under the "post it in your group chat" line.

The "To be fair" box went next, at the maintainer's word: four caveats were
still four more lines than a flyer is read for. The footer keeps "not an
official schedule" beside the not-affiliated statement, and the app's own
data statement says the rest.

Then the tester page's QR code joined it too, as the poster carries it: a
smaller white card under the steps, "Share with your phone locked", for
whoever shares from the bus. The tracker's code stays first and maroon.

## 2026-10-20: A poster that shows, with two ways in

Asked for: a PDF poster that is a quick showcase of what the tracker does,
with the addresses, as QR codes, of both the tracker and the tester page, for
riders who would rather share from the Play app. The flyer already carries
the tracker's QR code, but it is the long argument: an example screen, the
steps, the fine print, in three columns on a landscape sheet. So the poster is
its own page, `poster.html`, one portrait sheet read from across a terminal:
the headline, four pictures with a line each (the map, then three of the
tracker's own drawings: two for whoever waits, two for whoever shares), and
the two codes side by side. The first draft was all Tagalog, like the flyer,
and had the bus on the road where the map is now; the maintainer asked for
the app's own mix instead ("Dress your bus", not "Bihisan ang bus mo") and for
the map itself. The second code follows `ANDROID_APP_URL`,
and a test fails when the two part, so when the app goes public the poster
cannot keep sending riders to a closed test.

## 2026-10-19: The saved stop's picture draws every stop

Looking at the card on a phone, the maintainer saw "about 47 stops before
yours" under a picture of a bus a few stops off, waiting and on board alike:
the picture held only the last six stops, so anything further looked six
away. And on board the road's dashes ran past while the stops beside them
stood still, as though the stops were riding along. They asked for the view
to be improved, open to keeping it or trying something new.

The view down the road was kept, since it was chosen over the others drawn
three days before, and now draws every stop between as a post, each one
even step of depth, so the line of posts is as long as the count: two stops
off the bus is close, six and it is small, forty and it is a speck at the end
of a long road. On board the dashes are on the road with the posts and move
only when a position does, all by the distance the bus went, and a stop it
passes goes by the glass. Between positions the view stands still, as the
waiting one always has. Keeping the road running and moving the posts with
it was the other way to make the two agree, and was not taken: between
positions that is a guess at where the bus is, and at the bus's own pace it
would be the speed the rules keep off every rider's screen.

Then they asked whether that meant the view on board no longer moved while
the bus did. Nearly so: a position every six seconds is a twentieth of a
stop, so the road and the posts crept on a pixel or two and stood still.
Their idea was to set the posts further apart, keep two or three in sight
with the rest over the horizon, and show their stop as its pin there, so the
stops and the road could move together. That became the road at its real
length: the stops as far apart as they are, the dashes 50 m apart on the
same road, 1.2 km in sight, and the view following the positions at an even
pace a poll behind the bus, so it moves while the bus does and stops when it
stops. That moves at the bus's pace, which the rules had kept off every
picture; it was put to the maintainer as an exception for on board only,
where the one looking is on that bus. The waiting card keeps every stop as
a post.

That was still far too slow to the maintainer, and they asked for signs
saying how many km are left, all along the road, so that something is
always happening. There is one every 100 m now, green, with the figures
drawn like a road sign's, and the view came closer to the road, 260 m in
sight, so at 30 km/h a dash goes by every second and a half and a sign
every twelve.

They also asked whether the moving picture drains the battery of a sharer
who has to keep the page open. Measured in Chromium at a phone's size: the
riding picture adds about 2% of a CPU core to a trip screen that costs under
1% at rest. What costs is the breathing green dots on the sharing tab: any
loop that never stops makes the browser repaint the page sixty times a
second, about 20% of a core, and that was already so before any of this.

The showcase video shows the old picture until it is rendered again.

## 2026-10-19: The tester page is linked

The app is in internal testing and the closed test is open. `testers.html`
is the page copied from the sister project's: join the group, become a
tester, install. It was built unlinked until the closed test opened, so a
rider could only reach it from a link posted by hand. `ANDROID_APP_URL` now
names it, which turns on the two places the site already offers the app: the
line on the sharing tab ("Keep the screen on, or get the app and lock it",
Android browsers only) and the guide's line under "More about sharing". The
Play listing was not used there because it says "App not available" to anyone
outside the test. It goes back to the Play listing when the app is public.
Sharers are the testers the test needs: they are the ones who would use it on
every ride.

The same day the page got screenshots, one per tap, from the maintainer's own
run through the steps, as the sister project's page has: the group's
"permission" page, the join form, the welcome post, Play's invitation, "You
are a tester" and the listing. The group's welcome post now carries the steps
too, as the sister project's does. The maintainer's name, photo and email
address appear on those screens and are blurred or cropped out: the
repository is public.

## 2026-10-18: An icon for Play

The maintainer found the icon, the front-on coach on maroon, too generic for
a listing on Play, and asked to plan a new one before anything was built:
options first, each explained, then a choice. It took thirteen rounds, all
drawn and set beside each other on a design canvas.

The first drafts were set aside quickly. A red ground with the coach coming
straight at the viewer read like a game about getting out of a bus's way, and
Taal reflected in the lake was liked but carried the same feeling. The
maintainer asked for the coach side on, with Taal or the flag behind, and left
room for other ideas. Of the second round, the ticket won: it is the one
feature only this app has, the souvenir a sharer is given at Stop. Of six ways
of drawing it, a fan of three tickets ("Koleksyon"), because it survives being
cut to a square or a circle. Then the morning colours ("Umaga") with the
SALAMAT stamp pressed across two tickets; the coach made bigger, since at a
launcher's size it was not obviously a bus; and finally the coach driving out
through the frame of the front ticket's picture, so that it reads as a bus app
at a glance.

The icon's small version came last. A reduced copy of the icon was not
wanted; the maintainer asked for something new that put a bus and a ticket
together and belonged with the icon, and chose "Butas": a ticket punched
through in the coach's shape. It is the favicon, the status bar's icon while
sharing, and the one-colour icon Android 13 tints. The link preview and Play's
feature graphic moved to the icon's coral too, over keeping them maroon,
because the group chat is where most riders first see the tracker.

Settled along the way: the app's ticket says FIBI and the website's says
nothing, since the site is Bus Tracker; the status bar's mark stands upright,
because a tilt blurs at 24 dp; and the map's badges stay the front-on coach,
because they say where a bus is, not which app this is. The website's icons
change with the next deploy. The launcher icon, the splash and the status
bar's icon are inside the app, so they wait for the next bundle on Play, and
the listing's icon and feature graphic are uploaded by hand in Play Console.

---

## 2026-10-18: Sharing works from anywhere, and riders still see only the route

Filling in Play's "Sign in details" form, the maintainer met its guidance for
a location-dependent lock: give details that work regardless of where the
reviewer is. The box around the route was exactly that, so a reviewer outside
Cavite could never get past "You seem to be off the route". The maintainer had
already switched on open sharing, so there was no key to give; the box was
the last lock. A reviewer key that skipped the box was considered and refused:
anyone holding it could put a made-up bus on the real map from anywhere.
Instead, outside the box a bus is kept for its own phone and shown to nobody
else (`sql/14-off-route-private.sql`), with "Outside the route area. Only you
can see this bus." on the sharing tab. The Play answer becomes "No part of the
app is restricted". The migration has to be run in Supabase before the release
goes to review.

---

## 2026-10-17: Ready for Play, not just for a browser

A review before the closed test asked what the page had been assuming
because it was only ever a website. The maintainer's calls: the sightings
"Anything else?" box goes, since Play treats anything a stranger can type and
everyone can read as user-generated content needing rules, reports and
moderation; and the app remembers the share key, since inside it the group
chat's link opens the browser and Android forgets the session whenever it
closes the app. Fixed with them: the back button (on older Androids it closed
the app and stopped a trip), a backup that claimed to save and did not,
vibration with no permission, the privacy panel naming the app as Play lists
it ("Fibi: Bus Tracker PH") and speaking of apps as well as browsers, a line
under Start saying the bus shows on the public map until Stop, and the
launcher name, Fibi. The Play form answers now live in `mobile/README.md` and
change with the code, because the website is the app.

One question was left with the maintainer: whether the bus company's name
belongs in the header now that the page is also an app on Play.

---

## 2026-10-17: The sightings board stays folded

The maintainer found the home screen overwhelming, and asked for "post a
sighting" to start minimized. It used to open itself whenever no bus was
live, on the reasoning that it was then the only answer on the page. That
reasoning is older than the strip's glowing stretches: every sighting is now
drawn on the strip and the newest is named in the headline, so the answer is
already on screen and only the form was being opened. Its summary line still
says how many sightings are posted. `test-boot.js` checks an empty map leaves
it folded.

---

## 2026-10-17: Testers sign themselves up

The closed test needs 12 testers who stay in for 14 days in a row and really
use the app. Collecting their email addresses and adding them by hand was the
first plan, and the maintainer asked instead for the way a sister project
runs its test: a Google Group anyone can join is the tester list, and a page
walks a rider through it. So `testers.html` is three taps on the rider's own
phone (join the group, become a tester, install), with a line at each of the
two screens that look broken and are not. Its ask is riding, not installing:
the sister project was refused production because its testers installed and
then rarely opened the app.

Play Console offered Google Groups for the closed test but showed only email
lists for internal testing, so the first internal build goes to a short email
list and the group waits for the closed test. The page is not linked from the
tracker, the flyer or the briefing until that test opens.

## 2026-10-17 — The app goes through Google Play

Asked next: offer the Android app from the website, or publish it on Google
Play? Both, it turned out: the website offers it, and what it offers is the
Play listing.

- **Play, not an APK linked from the site.** An APK from a link in a chat is
  the shape of the scam apps riders here are warned about; Play updates the
  shell by itself; and the verification in the entry below closes the other
  way in. The site's offer is one line on the sharing tab, shown once the
  Play address is in `config.txt`.
- **The maintainer's Play account is a personal one**, so the app needs a
  closed test of 12 testers for 14 days before it can be public. Google has
  refused production to apps whose testers installed them and hardly opened
  them, so the testers should be people who ride this route, their feedback
  written down, and a release or two put up during the test.
- **Play keeps the signing key; the repository holds an upload key**, which
  Play Console can reset if it is lost. It was made on a phone, in Termux,
  with OpenSSL: Java's keytool crashes in Termux from Google Play ("Native
  registration unable to find class ..."), the same failure reported there
  for javac. `mobile/README.md` has the commands.
- **Next:** the first release build, the app made in Play Console, internal
  testing on two or three phones for the four real-trip checks the app still
  owes, then the closed test.

## 2026-10-17 — Could the website share with the screen locked?

The maintainer asked whether sharing could go on with the page minimised or the
phone locked, or whether an app is the only way. Checked against the standard,
the three browser engines' source and the platforms' current rules.

- **The website cannot, and nothing coming would let it.** The Geolocation
  standard (March 2026) delivers positions only to "fully-active visible
  documents", Chrome, Safari and Firefox enforce it in code, and the spec's
  editor closed background location as out of scope in 2021. Keep-alive tricks
  such as silent audio keep a page running, not visible; service workers have
  no geolocation; an installed web app, a WebAPK and a Trusted Web Activity are
  all still Chrome. Safari 26 and 27 added nothing for iPhones.
- **It turned up a bug instead**: a hidden page's heartbeat kept re-sending the
  last fix, so a bus looked live where the screen went off. Fixed the same day;
  `docs/ARCHITECTURE.md`, "When a trip is interrupted".
- **Split screen may keep a browser sharer going on Android.** Chrome hides a
  tab only when Android stops its window, which split screen and pop-up windows
  do not. Read in Chrome's source, not tried on a phone: try it before the guide
  says so.
- **The app will need registering in 2027.** Since 30 September 2026 Google's
  developer verification covers only installs from app stores in Brazil,
  Indonesia, Singapore and Thailand, and says sideloads are not covered "yet";
  it goes worldwide in 2027, no month given. After that an unregistered APK
  installs only through a one-time "advanced flow" with a day's wait, or adb.
  Registering costs $25 and an ID and ties the package to the signing key.
  Google Play is the other route (a closed test of 12 testers for 14 days, and a
  video of the location service for its declaration). F-Droid is out while the
  GPS plugin needs Google Play Services.
- **Not known before:** that plugin takes its fixes from Google's fused location
  with no fallback, so it probably fails on Huawei phones sold without Google
  services. Worth knowing before the APK goes to one.
- **iPhone:** a native build of the same plugin could keep sharing with "While
  Using" permission, at $99 a year, a Mac to build on, and an App Review that
  rejects repackaged websites; TestFlight would be the way in. Off-the-shelf
  trackers (OwnTracks, Traccar Client and others) were looked at and set aside:
  they skip the trip's guards and Stop, keep reporting until someone remembers
  to switch them off, and several keep a log on the phone.

## 2026-10-16 — The saved stop's card draws the bus coming

Watching the video, the maintainer saw that the saved stop's card looked the
same however close the bus was: a line of dots, the bus at one end and the
stop at the other, one dot fewer per stop. They asked for a picture of the
bus approaching instead, the customised bus where there is one, for both
waiting and riding, and five ideas before anything was drawn. Of those they
asked to see three drawn: the roadside seen side on, the road coming at you,
and a mix of the two, each as an interactive page with a slider. They chose
the road coming at you.

Waiting, the bus grows down the road towards the shed you wait at, a post for
each stop still between; on board, your stop's sign grows at the roadside
seen through the windscreen, past whatever hangs from the mirror. It moves
only when a position arrives, gliding to its new place, and never creeps on
between them, so it promises no more about when the bus arrives than the
words do. The words, the flags and the buzz are unchanged.

## 2026-10-16 — A video to show what the tracker does

The maintainer asked for a short, high-level video of the main features:
watching the buses, the alarms for waiting and for getting off, sharing,
dressing the bus and collecting tickets, and showing the bus to other
riders. The plan was settled before anything was made: one rider's trip
rather than a list of features, real screens with short drawn interludes
rather than a drawing of the whole app, vertical for Facebook, TikTok and
Reels, English captions kept simple, no sound. The maintainer asked
specifically that the English be easy to read, so each caption is one short
sentence of common words.

It is filmed from the real `index.html` with made-up buses; nothing it does
reaches the route's database.
`tools/render-video.sh` makes it, and the video itself is not committed: it
is about 16 MB, and every re-render would add another copy to the history
for good. The parol was left out so that a video posted now still looks
right after Three Kings.

Filming it showed one small fault in the app: just after Stop the waiting
card treated the bus the sharer had just left as one coming to their stop,
said Sakay na! and buzzed once, until the next poll. The maintainer asked for
it to be fixed; Stop now takes that bus off the sharer's own map at once.

After watching the first cut the maintainer asked for four changes, all
made: no "demo" label anywhere (the first cut carried "Demo · not real
buses" on every screen, after the flyer's rule), "Help other commuters" in
place of "Riders can say salamat", "Earn coins and dress up your bus" in
place of "Dress up your bus", knowingly using the word the app gave up for
spare parts, and the interface's sounds. Music and the bus's own sounds
they will add themselves.

Then a few seconds more in My tickets: after the new paint, the same bus in
five other paints and sets of accessories, half a second each, close up and
without showing the taps, so a viewer sees how much a bus can be dressed.

## 2026-10-16 — A bus waiting at the terminal, and a ticket for going nowhere

The maintainer asked two things. Could the bus in a popup move with the bus's
speed, since a sharer who starts at the terminal while the bus waits shows a
bus driving past the town for as long as it waits? And could the app tell
distance, so that a trip under a kilometre gets no ticket?

The phone does know a speed: most phones' GPS reports one, and the Android
app's plugin passes it on. The page throws it away before anything is sent,
and the server has kept none since `sql/08-position-checks.sql`, because a
bus's speed is the one thing this tool promises cannot be used to review a
driver by. A picture that moved with it would put that number on every
rider's screen, which is why the ride's fixed pace was kept when the rules
were last revisited. The waiting bus needed less than a speed: whether it is
moving at all, which every rider can already see from its badge on the map.
The rider's page now works that out from the positions it is sent anyway and
stands the picture still after two minutes in one place; nothing new is sent
or kept.

Distance it already had. Every trip keeps where on the route it started, and
its end is read off the last fix, both measured along the checkpoint chain.
Under a kilometre between the two is now no ticket, whatever the time on the
map, so half an hour at the terminal with sharing on and then Stop gets
nothing, and earns nothing for the bus either.

## 2026-10-14 — What two months of the group chat said

A second Claude session with the riders' group chat (mid-August to early
October) was asked eight questions about departures, position reports, travel
times, what riders ask, the schedule, the road and the tracker, under the rule
that nothing in the answer names a person. The travel-time pairs it returned
are kept out of this repository on purpose: they are timestamps from
identifiable accounts, which is the history this tool promises not to hold.
What they established is recorded here instead.

- **61 timed trips, 124 departure-to-position pairs**, nearly all northbound
  from Mendez, from operators posting from on board. Along the checkpoint
  chain, early buses run 19 to 36 km/h after Tagaytay and afternoon buses 9 to
  28, the afternoon's first leg slowest because buses sit at Olivarez filling
  up. Afternoon full runs reached One Ayala in 208 to 238 minutes. The en-route
  allowance was 210 and is now 240. Southbound gave five pairs, not enough to
  draw anything from.
- **"Paalis na" at Mendez is departure within two or three minutes**; stated
  slots ran 0 to 13 minutes late. At One Ayala the same words can precede
  departure by an hour of waiting to fill. Any band drawn from a report should
  anchor on the message time, and southbound only on "has left".
- **What riders ask**, of about 4,450 bus questions: where is it now 43%, is
  there still a bus today 18%, what time 17%, has it passed a place 7%, has
  it left 6%. The weekend hours and the hours card answer the middle third; a
  "left Mendez" report with a band on the strip would answer the first and
  last.
- **Riders name stops, not checkpoint towns**: Manggahan, Olivarez, Monterey,
  Open Canal, Sunny Brooke, Lancaster each outrank Gen. Trias, Imus and Kawit.
  The sighting picker offers checkpoints only. Noted, not yet changed.
- **Weekends are thin.** Three Sundays ran a single bus. Weekend departures
  are announced the same way, only less. Hence the weekend hours set.
- **Built from the pairs the same day:** a "just left the terminal" sighting
  and a hatched stretch on the strip between where the slowest and the
  fastest past trip would be, northbound only, from `TRAVEL` lines in
  `config.txt` (early row to Imus, afternoon row to One Ayala). The crossing
  times per checkpoint were read off each run's progress curve, not off the
  nearest report, so a report past Imus bounds Imus rather than standing in
  for it. `docs/ARCHITECTURE.md` has the fences.
- **The first thing the maintainer asked on seeing the board:** what if the
  sighting was twenty minutes ago? The composer stamped everything at the
  moment of posting, which was wrong for exactly the posts the chat showed
  are common, riders relaying an operator's "paalis na". Fixed the same day
  with a "when" choice and a clock time in the body. Should have shipped
  with the departure report.
- **One mark for every sighting.** The maintainer, looking at the first
  live band: what is the difference between the ring and the band, and why
  stripes? Now every sighting is the same glowing stretch, moving where the
  travel-time rows allow and still where they do not, and live buses pulse.
- **Operators already share live locations in the chat**, 319 of them plus
  pins, and riders complain that WhatsApp live locations freeze. That is the
  pitch for the tracker, which the chat never mentions in that period, even
  though the 28 July entry below records an announcement to the commuter
  group. Either a different group or an export that starts later; to check.

## 2026-10-14 — A new poster, and the question of a bus nobody is on

The company posted an updated schedule. Two things in it the tool could not
say. The trips in each window now run at their own interval, every 30 minutes
before dawn towards Makati and every 40 in the afternoon back, where the
settings had one number for the whole route; a window can now carry its own,
and the route's number stays for any that does not. And weekdays and weekends
now have different windows, which the settings still cannot express: the
tracker shows the same hours every day of the week. The weekend hours are
narrower than the weekday ones, so until that was built the page said
"departing" on a Saturday morning at 3:30 when the poster says 4:00. Built the
same day as an optional `hours.weekend` set; the entry above has why.

The poster also prompted a question worth recording the answer to: could the
map show a faint bus where one *should* be, worked out from the timetable, for
the days nobody is sharing, or when an operator just posts "umalis na" in the
chat and nothing more? Decided against the timetable version. The schedule is
departure windows with an interval, not departure times, so the position of a
bus guessed from it is wrong by up to a whole interval before traffic is even
considered, and a transparent bus on the same map as the real ones is exactly
the thing the flyer's "example screen" label exists to prevent: a drawing that
reads as data. The project already declined to draw a route line for the same
reason, and the saved-stop card is tested never to imply an ETA. The "umalis
na" case is a different thing, and a real one: it is a human report with a
time, which is what a sighting already is. "Left Mendez at 3:40" posted as a
sighting at the terminal would already draw the hollow dashed ring for one
interval, and that is the honest shape for it. Whether that ring may drift
along the strip at an assumed pace is the open question; it would need
segment travel times, which nothing here records on purpose, so they would be
a handful of hand-written minutes in `config.txt` from trips somebody rode,
never a log. Left open.

## 2026-10-14 — The first 08 failed on the live database

Run in the Supabase SQL editor, `sql/08-position-checks.sql` stopped on
`null value in column "speed" ... violates not-null constraint`. The live
`speed` column refuses NULL, which the repository's reconstruction of the
database did not record, so every test here passed. The file is one
transaction, so nothing was applied. The fixed version lets that constraint go
before clearing the values, and the reconstruction now has it, so the suites
fail the way the live database did if it ever comes back. Run the new version
of the file; the old one cannot succeed there.

The error's detail line printed a whole row, share key included. Worth knowing
before pasting one anywhere public.

## 2026-10-13 — A review, and the six fixes it put first

The maintainer asked for a review of the whole codebase for security and bugs.
It found nothing critical: the database functions are locked down, row level
security holds, and every value from the database is escaped where the pages
draw it. Six things were worth fixing first, and all six are fixed in the
software. One needs a step outside it.

- **Run `sql/08-position-checks.sql` in the Supabase SQL editor.** Until it
  runs, the database still accepts a bus with no position from anyone holding
  the share key, dead rows can still fill the sharer cap, and speed is still
  kept if a page from before this sends it. It is safe before or after the
  pages deploy.
- **What the six were.** A bus with no position stopped every rider's list
  drawing and hid from the admin page's Stop list. Dead rows could refuse every
  new sharer while the map showed no buses. Every GPS fix was a read. A failed
  write swapped Stop for Start, and that Start left a GPS watch running after
  Stop. The session id, and so the bus's public id, outlived the trip. And speed
  was kept and published, though nothing used it and the privacy panel never
  said so.
- **Wording that changed with them.** The privacy panel now says that anyone
  watching could write down what they see, and the operators' briefing has a
  short section saying the same; its PDF was re-rendered and is still seven
  pages. The kick's honest limit was wrong: a reload never gave a new session,
  a new tab does.
- About fifty smaller findings remain open.

## 2026-10-11 — A clearer guide, and a tour

The maintainer asked for the guide to be very clear, with no long blocks of
text and more pictures where they help, and floated an onboarding tutorial that
people can easily open: an interactive way to explore what the app does, with
the Arok app's tour as the inspiration.

- **The guide** went from about twelve phone screens of paragraphs to a line and
  a picture per idea, with the fine print in "More" folds, a list of links at the
  top, and new drawings: a bus's popup, a key to the strip, the card's flags.
- **The tour** is two practice runs on the real page, one per tab, about a
  minute each. A practice bus stands in for the real ones while it runs, and
  nothing in it can be sent or kept. It opens from the guide, from a button at
  the foot of each tab, and once from a "New here?" note on a first visit.
- **One decision taken without asking**, and worth revisiting if it reads wrong
  in the group: the tour is offered on a first visit, not started, because the
  page's first job is showing the bus. Arok starts its tour by itself.

## 2026-10-10 — Keeping the ticket

The maintainer asked whether a sharer could collect the tickets of every ride,
with stats, kept on the phone and never sent: to make sharing, and watching,
more fun and more useful. The ticket had been built to be kept nowhere, so this
reversed a promise, and it was planned before anything was built. Three
decisions went to the maintainer with a recommendation each, and "sounds good,
let's implement" took all three:

- **The promise changes** from "never kept" to "kept only if you tap Keep, on
  this phone only". A kept copy is a souvenir, not a stopwatch: the day, the
  direction, the two places, the stamps, and whether anyone said salamat. No
  times, no duration, no bus number, no count, because anyone on board can
  share and a conductor's phone full of timed tickets is a timesheet.
- **Salamat in the album is a flower** on each ticket someone thanked, with no
  number anywhere, over a per-ticket count or a running total.
- **The album first**, the ideas for watchers after.

The maintainer then suggested art on each ticket depending on where the trip
started and ended, "so collecting makes more sense". That became the ticket's
picture: the two places' marks as roadside signs, the coach on the road between
them. One thing was added to it: the sky follows the stamps (dawn, night, or
day), so tickets differ more and a kept copy needs no clock to draw it. The
album counts the places on the route a sharer's kept trips have passed, the
four stamps, and the tickets themselves. Time on the map was left out on
purpose, because added up it is working hours.

Asked whether each place still had its art, "like Taal when arriving at
Tagaytay", it had, but only as the small drawing on the arrival sign. So the
picture now has the destination's view behind the coach: Taal Lake and the
volcano island for Tagaytay, towers for One Ayala, the terminal's wave of a
roof on the bay for PITX, coffee under a shade tree for Amadeo, a church, a
heritage house with its tower, shops at a crossing, and a monument with the
flag. They are by kind of place, like the marks, so the code names no town.
The flag is pinned the right way up by a test: blue above red.

**Left as it was:** the flyer's "Walang itinatagong history ng biyahe". It is
about what the system stores, its claim that no driver's route, speed or stops
are recorded still holds, and the poster has no room to spare. The briefing
and the guide do say it now.

**Not yet checked:** whether sharers notice Keep on a real phone; how the
picture's small signs read on a cheap screen in daylight; and whether the
Android app keeps its album across an app update, as WebView storage should
unless the app's data is cleared.

**Next, from the same plan, not built:** for watchers, "Sasakay ka na?" — when
the bus you are watching reaches your saved stop, offer to start sharing it,
on phones that opened the share link — and a saved stop for each direction,
for people who wait at one stop in the morning and another in the evening.

## 2026-10-10 — An art direction, agreed before it was built

The maintainer's next question was about the look rather than the features: it
read as generic templates, icons and shapes, and could it look professional.
The answer was planned before anything was built, as a page of drawn examples,
and four decisions were put to the maintainer with a recommendation each. All
four recommendations were taken:

- **The typeface:** Barlow Semi Condensed, over Atkinson Hyperlegible or
  staying with each phone's own font. It fits the strip's eight checkpoint
  names at a readable size, and it looks like transport signage without being
  any operator's lettering.
- **The coach's colours:** a cream body with the app's maroon and gold, over an
  all-maroon body or keeping the simple bus symbol.
- **The mark:** the coach seen from the front, over a signboard or route lines.
- **How far:** all four steps — the foundations and a style guide; the
  typeface, the icons and the map's buttons; the signboard and the mark; the
  coach and the pictures. A fifth, a basemap in the app's own colours, was left
  out as a decision of its own: it needs either a paid map style or map data
  hosted here, and both are bigger than everything else put together.

**Rules the work was held to**, stated in the plan and kept: nothing new from
anyone else (the font and the drawings are served from this site, so the
privacy panel stays true word for word); under 60 KB added to the tracker;
nothing that looks like the bus company's own livery, logo or lettering; text
stays text, so the signboard and every icon still read to a screen reader;
icon names follow the content-blocker rule; and the flyer, the briefing and the
guide change in the same commit as the app, with the poster still one sheet.

**Where it stands.** The first two steps are in: seven text sizes, three
corners and three heights where there had been twenty-one sizes, nineteen
corners and forty shadows, and three speeds with three curves where there had
been ten curves, all held by a test that fails on a new literal; a
style guide page that draws them from the tracker's own stylesheet; Barlow,
46 KB for five weights, cached for a year; and one drawn icon family with no
emoji left in the interface. Doing it turned up one bug that had shipped: the
first tap on a bus in the list could open its popup with the top cut off for a
few seconds.

The third step is in too: the header's route board is a real dot matrix,
built from lit dots five across and seven down like the boards on the buses,
and the coach is the mark, on the home screen, in every tab and on the link
preview. The board kept the rule the old one had: the route name is still
text in the page, and any character it cannot draw leaves the lettered board
instead.

And the fourth: the empty map is a picture now, the coach parked on the ridge
above Taal at night, at dawn or in the midday sun, with the next trips written
on its sky, and the same view covers the guide, the flyer and the briefing.
Each checkpoint can carry a small drawing of the kind of place it is, beside its
line in a bus's popup and on its stop on the ticket, chosen in config.txt so
the code names no town. Two things that had looked wrong for a while were put
right on the way: the ticket's stamps sat over "3 riders said salamat", and the
parol hung on the corner of the sharing tab.

**Not yet checked:** how Barlow renders on a real iPhone and a real low-end
Android, how the board's glow looks on a cheap screen in sunlight, and whether
riders read the sampaguita on the salamat button as a thank-you without the
words beside it. They always have the words beside it. The link preview with
the new picture has not been seen in an actual Messenger chat. The marks were
chosen from general knowledge of each town, like the town lines, and are worth
the same read-through before this is merged.

## 2026-10-10 — A redesign, and some fun

The maintainer asked whether the UI could be more beautiful, and then whether
the app could be more fun, after picking the salamat ticket for sharers out of
the first set of ideas as the one they liked best. Nine design ideas and seven
of nine fun ones were built in one go; the commit log has what each one is, and
`docs/ARCHITECTURE.md` why each one is shaped the way it is. This entry is the
parts that were decided rather than built.

**The name is Bus Tracker.** The previous entry noted that "WT Live" reads as
the bus company's initials in a link preview, before anyone has seen a
disclaimer. Settled: every title a reader sees says Bus Tracker, and the route
says the rest. The header line that names the company as UNOFFICIAL stays.

**Two fun ideas were left out on purpose.** Telling a sharer how many phones
have the map open ("10 people are watching") would change who can see the
watching count, which only the admin page can today; that is a decision about
the count, not a decoration, so it waits for one. And "Ingat po" as a second
kind of thank-you needs a database migration for what is really the same
gesture as salamat. Neither is ruled out.

**Two bugs turned up by using the thing, not by reading it.** Every afternoon
between the windows, the empty headline sent riders home until tomorrow's first
trip with a 3:40 PM bus due. And tapping salamat closed the popup before
"Salamat sent" appeared, so the rider never saw their thank-you land, though it
did. Both were live; both are fixed and pinned by tests that fail on the old
code.

**One rule that shaped the favourite.** The ticket is the most rewarding thing
the app shows anyone, which made it the most likely place for a driver metric
to creep in: "trip took 2 h 05 min" is a stopwatch on a driver with one more
step. So its stamps are about the trip's shape and the time of day only, it is
made on the phone and kept nowhere, and a test fails if the record it is built
from ever grows.

**Not yet checked:** the link preview picture in an actual Messenger chat (it
only gets its full address on a Netlify build), "Add to Home screen" and the
buzz on a real Android phone, and the seven one-line town stories, which were
written from general knowledge and are now printed to every rider: they are
the first thing to read over before this is merged.

## 2026-10-09 — If it were built again from scratch

A review rather than a change: what would come out the same if the whole thing
were rebuilt today, and what would not. Nothing in the code moved. It is written
down because the useful part was the list, and a list that lives only in a
conversation gets rebuilt from nothing next time.

**The core would come out the same.** One row per sharing session and no history
table; every read and write through `SECURITY DEFINER` functions over tables
with RLS and no policies; three separate credentials and open reads; polling
rather than Realtime; distance along the checkpoint chain and never minutes; a
stop picker instead of a location prompt; static pages, vendored libraries, no
framework; a Capacitor shell that loads the live site. These are the decisions
that make the project what it is, and none of them would be made differently.

**What a rider or driver would actually notice is small.** Four things:

- *The name.* The link preview and the browser tab say "WT Live", which reads as
  the bus company's initials. The header does say UNOFFICIAL, but the preview is
  seen in the group chat before anyone opens the page, and it carries no such
  word. A rebuild would use a name that does not borrow the company's.
  `for-operators.html` already calls it "Community bus tracker". Not decided:
  the name is the maintainer's call.
- *The pictures on the flyer and the guide would always match the app*, because
  they would be captured from a labelled demo mode of the real tracker by the
  headless-Chromium script that already exists, instead of drawn by hand. Today
  their map photos still show the old grey stop dots.
- *No sightings board.* It was switched off the same day it was redesigned, and
  the group chat already does its job. Riders see no difference, since it is
  off.
- *The Android app would have come first*, and been tried on a real trip before
  any of the design passes. Same app, about two months earlier. As of this entry
  `mobile/README.md` still lists that trip as not done.

**What only matters behind the scenes, or to another route:**

- **`sql/` cannot build an empty database.** `01-base.sql` opens with
  `alter table public.routes`; nothing in `sql/` creates `routes`,
  `bus_positions` or `sightings`, and nothing inserts a route row. Those exist
  only in `tests/db/00-legacy-baseline.sql`, the reconstruction of the original
  production database, which also seeds a test share key, fake buses and a spam
  sighting, so running it is not the answer either. Checked against a fresh
  PostgreSQL 16 by following the README exactly: `01` to `05` and `07` fail with
  `relation "public.routes" does not exist`, and the only table created is
  `watching_now`. All 187 database checks pass, but only as upgrades of the
  baseline, so CI has never tried a fresh install. This is the lesson from
  `tests/README.md` again: a runbook nobody has followed end to end is not a
  runbook. It matters if another community wants its own copy, and it matters
  to this route if its database ever has to be rebuilt.
- **The route is not all in `config.txt`.** `set_bus_position` hardcodes a
  Cavite bounding box (`sql/03-kick-block.sql`), so a deployment anywhere else
  would have every position refused, and the page would explain it as being
  outside "the Mendez to Makati route". The header, the direction destinations,
  the closing-hours sentence, the trip questions and the map's default centre are
  fixed text in `index.html`.
- **The code would be organised differently**, invisibly to anyone using it.
  ES modules instead of one long inline script, so the tests import the shipped
  code rather than cutting `index.html` apart at comment markers (one cut takes
  everything from `function haversineKm` up to `function timeAgo`, so it depends
  on the order the functions happen to be in). One shared token stylesheet
  instead of five copies and a drift test. The site published from a
  subfolder, which would make a root `package.json` harmless. Roughly half the
  rules in `CLAUDE.md` exist to compensate for these, and would not be needed.

**If one thing is done, it is the fresh install**: a schema file that builds the
database from empty plus a function that creates a route, and a CI job that
installs from nothing, so the README's setup steps are proven on every commit
the way the test runbook already is.

---

## 2026-09-15 — CARTO started charging rent, in watermarks

**What happened.** The live map began showing "API KEY REQUIRED" printed
diagonally across every tile. Not our doing: CARTO changed its terms in
late August 2026 and now watermarks any tile fetched without an API key.
It hit the deployed site and the redesign branch alike, because both ask
the same host for tiles. Nobody told us; it was noticed by looking.

**The fix.** A free key, no account needed, in `config.txt` as
`CARTO_API_KEY`, appended to the tile URL as `?key=`. Left blank the map
still works and stays watermarked, which is on purpose: a fork that has
not read the setup notes should see its own route on a recognisable map
rather than a broken one. The warning goes to the console, where the only
person who can act on it will be.

The key is public, like everything in that file. That is worth stating
plainly because the file's whole pitch has been "no secrets here": the
Supabase anon key unlocks nothing, but a copied CARTO key spends this
deployment's monthly tile allowance. Different kind of thing, same file.

**And then it moved to Netlify, which cost the repo a property.** Putting
the key in Netlify's build settings instead keeps it out of a public
repository, which is the theft route that actually happens — bots trawl
GitHub for keys, they do not read deployed config files. So
`tools/write-basemap-key.js` now runs first in the build and writes the
variable into `config.txt` on the way past.

Be clear about what that is and is not. It is not secrecy: `config.txt` is
fetched by the browser, so the key is one devtools panel away on the live
site, exactly as it was when it was committed. Hiding it from users means
proxying every tile through a function, which ties this to one host and
spends that host's bandwidth on map tiles — a bigger decision, not taken.

What it did cost is the sentence this repo has repeated since the move to
git deploys: *what gets published is the repository exactly as committed.*
That is now false by one line, and both `netlify.toml` and
`docs/ARCHITECTURE.md` say so rather than quietly keeping the old claim.
It is a small break and a real one: for the first time the deployed site
can differ from the commit, and the next person debugging a strange
production-only symptom needs to know that is possible.

**What was tried.** Drawing our own basemap, with no tile provider at all.
It got further than expected. A coastline traced out of the map screenshot
already embedded in `flyer.html`, georeferenced against the eight
checkpoints whose pixel positions are recorded in the comment above that
figure, came to 8.7 KB at about 56 m per pixel. At the whole-route zoom it
looked good and entirely on-brand.

Two things stopped it. Zoomed in, a drawn map has nothing to show, and
knowing which corner the bus is on is the one job the strip and the saved
stop do not already do. And the trace invents water: text labels and the
old grey marker dots in the screenshot read as coastline, which at zoom 13
put a lake across the route near Tagaytay. That is the same failure as the
route line crossing the sea, and it was rejected for the same reason.

The idea is not dead, it is blocked on data. Natural Earth is public domain
and reachable but has fourteen points for our whole coastline. The detailed
Philippine boundary set on GitHub is GADM-derived and its licence forbids
redistribution, so it cannot ship in an AGPL repo people fork.
OpenStreetMap has the right detail and the right licence and we already
credit it, and needs a tool run somewhere with network access to fetch the
corridor's coastline, major roads and place names. That is the next move if
the map is worth owning outright — and this week is the argument that it is.

## 2026-09-12 — The map becomes this route's map

A presentation pass on the map only. Nothing moved on the page, no request
changed, nothing new is stored, and CARTO is still the only third party —
the privacy panel's sentence about it is unchanged and still exactly true.

**What changed.** The basemap is now two CARTO layers, base without labels
under the app's own marks and labels alone above them, so place names sit
over the stop pips rather than under them. The base is faded so maroon and
gold are the only strong colours on the map. Stops became small pips in the
livery that hide below zoom 12; checkpoints became station marks with the
strip's short names beside them. The bus badge is a drawn SVG instead of an
emoji, and a live one breathes.

**What was tried and dropped.** A route line. The exact road is not known,
the public routers cannot be reached from where this was built, and a
straight line between checkpoints crossed water at the Manila Bay end. A
line that is wrong is worse than none, because a bus a kilometre beside it
reads as a bus off its route. Taken out the same day, tool and all.

**The honest costs.** The three recreations carry the new badge and the
checkpoint marks, but their basemap photos still show the old grey stop
dots, which is a recapture that needs a browser with CARTO access. And the
faded base is a CSS filter over the whole tile pane, which is one more
thing for an old phone to composite; if the map ever stutters on one, that
filter is the first suspect.

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

**Fewer words.** A follow-up trim, same day: the hints had grown until the
tracking tab read like a form with terms and conditions. Every hint now says
its one thing and stops — "Tap any 🚌 to see it up close and say salamat"
instead of naming the three places a bus can be tapped; the sharing tab's
strip card no longer repeats its own heading in prose. Nothing pinned by the
tests moved, no promise was weakened (the privacy row still carries the
never-leaves-your-phone and can-be-wrong clauses), and the privacy panel
itself is untouched — long is correct there, behind a tap, where someone has
asked to read it.

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
