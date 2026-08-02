#!/bin/sh
# Renders the printable and postable versions of the two adoption pages.
#
#   sh tools/render-flyer.sh [output-directory]   (default: assets/flyer)
#
# flyer.html and for-operators.html are the sources. Everything this script
# writes is derived from them, so a change to a page is picked up by re-running
# it — nothing here is edited by hand.
#
# Headless Chromium is driven directly rather than through Playwright or any
# other wrapper, because there is deliberately no package.json in this
# repository (it would make Netlify run npm install and publish node_modules
# alongside the site). The browser is the only dependency, and CHROME below can
# be pointed at any Chromium or Chrome build.
#
# Outputs:
#   flyer-a4.pdf         the poster: one LANDSCAPE A4 sheet, three columns,
#                        for printing and putting up at terminals
#   flyer-chat.png       1080x3120, sized for a Messenger feed
#   for-operators.pdf    the briefing, for attaching to an email
#
# The PNGs capture the top of the flyer rather than the whole scroll, which is
# why the route name, the headline, the example screen and the link all sit in
# the first screenful of flyer.html. If that stops being true, these images
# quietly start cutting off the thing they exist to show.

set -eu

OUT="${1:-$(cd "$(dirname "$0")/.." && pwd)/assets/flyer}"
ROOT=$(cd "$(dirname "$0")/.." && pwd)

CHROME="${CHROME:-}"
if [ -z "$CHROME" ]; then
  for c in \
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
FLAGS="--headless --disable-gpu --no-sandbox --hide-scrollbars --force-color-profile=srgb"

echo "Chromium: $CHROME"

# --- The two PDFs. Page size and margins come from each page's @page rule. ---
# --no-pdf-header-footer suppresses Chromium's own URL and date furniture,
# which otherwise prints across the top of a poster.
for job in "flyer:flyer-a4" "for-operators:for-operators"; do
  src=${job%%:*}; dst=${job##*:}
  # shellcheck disable=SC2086
  "$CHROME" $FLAGS --no-pdf-header-footer \
    --print-to-pdf="$OUT/$dst.pdf" "file://$ROOT/$src.html" 2>/dev/null
  echo "  wrote $OUT/$dst.pdf"
done

# --- The image. Rendered at half the target size with a 2x device scale,
#     so text is laid out at phone widths and comes out at retina density. ---
# shellcheck disable=SC2086
"$CHROME" $FLAGS --force-device-scale-factor=2 --window-size=540,1560 \
  --screenshot="$OUT/flyer-chat.png" "file://$ROOT/flyer.html" 2>/dev/null
echo "  wrote $OUT/flyer-chat.png (1080x3120)"

echo "Done."
