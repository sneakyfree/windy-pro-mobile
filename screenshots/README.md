# Play Store Screenshot Specifications

Place screenshots in this directory with the following dimensions:

## Phone Screenshots (Required — minimum 2, maximum 8)
- **Dimensions:** 1080 × 1920 px (or 1080 × 2400 for taller devices)
- **Format:** PNG or JPEG, max 8 MB each

Suggested screenshots:
1. `01_record_screen.png` — Main recording screen with waveform
2. `02_translate_screen.png` — Translation result with language flags
3. `03_conversation_mode.png` — Split-screen conversation mode
4. `04_camera_ocr.png` — Camera OCR translating text
5. `05_history_screen.png` — Recording history with search
6. `06_settings_screen.png` — Settings showing key features
7. `07_onboarding.png` — Welcome onboarding screen
8. `08_quick_translate.png` — Deep link quick translate

## 7-inch Tablet Screenshots (Optional)
- **Dimensions:** 1200 × 1920 px

## 10-inch Tablet Screenshots (Optional)
- **Dimensions:** 1600 × 2560 px

## Feature Graphic (Required)
- **Dimensions:** 1024 × 500 px
- **Filename:** `feature_graphic.png`

## Icon (Required — already in src/assets/)
- **Dimensions:** 512 × 512 px (32-bit PNG, no alpha)

## Notes
- Screenshots must show the app in use (not marketing material)
- No device frames unless added manually
- All text must be readable
- Generate screenshots using `npx expo run:android` on a device/emulator
