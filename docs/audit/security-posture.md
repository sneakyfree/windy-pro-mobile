# Security posture (Wave-7 audit)

Mobile threat model:

- The account-server at `windyword.ai` is the canonical IdP. A stolen JWT
  grants access to every Windy product (Word, Chat, Mail, Cloud, Clone, Fly).
  So token confidentiality is **the** thing we're protecting.
- Mobile is a client: it doesn't gate inbound bot requests, and has no
  CORS/rate-limit concerns of its own. Our surface is: deep-link phishing,
  WebView XSS → token exfiltration, SSRF via user-controlled URLs,
  insecure local storage, unverified JWT claim trust.

Below: every postural item I checked, verdict, and a link to the canonical
GAP_ANALYSIS entry.

| # | Area | Verdict | Detail / entry |
|---|---|---|---|
| 1 | CORS | N/A (client) | — |
| 2 | Rate limiting | N/A (client) — server side is the authority | — |
| 3 | Auth on non-public endpoints | Client enforces via `identityApi.authedFetch` which adds `Authorization: Bearer`; server is the authority. No code path bypasses it. | — |
| 4 | SQL injection | No SQL concatenation. SQLite is only accessed via `expo-sqlite` with prepared statements in `storage-local.ts`. Verified: no `db.exec` on raw user input. | — |
| 5 | XSS via user input in native RN | React Native `<Text>` escapes by default. One explicit sanitizer `stripHtml` at `chat/[roomId].tsx:36` strips tags before display of Matrix message text. | — |
| 5b | WebView injection / origin | **P0-1**: `(tabs)/chat.tsx:193` uses `originWhitelist=['https://*','http://*']` and injects `windy_auth_token` into every page. Any redirect out of `chat.windychat.ai` (misconfig or subdomain takeover) leaks the JWT. | P0-1 |
| 5c | WebView — mail reader | **P1-2**: `/mail/[id].tsx:57` injects JWT into `WINDY_MAIL_WEBVIEW_URL/webmail/message/{id}`. No `originWhitelist` → default allows all origins; same redirect-to-attacker token leak applies. | P1-2 |
| 6 | SSRF via user-controlled URLs | `trustApi.getTrust(passport)` encodes the passport but the base host `ETERNITAS_URL` is a constant. An attacker can't pivot the base URL. Share-intent `sharedUrl` is passed as a router param but not yet consumed by the mail tab; P2 exposure if the mail tab ever renders it. | P2-6 |
| 7 | Open redirect | Share-intent `sharedUrl` param is untrusted user input from Android SEND intents. Currently unused by consuming screens. Flagged to prevent regression. | P2-6 |
| 8 | JWT validation on the wire | mobile does not verify signatures — correct pattern (client trusts server-issued tokens). BUT: `exp` is not checked client-side; expired tokens spray to the server until a 401 bounces them. Minor — server is authoritative. | P2-7 |
| 9 | JWT claim trust | `tier`, `sub`, `email`, `windy_identity_id` extracted from the token payload and mirrored into Zustand + SecureStore **without** re-verification. Server heartbeat (`license.ts`) is the authoritative check and runs on app start + on resume. An attacker with a stolen pre-heartbeat window can unlock Pro for 5–10 s before heartbeat fails. | P2-5 |
| 10 | Biometric gating of SecureStore | Not configured. `expo-secure-store` defaults apply (keychain on iOS, EncryptedSharedPreferences on Android). On a jailbroken/rooted device with the device unlocked, an attacker can read the JWT. Matches industry-standard mobile posture; noted for future hardening. | P3 |
| 11 | Deep-link ID sanitization | `windyword://recording/{id}`, `windyclone://clone/{id}`, `windycloud://file/{id}` validated by `parseWindyUrl` against `/^[a-zA-Z0-9_-]{1,128}$/`. `windypro://session/{id}` validated by `sanitizeSessionId`. `windychat://room/{id}` **not** validated — see P1-1. | P1-1 |
| 12 | Pending-deep-link resume after auth | Kept in-memory only; an attacker cannot race another deep-link in because `pendingDeepLink.set` overwrites rather than queues. However a crafted deep-link that lands the user on an attacker-chosen screen post-auth is still the whole point of the contract. No redirect-to-external-URL vulnerability here because all targets are in-app routes. | — |
| 13 | Secrets in the bundle | 3 `EXPO_PUBLIC_*` env vars only: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_ETERNITAS_URL`, `EXPO_PUBLIC_SENTRY_DSN` — none are secrets (Sentry DSN is intentionally public). `app.json.extra.googleVisionApiKey` and the RevenueCat keys ARE shipped with the bundle; they are supposed to be public per each vendor. Verified no server-side secrets present. | — |
| 14 | Content-type guard on `.json()` | `mailApi.ts:64`, `ecosystem-status.ts:182`, `identityApi.ts` all wrap the `.json()` call in an outer `try/catch` so a Cloudflare challenge page or 502 HTML degrades to an error result instead of crashing. Safe. | — |
| 15 | Device-code poll circuit breaker | `identityApi.pollForToken` retries every 5 s until `expires_in` (900 s) without backoff. If the server is 502 for 14 min, the user stares at a spinner. P2 UX issue — no security impact. | P2-8 |
| 16 | Deprecated endpoint references | `storage-cloud.ts` still calls `AUTH_LOGIN`/`AUTH_REFRESH` (password flow) if `cloudStorageClient.login()` is invoked. Confirmed by `grep`: **no caller** invokes it; the file is dead weight but the `ENDPOINTS.AUTH_LOGIN`/`AUTH_REFRESH` constants remain, and a future developer who imports `cloudStorageClient` will hit `AuthFlowDeprecatedError`. | P1-5 |

No secrets were found in the current tree. `trufflehog`/`gitleaks` were not
run against git history in this session (out-of-band tooling). Recommend
a CI pass before GA.
