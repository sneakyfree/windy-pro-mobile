# Changelog — Windy Pro iOS

## [1.0.0-rc.1] — 2026-03-02

### 🎙 Core Features
- **Speech Translation**: Press-and-hold recording, animated waveform, haptic feedback, 5-language tier-1 support
- **Conversation Mode**: Alternating mic, dual transcript, pulse animation
- **Camera OCR**: Live scan with bounding boxes, freeze frame, auto-detect language, 5-language translate
- **Clone Recording**: 30s voice sample pipeline with upload progress and voice ID storage
- **Deep Links**: `windypro://translate?from=en&to=es&text=hello` quick-translate route

### 📦 History & Sync
- Backend sync with offline fallback via `NetworkMonitor`
- Favorites with optimistic updates
- Swipe-to-delete with PanResponder
- CSV export, storage usage indicator, sort/filter controls

### 💰 Monetization
- RevenueCat subscription integration (`react-native-purchases ^9.10.5`)
- 4-tier paywall: Free / Pro / Translate / Translate Pro
- Feature comparison table, restore purchases flow
- License service with key activation fallback

### ♿ Accessibility
- VoiceOver labels on all 7 screens (Record, Settings, Translate, Camera, History, Subscription, Tab Bar)
- `useReducedMotion` hook respects system preference
- `useAccessibility` hook for Dynamic Type + VoiceOver detection
- Chevrons hidden from screen readers

### 🏗 Build & Infrastructure
- CocoaPods toolchain resolved (Homebrew Ruby 4.0.1, 106 pods)
- iOS simulator build: 0 errors
- EAS production profile with auto-increment, remote credentials
- Deployment target: iOS 16.0
- Bundle ID: `uk.thewindstorm.windypro`

### 🔒 Privacy & Compliance
- 9 Info.plist privacy descriptions (Mic, Camera, Location, Photos ×2, Speech, FaceID, LocalNetwork, Tracking)
- `ITSAppUsesNonExemptEncryption: false`
- `UIBackgroundModes: ["audio", "fetch"]`
- Associated Domains: `applinks:` + `appclips:windypro.thewindstorm.uk`

### 🧪 Quality
- TypeScript strict: 0 errors
- Jest: 145/145 tests (6 suites)
- Comprehensive error handling with typed errors, timeout, retry
- Offline queue with network monitor
