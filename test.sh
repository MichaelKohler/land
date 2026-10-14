#!/usr/bin/env bash
# Renders the island in a few fixed scenes with a headless Chrome and reports any errors on the page.
#
#   ./test.sh                  the usual scenes
#   ./test.sh winter-morning   just the named ones
#   OUT=shots ./test.sh        keep the screenshots there (default: a new temp folder)
#   CHROME=/path/to/chrome ./test.sh
#
# Uses reduced motion, and software WebGL on Linux, so there each scene takes a few minutes on a slow machine.
# Exits 1 if any scene had errors or did not finish. Runs on macOS's bash 3.2 as well as on Linux.
set -u
cd "$(dirname "$0")" || exit 1 # the site root, where index.html is

ALL="summer-day winter-morning autumn-rain christmas-night house sunset afterglow moon live"

scene() {
  case "$1" in
    summer-day) echo "time=13&season=summer" ;;
    winter-morning) echo "time=9&season=winter" ;;
    autumn-rain) echo "time=11.2&season=autumn" ;;
    christmas-night) echo "time=22.5&season=winter&christmas" ;;
    house) echo "time=15&season=summer#alice" ;;
    sunset) echo "time=17.67&season=autumn" ;;
    afterglow) echo "time=18.42&season=autumn" ;;
    moon) echo "time=22&season=autumn&moon=0.3" ;;
    live) echo "from=test" ;;
    *) return 1 ;;
  esac
}
if [ $# -gt 0 ]; then names=("$@"); else names=(summer-day winter-morning autumn-rain christmas-night house live); fi

if [ -z "${CHROME:-}" ]; then
  for c in ~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell \
    ~/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell; do
    [ -x "$c" ] && CHROME=$c # the last one found wins: Playwright's newest
  done
fi

CHROME=${CHROME:-$(command -v chromium || command -v chromium-browser || command -v google-chrome)}
[ -x "$CHROME" ] || { echo "No headless Chrome found; set CHROME=/path/to/chrome" >&2; exit 1; }

LIMIT=$(command -v timeout || command -v gtimeout || true)
limited() { if [ -n "$LIMIT" ]; then "$LIMIT" 900 "$@"; else "$@"; fi; }

# WebGL: on Linux (the Pi) drawn in software, as there is no GPU for headless Chrome to use; on macOS on the Mac's own
# GPU, which takes seconds a scene where drawing in software would take many minutes
case "$(uname -s)" in
  Darwin) GL="--use-angle=metal" ;;
  *) GL="--disable-gpu" ;;
esac

OUT=${OUT:-$(mktemp -d -t island-shots.XXXX)}
mkdir -p "$OUT"
PORT=$((20000 + RANDOM % 20000))
PAGE="_test-$$.html"

python3 - "$PAGE" <<'PY'
import sys
s = open("index.html").read()
s = s.replace('<script type="importmap">', '''<script>window.__errs = []; addEventListener("error", (e) => __errs.push(e.message)); addEventListener("unhandledrejection", (e) => __errs.push(String(e.reason)));</script>
    <script type="importmap">''', 1)
# the loading veil goes at once rather than fading, so the screenshot never catches it half gone
s = s.replace("</head>", "<style>.veil { transition: none !important; }</style>\n  </head>", 1)
s = s.replace("</body>", '''<script type="module">setTimeout(() => console.log("ISLAND-TEST " + (__errs.length ? "errors: " + __errs.join(" | ") : "ok") + (document.documentElement.dataset.weather === "berlin" ? " (real weather)" : "")), 3000);</script>
  </body>''', 1)
open(sys.argv[1], "w").write(s)
PY

python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
disown # no "Terminated" notice when it is stopped at the end
trap 'kill $SERVER 2>/dev/null; rm -f "$PAGE"' EXIT
sleep 1

failed=0
for name in "${names[@]}"; do
  q=$(scene "$name") || { echo "unknown scene: $name (known: $ALL)" >&2; failed=1; continue; }
  printf '%-16s ' "$name"
  log=$(limited "$CHROME" --headless --no-sandbox $GL --hide-scrollbars --force-prefers-reduced-motion \
    --window-size=900,560 --virtual-time-budget=6000 --enable-logging=stderr --v=0 \
    --screenshot="$OUT/$name.png" "http://127.0.0.1:$PORT/$PAGE?$q" 2>&1)
  result=$(grep -o 'ISLAND-TEST [^"]*' <<<"$log" | head -1)
  [ -s "$OUT/$name.png" ] || result="ISLAND-TEST no screenshot (timed out?)"

  case "$result" in
    "ISLAND-TEST ok"*) echo "${result#ISLAND-TEST }" ;;
    "") echo "no result (timed out or crashed)"; failed=1 ;;
    *) echo "${result#ISLAND-TEST }"; failed=1 ;;
  esac
done

echo "screenshots: $OUT"

exit $failed
