# 🧪 BETA_FEEDBACK_TRIAGE.md — QA Results

## ✅ iOS Simulator QA: 21 PASS | 0 FAIL | 10 SKIP

Tested on iPhone 15 Pro (iOS 17.2) with Expo SDK 52 dev build.

### Passed Tests
| Category | Items |
|----------|-------|
| App Launch | Opens without crash, splash screen renders |
| Record Tab | Tornado button, timer, Audio/Video/Text toggles, transcript area |
| Camera Tab | Camera access prompt, 10 language flags, Enable Camera CTA |
| History Tab | Storage indicator, search bar, sort filters, empty state |
| Clone Tab | Stats cards, filter pills, empty state |
| Settings Tab | License (Free), engine selector (Auto), cloud fallback, recording prefs |
| Stress: Force-quit/relaunch | Clean splash + app reload |
| Stress: Rapid tab switching | 5 tabs via deep links, no crashes |
| TypeScript | **0 errors** |
| Jest | **8/8 suites, 165/165 tests** |

### Skipped Tests (Simulator Limitations)
- Recording flow (no microphone in simulator)
- Transcription error handling (requires recording first)
- Rapid start/stop recording (no mic)
- Tab switch during recording (no mic)
- Onboarding flow (needs AsyncStorage.clear via interactive debugger)
- iOS Keyboard Extension (not reliable in sim)

## Bugs Fixed

| Bug | Fix | Commit |
|-----|-----|--------|
| `windy-tune.test.ts` — missing AsyncStorage/FileSystem mock | Added jest.mock entries | `c798bdf` |
| `_layout.tsx:156` — `validateLicense(key, 'device-todo')` extra arg | Removed `'device-todo'` | `0bb7816` |

## ⚠️ Known Non-Blocking Issues
- **RevenueCat SDK warning banner** — dev builds only, not configured with production API key
- **Expo Dev Menu overlay** — shows on every cold launch in dev build (normal behavior)

## 🔲 Items for Physical Device Testing
- Recording flow (tornado button → record → stop → transcript)
- Transcription error handling (server unreachable, 30s timeout)
- iOS Keyboard Extension (Settings → Keyboards → Add → Windy Pro)
- Onboarding 3-slide flow
- Copy/Share/Save actions on transcripts
