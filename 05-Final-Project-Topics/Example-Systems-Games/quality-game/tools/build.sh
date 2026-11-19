#!/bin/bash
# Build the two classroom zips from the same source.
#   quality-game-midterm.zip : level 1 and 2 only (final CR block removed)
#   quality-game-final.zip   : levels plus CR-01
# Each zip holds only index.html, style.css, game.js (no audio or other files).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=dist
rm -rf "$OUT"
mkdir -p "$OUT/midterm" "$OUT/final"

cp index.html style.css game.js "$OUT/final/"

cp index.html style.css "$OUT/midterm/"
awk '/@@FINAL_BEGIN/{skip=1; next} /@@FINAL_END/{skip=0; next} !skip' game.js \
  | sed "s/^const EDITION = 'final';.*$/const EDITION = 'midterm';/" > "$OUT/midterm/game.js"

# Midterm build must not contain final-stage content.
if grep -n -E "CR-0|CR_SCENARIOS|期末" "$OUT/midterm/game.js" "$OUT/midterm/index.html"; then
  echo "ERROR: midterm build still contains final-stage content" >&2
  exit 1
fi
grep -q "const EDITION = 'midterm';" "$OUT/midterm/game.js"

(cd "$OUT/midterm" && zip -q -X ../quality-game-midterm.zip index.html style.css game.js)
(cd "$OUT/final" && zip -q -X ../quality-game-final.zip index.html style.css game.js)

# Each zip must hold exactly the three web files.
for z in "$OUT/quality-game-midterm.zip" "$OUT/quality-game-final.zip"; do
  list=$(unzip -Z1 "$z" | sort | tr '\n' ' ')
  if [ "$list" != "game.js index.html style.css " ]; then
    echo "ERROR: $z holds: $list" >&2
    exit 1
  fi
done
echo "built: $OUT/quality-game-midterm.zip $OUT/quality-game-final.zip"
