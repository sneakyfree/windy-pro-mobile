#!/bin/bash
# Take screenshots of all 6 tabs + 2 extra screens for store submission.
# Prerequisites:
#   - iOS Simulator running: `npx expo run:ios`
#   - OR Android emulator running: `npx expo run:android`
#
# Usage:
#   ./scripts/take-screenshots.sh [ios|android]

set -euo pipefail

PLATFORM="${1:-ios}"
OUT_DIR="screenshots"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$OUT_DIR"

if [ "$PLATFORM" = "ios" ]; then
    DEVICE=$(xcrun simctl list devices booted -j | python3 -c "import json,sys; devs=json.load(sys.stdin)['devices']; print([d['udid'] for vs in devs.values() for d in vs if d['state']=='Booted'][0])" 2>/dev/null)
    if [ -z "$DEVICE" ]; then
        echo "Error: No booted iOS Simulator found. Run 'npx expo run:ios' first."
        exit 1
    fi
    echo "Using iOS Simulator: $DEVICE"

    take_screenshot() {
        local name="$1"
        xcrun simctl io "$DEVICE" screenshot "$OUT_DIR/${name}.png"
        echo "  Captured: $OUT_DIR/${name}.png"
    }
elif [ "$PLATFORM" = "android" ]; then
    if ! adb devices | grep -q "device$"; then
        echo "Error: No Android device/emulator found. Run 'npx expo run:android' first."
        exit 1
    fi

    take_screenshot() {
        local name="$1"
        adb shell screencap -p /sdcard/screenshot.png
        adb pull /sdcard/screenshot.png "$OUT_DIR/${name}.png" > /dev/null 2>&1
        adb shell rm /sdcard/screenshot.png
        echo "  Captured: $OUT_DIR/${name}.png"
    }
else
    echo "Usage: $0 [ios|android]"
    exit 1
fi

echo "Taking screenshots for $PLATFORM..."
echo ""
echo "Instructions:"
echo "  1. Navigate to the Record tab (home screen)"
echo "  2. Press Enter when ready"
read -r
take_screenshot "01_record_screen"

echo "  Navigate to the Camera tab, then press Enter"
read -r
take_screenshot "04_camera_ocr"

echo "  Navigate to the History tab, then press Enter"
read -r
take_screenshot "05_history_screen"

echo "  Navigate to the Clone tab, then press Enter"
read -r
take_screenshot "03_clone_data"

echo "  Navigate to the Chat tab, then press Enter"
read -r
take_screenshot "02_chat_screen"

echo "  Navigate to the Settings tab, then press Enter"
read -r
take_screenshot "06_settings_screen"

echo "  Open the Translate screen, then press Enter"
read -r
take_screenshot "02_translate_screen"

echo "  Open the Onboarding screen (or any marketing-worthy screen), then press Enter"
read -r
take_screenshot "07_onboarding"

echo ""
echo "Done! Screenshots saved to $OUT_DIR/"
ls -la "$OUT_DIR/"*.png 2>/dev/null
echo ""
echo "Next steps:"
echo "  - Review and crop if needed"
echo "  - Phone screenshots should be 1080x1920 or 1080x2400"
echo "  - Create feature_graphic.png (1024x500) separately"
