#!/bin/sh
# Renders the home-screen icons and the link-preview picture.
#
#   sh tools/render-icons.sh [output-directory]   (default: assets/icons)
#
# tools/app-icons.html is the source; everything this writes is derived from
# it, so a change there is picked up by re-running this, never by editing a
# PNG. Like render-flyer.sh, it drives headless Chromium directly, because
# there is deliberately no package.json in this repository.
#
# Outputs:
#   icon-192.png, icon-512.png   the manifest's icons
#   icon-maskable-512.png        the same with room to be cropped to a circle
#   apple-touch-icon.png         180x180, for "Add to Home Screen" on iPhones
#   preview.png                  1200x630, the picture in a link preview;
#                                tools/write-preview-url.js points og:image at
#                                it with the site's full address at build time

set -eu

OUT="${1:-$(cd "$(dirname "$0")/.." && pwd)/assets/icons}"
ROOT=$(cd "$(dirname "$0")/.." && pwd)

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

mkdir -p "$OUT"
# --allow-file-access-from-files lets app-icons.html load the site's own font
# files from ../assets/fonts; without it Chromium refuses a font from another
# file, and the picture comes out in a fallback face.
FLAGS="--headless --disable-gpu --no-sandbox --hide-scrollbars --force-color-profile=srgb --force-device-scale-factor=1 --allow-file-access-from-files"
echo "Chromium: $CHROME"

shot(){ # name width height fragment
  # shellcheck disable=SC2086
  "$CHROME" $FLAGS --window-size="$2,$3" --screenshot="$OUT/$1" "file://$ROOT/tools/app-icons.html#$4" 2>/dev/null
  echo "  wrote $OUT/$1 ($2x$3)"
}
shot icon-192.png 192 192 icon
shot icon-512.png 512 512 icon
shot icon-maskable-512.png 512 512 maskable
shot apple-touch-icon.png 180 180 icon
shot preview.png 1200 630 preview
echo "Done."
