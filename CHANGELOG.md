# Changelog

All notable changes to Windy Pro Mobile are documented here.

## [2.0.0] — 2026-03-02

### 🧬 v2.0 — Video Recording, Clone Training & Wi-Fi Auto-Sync

#### Video Recording & Clone Training
- Added optional front/back camera video recording alongside audio
- Created `CloneBundleService` — standardized bundle format (audio + video + transcript)
- Created Clone Data Dashboard tab (🧬 Clone) with stats, filters, training-ready badges
- Added `BackgroundRecordingService` — silence detection, 5-min chunking, battery monitoring
- Bundle format: `{ audio, video, transcript, sync_status, clone_training_ready }`

#### Wi-Fi Auto-Sync (iCloud-style)
- Created `SyncManager` — persistent upload queue with priority (transcript → audio → video)
- Network-aware: videos wait for Wi-Fi, small files (<5MB) upload on cellular
- Chunked upload (2MB) with resume from last successful chunk
- Smart batching: combines small files into single request
- Conflict detection: checks cloud by bundle_id before upload
- Background sync: `expo-background-fetch` (every 15 min on Wi-Fi)
- Cellular notification: "X recordings ready — connect to Wi-Fi"
- Settings: Auto-Sync (ON), Sync on Cellular (OFF)

#### Phone-as-Camera
- New screen: pair with desktop via 6-digit code (WebSocket signaling)
- Front/back camera switch from either end
- Keep-awake while linked (`expo-keep-awake`)
- Optional audio streaming toggle

#### Integration
- Wired SyncManager into record screen: auto-queues bundle + sync after every recording
- Enhanced `SyncStatusBanner` with progress bar, network indicator, pending count
- Added Cloud Sync section to Settings: toggles, Sync Now, Clear Synced Data
- Added Clone Data tab to main tab navigator
- SyncManager test suite (9 tests: settings, queue, priority, duplicates, cleanup)

#### Packages Added
- `@react-native-community/netinfo` (Wi-Fi vs cellular detection)
- `expo-keep-awake` (screen on during camera link)
- `expo-image-picker`, `expo-media-library` (photo features)

#### Validation
- TypeScript: 0 errors
- Tests: 166+ passing (8 suites)
- Version bump: 1.0.0 → 2.0.0 (versionCode 4 → 5)

---

## [1.0.0-rc.2] — 2026-03-02

### 🍎 iOS Release Candidate 2 — Stability & Hardening

#### Reliability
- Wrapped all 12+ screens in `ScreenErrorBoundary` (defense-in-depth crash protection)
- Added `AppState` backgrounding handler on Record screen — auto-stops & saves on suspend
- Converted 39 `feedbackService` calls to fire-and-forget with `.catch()` (prevents unhandled rejections)
- Fixed 3 cloud-sync test failures (mock field alignment: `isOnline`, `transcript`, `syncedAt`)

#### Infrastructure
- Created `BETA_FEEDBACK_TRIAGE.md` for structured feedback ingestion
- Created `scripts/triage-feedback.ts` CLI for auto-tagging, deduplication, severity classification
- Created `SHIP_DECISION.md` batch protocol (P0 → P1 → P2)

#### Cloud Sync
- Implemented `CloudSyncService` with offline queue, exponential backoff retry, conflict resolution
- Added `SyncStatusBanner` component on home screen
- Full integration test suite (157 tests, all passing)

#### Validation
- TypeScript: 0 errors
- Tests: 157/157 passing
- All lint-clean (IDE `--jsx` warnings are Expo false positives)

---

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
