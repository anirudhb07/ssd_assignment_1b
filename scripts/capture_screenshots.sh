#!/usr/bin/env bash
# Captures every screen at laptop (1280x800) and phone (390x844) resolutions
# using headless Chromium.
set -euo pipefail

BASE_URL="${1:-http://localhost:5173}"
OUTPUT_DIR="docs/design/screenshots"

mkdir -p "${OUTPUT_DIR}"

CHROMIUM_BIN=$(which chromium || which google-chrome || which chromium-browser)

echo "==> Using browser: ${CHROMIUM_BIN}"
echo "==> Capturing screenshots from ${BASE_URL} into ${OUTPUT_DIR}/..."

PAGES=(
  "home:/"
  "browse:/browse"
  "checkout:/checkout"
  "wallet:/wallet"
  "analytics:/analytics"
  "map:/map"
  "reviews:/reviews"
)

for entry in "${PAGES[@]}"; do
  name="${entry%%:*}"
  path="${entry#*:}"

  url="${BASE_URL}${path}"

  echo "--> Capturing ${name} (${url})"

  # Laptop: 1280x800
  "${CHROMIUM_BIN}" \
    --headless \
    --no-sandbox \
    --disable-gpu \
    --virtual-time-budget=3000 \
    --window-size=1280,800 \
    --screenshot="${OUTPUT_DIR}/${name}_laptop.png" \
    "${url}" >/dev/null 2>&1

  # Phone: 390x844
  "${CHROMIUM_BIN}" \
    --headless \
    --no-sandbox \
    --disable-gpu \
    --virtual-time-budget=3000 \
    --window-size=390,844 \
    --screenshot="${OUTPUT_DIR}/${name}_phone.png" \
    "${url}" >/dev/null 2>&1
done

echo "==> All screenshots captured successfully in ${OUTPUT_DIR}/"
ls -lh "${OUTPUT_DIR}"
