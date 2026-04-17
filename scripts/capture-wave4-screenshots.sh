#!/usr/bin/env bash
# capture-wave4-screenshots.sh
#
# Captures the four Wave-4 screenshots needed for App Store review.
# Grant runs this manually because screens 3 & 4 require a signed-in user
# (the device-code flow opens the system browser for credential entry and
# can't be fully scripted).
#
# Usage:
#   ./scripts/capture-wave4-screenshots.sh
#
# Prereqs:
#   - iPhone 15 Pro Max simulator booted (or any 6.7" — adjust DEVICE below)
#   - Dev build installed:    npx expo run:ios --device "iPhone 15 Pro Max"
#   - Metro bundler running:  npx expo start --ios
#
# Flow (assumes you already have an Eternitas test passport on the
# review account):
#   1. Script pauses before each capture. Navigate the app to the target
#      screen, then press ENTER to capture.
#   2. PNG lands in docs/screenshots/wave4/{slug}.png.

set -euo pipefail

DEVICE="${DEVICE:-iPhone 15 Pro Max}"
OUT_DIR="docs/screenshots/wave4"
mkdir -p "$OUT_DIR"

echo "Using simulator: $DEVICE"
echo "Output dir:      $OUT_DIR"
echo

BOOTED=$(xcrun simctl list devices booted | awk '/iPhone/ {print; exit}')
if [[ -z "$BOOTED" ]]; then
    echo "No booted iPhone simulator found. Boot one first:"
    echo "  xcrun simctl boot \"$DEVICE\" && open -a Simulator"
    exit 1
fi

capture() {
    local slug="$1"
    local instruction="$2"
    echo
    echo "→ Next: $instruction"
    read -r -p "  Press ENTER when the screen is ready... "
    xcrun simctl io booted screenshot "$OUT_DIR/${slug}.png"
    echo "  Saved $OUT_DIR/${slug}.png"
}

capture "01-login" \
    "Open Windy Word, tap Settings → Sign out if needed, navigate to /auth/login (one-button 'Sign in with Windy')."

capture "02-device-code" \
    "Tap 'Sign in with Windy'. Wait for the user_code to appear (ABCD-EFGH style) with the Approve button. Do NOT tap Approve yet."

echo
echo "  → Now tap 'Approve on windyword.ai →'. Safari opens."
echo "  → Sign in on the web form as the review account, then approve."
echo "  → Return to the app (it should auto-resume)."
read -r -p "  Press ENTER once you're back in the app and signed in... "

capture "03-mail-inbox" \
    "Tap the Mail tab. Wait for the inbox list to populate (at least 3 messages recommended — send test mail if empty)."

capture "04-settings-trust" \
    "Tap Settings tab → Features → 🪪 Trust & Clearance. Wait for the passport card + band pill + clearance badge + 'What this unlocks' list."

echo
echo "All four screenshots captured:"
ls -la "$OUT_DIR"/*.png
