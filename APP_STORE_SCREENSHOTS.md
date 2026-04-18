# 🖼 App Store Screenshot Spec — Windy Word iOS

## Required Device Sizes

| Device | Resolution | Required By |
|--------|-----------|-------------|
| iPhone 15 Pro Max (6.7") | 1290 × 2796 px | **Required** for all locales |
| iPhone 15 Pro (6.1") | 1179 × 2556 px | Optional (auto-scaled from 6.7") |
| iPad Pro 12.9" (6th gen) | 2048 × 2732 px | Required if `supportsTablet: true` |

## Simulator Capture Commands

```bash
# iPhone 15 Pro Max
xcrun simctl boot "iPhone 15 Pro Max"
xcrun simctl io "iPhone 15 Pro Max" screenshot ~/Desktop/shot_1_record_idle.png

# iPad Pro 12.9"
xcrun simctl boot "iPad Pro (12.9-inch) (6th generation)"
xcrun simctl io "iPad Pro (12.9-inch) (6th generation)" screenshot ~/Desktop/ipad_shot_1.png
```

## Shot List

| # | Screen | State | Caption | Notes |
|---|--------|-------|---------|-------|
| 1 | Record | Idle, waveform flat | "Tap. Talk. Text." | Show full mic button + empty waveform |
| 2 | Record | Recording active | "Live Speech to Text" | Animated waveform green, timer visible |
| 3 | Translate | Conversation with 3 turns | "Real-Time Translation" | Show both speakers, confidence badges |
| 4 | Camera | Live OCR with bounding boxes | "Point. Scan. Translate." | Real text visible through viewfinder |
| 5 | History | Session list with favorites | "Every Word, Saved" | Show sort controls, quality badges |
| 6 | Subscription | Pro card highlighted | "Unlock the Full Power" | Show feature comparison collapsed |

## Design Guidelines

| Property | Value |
|----------|-------|
| Background | `#0f172a` (app theme) |
| Accent | `#a3e635` (lime green) |
| Device frame | iPhone 15 Pro Max, Space Black |
| Caption font | SF Pro Display Bold, white, 48pt |
| Subcaption | SF Pro Display Regular, `#94a3b8`, 24pt |
| Caption position | Bottom 15% of frame |

## Localization
- **v1.0**: English captions only
- **Future**: Spanish, French, German, Chinese
