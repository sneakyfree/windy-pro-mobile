# SERVICE_AUDIT.md — Mobile App Integration Surface

_Generated: 2026-03-29_
_Scope: All 37 service modules in `src/services/`_

---

## Test Suite Status

**18 suites, 362 tests — 360 passed, 2 failed**

| Suite | Status |
|-------|--------|
| audio-quality.test.ts | PASS |
| clone-tracker.test.ts | PASS (AsyncStorage warnings) |
| speech-translation.test.ts | PASS |
| model-crypto.test.ts | PASS |
| cloudApi.test.ts | PASS |
| analytics.test.ts | PASS |
| subscription.test.ts | PASS |
| cloud-sync.test.ts | PASS |
| heartbeat.test.ts | PASS |
| network-monitor.test.ts | PASS |
| validation.test.ts | PASS |
| chatTranslate.test.ts | PASS |
| translation.test.ts | PASS |
| transcription.test.ts | PASS |
| chatIntegration.test.ts | PASS |
| sync-manager.test.ts | PASS |
| **windy-tune.test.ts** | **FAIL** — `should fall back to cloud for very low RAM (<1500)` |
| **license.test.ts** | **FAIL** — `all paid tiers should have same limit` |

**Other warnings:** Jest config has `setupFilesAfterSetup` (typo for `setupFilesAfterSetup`). Worker process force-exit on teardown (likely open timers).

---

## Service Catalog

### 1. analytics.ts
**Purpose:** Local-only analytics tracking screen views, translations, recording durations, language pair usage. Stored in AsyncStorage for future backend sync.
**Dependencies:** `@react-native-async-storage/async-storage`, `./logger`
**API Endpoints:** None
**Hardcoded Config:** None
**Gaps:** Backend sync not implemented. `ensureInit()` fire-and-forget creates a race condition where in-memory increments can be overwritten by the late async load.

---

### 2. audio-capture.ts
**Purpose:** Records audio via `expo-av` with real-time metering (dB normalization) for waveform display. Exports `scoreAudioQuality()` heuristic for clone pipeline.
**Dependencies:** `expo-av`, `expo-file-system`, `@/types`, `./logger`
**API Endpoints:** None
**Hardcoded Config:** None
**Gaps:** `(fileInfo as any).size` unsafe cast. `sessionId` parameter to `startRecording()` is ignored — result always fabricates `session-${Date.now()}`.

---

### 3. chatClient.ts
**Purpose:** Full Matrix protocol chat client via `matrix-js-sdk`. Login/register, real-time sync, DM rooms, presence, typing indicators, offline message queue, E2E encryption foundation.
**Dependencies:** `expo-secure-store`, `matrix-js-sdk` (dynamic require), `./logger`
**API Endpoints:** All Matrix Client-Server API via SDK — login, register, sync, send, presence, user search.
**Hardcoded Config:**
- **`DEFAULT_HOMESERVER = 'https://matrix.org'`** — should be `CHAT_HOMESERVER` from `@/config/api` (`https://chat.windypro.com`). Mismatch with chatOnboarding.ts.

**Gaps:** `sdk` and `client` typed as `any`. Pending message queue is in-memory only (lost on app kill). `isDirectRoom()` uses `members.length <= 2` heuristic.

---

### 4. chatOnboarding.ts
**Purpose:** WhatsApp-style phone/email OTP verification flow. Provisions Matrix account, sets profile, stores credentials, initializes chat client.
**Dependencies:** `@react-native-async-storage/async-storage`, `expo-secure-store`, `@/config/api`, `./chatClient`, `./logger`
**API Endpoints:**
- `POST /api/v1/chat/register` — request OTP
- `POST /api/v1/chat/verify` — verify OTP, get Matrix credentials
- `POST /api/v1/chat/profile` — set display name (Bearer auth)

**Hardcoded Config:** All URLs from `@/config/api`.
**Gaps:** Avatar upload not implemented. `setProfile()` silently succeeds on network failure ("soft failure").

---

### 5. chatTranslate.ts
**Purpose:** On-device translation middleware for chat. Language detection, translation via local engine, LRU cache (100 entries).
**Dependencies:** `./translation`, `./chatClient` (types), `./logger`, `./pairManager`
**API Endpoints:** None (fully on-device)
**Hardcoded Config:** None
**Gaps:** `pairNeeded` property added via duck typing (not in TranslatedMessage type). `userLanguage` defaults to `'en'` with no persistence.

---

### 6. clone-bundle.ts
**Purpose:** Manages recording bundles (audio + video + transcript) for clone training. Creates bundles, tracks sync status, uploads multipart to backend.
**Dependencies:** `@react-native-async-storage/async-storage`, `expo-file-system`, `expo-battery`, `expo-constants`, `react-native`, `./network-monitor`, `@/config/api`, `./logger`
**API Endpoints:**
- `POST /api/v1/recordings/upload` — multipart upload

**Hardcoded Config:** Upload path `/api/v1/recordings/upload` hardcoded instead of using `ENDPOINTS.RECORDINGS_UPLOAD`.
**Gaps:** Log tag typo `[cloneuundle]`. Video upload result not checked. `cloud_bytes` always `0`.

---

### 7. clone-tracker.ts
**Purpose:** Silently accumulates recording data toward 10-hour voice clone threshold. Quality-weighted hours, milestone detection (25/50/75/100%) with haptic + push notification.
**Dependencies:** `@/types`, `./quality-scorer` (unused import), `./logger`. Dynamic: `@/services/feedback`, `expo-notifications`, `react-native`, `@react-native-async-storage/async-storage`, `@/services/storage-local`
**API Endpoints:** None
**Hardcoded Config:** None
**Gaps:** `isCloneUsable` imported but unused. Heavy dynamic `require()` pattern. `Notifications.scheduleNotificationAsync` trigger cast to `null as any`.

---

### 8. cloud-sync.ts
**Purpose:** Unified cloud sync with offline queue, exponential backoff retry, conflict resolution (newer transcript wins), download capability.
**Dependencies:** `@react-native-async-storage/async-storage`, `expo-file-system`, `./storage-cloud`, `./storage-local`, `./network-monitor`, `@/types`, `./logger`
**API Endpoints:** Delegates to `cloudStorageClient`. Downloads audio via `FileSystem.downloadAsync(recording.audioUrl)`.
**Hardcoded Config:** None
**Gaps:** `cloneUsable` hardcoded to `false` for cloud recordings. `getLocalStorageUsed()` does O(N) individual session reads.

---

### 9. cloudApi.ts
**Purpose:** Typed HTTP client for Windy Pro cloud storage API (R2-backed). Registration, login, JWT auth (SecureStore), file CRUD, storage usage, health checks, upload retry queue. Extracts `windy_identity_id` from JWT for cross-product correlation.
**Dependencies:** `expo-secure-store`, `expo-file-system`, `react-native` (unused), `@/config/api`, `@/types`, `./logger`
**API Endpoints:**
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/storage/health`
- `GET /health`
- `POST /api/storage/files/upload`
- `GET /api/storage/files`
- `GET /api/storage/files/:id`
- `DELETE /api/storage/files/:id`

**Hardcoded Config:** All URLs via `@/config/api`.
**Gaps:** `Platform` imported but unused. Retry queue in-memory only. `getStorageUsage()` requires full file listing. `atob()` may need polyfill in some RN environments.

---

### 10. engine-download.ts
**Purpose:** Downloads whisper.cpp GGML models from HuggingFace CDN. Resumable downloads, progress callbacks, cancel, delete, storage usage.
**Dependencies:** `expo-file-system`, `@/types`
**API Endpoints:**
- `GET https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{model}.bin`

**Hardcoded Config:**
- **`MODEL_CDN = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main'`** — should be configurable.
- **`User-Agent: 'WindyPro/0.1.0'`** — hardcoded version.

**Gaps:** No checksum/integrity verification after download. `cancelDownload()` leaves orphaned partial files. `(info as any).size` unsafe cast.

---

### 11. feedback.ts
**Purpose:** Haptic feedback (via `expo-haptics`) for app events. Respects user's haptic setting from settings store.
**Dependencies:** `expo-haptics`, `@/stores/useSettingsStore`, `./logger` (unused)
**API Endpoints:** None
**Hardcoded Config:** None
**Gaps:** Logger created but never used. No audio feedback despite file header claiming "Haptic + audio feedback".

---

### 12. heartbeat.ts
**Purpose:** License DRM heartbeat. Periodic server verification, tiered offline grace periods (24h–30d), model lock on grace expiry, revocation handling.
**Dependencies:** `expo-secure-store`, `@react-native-async-storage/async-storage`, `react-native`, `@/utils/fetch-timeout`, `@/config/api`, `./license`, `./logger`, `@/types`
**API Endpoints:**
- `POST /api/v1/license/activate` — reused as heartbeat with `{ heartbeat: true }`

**Hardcoded Config:**
- **`'X-App-Version': '1.0.0'`** — should come from `expo-constants`.
- **`TOKEN_KEY = 'windy_jwt_token'`** — different from cloudApi's `'windy_cloud_jwt'`.

**Gaps:** Token key mismatch with cloudApi.ts — heartbeat reads `windy_jwt_token`, cloudApi stores `windy_cloud_jwt`. Reuses license activation endpoint instead of dedicated heartbeat endpoint.

---

### 13. keyboard.ts
**Purpose:** JS bridge for iOS keyboard extension. NativeModules + App Group shared storage for settings sync, transcript retrieval, Live Activity (Dynamic Island).
**Dependencies:** `react-native`, `@react-native-async-storage/async-storage` (unused import)
**API Endpoints:** None (native bridge only)
**Hardcoded Config:**
- **`APP_GROUP_ID = 'group.ai.windyword.app'`** — standard for iOS extensions.

**Gaps:** AsyncStorage imported but unused. Android no-op (no equivalent stubbed). `openKeyboardSettings()` opens app settings, not keyboard settings specifically.

---

### 14. license.ts
**Purpose:** Tier-based feature gating (free/pro/translate/translate_pro) with Stripe integration. License key validation against backend, 24h cache, offline fallback.
**Dependencies:** `expo-secure-store`, `@/types`, `@/config/api`, `@/utils/fetch-timeout`, `@/utils/api-error`, `./logger`
**API Endpoints:**
- `POST /api/v1/license/activate` — license activation (Bearer auth)
- `POST /api/stripe/checkout` — Stripe checkout session
- Fallback: `${API_BASE_URL}/pricing?device=...`

**Hardcoded Config:** `TOKEN_KEY = 'windy_jwt_token'` (shared with heartbeat, model-crypto, pairManager).
**Gaps:** `createNetworkError` imported but unused. No persistent tier storage — resets to `free` on app restart until `validateLicense` is called.

---

### 15. logger.ts
**Purpose:** Structured file-persistent logger with 2MB auto-rotation, sensitive key redaction, batched writes (500ms), level filtering (DEBUG in dev, INFO+ in prod).
**Dependencies:** `expo-file-system`
**API Endpoints:** None
**Hardcoded Config:** `LOG_DIR`, `MAX_LOG_SIZE` — reasonable local constants.
**Gaps:** `flushQueue` uses `writeAsStringAsync` without append — each flush **overwrites** the log file. Only the most recent batch survives.

---

### 16. model-crypto.ts
**Purpose:** AES-256-GCM-like encryption for translation model files at rest. Device-bound key derivation (license token + device fingerprint + app secret). Custom WMOD binary format.
**Dependencies:** `expo-secure-store`, `expo-file-system`, `expo-device`, `react-native`, `expo-crypto` (optional), `./logger`
**API Endpoints:** None
**Hardcoded Config:**
- **`APP_SECRET_PEPPER = 'windy-model-v1-L6-protection'`** — hardcoded in source. Exposed if bundle decompiled.

**Gaps:** `generateRandomBytes` uses **`Math.random()`** (not CSPRNG) for IV generation — real security weakness. Fallback hash is 32-bit DJB — no real security. Auth tag only samples first 1024 bytes of ciphertext.

---

### 17. network-monitor.ts
**Purpose:** Periodic health endpoint ping (30s interval). Online/offline status with listener subscriptions. Translation queue for offline fallback.
**Dependencies:** `expo-file-system`, `@/config/api`, `./logger`
**API Endpoints:**
- `HEAD /health` — connectivity check (5s timeout)

**Hardcoded Config:** None
**Gaps:** Translation queue in-memory only. `onQueueReady` supports only a single handler.

---

### 18. ocr.ts
**Purpose:** OCR via Google Cloud Vision API (primary) or backend endpoint, with local fallback stub. Supports extract-and-translate workflows.
**Dependencies:** `./translation`, `@/config/api`, `@/utils/api-error`, `./logger`
**API Endpoints:**
- `POST /api/v1/ocr/translate` — backend OCR+translate
- `POST https://vision.googleapis.com/v1/images:annotate?key=...` — Google Vision

**Hardcoded Config:**
- **`OCR_API = 'https://vision.googleapis.com/v1/images:annotate'`** — should be in config.
- **`'DEMO_KEY'`** fallback API key — should be null/env var.

**Gaps:** `isAuthError`, `isRateLimited` imported but unused. `fallbackOcr` is a stub (always returns empty). No timeout on Google Vision fetch.

---

### 19. offline-packs.ts
**Purpose:** Downloads and manages offline language translation packs (12 languages). Progress tracking, on-disk verification, metadata persistence.
**Dependencies:** `expo-file-system`, `@react-native-async-storage/async-storage`, `./logger`
**API Endpoints:**
- `GET https://windypro.thewindstorm.uk/models/{code}/model-v{version}.bin`

**Hardcoded Config:**
- **`PACK_BASE_URL = 'https://windypro.thewindstorm.uk/models'`** — should use `@/config/api`.

**Gaps:** No integrity verification. No encryption (unlike pairManager). No retry logic. Overlaps significantly with pairManager.ts — potential dead code.

---

### 20. overlay.ts
**Purpose:** JS bridge for Android floating overlay ("tornado button"). SYSTEM_ALERT_WINDOW permission, overlay lifecycle, clipboard paste via AccessibilityService.
**Dependencies:** `react-native`, `./logger` (created but unused)
**API Endpoints:** None
**Hardcoded Config:** None
**Gaps:** Logger created but all logging uses `console.warn`. Android-only.

---

### 21. pairCatalog.ts
**Purpose:** Loads, caches, validates, queries translation pair catalog. 3-tier loading: CDN -> AsyncStorage cache (24h TTL) -> bundled JSON fallback.
**Dependencies:** `expo-secure-store`, `@react-native-async-storage/async-storage`, `./logger`, `../../shared/pair-catalog.json`, `../../shared/pair-bundles.json`
**API Endpoints:**
- `GET https://windypro.thewindstorm.uk/api/v1/pairs/catalog.json`

**Hardcoded Config:**
- **`CDN_CATALOG_URL = 'https://windypro.thewindstorm.uk/api/v1/pairs/catalog.json'`** — should use `@/config/api`.

**Gaps:** No timeout on CDN fetch. Bundles always from bundled JSON (never CDN). **Tier naming mismatch:** `PairTier = 'free'|'pro'|'ultra'|'max'` vs `LicenseTier = 'free'|'pro'|'translate'|'translate_pro'`.

---

### 22. pairManager.ts
**Purpose:** Primary download manager for translation pair models. CDN download with 3x retry, 5-min timeout, storage checks, offline queue, tier-based limits, integrity hashing, AES-256-GCM encryption (via modelCrypto), heartbeat-gated loading.
**Dependencies:** `expo-file-system`, `expo-secure-store`, `expo-crypto` (optional), `@react-native-async-storage/async-storage`, `@react-native-community/netinfo`, `react-native`, `./logger`, `./license`, `./model-crypto`, `./heartbeat`, `@/types`
**API Endpoints:** CDN downloads only (URLs from catalog, validated HTTPS).
**Hardcoded Config:**
- `LICENSE_TOKEN_KEY = 'windy_jwt_token'` — duplicated across 4 files.
- **`User-Agent: 'WindyPro/1.0.0'`** — hardcoded version.

**Gaps:** Download timeout `Promise.race` never clears timeout on success. `expo-crypto` graceful import duplicated with model-crypto.ts.

---

### 23. push-notifications.ts
**Purpose:** Push notification setup, Expo push token registration, Android channel config, local notifications for translations, subscriptions, app updates.
**Dependencies:** `react-native`, `expo-notifications`, `expo-device`, `expo-constants`, `./logger`, `@/config/api`
**API Endpoints:**
- `POST /api/register-push-token` — token registration

**Hardcoded Config:**
- **`/api/register-push-token`** path hardcoded inline instead of using `ENDPOINTS` + `apiUrl()`.

**Gaps:** No auth header on token registration. Notification trigger cast `null as unknown as ...` type hack. Notification preferences in-memory only.

---

### 24. quality-scorer.ts
**Purpose:** Scores audio recording quality (0–100) using 5 weighted factors for clone pipeline. Recommendations and clone-usability checks.
**Dependencies:** `@/types`, `./logger` (created but unused)
**API Endpoints:** None
**Hardcoded Config:** None
**Gaps:** Logger unused. Naive SNR estimation (fixed noise floor 0.01). Speech ratio is rough heuristic. No frequency-domain analysis.

---

### 25. rating-prompt.ts
**Purpose:** Triggers app store rating prompt after every 5th translation, rate-limited to once per 30 days.
**Dependencies:** `@react-native-async-storage/async-storage`, `expo-store-review`, `./logger` (unused)
**API Endpoints:** None
**Hardcoded Config:** None
**Gaps:** Logger unused. No "don't ask again" option.

---

### 26. speech-translation.ts
**Purpose:** Full speech translation pipeline — record, upload for translation, play back via TTS. Language validation, 3x retry with exponential backoff, 15s timeout.
**Dependencies:** `expo-av`, `expo-file-system`, `expo-speech`, `./translation`, `@/config/api`, `@/utils/api-error`, `./logger`
**API Endpoints:**
- `POST /api/v1/translate/speech` — multipart audio upload

**Hardcoded Config:** None
**Gaps:** `DETECT_ENDPOINT` declared but never used. No auth token in upload headers. `detectLanguageFromAudio` silently falls back to `en`.

---

### 27. storage-cloud.ts
**Purpose:** Legacy cloud storage client for auth (JWT login/refresh/logout) and recording CRUD against account server. **Deprecated** in favor of `cloudApi.ts`.
**Dependencies:** `expo-file-system`, `expo-secure-store`, `@/config/api`, `@/utils/api-error`, `./logger`, re-exports `./cloudApi`
**API Endpoints:**
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/recordings/upload`
- `PUT /api/v1/recordings/:id/audio`
- `GET /api/v1/recordings/list`
- `GET /api/v1/recordings/:id`
- `DELETE /api/v1/recordings/:id`

**Hardcoded Config:** None
**Gaps:** Broken template literal (single quotes on line 293). `uploadMetadata` is a no-op. `createNetworkError` imported but unused.

---

### 28. storage-local.ts
**Purpose:** Local SQLite database for session CRUD, sync queue management, storage usage metrics. Creates `windy.db`.
**Dependencies:** `expo-sqlite`, `expo-file-system`, `@/types`, `./logger`. Dynamic: `@/stores/useSettingsStore`
**API Endpoints:** None
**Hardcoded Config:** DB name `'windy.db'`, `LIMIT 100` hardcoded in `getSessions()`.
**Gaps:** `SCHEMA_VERSION = 1` declared but never used — no migration logic. `AudioQuality` imported but unused. Dynamic `require()` for sync state check.

---

### 29. subscription.ts
**Purpose:** RevenueCat subscription management. SDK init, offerings, purchase (mutex-protected), restore, entitlement checks, user identification.
**Dependencies:** `react-native-purchases`, `react-native`, `expo-constants`, `@/types`, `./logger`
**API Endpoints:** Via RevenueCat SDK (no direct HTTP).
**Hardcoded Config:** API keys from `expo-constants` (properly externalized). Entitlement IDs `'pro'`, `'translate'`, `'translate_pro'` must match RevenueCat dashboard.
**Gaps:** Missing API keys log error but don't throw. `sanitizeSubError` defined but never called. Comment: "PRODUCTION KEYS REQUIRED BEFORE LAUNCH".

---

### 30. sync-engine.ts
**Purpose:** Background cloud sync — uploads pending local sessions. Wi-Fi/battery condition checks, JWT auth, 15-minute background fetch task.
**Dependencies:** `expo-task-manager`, `expo-background-fetch`, `@react-native-community/netinfo`, `expo-battery`, `@/types`, `./storage-local`, `./storage-cloud`, `./logger`
**API Endpoints:** Via `cloudStorageClient.uploadRecording()` and `cloudStorageClient.login()`.
**Hardcoded Config:** `storageQuota: 10 * 1024 * 1024 * 1024` (10GB) — should come from tier.
**Gaps:** Broken template literal (single quotes). `pendingUploadBytes` assumes 1MB per file. **Overlaps with sync-manager.ts** — duplicate system.

---

### 31. sync-manager.ts
**Purpose:** Advanced Wi-Fi-aware sync with persistent queue, priority processing, chunked upload with resume, conflict detection, smart batching, background sync, notifications. **Newer replacement for sync-engine.ts.**
**Dependencies:** `react-native`, `@react-native-async-storage/async-storage`, `@react-native-community/netinfo`, `expo-file-system`, `expo-background-fetch`, `expo-task-manager`, `expo-notifications`, `@/config/api`, `@/utils/api-error`, `./cloudApi`, `@/types`, `./logger`
**API Endpoints:**
- `POST /api/v1/recordings/upload` — single file
- `POST /api/v1/recordings/upload/chunk` — chunked upload (base64 in JSON)
- `POST /api/v1/recordings/upload/batch` — batch upload
- `GET /api/v1/recordings/check` — conflict detection

**Hardcoded Config:** None
**Gaps:** `downloaded` and `conflicts` counters never incremented (always 0). `checkConflict` returns `'download'` but caller ignores it. **No auth headers** in upload/check requests. Chunked upload uses base64-in-JSON (inefficient). Notification trigger type hack.

---

### 32. transcription.ts
**Purpose:** Routes audio to on-device Whisper or cloud backend (HTTP POST primary, WebSocket streaming fallback). Engine selection, license gating for cloud.
**Dependencies:** `expo-file-system`, `@/types`, `./windy-tune`, `@/config/api`, `@/utils/api-error`, `./logger`. Dynamic: `./whisper-manager`, `./license`, `@/stores/useSettingsStore`
**API Endpoints:**
- `POST /api/v1/transcribe` — HTTP multipart upload
- `WSS /ws/transcribe` — WebSocket streaming (auth + config + binary chunks + stop)

**Hardcoded Config:** `SERVER_URL` mutable via `setTranscriptionServerUrl()`.
**Gaps:**
- **`licenseService` reference error** — referenced in catch block (line 103) without being in scope.
- **Call signature mismatch** — calls `whisperManager.transcribe(uri, { onSegment })` but whisper-manager expects `(audioUri, language, onSegment?)`.
- `atob()` polyfill concern.

---

### 33. translation.ts
**Purpose:** Full translation service — text translation (cloud API), speech-to-speech (audio upload), language detection (cloud + heuristic), TTS playback, conversation export (text/Markdown/SRT).
**Dependencies:** `expo-speech`, `expo-file-system`, `expo-sharing`, `@/types`, `@/config/api`, `@/utils/fetch-timeout`, `@/utils/api-error`, `./logger`, `./pairManager`. Dynamic: `@/stores/useSettingsStore`
**API Endpoints:**
- `POST /api/v1/translate/text`
- `POST /api/v1/translate/speech`
- `POST /api/v1/translate/languages`

**Hardcoded Config:** None
**Gaps:** `LicenseTier`, `createNetworkError`, `isAuthError`, `isRateLimited`, `getUserMessage` all imported but unused. `translateSpeech` sends no auth headers.

---

### 34. video-capture.ts
**Purpose:** Camera-based video capture for recording sessions (clone data collection). Permissions, start/stop/cancel, file management.
**Dependencies:** `expo-camera`, `expo-file-system`, `./logger`
**API Endpoints:** None
**Hardcoded Config:** None
**Gaps:** **Stub implementation** — `startVideoCapture` never calls `recordAsync()`. `stopVideoCapture` tries to move a file that was never created. `CameraType` imported but unused.

---

### 35. whisper-manager.ts
**Purpose:** Wraps `whisper.rn` native module for on-device transcription. Model loading, transcription with segment callbacks, context lifecycle.
**Dependencies:** `expo-file-system`, `@/types`, `./logger`. Dynamic: `whisper.rn`
**API Endpoints:** None
**Hardcoded Config:** Model directory `windy/engines/`, model filename map.
**Gaps:**
- **Path mismatch** — expects models in `{documentDirectory}/windy/engines/` but windy-tune.ts downloads to `{documentDirectory}/models/`. Models will never be found.
- Confidence hardcoded to `0.9`. Auto-detect defaults to `'en'`.

---

### 36. windy-tune.ts
**Purpose:** Intelligent engine auto-configuration. Device hardware detection (RAM, Neural Engine, NPU), 8-engine registry (6 on-device Whisper + 2 cloud), optimal engine recommendation, model download with progress.
**Dependencies:** `react-native`, `expo-device`, `expo-file-system`, `@react-native-async-storage/async-storage`, `@/types`, `./logger`
**API Endpoints:**
- `GET https://windypro.thewindstorm.uk/models/{engineId}.bin` — CDN model download

**Hardcoded Config:**
- **`ENGINE_CDN_BASE = 'https://windypro.thewindstorm.uk/models'`** — should use `@/config/api`.

**Gaps:**
- **Critical path mismatch** with whisper-manager (downloads to `models/`, whisper looks in `windy/engines/`).
- `cpuCores` hardcoded to `4`. `availableStorage` always `0`.
- `AbortController` created but never connected to download — cancel is non-functional.

---

### 37. windytune-nudge.ts
**Purpose:** Performance monitoring nudge — alerts when device is 3x slower than realtime for 2 consecutive transcriptions. Respects dismiss limits (max 3) and rate limits (weekly).
**Dependencies:** `@react-native-async-storage/async-storage`, `react-native`, `./logger`
**API Endpoints:** None
**Hardcoded Config:** None
**Gaps:** "Open Settings" button is a no-op (logs only). `Platform` imported but unused.

---

## Complete Endpoint Map

### Windy Pro Backend (`https://windypro.thewindstorm.uk`)

| Method | Path | Service(s) | Auth |
|--------|------|-----------|------|
| POST | /api/auth/register | cloudApi | None |
| POST | /api/auth/login | cloudApi | None |
| POST | /api/v1/auth/login | storage-cloud | None |
| POST | /api/v1/auth/refresh | storage-cloud | Bearer JWT |
| GET | /health | cloudApi, network-monitor | None |
| GET | /api/storage/health | cloudApi | None |
| POST | /api/storage/files/upload | cloudApi | Bearer JWT |
| GET | /api/storage/files | cloudApi | Bearer JWT |
| GET | /api/storage/files/:id | cloudApi | Bearer JWT |
| DELETE | /api/storage/files/:id | cloudApi | Bearer JWT |
| POST | /api/v1/recordings/upload | clone-bundle, sync-manager, storage-cloud | Bearer JWT |
| POST | /api/v1/recordings/upload/chunk | sync-manager | **Missing auth** |
| POST | /api/v1/recordings/upload/batch | sync-manager | **Missing auth** |
| GET | /api/v1/recordings/check | sync-manager | **Missing auth** |
| PUT | /api/v1/recordings/:id/audio | storage-cloud | Bearer JWT |
| GET | /api/v1/recordings/list | storage-cloud | Bearer JWT |
| GET | /api/v1/recordings/:id | storage-cloud | Bearer JWT |
| DELETE | /api/v1/recordings/:id | storage-cloud | Bearer JWT |
| POST | /api/v1/translate/text | translation | Bearer JWT |
| POST | /api/v1/translate/speech | speech-translation, translation | **Missing auth** |
| POST | /api/v1/translate/languages | translation | Bearer JWT |
| POST | /api/v1/transcribe | transcription | Bearer JWT |
| WSS | /ws/transcribe | transcription | License key |
| POST | /api/v1/ocr/translate | ocr | Bearer JWT |
| POST | /api/v1/license/activate | license, heartbeat | Bearer JWT |
| POST | /api/stripe/checkout | license | Bearer JWT |
| POST | /api/register-push-token | push-notifications | **Missing auth** |
| POST | /api/v1/chat/register | chatOnboarding | None |
| POST | /api/v1/chat/verify | chatOnboarding | None |
| POST | /api/v1/chat/profile | chatOnboarding | Bearer JWT |

### External Services

| Service | URL | Used By |
|---------|-----|---------|
| Matrix Homeserver | `https://chat.windypro.com` | chatOnboarding (via config) |
| Matrix Homeserver (default) | `https://matrix.org` | chatClient (hardcoded default) |
| HuggingFace CDN | `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/` | engine-download |
| Windy CDN (models) | `https://windypro.thewindstorm.uk/models/` | windy-tune, offline-packs |
| Windy CDN (catalog) | `https://windypro.thewindstorm.uk/api/v1/pairs/catalog.json` | pairCatalog |
| Google Cloud Vision | `https://vision.googleapis.com/v1/images:annotate` | ocr |
| RevenueCat | via SDK | subscription |

---

## Critical Cross-Cutting Issues

### P0 — Will Break at Runtime

1. **Model directory path mismatch:** `windy-tune.ts` downloads to `{documentDirectory}/models/` but `whisper-manager.ts` looks in `{documentDirectory}/windy/engines/`. On-device transcription will fail to find any downloaded model.

2. **transcribe() call signature mismatch:** `transcription.ts` calls `whisperManager.transcribe(uri, { onSegment })` but `whisper-manager.ts` expects `(audioUri, language, onSegment?)`. Language will be `[object Object]`.

3. **licenseService scope error:** `transcription.ts` line 103 references `licenseService` in a catch block where it's not in scope. Will throw `ReferenceError`.

### P1 — Security / Auth

4. **JWT token key mismatch:** `heartbeat.ts`, `license.ts`, `model-crypto.ts`, `pairManager.ts` all use `'windy_jwt_token'`, but `cloudApi.ts` stores auth token as `'windy_cloud_jwt'`. Two separate auth states — heartbeat/license flow can't find cloud API tokens.

5. **Missing auth headers:** `sync-manager.ts` (upload, chunk, batch, conflict-check), `speech-translation.ts` (speech upload), `push-notifications.ts` (token registration) send no Bearer tokens. These endpoints are likely protected server-side.

6. **Math.random() for crypto IV:** `model-crypto.ts` uses `Math.random()` for IV generation instead of `expo-crypto.getRandomBytesAsync()`. Predictable IVs undermine AES-GCM.

7. **Hardcoded app secret:** `model-crypto.ts` has `APP_SECRET_PEPPER = 'windy-model-v1-L6-protection'` in source — exposed on bundle decompile.

### P2 — Config / Hardcoding

8. **`API_BASE_URL` not from environment:** `src/config/api.ts` hardcodes `'https://windypro.thewindstorm.uk'` — no env var switching for dev/staging/prod.

9. **Scattered hardcoded URLs:** HuggingFace CDN (`engine-download.ts`), Windy CDN (`windy-tune.ts`, `offline-packs.ts`), pair catalog CDN (`pairCatalog.ts`), Google Vision (`ocr.ts`) all hardcoded outside centralized config.

10. **Hardcoded version strings:** `'WindyPro/0.1.0'` in engine-download, `'WindyPro/1.0.0'` in pairManager, `'1.0.0'` in heartbeat — should all read from `expo-constants`.

### P3 — Architecture Debt

11. **Duplicate sync systems:** `sync-engine.ts` and `sync-manager.ts` overlap significantly. sync-manager is newer/better but sync-engine is still present.

12. **Duplicate download systems:** `offline-packs.ts` and `pairManager.ts` both manage translation model downloads with very different hardening levels. Consolidation needed.

13. **Tier naming mismatch:** `pairCatalog.ts` uses `'free'|'pro'|'ultra'|'max'` while `license.ts` uses `'free'|'pro'|'translate'|'translate_pro'`. Feature gating bugs likely.

14. **Matrix homeserver default mismatch:** `chatClient.ts` defaults to `https://matrix.org` but the Windy homeserver is `https://chat.windypro.com`. Any code path using the default connects to the wrong server.

15. **In-memory queues lost on app kill:** cloudApi upload queue, chatClient pending messages, network-monitor translation queue — none persisted.

16. **Logger overwrites instead of appending:** `logger.ts` `flushQueue` uses `writeAsStringAsync` without append mode — each 500ms flush destroys previous logs.

17. **video-capture.ts is a stub:** `startVideoCapture` never calls `recordAsync()`. No video data is actually captured.

18. **Broken template literals:** `storage-cloud.ts` line 293 and `sync-engine.ts` line 152 use single quotes with `${}` — string interpolation doesn't work.

### P4 — Dead Code / Unused Imports

19. **Unused imports across many services:** `Platform` in cloudApi, `AsyncStorage` in keyboard, `isCloneUsable` in clone-tracker, `createNetworkError` in license/storage-cloud/translation, `isAuthError`/`isRateLimited` in ocr, `CameraType` in video-capture, `LicenseTier` in translation, `sanitizeSubError` in subscription, `DETECT_ENDPOINT` in speech-translation, `AudioQuality` in storage-local.

20. **Loggers created but unused:** feedback.ts, overlay.ts, quality-scorer.ts, rating-prompt.ts all create loggers then use `console.warn` instead.

---

## Top 5 Critical Untested Services

Ranked by blast radius and user impact. Test suites added 2026-03-29.

| Rank | Service | Why Critical | Test File |
|------|---------|-------------|-----------|
| 1 | **storage-local.ts** | SQLite persistence layer — every session, sync queue, and storage metric flows through it. Bugs here corrupt or lose user data. | `storage-local.test.ts` |
| 2 | **pairManager.ts** | Core download + encryption pipeline for translation models. Handles DRM gating, integrity hashing, offline queueing, and tier limits. | `pairManager.test.ts` |
| 3 | **chatOnboarding.ts** | Auth/verification entry point for chat. OTP validation, credential provisioning, and onboarding state management. | `chatOnboarding.test.ts` |
| 4 | **ocr.ts** | External API integration (Google Vision + backend OCR). Contains the `DEMO_KEY` security issue and untested fallback paths. | `ocr.test.ts` |
| 5 | **pairCatalog.ts** | Translation pair catalog with 3-tier loading (CDN → cache → bundled). Tier mismatch bug (`ultra/max` vs `translate/translate_pro`) lives here. | `pairCatalog.test.ts` |
