# 🌪️ Windy Pro Mobile

> The world's most potent, simplified voice-to-text and speech translation app.

[![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20iOS-blue)](https://expo.dev)
[![SDK](https://img.shields.io/badge/Expo%20SDK-52-black)](https://docs.expo.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6)](https://www.typescriptlang.org)

---

## Features

| Feature | Description |
|---------|-------------|
| 🎤 **Voice Recording** | Press-and-hold mic with live waveform + haptic feedback |
| 🌍 **15-Language Translation** | Real-time speech-to-speech translation |
| 🗣️ **Conversation Mode** | Split-screen 2-person translation |
| 📷 **Camera OCR** | Point camera at text → instant translation |
| 🔊 **Text-to-Speech** | Hear translations in native accents |
| 📚 **History** | Search, favorites, sort, export (CSV/SRT) |
| ☁️ **Cloud Sync** | Sync across devices (Wi-Fi only option) |
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
│   ├── (tabs)/             # Tab screens (record, camera, history, settings)
│   ├── translate/          # Full translate screen
│   ├── onboarding/         # 3-screen swipeable onboarding
│   ├── legal/              # Privacy policy, terms
│   └── quick-translate.tsx # Deep link translate
├── components/             # Reusable components
├── services/               # Business logic services
│   ├── analytics.ts        # Local analytics tracking
│   ├── audio-capture.ts    # Microphone recording
│   ├── network-monitor.ts  # Offline detection
│   ├── ocr.ts              # Camera OCR
│   ├── rating-prompt.ts    # App rating (expo-store-review)
│   ├── speech-translation.ts # Speech-to-speech
│   ├── storage-local.ts    # SQLite storage
│   ├── storage-cloud.ts    # Cloud sync API
│   ├── sync-engine.ts      # Background sync
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
5. Host `assetlinks.json` at `https://windypro.thewindstorm.uk/.well-known/assetlinks.json`
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

## Deep Links

| Link | Action |
|------|--------|
| `windypro://translate?text=hello&to=es` | Quick translate |
| `windypro://session/SESSION_ID` | Open recording |
| `windypro://license?key=XXX` | Activate license |
| `windypro://clone` | Voice clone |
| `windypro://settings` | Settings |
| `https://windypro.thewindstorm.uk/app/*` | HTTPS App Links |

## License

Proprietary — © 2026 Windy Pro. All rights reserved.
