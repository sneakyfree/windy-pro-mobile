# Coverage gaps (Wave-7 audit)

Run: `npm test -- --coverage` on the `wave-7-gap-analysis` branch.

## Totals (from `coverage/coverage-summary.json`)

| Metric | Covered | Total | % |
|---|---:|---:|---:|
| Lines | 2370 | 4323 | **54.82 %** |
| Statements | 2534 | 4756 | **53.28 %** |
| Functions | 397 | 767 | **51.76 %** |
| Branches | 1145 | 2586 | **44.27 %** |

## Auth / crypto / money / identity modules below 80% — P0-grade per brief

| File | Lines % | Fn % | Branches % | Notes |
|---|---:|---:|---:|---|
| `src/services/cloudApi.ts` | 62.93 | 74.07 | 37.34 | Shim — deprecated password paths are unreachable; low branch coverage reflects error paths in the surviving storage methods |
| `src/services/identityApi.ts` | 84.65 | **59.09** | 63.04 | Functions below 80%: the event-subscription helpers, `logout` after partial SecureStore failure, and the `wait` abort path all untested |
| `src/services/model-crypto.ts` | **70.81** | 85.71 | 52.72 | Crypto — key derivation + watermark paths; 47% of branches untested |
| `src/services/pairManager.ts` | **51.45** | 62.79 | 42.85 | Paid pair purchases and download — money & identity touching |
| `src/services/sync-manager.ts` | **39.63** | 56.25 | 32.46 | Cloud upload queue — money-touching (drives quota) |
| `src/services/clone-bundle.ts` | **19.80** | 12.50 | 5.88 | Voice-clone uploads — PII & money-touching |
| `src/services/chatClient.ts` | **43.40** | 31.39 | 29.43 | Matrix session — identity-touching |
| `src/services/transcription.ts` | 69.12 | 78.26 | 46.80 | Core feature; near the 80% line |
| `src/services/windy-tune.ts` | **30.43** | 17.39 | 41.02 | Model-tuning flow |

## Modules at 0% coverage

(Zero tests exist. `tests/hardening/test-*.test.ts` hits none of them in the
black-box sense.)

- `src/services/engine-download.ts`
- `src/services/feedback.ts`
- `src/services/keyboard.ts`
- **`src/services/mailApi.ts`** — Wave-3 code shipped by me; zero tests
- `src/services/offline-packs.ts`
- `src/services/overlay.ts`
- `src/services/push-notifications.ts`
- `src/services/rating-prompt.ts`
- `src/services/storage-cloud.ts` — DEAD (Wave-3 left behind; see GAP_ANALYSIS P1-5)
- **`src/services/trust-monitor.ts`** — Wave-4 code shipped by me; zero tests
- `src/services/video-capture.ts`
- `src/services/whisper-manager.ts`
- `src/services/windytune-nudge.ts`

## Tests that mock something this service should integration-test

(See GAP_ANALYSIS P2-10 for the canonical list.) In short: every `jest.mock`
of an `@/services/*` module is a place where a contract could silently drift
between the mobile client and the server.

## What was NOT measured

- Coverage data is Jest-only. Screens under `src/app/` have no render-test
  coverage at all (no React Testing Library setup for expo-router routes).
- Coverage does not measure branch-taken counts for `try/catch` — a handler
  can be 100% covered yet untested under real error conditions.
- No integration test boots the real `identityApi + authedFetch + mail
  server`; the green `trustApi` suite for example mocks `fetch` rather than
  hitting any real URL.
