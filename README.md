# 🌪️ Windy Word Mobile

> The world's most potent, simplified voice-to-text and speech translation app.
> (The repo directory is still named `windy-pro-mobile` for historical
> reasons; the shipped app and bundle — `ai.windyword.app` — are Windy Word.)

[![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20iOS-blue)](https://expo.dev)
[![SDK](https://img.shields.io/badge/Expo%20SDK-52-black)](https://docs.expo.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6)](https://www.typescriptlang.org)

---

## Features

| Feature | Description |
|---------|-------------|
| 🎤 **Voice Recording** | Press-and-hold mic with live waveform + haptic feedback |
| 🎥 **Video Recording** | Optional front/back camera + audio + transcript bundle |
| 🌍 **15-Language Translation** | Real-time speech-to-speech translation |
| 🗣️ **Conversation Mode** | Split-screen 2-person translation |
| 📷 **Camera OCR** | Point camera at text → instant translation |
| 🔊 **Text-to-Speech** | Hear translations in native accents |
| 📚 **History** | Search, favorites, sort, export (CSV/SRT) |
| 🧬 **Clone Data Dashboard** | Bundle viewer with training-ready badges, storage stats |
| 📶 **Wi-Fi Auto-Sync** | iCloud-style: queue on cellular, upload on Wi-Fi |
| 📱 **Phone-as-Camera** | Pair with desktop via 6-digit code, stream camera |
| ☁️ **Cloud Sync** | Chunked upload with resume, conflict detection |
| 🔔 **Push Notifications** | Translation complete, sync status, milestones |
| 🛡️ **Error Boundaries** | Every screen protected — never a white screen |
| 🎨 **Dark Mode** | Beautiful dark UI with Material Design 3 |

## Tech Stack

- **Framework:** React Native + Expo SDK 52
- **Navigation:** expo-router (file-based)
- **State:** Zustand with AsyncStorage persist
- **Storage:** expo-sqlite (local) + cloud API sync
- **Audio:** expo-av (capture) + expo-speech (TTS)
- **Camera:** expo-camera + Google Vision OCR
- **Build:** EAS Build (app-bundle + remote signing)
- **Target:** Android SDK 34+ / iOS 16+

## Project Structure

```
src/
├── app/                    # expo-router pages
│   ├── (tabs)/             # Tab screens (record, camera, history, clone-data, settings)
│   ├── translate/          # Full translate screen
│   ├── video/              # Video recording screen
│   ├── clone-data/         # Clone data dashboard
│   ├── camera-link/        # Phone-as-camera pairing
│   ├── onboarding/         # 3-screen swipeable onboarding
│   ├── legal/              # Privacy policy, terms
│   └── quick-translate.tsx # Deep link translate
├── components/             # Reusable components
│   └── SyncStatusBanner    # Wi-Fi sync progress + network indicator
├── services/               # Business logic services
│   ├── audio-capture.ts    # Microphone recording
│   ├── background-recording.ts # Silence detection, chunking, battery
│   ├── clone-bundle.ts     # Clone training bundle format + CRUD
│   ├── network-monitor.ts  # Offline detection
│   ├── ocr.ts              # Camera OCR
│   ├── sync-manager.ts     # Wi-Fi auto-sync (iCloud-style)
│   ├── speech-translation.ts # Speech-to-speech
│   ├── storage-local.ts    # SQLite storage
│   ├── storage-cloud.ts    # Cloud sync API
│   ├── video-capture.ts    # Camera video capture
│   └── translation.ts      # Text translation + TTS
├── stores/                 # Zustand stores
├── hooks/                  # Custom React hooks
├── theme/                  # Design tokens
└── types/                  # TypeScript types
```

## Setup

### Prerequisites
- Node.js 18+
- npm or yarn
- Expo CLI: `npm install -g eas-cli`
- Android Studio (for local builds)

### Install
```bash
git clone <repo-url>
cd windy-pro-mobile
npm install
```

### Environment Variables
Create a `.env` file (never committed):
```env
GOOGLE_VISION_API_KEY=your_google_vision_key
FCM_SERVER_KEY=your_fcm_server_key
```

For EAS builds, set secrets via:
```bash
eas secret:create --name GOOGLE_VISION_API_KEY --value "your_key"
eas secret:create --name FCM_SERVER_KEY --value "your_key"
```

### Run Development
```bash
npx expo start           # Start Metro bundler
npx expo start --android # Launch on Android device/emulator
npx expo start --ios     # Launch on iOS simulator
```

## Build Commands

### Development Build
```bash
eas build --platform android --profile development
```

### Preview APK (Internal Testing)
```bash
eas build --platform android --profile preview
```

### Production AAB (Play Store)
```bash
eas build --platform android --profile production
```

### Submit to Play Store
```bash
eas submit --platform android --profile production
```

## Deployment Guide

### Android (Google Play)
1. Log in: `eas login`
2. Build: `eas build --platform android --profile production`
3. Submit: `eas submit --platform android`
4. In Play Console: set up store listing, screenshots, and content rating
5. Host `assetlinks.json` at `https://windyword.ai/.well-known/assetlinks.json`
6. Release to internal → closed → open → production tracks

### iOS (App Store)
1. Build: `eas build --platform ios --profile production`
2. Submit: `eas submit --platform ios`
3. Configure in App Store Connect

## Testing

```bash
npx jest --passWithNoTests    # Run test suite
npx tsc --noEmit              # TypeScript check
npx expo-doctor               # Expo health check
```

## Telemetry (Windy Admin intel hooks)

Per `INTEL-CONTRACT-V2` (windy-admin repo), the app emits content-free
telemetry (sessions, dictation usage counts, errors/crash signatures,
paywall hits, update + onboarding funnel, marketing impressions) to
`admin.windyword.ai`, and fetches `/v1/client/config` for version policy
and messages. **Fully inert unless configured at build time:**

| Env var (EXPO_PUBLIC — inlined at bundle time) | Value |
|---|---|
| `EXPO_PUBLIC_WINDY_ADMIN_INGEST_URL` | `https://admin.windyword.ai` (non-secret, in `eas.json` production profile) |
| `EXPO_PUBLIC_WINDY_ADMIN_INGEST_TOKEN` | Mobile-only, low-trust, rotatable ingest token — **set as an EAS env var, never committed** |

No content, no PII, no free-text, no geo ever leaves the device. See
`CLAUDE.md` → "Windy Admin telemetry" and `src/services/intel.ts`.

## Deep Links

| Link | Action |
|------|--------|
| `windypro://translate?text=hello&to=es` | Quick translate |
| `windypro://session/SESSION_ID` | Open recording |
| `windypro://license?key=XXX` | Activate license |
| `windypro://clone` | Voice clone |
| `windypro://settings` | Settings |
| `https://windyword.ai/app/*` | HTTPS App Links |

## License

Proprietary — © 2026 Windy Pro. All rights reserved.
