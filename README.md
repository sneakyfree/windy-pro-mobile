# Windy Pro Mobile

Cross-platform mobile app for **Windy Pro** — real-time AI translation for iOS and Android.

Built with **React Native** + **Expo**.

## Features (Planned)
- Real-time speech-to-speech translation
- Text translation with history
- Camera/OCR translation (signs, menus, documents)
- Offline language packs
- Stripe subscription (Pro $49, Translate $79/$7.99mo, Translate Pro $149)
- Cloud sync via Windy Pro Storage API

## Tech Stack
- **Framework:** React Native (Expo managed workflow)
- **Language:** TypeScript
- **State:** Zustand
- **Navigation:** React Navigation
- **Audio:** expo-av / expo-speech
- **Payments:** react-native-purchases (RevenueCat) or Stripe React Native SDK
- **Backend:** Shared with Windy Pro Desktop (storage API, Stripe webhooks)

## Getting Started

```bash
# Install dependencies
npm install

# Start Expo dev server
npx expo start

# Run on iOS simulator
npx expo run:ios

# Run on Android emulator
npx expo run:android
```

## Project Structure
```
src/
├── app/                 # Expo Router screens
│   ├── (tabs)/          # Tab navigation
│   │   ├── translate.tsx    # Main translation screen
│   │   ├── history.tsx      # Translation history
│   │   ├── settings.tsx     # Settings & account
│   │   └── _layout.tsx      # Tab layout
│   ├── onboarding/      # First-run setup
│   ├── auth/            # Login/signup
│   └── _layout.tsx      # Root layout
├── components/          # Reusable UI components
├── services/            # API clients, translation engine
├── stores/              # Zustand state stores
├── hooks/               # Custom React hooks
├── utils/               # Helpers, constants
├── i18n/                # Localization strings
└── assets/              # Images, fonts, sounds
```

## Related
- [Windy Pro Desktop](https://github.com/sneakyfree/windy-pro) — Electron app for Linux/Windows/macOS
- [Windy Pro Website](https://windypro.thewindstorm.uk)

## License
Proprietary — © 2026 The Windstorm
