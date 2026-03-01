# ARCHITECTURE.md — Windy Pro Technical Architecture

## Platform Overview

Windy Pro exists on two platforms built from separate codebases but sharing backend infrastructure:

| | Desktop | Mobile |
|---|---------|--------|
| **Framework** | Electron (Chromium + Node.js) | React Native + Expo |
| **Language** | JavaScript/HTML/CSS | TypeScript + React Native |
| **Platforms** | Linux (.deb, .AppImage), Windows (.exe), macOS (.dmg) | iOS (App Store), Android (Play Store) |
| **Repo** | `sneakyfree/windy-pro` | `sneakyfree/windy-pro-mobile` |
| **Current Version** | v0.6.0 (released 28 Feb 2026) | v0.1.0 (scaffolded 1 Mar 2026) |

## Shared Backend Infrastructure

### Windy Cloud Storage (MinIO Cluster)
Both desktop and mobile connect to the same distributed storage cluster:

| Node | Machine | Capacity | Role |
|------|---------|----------|------|
| OC5 | iMac 27" 5K | 786 GB | Primary storage |
| OC2 | HP ProBook 455 G8 | 395 GB | Storage + compute |
| OC4 | Lenovo ThinkCentre M73 | 414 GB | Storage |
| OC3 | Dell Latitude 5410 | 168 GB | Storage + dev |
| Kit 0 | VPS (72.60.118.54) | 68 GB | Gateway + routing |

- **Protocol:** S3-compatible API (MinIO)
- **Total capacity:** 1,831 GB
- **Redundancy:** Erasure coding across nodes
- **Access:** Via VPS gateway (public) or direct LAN (local)

### Stripe Payment Infrastructure
Shared Stripe account for both platforms:

- **Account:** WindyPro Sandbox (acct_1T5nu2BXIOBasDQi)
- **Products:** Pro ($49), Translate ($79 or $7.99/mo), Translate Pro ($149)
- **Webhook:** https://windypro.thewindstorm.uk/stripe/webhook
- **Coupons:** WINDYFRIEND (25% off), WINDYBETA (50% off)

**Mobile consideration:** iOS App Store and Google Play Store both take a 15-30% cut on in-app purchases. Options:
1. Use Stripe directly (requires external payment link — Apple may reject)
2. Use RevenueCat (wraps StoreKit + Google Billing, handles receipts, Stripe sync)
3. Higher mobile pricing to offset platform fees
4. Web-based subscription management (user subscribes on website, app checks license)

**Recommendation:** Option 4 (web-based subscription) for initial launch. Avoids App Store payment complexity. User buys on windypro.thewindstorm.uk, enters license key in app.

### Website
- **URL:** https://windypro.thewindstorm.uk
- **Hosted on:** Kit 0 VPS via Cloudflare
- **Serves:** Downloads, documentation, payment portal
- **Will also serve:** App Store / Play Store links for mobile

## Mobile Architecture (React Native + Expo)

### Why React Native + Expo?
1. **One codebase → iOS + Android** — 80-90% code sharing
2. **JavaScript ecosystem** — same language as desktop app, shareable logic
3. **Expo managed workflow** — handles native builds, OTA updates, push notifications
4. **Large ecosystem** — libraries for audio, camera, speech, payments all exist
5. **Fast iteration** — hot reload, Expo Go for testing without builds

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | React Native 0.76 + Expo SDK 52 |
| **Language** | TypeScript |
| **Routing** | Expo Router (file-based) |
| **State** | Zustand |
| **Audio** | expo-av (recording + playback) |
| **Speech** | expo-speech (TTS) + @react-native-voice/voice (STT) |
| **Camera** | expo-camera |
| **Storage (local)** | expo-sqlite + expo-file-system |
| **Storage (cloud)** | AWS SDK (S3-compatible → MinIO) |
| **HTTP** | fetch / axios |
| **Payments** | Web-based (Stripe checkout link) |
| **Push** | expo-notifications |
| **Analytics** | TBD |

### Project Structure
```
windy-pro-mobile/
├── docs/                    # Project documentation (you're reading it)
├── src/
│   ├── app/                 # Expo Router screens (file-based routing)
│   │   ├── (tabs)/          # Main tab navigation
│   │   │   ├── translate.tsx    # Windy Translate screen
│   │   │   ├── history.tsx      # Translation/transcription history
│   │   │   ├── settings.tsx     # Settings, account, storage
│   │   │   └── _layout.tsx      # Tab bar configuration
│   │   ├── record/          # Dedicated recording screens
│   │   ├── clone/           # Clone pipeline screens
│   │   ├── onboarding/      # First-run experience
│   │   ├── auth/            # Login/signup/license
│   │   └── _layout.tsx      # Root layout
│   ├── components/          # Reusable UI components
│   │   ├── AudioWaveform.tsx
│   │   ├── LanguagePicker.tsx
│   │   ├── RecordButton.tsx
│   │   ├── TranslationCard.tsx
│   │   └── ProgressMeter.tsx
│   ├── services/            # Business logic & API clients
│   │   ├── translation.ts       # Translation API wrapper
│   │   ├── transcription.ts     # Speech-to-text engine
│   │   ├── storage.ts           # Local + cloud storage manager
│   │   ├── sync.ts              # Cloud sync logic
│   │   ├── license.ts           # License validation
│   │   └── clone.ts             # Clone pipeline status & management
│   ├── stores/              # Zustand state stores
│   │   ├── useTranslateStore.ts
│   │   ├── useRecordingStore.ts
│   │   ├── useSettingsStore.ts
│   │   └── useCloneStore.ts
│   ├── hooks/               # Custom React hooks
│   │   ├── useAudioRecorder.ts
│   │   ├── useSpeechRecognition.ts
│   │   └── useCloudSync.ts
│   ├── utils/               # Helpers & constants
│   │   ├── constants.ts
│   │   ├── formatters.ts
│   │   └── audioUtils.ts
│   ├── i18n/                # App localization
│   └── assets/              # Images, fonts, sounds
├── app.json                 # Expo configuration
├── package.json
├── tsconfig.json
└── .gitignore
```

### Data Flow

```
User speaks into phone
        ↓
Native audio capture (expo-av)
        ↓
Speech recognition (on-device or cloud)
        ↓
Raw text → Translation API → Translated text
        ↓
TTS engine speaks translation aloud
        ↓
Meanwhile: audio file saved locally (SQLite index + file system)
        ↓
If cloud sync enabled: upload to MinIO on Wi-Fi
        ↓
Clone pipeline monitors total hours accumulated
```

## API Endpoints (Shared with Desktop)

### Storage API (MinIO)
- `PUT /bucket/user/{userId}/audio/{filename}` — Upload audio
- `PUT /bucket/user/{userId}/video/{filename}` — Upload video
- `PUT /bucket/user/{userId}/text/{filename}` — Upload text/transcription
- `GET /bucket/user/{userId}/...` — Retrieve files
- `GET /api/storage/usage/{userId}` — Storage usage stats

### Windy Pro Server
- `POST /api/auth/validate` — Validate license key
- `POST /api/translate` — Cloud translation endpoint
- `POST /api/transcribe` — Cloud transcription endpoint
- `GET /api/user/profile` — User profile + tier info
- `GET /api/user/clone-status` — Clone pipeline progress
- `POST /stripe/webhook` — Stripe payment events

### Admin Dashboard
- `https://windypro.thewindstorm.uk/admin` — Super admin panel (built 28 Feb)
- Manages users, billing, alerts, migration, reports

## Network Architecture

```
                    ┌─────────────────┐
                    │   App Store /   │
                    │   Play Store    │
                    └────────┬────────┘
                             │ distributes
                    ┌────────▼────────┐
                    │  Windy Pro      │
                    │  Mobile App     │
                    │  (user's phone) │
                    └────────┬────────┘
                             │ HTTPS
                    ┌────────▼────────┐
                    │  Cloudflare     │
                    │  (CDN + proxy)  │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Kit 0 VPS      │
                    │  (gateway)      │
                    │  72.60.118.54   │
                    └────────┬────────┘
                             │ WireGuard VPN
              ┌──────────────┼──────────────┐
              │              │              │
        ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐
        │  OC2-OC5  │ │  MinIO    │ │  Stripe   │
        │  Storage   │ │  Cluster  │ │  Webhook  │
        │  Nodes    │ │           │ │           │
        └───────────┘ └───────────┘ └───────────┘
```

## Security Considerations
- All API calls over HTTPS (Cloudflare-terminated TLS)
- User audio/video encrypted at rest (AES-256) in MinIO
- License keys are non-reversible tokens
- No PII stored on our servers beyond email + license
- Voice clone models stored in user's personal bucket (not shared)
- GDPR-ready: user can export or delete all their data
