# Production Blockers — Must Fix Before App Store Submission

## 1. RevenueCat API Keys
- **File:** `app.json` lines 114-115
- **Current:** `"PRODUCTION_KEY_REQUIRED_CONTACT_GRANT"` (both iOS and Android)
- **Need:** Real RevenueCat API keys (`appl_xxxxx` for iOS, `goog_xxxxx` for Android)
- **Action:** Create RevenueCat account → add iOS/Android app → copy API keys → replace in app.json
- **Graceful fallback:** `subscription.ts` now skips initialization when placeholder keys detected. Users see "purchases unavailable" instead of crash.
- **Impact without fix:** Users cannot purchase Pro/Translate/Translate Pro tiers

## 2. FCM Configuration (Remote Push Notifications)
- **Missing:** `google-services.json` (Android) and `GoogleService-Info.plist` (iOS)
- **Action:** Create Firebase project → enable Cloud Messaging → download config files → add to project root
- **Also needed:** Set `FCM_SERVER_KEY` in EAS secrets (`eas.json` production env)
- **Graceful fallback:** `push-notifications.ts` already handles missing FCM gracefully — `initialize()` returns null, no crash. Local notifications still work.
- **Impact without fix:** Remote push notifications won't work. Local notifications (translation complete, reminders) still function.

## 3. QR Code Pairing (v1.1 Roadmap)
- **Status:** Zero implementation — no library, no screen, no pairing protocol
- **Can ship without it:** Device pairing via QR is not critical for v1.0
- **Action for v1.1:** Install `expo-barcode-scanner`, create pairing screen, implement 6-digit code exchange
- **Impact:** Users cannot pair phone-as-camera to desktop app. Core recording/transcription/translation unaffected.

## Pre-Launch Checklist

- [ ] Replace RevenueCat placeholder keys with production keys
- [ ] Add `google-services.json` to project root (Android)
- [ ] Add `GoogleService-Info.plist` to `ios/` directory (iOS)
- [ ] Set `FCM_SERVER_KEY` in EAS production secrets
- [ ] Run `npx eas build --profile production` for both platforms
- [ ] Submit to App Store Connect and Google Play Console
- [ ] Verify test purchases work in sandbox environment
- [ ] Verify push notifications arrive on physical device
