# Deployment Checklist — Windy Word Mobile

**Last Updated:** 2026-04-17

> **See also `docs/eas-submission-checklist.md`** — the step-by-step EAS
> submission playbook that complements this secrets/credentials inventory.

This document lists every secret, credential, and configuration required to ship Windy Word Mobile to production. For each item: what it is, where to get it, where to put it, and what breaks without it.

---

## 1. RevenueCat API Keys

**What:** API keys for the RevenueCat in-app purchase SDK (iOS + Android).

**Where to get:**
1. Create a RevenueCat account at https://app.revenuecat.com
2. Create a project "Windy Word"
3. Configure iOS App Store Connect and Google Play Store credentials
4. Copy the API keys from Project Settings > API Keys

**Where to put:** `app.json` lines 114-115 in the `extra` block:
```json
{
  "extra": {
    "revenueCatIosKey": "appl_XXXXXXXXXXXXXXXX",
    "revenueCatAndroidKey": "goog_XXXXXXXXXXXXXXXX"
  }
}
```

For EAS builds, set via `eas.json` environment variables:
```json
{
  "production": {
    "env": {
      "REVENUECAT_IOS_KEY": "appl_...",
      "REVENUECAT_ANDROID_KEY": "goog_..."
    }
  }
}
```

**What breaks without it:** In-app purchases are completely disabled. Users see "purchases unavailable" but the app functions otherwise. `subscription.ts` skips initialization when placeholder keys are detected.

---

## 2. Google Cloud Vision API Key

**What:** API key for Google Cloud Vision OCR (camera text recognition).

**Where to get:**
1. Go to https://console.cloud.google.com
2. Create or select a project
3. Enable the "Cloud Vision API"
4. Create an API key under Credentials
5. Restrict the key to Cloud Vision API only

**Where to put:** `app.json` line 116 in the `extra` block:
```json
{
  "extra": {
    "googleVisionApiKey": "AIzaSy..."
  }
}
```

**What breaks without it:** Camera OCR translation fails with a clear error message. The rest of the app (voice transcription, manual translation) works normally. `ocr.ts` degrades gracefully.

---

## 3. Firebase Cloud Messaging (FCM) Config Files

**What:** Platform-specific config files for push notifications via Firebase.

**Where to get:**
1. Go to https://console.firebase.google.com
2. Create a project "Windy Word"
3. Add an Android app (package: `ai.windyword.app`)
4. Add an iOS app (bundle ID: `ai.windyword.app`)
5. Download the config files

**Where to put:**
- **Android:** `google-services.json` in project root (or `android/app/`)
- **iOS:** `GoogleService-Info.plist` in `ios/` directory

**What breaks without it:** Remote push notifications don't work. Local notifications (recording complete, sync reminders) still work. `push-notifications.ts` returns null token and logs a warning.

---

## 4. EXPO_TOKEN (CI/CD)

**What:** Expo access token for automated EAS builds in GitHub Actions.

**Where to get:**
1. Go to https://expo.dev/accounts/[your-account]/settings/access-tokens
2. Create a "Robot" token with build permissions
3. Name it "GitHub Actions CI"

**Where to put:** GitHub repo Settings > Secrets and Variables > Actions:
- Secret name: `EXPO_TOKEN`
- Value: the token from step 2

**What breaks without it:** The `build-native` CI job fails. Tests and web builds still work. Development/manual EAS builds from your machine still work.

---

## 5. APP_SECRET_PEPPER (DRM)

**What:** Secret pepper used in model encryption key derivation (AES-256-GCM for offline translation pairs).

**Where to get:** Generate a random 32+ character string:
```bash
openssl rand -base64 32
```

**Where to put:** `app.json` in the `extra` block:
```json
{
  "extra": {
    "modelSecretPepper": "your-random-secret-here"
  }
}
```

For EAS builds:
```json
{
  "production": {
    "env": {
      "MODEL_SECRET_PEPPER": "your-random-secret-here"
    }
  }
}
```

**What breaks without it:** Falls back to the bundled default pepper (`windy-model-v1-L6-protection`). This is functional but less secure — the default is visible in the source code. For production, always set a custom pepper.

---

## 6. API Base URLs

**What:** All backend service endpoints. Currently hardcoded to AWS-hosted services.

**Current configuration** (`src/config/api.ts`):
| Service | URL | Purpose |
|---------|-----|---------|
| API_BASE_URL | `https://windypro.thewindstorm.uk` | Account server (identity hub, all v1 APIs) |
| CHAT_HOMESERVER | `https://chat.windychat.ai` | Matrix homeserver (Synapse) |
| WINDY_MAIL_URL | `https://mail.windymail.ai` | Webmail interface |
| WHISPER_MODEL_CDN | HuggingFace default | Whisper GGML model downloads |
| GOOGLE_VISION_API | `https://vision.googleapis.com/...` | Google Cloud Vision |

**What to verify before launch:**
- All URLs resolve and return expected responses
- SSL certificates are valid and not expiring soon
- CORS headers allow the mobile app's requests
- Rate limits are configured appropriately

**What breaks without it:** The app cannot authenticate, sync, translate, or communicate. All network features fail. Local-only features (on-device transcription, recording) still work.

---

## 7. Whisper Model CDN (Optional Override)

**What:** CDN URL for downloading whisper.cpp GGML model files for on-device transcription.

**Where to put (optional):** `app.json` in the `extra` block:
```json
{
  "extra": {
    "whisperModelCdn": "https://your-cdn.example.com/models"
  }
}
```

**What breaks without it:** Falls back to HuggingFace CDN (`huggingface.co/ggerganov/whisper.cpp/resolve/main`). This is the standard public source and works fine. Only override if you're hosting models on your own CDN for faster/more reliable downloads.

---

## 8. App Store / Play Store Credentials

**What:** Signing keys and store accounts for publishing.

### iOS (App Store Connect)
- Apple Developer Program membership ($99/year)
- App Store Connect app entry created
- Distribution certificate + provisioning profile
- EAS will handle signing if configured in `eas.json`

### Android (Google Play Console)
- Google Play Developer account ($25 one-time)
- App entry created in Play Console
- Upload signing key (or use Play App Signing)
- `android/app/build.gradle` already has release signing config

**Where to put:** EAS handles most signing automatically. For manual builds:
- iOS: Xcode > Signing & Capabilities
- Android: `android/app/release.keystore` (already configured in build.gradle)

---

## Pre-Launch Verification Checklist

### Secrets Configured
- [ ] RevenueCat iOS key in app.json (`appl_...`)
- [ ] RevenueCat Android key in app.json (`goog_...`)
- [ ] Google Vision API key in app.json
- [ ] `google-services.json` added for Android
- [ ] `GoogleService-Info.plist` added for iOS
- [ ] `EXPO_TOKEN` secret in GitHub Actions
- [ ] `modelSecretPepper` set in app.json extra
- [ ] `whisperModelCdn` set (if using custom CDN)

### Backend Services Running
- [ ] Account server responding at API_BASE_URL/health
- [ ] Cloud storage R2 health at /api/storage/health
- [ ] Matrix homeserver responding at CHAT_HOMESERVER
- [ ] Windy Mail accessible at WINDY_MAIL_URL
- [ ] License activation endpoint working
- [ ] Transcription endpoint working
- [ ] Translation endpoint working

### Build & Submit
- [ ] `eas build --profile production --platform ios` succeeds
- [ ] `eas build --profile production --platform android` succeeds
- [ ] Test purchases work in sandbox environment
- [ ] Push notifications received on physical device
- [ ] On-device transcription works with downloaded model
- [ ] Cloud transcription works with auth
- [ ] Chat login/messaging works
- [ ] Voice clone upload works
- [ ] Offline mode works (airplane mode test)

### Store Listings
- [ ] App Store screenshots (6.7", 6.5", 5.5" sizes)
- [ ] Play Store screenshots (phone + tablet)
- [ ] App description and keywords
- [ ] Privacy policy URL (`/legal/privacy`)
- [ ] Terms of service URL (`/legal/terms`)
- [ ] Support URL
- [ ] Age rating questionnaire completed
