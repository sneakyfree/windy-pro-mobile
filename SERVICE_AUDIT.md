# Service Audit — Windy Pro Mobile

**Audit Date:** 2026-03-31
**Services Audited:** 37

## Service Status Table

| Service | API Endpoints | Error Handling | Unused Exports | Missing Imports | Status |
|---------|--------------|----------------|----------------|-----------------|--------|
| analytics.ts | None (local) | try/catch | None | None | CLEAN |
| audio-capture.ts | None (local) | try/catch | None | None | CLEAN |
| chatClient.ts | Matrix homeserver | try/catch + classify | None | None | CLEAN |
| chatOnboarding.ts | CHAT_REGISTER, CHAT_VERIFY_OTP, CHAT_SET_PROFILE | try/catch | None | None | CLEAN |
| chatTranslate.ts | None (uses translationService) | try/catch | None | None | CLEAN |
| clone-bundle.ts | /api/v1/recordings/upload | try/catch | None | None | CLEAN |
| clone-tracker.ts | None (local) | Partial | None | None | CLEAN |
| cloud-sync.ts | Via cloudStorageClient | try/catch | None | None | CLEAN |
| cloudApi.ts | AUTH_REGISTER, AUTH_LOGIN, STORAGE_*, AUTH_REFRESH | try/catch + timeout | None | None | CLEAN |
| engine-download.ts | WHISPER_MODEL_CDN | try/catch | None | None | CLEAN |
| feedback.ts | None (haptic) | None needed | None | None | CLEAN |
| heartbeat.ts | LICENSE_HEARTBEAT | try/catch | None | None | CLEAN |
| keyboard.ts | None (native bridge) | try/catch | None | None | CLEAN |
| license.ts | LICENSE_ACTIVATE | try/catch | None | None | CLEAN |
| logger.ts | None (FileSystem) | try/catch | None | None | CLEAN |
| **mock-api.ts** | Intercepts fetch | Limited | **initMockApi(), disableMockApi()** | None | **UNUSED** |
| model-crypto.ts | None (crypto) | Custom errors | None | None | CLEAN |
| network-monitor.ts | HEALTH | try/catch | None | None | CLEAN |
| ocr.ts | OCR_TRANSLATE, GOOGLE_VISION_API | try/catch | None | None | CLEAN |
| offline-packs.ts | CDN downloads | try/catch | None | None | CLEAN |
| overlay.ts | None (native bridge) | try/catch | None | None | CLEAN |
| pairCatalog.ts | PAIR_CATALOG_URL | try/catch | None | None | CLEAN |
| pairManager.ts | CDN downloads | try/catch | None | None | CLEAN |
| push-notifications.ts | PUSH_TOKEN_ENDPOINT | try/catch | None | None | CLEAN |
| quality-scorer.ts | None (pure functions) | None needed | None | None | CLEAN |
| rating-prompt.ts | None (local) | try/catch | None | None | CLEAN |
| speech-translation.ts | TRANSLATE_SPEECH, TRANSLATE_LANGUAGES | try/catch | None | None | CLEAN |
| **storage-cloud.ts** | Legacy v1 endpoints | try/catch | None | None | **DEPRECATED** |
| storage-local.ts | None (SQLite) | try/catch | None | None | CLEAN |
| subscription.ts | RevenueCat SDK | try/catch + classify | None | None | CLEAN |
| sync-manager.ts | RECORDINGS_UPLOAD, RECORDINGS_CHECK | try/catch | None | None | CLEAN |
| transcription.ts | TRANSCRIBE, WS_TRANSCRIBE | try/catch | None | None | CLEAN |
| translation.ts | TRANSLATE_TEXT, TRANSLATE_SPEECH, TRANSLATE_LANGUAGES | try/catch | None | None | CLEAN |
| video-capture.ts | None (camera) | try/catch | None | None | CLEAN |
| whisper-manager.ts | None (local model) | try/catch | None | None | CLEAN |
| windy-tune.ts | None (pure functions) | None needed | None | None | CLEAN |
| windytune-nudge.ts | None (local) | try/catch | None | None | CLEAN |

## Issues Found

### 1. mock-api.ts — Unused Exports
`initMockApi()` and `disableMockApi()` are exported but never imported anywhere. This is by design (dev-only tool), but could be auto-initialized in `__DEV__` mode.

### 2. storage-cloud.ts — Deprecated
Marked `@deprecated` with comment to use `cloudApi` instead. Still exports `cloudStorageClient` which is used by `sync-engine.ts` (now deleted) and `cloud-sync.ts`. The compat bridge methods are still active.

## All Endpoints Verified

Every API call uses the centralized `apiUrl()` helper from `src/config/api.ts`. No raw URL construction found in services (hardcoded URLs exist only in screen files — see SCREEN_AUDIT.md).
