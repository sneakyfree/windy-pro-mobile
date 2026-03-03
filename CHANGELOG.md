# Changelog

All notable changes to Windy Pro Mobile are documented here.

## [1.0.0] — 2026-03-02

### 🚀 Initial Release — Android Launch

#### Phase 1: Foundation & Build Config
- Configured EAS build with `expo-build-properties` (compileSdk 35, targetSdk 34, Kotlin 1.9.24)
- Set up EAS production profile with app-bundle, remote signing, internal track
- Synced `versionCode` across `app.json` and `build.gradle`
- Added EAS Secrets for Google Vision API and FCM server keys

#### Phase 2: Release Hardening
- Added comprehensive ProGuard/R8 rules (Hermes, OkHttp, Expo modules, React Native core)
- Implemented recording cleanup on translate screen unmount (prevents memory leaks)
- Added explicit Stack.Screen for OCR modal with slide-from-bottom animation
- Added audio mode reset and callback cleanup in speech translation cancellation
- Removed duplicate network monitor start calls
- Added network-aware error handling to OCR screen

#### Phase 3: Polish & User Experience
- Rewrote onboarding as swipeable FlatList with animated dot indicators
- Created `ScreenErrorBoundary` component — wraps all 6 screens
- Created `AnalyticsService` for tracking screen views, translations, language pairs
- Created `RatingPromptService` using `expo-store-review` (triggers after 5th translation)
- Integrated analytics and rating prompt into translate screen
- Commented out ~40 `console.log` calls across all production files
- Fixed `translation.ts` broken `onDone` callback

#### Phase 4: Android Launch Prep
- Added HTTPS App Links with `autoVerify` to AndroidManifest
- Bumped `versionCode` to 4 for release
- Verified all deep link routes (translate, quick-translate, clone, session, license, settings)

#### Phase 5: Final QA & Submission
- Created Play Store listing (title, descriptions, metadata)
- Security audit: no hardcoded API keys or secrets in source
- Permissions audit: verified all permissions are necessary
- Created comprehensive README with setup and deployment guide
- Git cleanup: verified `.gitignore` covers all build artifacts

### Features
- 🎤 Press-and-hold voice recording with live waveform visualization
- 🌍 15-language speech translation (Tier 1 languages)
- 🗣️ Split-screen conversation mode (2-person real-time translation)
- 📷 Camera OCR text extraction and translation
- 🔊 Text-to-speech playback with voice selection
- 📚 Recording history with search, favorites, sort, and language filter
- ☁️ Cloud sync with Wi-Fi-only and plugged-in-only options
- 💾 CSV and SRT export
- 🌐 Deep link support (`windypro://` scheme + HTTPS App Links)
- 🔔 Push notifications with deep link routing
- ⚙️ Comprehensive settings (language, voice, quality, theme, cache, about)
- 🛡️ Error boundaries on all screens
- 📊 Local analytics tracking
- ⭐ App rating prompt after 5th translation
- 🎨 Dark mode with Material Design 3 styling
- ♿ Full accessibility support (VoiceOver, Dynamic Type)
- 🔒 ProGuard/R8 hardened for release builds

### Technical Stack
- React Native + Expo SDK 52
- expo-router (file-based navigation)
- Zustand (state management with persist)
- expo-av, expo-camera, expo-speech, expo-haptics
- expo-notifications, expo-store-review
- Custom services: audio capture, speech translation, OCR, sync engine
- SQLite local storage with cloud sync
