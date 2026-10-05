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

## The two plugins

| Plugin | Why |
| --- | --- |
| `@capacitor-community/background-geolocation` | The foreground service that keeps GPS alive with the screen off. |
| `@capacitor/local-notifications` | Two jobs. It asks for Android 13's notification permission, without which the sharing notification is hidden. And it turns a trip question asked while the app is in the background (wrong direction, still on the bus, trip finished) into a notification, because the wrong-direction one takes the bus off the map until it is answered. |

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
changes, or on demand from the Actions tab, and attaches the APK to the run.

## Signing: do this once, before the first APK goes to anyone

Android only installs an update over an existing app when both are signed
with the same key. A debug build is signed with a throwaway key, so the next
build will not install over it. Make one key, keep it safe, and give it to
CI:

```
keytool -genkeypair -v -keystore bus-tracker.jks -alias bus \
        -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 bus-tracker.jks     # paste into the BUS_KEYSTORE_BASE64 secret
```

Then add `BUS_KEYSTORE_PASSWORD`, `BUS_KEY_ALIAS` (`bus` above) and
`BUS_KEY_PASSWORD` as repository secrets. With all four set, CI builds a
signed release instead of a debug APK, and the version code counts up with
each run. **Never commit the `.jks`.** Losing it means every sharer has to
uninstall and reinstall.

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

Some phone makers (Xiaomi, Oppo, Vivo, Huawei, common on this route) kill
foreground services more aggressively than stock Android. If a bus drops off
mid-trip on one of those, the fix is in the phone's battery settings, set
to "no restrictions" for this app, and is worth putting in the instructions
handed out with the APK.
