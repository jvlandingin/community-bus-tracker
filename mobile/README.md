# The Android app

A Capacitor shell for **sharers**: it loads the live site and adds the one
thing a browser cannot do, which is keep GPS running with the screen locked
or another app in front. Watchers never need it, and iPhone sharers still
use the website with the screen on.

## What it is, and what it deliberately is not

- **It loads the live site** (`server.url` in `capacitor.config.json`), not a
  copy bundled into the APK. Every screen comes from the same Netlify deploy
  the browser gets, so a change to `index.html` reaches the app on its next
  launch with no new APK, and there is no second copy to drift. `www/` exists
  only because Capacitor requires a web directory; `www/offline.html` is
  what shows when the site cannot be reached.
- **The trip logic stays in `index.html`.** When the page finds
  `window.Capacitor.Plugins.BackgroundGeolocation`, `watchTripGps()` takes
  fixes from it instead of `navigator.geolocation`, and everything after that
  (`writePosition`, the heartbeat, all three trip guards) is the same code the
  browser runs, tested by the same suites. `test-boot.js` section 11 boots the
  page with a stand-in bridge to prove the switch happens.
- **No new data.** It sends exactly what the page sends. There is no
  location history on the phone either: the latest fix lives in the page's
  memory, as in the browser.
- **No `ACCESS_BACKGROUND_LOCATION`.** The service only starts when a sharer
  taps Start with the app on screen, which Android counts as foreground use
  for as long as the notification is up. That notification cannot be
  dismissed while sharing, so the app can never share without the person
  knowing.

## The five plugins

Each one only carries a call across to Android. What to do with it is decided
in `index.html`, under the suites, like everything else.

| Plugin | Why |
| --- | --- |
| `@capacitor-community/background-geolocation` | The foreground service that keeps GPS alive with the screen off. |
| `@capacitor/local-notifications` | Two jobs. It asks for Android 13's notification permission, without which the sharing notification is hidden. And it turns a trip question asked while the app is in the background (wrong direction, still on the bus, trip finished) into a notification, because the wrong-direction one takes the bus off the map until it is answered. |
| `@capacitor/app` | The back button. Without it, Android 11 and older closed the app on back, which stopped a trip, and back never closed a pop-up. `appBack()` in the page closes what is open, one layer at a time, and otherwise puts the app in the background. |
| `@capacitor/filesystem` and `@capacitor/share` | A backup, a link to a bus, the tracker's own link (Send the tracker) and a ticket's picture (Send a picture) go to the phone's share sheet. A WebView has no `navigator.share`, and it drops a download without a word, so a backup "saved to your downloads" was never saved. `appSendFile()` writes the backup, or the picture as base64, to the app's cache and shares the file. |

The manifest adds two things the plugins leave out. `VIBRATE`, or the WebView
ignores `navigator.vibrate` and the saved stop's "buzz once" never buzzes.
And the GPS plugin's service is set not exported, because the plugin leaves
it open to every other app on the phone.

Two settings in `capacitor.config.json` are there because the
background-geolocation plugin's README says so, and both are about Android
quietly throttling a backgrounded WebView:

- `android.useLegacyBridge: true`, or location updates stop after about five
  minutes in the background.
- `plugins.CapacitorHttp.enabled: true`, which routes the page's `fetch`
  through native code, because Android throttles HTTP from a background
  WebView after about five minutes. supabase-js uses `fetch`, so every write
  goes this way inside the app.

## Building

The npm here lives in `mobile/` only. Netlify only installs from a
`package.json` at the repository root, so this one never runs at deploy
time, and the site stays exactly what is committed.

```
cd mobile
npm ci
npx cap sync android
cd android && ./gradlew assembleDebug   # needs JDK 21 and the Android SDK
```

The APK is at `android/app/build/outputs/apk/debug/app-debug.apk`.

CI does the same in `.github/workflows/android.yml` whenever `mobile/`
changes, or on demand from the Actions tab, and attaches the debug APK to
the run. That APK is signed with a key thrown away with the runner, so the
next one will not install over it, and Play refuses it: it proves the shell
compiles. The build that goes to Play is the next section's.

## Signing: the upload key, made once

Google Play keeps the app's signing key and re-signs everything it delivers
(Play App Signing, which a new app starts on). What this project holds is the
**upload key**, which only proves that an upload came from here. Lose it and
Play Console resets it in a day or two, with every installed app unaffected,
so it is a key to back up rather than one to fear for.

A phone is enough to make it. In Termux it is made with OpenSSL rather than
Java's keytool, which crashes in Termux from Google Play ("Native
registration unable to find class ...", October 2026). OpenSSL writes the
same kind of file, a PKCS12 keystore, and Java and the build read it as they
read keytool's: tried here with a signed bundle.

```
pkg install openssl-tool termux-api   # termux-api needs the Termux:API app too
openssl req -x509 -newkey rsa:2048 -noenc -keyout bus-key.pem -out bus-cert.pem \
        -days 10000 -subj "/CN=Bus Tracker/C=PH"
openssl pkcs12 -export -inkey bus-key.pem -in bus-cert.pem -name bus \
        -out bus-tracker-upload.jks    # asks for the password twice
rm bus-key.pem bus-cert.pem
base64 -w0 bus-tracker-upload.jks | wc -c               # how long the secret must be
base64 -w0 bus-tracker-upload.jks | termux-clipboard-set
```

Anywhere with a working JDK, keytool makes the same file in one line:
`keytool -genkeypair -keystore bus-tracker-upload.jks -alias bus -keyalg RSA -keysize 2048 -validity 10000`.

The last Termux line puts the whole key on the clipboard for the
`BUS_KEYSTORE_BASE64` secret: it is one very long line, and selecting it by
hand drops the end. Then add `BUS_KEYSTORE_PASSWORD`, `BUS_KEY_ALIAS` (`bus`)
and `BUS_KEY_PASSWORD` as repository secrets. A PKCS12 keystore has one
password, the one asked for when it was made, and `BUS_KEY_PASSWORD` is that
same password. **Never commit the `.jks`**
(`.gitignore` refuses it). Termux's home folder goes if Termux is
uninstalled, so keep a copy and the password somewhere else as well.

`.github/workflows/android-release.yml` ("Android release bundle" in the
Actions tab) builds with it, only when run. It checks the four secrets before
the build and names the one that is wrong, a paste cut short included, then
builds the bundle, proves it is signed, and publishes it as
`bus-tracker-<code>.aab` to a prerelease of its own, `android-release-<code>`,
which a phone can download in one tap for the Play Console upload.

## Google Play

The app goes out through Google Play, and the website offers it once
`ANDROID_APP_URL` in `config.txt` is the Play address: in the trip's first
window, in an Android browser, once a trip is on (going for it ends the
browser's trip, so the app's is not a second bus), with Google's badge, and in
the guide's notes on sharing.
`docs/ARCHITECTURE.md`, "The Android app", has why Play rather than an APK
link, and why the offer is that narrow.

**What goes up.** The `.aab` from an "Android release bundle" run. Its version
code is the run number, which Play needs to rise with every upload, and its
version name is `1.<run number>`, so a release in Play Console says which run
made it. Accept Play's own app signing key when it offers it; the bundle is
already signed with the upload key above. The package name,
`org.communitybustracker.app`, is fixed by the first upload.

**Nothing is handed out as an APK.** Testers install from Play's internal or
closed testing track, and everyone else from the listing, so every copy of the
app carries Play's signature and updates from Play. An APK signed any other
way would not, and switching would mean an uninstall, which deletes My tickets
and the sharer's bus. Should a phone ever need a file, Play Console's App
bundle explorer offers a signed universal APK carrying Play's own signature.

**What the forms need to know**, all checked against a signed build:

- **Name:** "Fibi: Bus Tracker PH" on the listing, "Fibi" under the icon
  (`strings.xml`). The privacy panel names the app the same way, because Play
  asks a privacy policy to name the app or the developer as the listing does.
- **Permissions:** fine and coarse location, a foreground service of type
  location, notifications, vibrate, internet and wake lock. No background
  location: the service starts only from a tap on "Start sharing my
  location" with the app on screen. The line under it that said the bus
  shows on the public map until Stop went in October 2026, at the
  maintainer's word; the trip's first window says to tap Stop when getting
  off, and the strip says EVERYONE CAN SEE THIS (`docs/ARCHITECTURE.md`,
  "What a website could assume and an app cannot", has the trade).
- **Foreground service declaration:** type `location`, for "the user shares
  the bus they are riding on a public live map until they tap Stop, or reach
  the stop they saved, where the app asks and stops a minute later if
  nobody answers". Play
  wants a short video of it: Start, the notification, the screen locked, the
  bus still moving on a second phone, Stop.
- **Privacy policy:** `https://community-bus-tracker.netlify.app/#privacy`,
  which opens the privacy panel. The panel is the policy, for the site and the
  app alike.
- **Data safety:** the privacy panel lists everything that leaves a phone,
  and these answers have to say the same. Collected, in Play's terms, none of
  it shared with a third party and all of it over HTTPS:
  - *Location, precise*: only while sharing, for the app's function, shown on
    the public map by the sharer's own choice (outside the route area, on the
    sharer's own phone only), deleted when the trip ends.
    The trip's direction and the bus number, if typed, go with it.
  - *App activity, other user-generated content*: a sighting, picked from
    lists (direction, place, time) and never typed, with no name, deleted
    after a couple of hours.
  - *App activity, app interactions*: a salamat tap, stored scrambled so it
    counts once per bus, deleted when that trip ends; and a "Not a real
    bus?" or "Wrong?" tap, stored the same way, seen only by the organizer,
    deleted when that trip ends or that sighting expires.
  - *Device or other IDs*: a random ID made fresh for each trip, and one made
    fresh by each open page for the live count of watchers, deleted three
    minutes after the page closes.

  Not collected: names, accounts, contacts, the advertising ID, a watcher's
  location, the saved stop or what is typed to find it (the places along
  the route are searched on the phone), tickets or your bus.
  Not shared either: Send the tracker and Send a picture hand a link, or a
  picture of a ticket's six kept things, to the phone's own share sheet at
  the user's tap, for the app the user picks. Play does not count a transfer
  the user starts and expects as sharing, and the app sends none of it
  anywhere itself. The share key is the route's,
  not the person's: the app keeps it on the phone and sends it only to be
  checked, as a browser does. Users can delete their data: Stop removes the
  position, and everything else goes by itself.
- **Content rating:** no violence, no gambling, no ads. Users share their
  location with everyone (while sharing) and can post sightings, which are
  picked from lists, so there is no free text to moderate. The questionnaire's
  answers (October 2026): users interact, yes; user-generated content is the
  main content, yes (every bus on the map is a user's); nudity and graphic
  violence, no; can block, yes (an organizer's Stop keeps that phone off for 6
  hours, and Delete removes a sighting); **can report, yes**, since
  `sql/15-say-wrong.sql`: "Not a real bus?" in a bus's popup and "Wrong?" on
  each sighting, counted beside Stop and Delete on the admin page; chat
  moderation, no (there is no chat); limited to invited friends, no (anyone
  with the link sees the map); online content, yes (the app loads the live
  site). Reports are only useful if somebody reads them: an organizer has to
  look at the admin page, because Play expects reported content to be acted
  on.
- **Category:** Maps & Navigation.
- **Target audience:** 13 and over. Nothing here is made for children.
- **App access ("Sign in details"):** nothing about the app depends on where
  the reviewer is. Outside the route area a bus is kept for its own phone and
  shown to nobody else (`sql/14-off-route-private.sql`), so a reviewer anywhere
  can start a trip, see their bus and stop it, and can never put one on the
  riders' map. Play asks for sign-in details that work regardless of location
  because a geo-gate used to mean a locked part; the box around the route was
  one until that file. With open sharing on there is no key either, so the
  answer is "No, no part of the app is restricted". With it off, answer "Yes",
  leave the username blank, give the share key as the password, and say in the
  notes that Start asks for it and that outside Cavite the bus shows on the
  reviewer's phone only. Change the key and this answer goes stale.
- **Store listing:** the icon is `mobile/store/play-icon-512.png`, the
  app's own with FIBI on it (the website's, in `assets/icons/`, has none), and
  the feature graphic `mobile/store/feature-graphic.png`, both rendered by
  `tools/render-icons.sh` and uploaded by hand in Play Console. The launcher
  icon, the splash screen and the status bar's icon are in the app itself, so
  they change on phones only with a new bundle. Screenshots are best taken on
  a phone during a real trip. The description says, as every page does, that
  the app is not affiliated with or endorsed by any bus company.

**New personal accounts** (created after 13 November 2023) must run a closed
test with 12 testers opted in for 14 days in a row before production, and
the maintainer's account is one. The 14 days are not the whole test: Google
has refused production access to an app whose testers installed it and
rarely opened it, and whose feedback was not answered with updates. So the
testers should be people who ride this route and use the app on it, their
feedback should be written down, and a release or two should go up during
the test with notes saying what changed. Most changes here reach the app
through the live site with no release at all, which Google does not count,
so a release's notes name the web changes it brings to testers too. Internal
testing, open to every account, is how the first builds reach volunteers; it
does not count towards the 12.

**The website is the app.** Every merge to `main` reaches the app's users on
their next launch, with no review by Play. So these answers change in the same
commit as anything that changes what leaves a phone, as the privacy panel
does, and Play Console is updated when that commit ships.

**Testers sign themselves up** at `testers.html` on the site: they join the
Google Group `fibi-testers@googlegroups.com`, tap Become a tester on Play's
page for the app, and install. The group is the closed test's tester list
(the track's Testers tab, Google Groups), so nobody's email is collected and
nobody is added by hand. Set the group so anyone can join, only members see
its posts and only managers see who is in it. While the closed test runs,
`ANDROID_APP_URL` in `config.txt` is the page's full address, so the sharing
tab and the guide offer it; the riders' chat can link it too. When the app
goes public, put the Play listing there instead.

The app takes its location from Google Play services, so a phone without
them, like most Huawei phones launched since 2019, cannot run it from any
source.

## What has not been proven yet

This was built and its page-side switch tested without a phone. Before it
goes to volunteers, do one real trip and check:

1. Start sharing, lock the screen, and watch from a second phone that the bus
   keeps moving for the whole trip, well past the five-minute mark.
2. Switch to Messenger mid-trip and back.
3. Leave the bus still for 20 minutes with the screen off, and check the
   "Still on the bus?" notification arrives.
4. Tap Stop sharing and check the notification goes and the bus leaves the
   map.
5. Press back mid-trip, on an Android 11 or older phone if one is to hand:
   the app goes to the background and the bus keeps moving.
6. Swipe the app away mid-trip: sharing stops, as the notification says,
   and opening the app again asks "Still on the bus?".
7. Note the battery used over the whole trip. The GPS plugin asks for a fix
   every second, at full accuracy.
8. Save a backup from My tickets, and send a link to a bus: both open the
   phone's share sheet.

Some phone makers (Xiaomi, Oppo, Vivo, Huawei, common on this route) kill
foreground services more aggressively than stock Android. If a bus drops off
mid-trip on one of those, the fix is in the phone's battery settings, set
to "no restrictions" for this app, and is worth putting in the instructions
handed out with the APK.
