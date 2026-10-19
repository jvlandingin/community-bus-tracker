#!/bin/sh
# Renders the icons, the link-preview picture and Play's feature graphic.
#
#   sh tools/render-icons.sh [output-directory]   (default: where each belongs)
#
# tools/app-icons.html is the source; everything this writes is derived from
# it, so a change there is picked up by re-running this, never by editing a
# PNG. Like render-flyer.sh, it drives headless Chromium directly, because
# there is deliberately no package.json in this repository.
#
# The website's, into assets/icons:
#   icon-192.png, icon-512.png   the manifest's icons
#   icon-maskable-512.png        the same with room to be cropped to a circle
#   apple-touch-icon.png         180x180, for "Add to Home Screen" on iPhones
#   preview.png                  1200x630, the picture in a link preview;
#                                tools/write-preview-url.js points og:image at
#                                it with the site's full address at build time
#
# The Google Play listing's, into mobile/store:
#   play-icon-512.png            512x512, the listing's icon, with FIBI on it
#   feature-graphic.png          1024x500, Play's feature graphic
#
# And the Android app's, into mobile/android/app/src/main/res:
#   mipmap-*/ic_launcher_foreground.png  the adaptive icon's two layers,
#   mipmap-*/ic_launcher_background.png  108dp at each density
#   mipmap-*/ic_launcher.png, ic_launcher_round.png
#                                        Android 7's own icons, 48dp
#   drawable-xxxhdpi/splash_icon.png     the splash screen's, 288dp
# The adaptive icon's one-colour layer and the status bar's icon are
# vectors, drawn by tools/make-pictures.js.
#
# Given a directory, everything goes in it instead, the app's under res/.

set -eu

OUT="${1:-$(cd "$(dirname "$0")/.." && pwd)/assets/icons}"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
STORE="${1:-$ROOT/mobile/store}"
RES="${1:+$1/res}"
RES="${RES:-$ROOT/mobile/android/app/src/main/res}"

# chrome-headless-shell first. Full Chrome's headless mode (the only one it
# has since version 132) lays the page out in a viewport about 87px shorter
# than --window-size and still returns a picture the full size, so the bottom
# of every screenshot is either unpainted or the page background. On the
# flyer image that is a strip of plain paper colour across the foot, which
# is how it went unnoticed; on an icon it is a black band. The shell's
# viewport is the size it is given. The PDFs are unaffected either way.
CHROME="${CHROME:-}"
if [ -z "$CHROME" ]; then
  for c in \
    /opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell \
    "$(command -v chrome-headless-shell 2>/dev/null || true)" \
    /opt/pw-browsers/chromium-*/chrome-linux/chrome \
    "$(command -v chromium 2>/dev/null || true)" \
    "$(command -v chromium-browser 2>/dev/null || true)" \
    "$(command -v google-chrome 2>/dev/null || true)"
  do
    if [ -n "$c" ] && [ -x "$c" ]; then CHROME="$c"; break; fi
  done
fi
if [ -z "$CHROME" ] || [ ! -x "$CHROME" ]; then
  echo "No Chromium found. Set CHROME=/path/to/chrome and re-run." >&2
  exit 1
fi

mkdir -p "$OUT" "$STORE" "$RES"
# --allow-file-access-from-files lets app-icons.html load the site's own font
# files from ../assets/fonts; without it Chromium refuses a font from another
# file, and the picture comes out in a fallback face.
FLAGS="--headless --disable-gpu --no-sandbox --hide-scrollbars --force-color-profile=srgb --force-device-scale-factor=1 --allow-file-access-from-files"
echo "Chromium: $CHROME"

shot(){ # name width height fragment [directory] [clear]
  dir="${5:-$OUT}"
  # clear: a picture with transparency in it. Chromium paints white behind a
  # page with no background unless it is told to paint nothing.
  bg=""
  if [ "${6:-}" = clear ]; then bg="--default-background-color=00000000"; fi
  mkdir -p "$dir"
  # shellcheck disable=SC2086
  "$CHROME" $FLAGS $bg --window-size="$2,$3" --screenshot="$dir/$1" "file://$ROOT/tools/app-icons.html#$4" 2>/dev/null
  echo "  wrote $dir/$1 ($2x$3)"
}
shot icon-192.png 192 192 icon
shot icon-512.png 512 512 icon
shot icon-maskable-512.png 512 512 maskable
shot apple-touch-icon.png 180 180 icon
shot preview.png 1200 630 preview
shot play-icon-512.png 512 512 store "$STORE" clear
shot feature-graphic.png 1024 500 feature "$STORE"
# Android's densities, each with an adaptive layer's 108dp and Android 7's
# 48dp icon in pixels.
for d in "mdpi 108 48" "hdpi 162 72" "xhdpi 216 96" "xxhdpi 324 144" "xxxhdpi 432 192"; do
  # shellcheck disable=SC2086
  set -- $d
  shot ic_launcher_foreground.png "$2" "$2" fg "$RES/mipmap-$1" clear
  shot ic_launcher_background.png "$2" "$2" bg "$RES/mipmap-$1"
  shot ic_launcher.png "$3" "$3" legacy "$RES/mipmap-$1" clear
  shot ic_launcher_round.png "$3" "$3" round "$RES/mipmap-$1" clear
done
# The splash screen shows the foreground layer at 288dp, not a launcher's
# 108, so it has a picture of its own, at the largest density; Android
# scales it down for the rest.
shot splash_icon.png 1152 1152 fg "$RES/drawable-xxxhdpi" clear
echo "Done."
