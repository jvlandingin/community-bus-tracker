#!/bin/sh
# Renders the showcase video: about 42 seconds, vertical (1080x1920), of the
# real tracker on a phone with made-up buses, with the interface's sounds.
#
#   CARTO_API_KEY=... sh tools/render-video.sh [output-directory] [options]
#
# Default output directory: video-out/ (ignored by git). It gets
#   bus-tracker.mp4         the video, H.264 and AAC, for Facebook, TikTok, Reels
#   bus-tracker-ui-sounds.wav  its sounds alone, to mix under music
#   bus-tracker-cover.jpg   a still from it, for a post's thumbnail
#   .tiles/                 the map tiles, kept so a re-render asks CARTO
#                           for nothing; delete it to fetch them again
#
# Options, after the directory: --from S --to S renders only that part
# (the phones still run from the start, so they are in the right state);
# --no-key renders without the map key, watermarked, for a quick look;
# --motion renders the animated cut instead (tools/video/motion.js): drawn
# scenes and kinetic type and no screens, about 42 seconds, as
# bus-tracker-motion.mp4. It draws no map, so it needs no key.
#
# It ends on two QR codes, as the poster does: the tracker, and the Android
# app at ANDROID_APP_URL in config.txt, so a change there needs a render.
#
# Like render-flyer.sh this is run by hand, never at deploy, and nothing it
# writes is committed. The video is the real index.html, so after a change
# to the tracker the video is out of date until this is run again:
# tools/video/film.js is the story, and says which screens it taps.
#
# Needs a Chromium (as render-flyer.sh finds one), ffmpeg, Node, and
# Playwright. There is deliberately no package.json in this repository (see
# CLAUDE.md), so Playwright is used from a global install, or installed
# beside the repository without saving it, as CI does with jsdom:
#   npm install --no-save playwright-core@1.56
#
# The map needs CARTO_API_KEY, the same key the Netlify build writes into
# config.txt: without one every tile is stamped "API KEY REQUIRED". The key
# is put into the copy of config.txt the render serves itself, and never
# written to disk.

set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="video-out"
case "${1:-}" in -*|"") ;; *) OUT="$1"; shift ;; esac
case "$OUT" in /*) ;; *) OUT="$ROOT/$OUT" ;; esac

# chrome-headless-shell first, for the reason render-flyer.sh gives: full
# Chrome's headless mode lays a page out shorter than its window.
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
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is needed to make the video. Install it and re-run." >&2
  exit 1
fi

# Playwright from beside the repository, or from the global modules.
NODE_PATH="$ROOT/node_modules${NODE_PATH:+:$NODE_PATH}"
if command -v npm >/dev/null 2>&1; then NODE_PATH="$NODE_PATH:$(npm root -g 2>/dev/null || true)"; fi
export NODE_PATH CHROME

echo "Chromium: $CHROME"
echo "Output:   $OUT"
exec node "$ROOT/tools/video/render.js" --out "$OUT" "$@"
