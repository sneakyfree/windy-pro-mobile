# Merge Triage — wave-7-* PR queue

**16 open PRs**, total cumulative diff **5,645 lines** (2,804 additions, 2,841 deletions — two large cleanup PRs account for most of the deletions).

## Bucket A — MERGE NOW (7 PRs)

Pure-doc or tests-only. No production code paths touched; no user-visible behaviour change; test suites green on every branch.

- **#3** — test(wave3,wave4): cover mailApi + trust-monitor (P1-4) — 24 new unit tests for the two services I shipped at 0 % coverage. Zero production code changes.
- **#5** — docs: fix Android package + brand drift across deployment docs (P1-7) — sed rename `uk.thewindstorm.windypro` → `ai.windyword.app` in 8 docs + rewrite APP_STORE_METADATA / PLAY_STORE_LISTING for the Windy Word rename. Docs never ship in the app.
- **#6** — test: retire five password-flow test suites + port unique cases (P1-5) — deletes 1,481 lines of obsolete test files testing the removed password flow; adds 2 unique SecureStore edge cases to identityApi.test.ts. Cuts red-test count from 48 → 3. No production code touched.
- **#12** — docs: addendum — heartbeatService.start() is never called (new P1-8) — pure doc (flags the finding that #13 fixes).
- **#14** — test: lock ecosystem-status backend field-alias contract (P2-4) — 11 new `it.each` cases locking backend field aliases. Tests only.
- **#15** — test(crypto): negative / tamper tests for model-crypto.decrypt (P2-8) — 8 tamper-resistance tests + rewrite of the test-file-local expo-crypto mock to produce real avalanche (test scope only — production uses real SHA-256).
- **#16** — test(clone-bundle): coverage from 19.8 % → 94 % (P2-7, 1 of 3) — 29 new tests on clone-bundle.ts. No production changes.

## Bucket B — SAFE WITH SMOKE (4 PRs)

Real user-visible behaviour; well-tested; reversible if the smoke test reveals something.

- **#7** — refactor: delete dead cloud-sync + storage-cloud + legacy auth endpoints (P1-3) — deletes 1,205 lines, verified via grep that `cloudSyncService` + `cloudStorageClient` have zero non-test callers. **Smoke**: record a session, ensure it uploads via `sync-manager` (the live path) not the removed one.
- **#8** — fix(deeplink): validate share-intent params before forwarding to mail (P2-5) — new sanitization on `sharedText` / `sharedUrl`. Preventative (params currently unused by the mail tab) — but the path IS live. **Smoke**: Android Share → Windy Word with a normal web URL; confirm the mail tab receives non-null `sharedUrl`.
- **#9** — fix(mail): recovery UI on WebView load failure (P2-12) — new error state + retry button on `/mail/[id]`. Small, isolated. **Smoke**: open a mail message in airplane mode → confirm retry UI renders; disable airplane mode + tap Retry → message loads.
- **#11** — fix(cloud): wire real download + share on file row tap (P2-1) — net-new user feature (tap file → download → system Share sheet). Device-dependent: `Sharing.shareAsync` + `FileSystem.downloadAsync` behaviour vary. **Smoke**: physical device — tap a cloud recording → Share sheet → Save to Files → verify file opens.

## Bucket C — HIGH RISK (5 PRs)

Touches auth, crypto, identity, or license enforcement. Each needs a second pair of eyes on the diff and a focused manual verification step.

- **#1** — GAP ANALYSIS — what's actually broken before launch — mixed PR: ships the adversarial audit doc (safe) **plus** P0-3 Play Store URL fix (safe — pure string) **plus** P1-1 `sanitizeMatrixRoomId()` that changes `windychat://room/{id}` deep-link routing. Last piece is the reason this isn't pure merge-now. Review the regex + fallback-to-`/(tabs)/chat` branch; confirm no legitimate Matrix room IDs (which can contain `!`, `#`, `@`, `:`, `.`, `-`, `_`, `=`) get rejected.
- **#2** — fix(webview): lock JWT-injecting WebViews to our own origins (P0-1, P0-2) — ships the WebView origin whitelist + off-domain guard. Closes a real token-theft surface but also rewrites how navigation is handled in the Chat + Mail WebViews. If `chat.windyword.ai` ever legitimately redirects (OAuth federation, CDN auth, analytics bounce), the chat UI breaks until reverted.
- **#4** — feat(auth): client-side JWT exp check on restore + isAuthenticated (P1-2) — adds a 30 s grace `exp` check. Proactively refreshes on expired-at-restore, logs out if refresh fails. A bug in the exp parse → unnecessary logouts for legitimate users. Tested end-to-end; still auth-critical.
- **#10** — feat(auth): device-code poll backoff + circuit breaker (P2-3) — adds 3-retry threshold + exponential backoff + 6-retry abort in the sign-in polling loop. Changes timing of sign-in recovery on transient server failures. Bug → users who would have recovered now get a hard fail; or worse, users stuck in a retry loop.
- **#13** — fix(license): actually start the heartbeat service at app init (P1-8) — wires `heartbeatService.start()` in `_layout.tsx`. This is a **product behaviour change**: license revocations now propagate, tier downgrades now take effect, grace-period logic starts running for real. A bug in the existing heartbeat service (which has never run in production) could brick paying users. Verify `/api/v1/license/activate` endpoint health before merging.

## Bucket D — BLOCKED ON GRANT (0 PRs)

None of the open PRs are blocked on a decision. The decision-blocked items from `docs/GAP_ANALYSIS.md` (P1-6 RECORDING_LIMITS.pro, P2-2 Pro-UI gating, P2-6 biometric, P2-9 EternitasBadge) have no PRs yet.

## Bucket E — DEFER (0 PRs)

None of the PRs are P3 polish. Everything in the queue is actioning a P0, P1, or P2 item from the gap analysis.

---

## TOP 3 MUST-MERGE BEFORE LAUNCH

Ranked by real user pain that accumulates from launch day onwards.

1. **#1 — GAP ANALYSIS + P0-3 Play Store URL fix + P1-1 `windychat://room` sanitizer** — the Play Store package name fix is the direct-user-pain piece. `src/app/appstore/index.tsx:136` and `src/app/_layout.tsx:220` currently point at `uk.thewindstorm.windypro`. The real package per `app.json:49` is `ai.windyword.app`. Every "Rate on Play Store" tap and every "Update available" banner opens Play Store to a 404 listing. Every Android user, every update. Impossible not to ship.

2. **#2 — WebView origin tightening** — latent token-theft surface: both JWT-injecting WebViews (`(tabs)/chat.tsx:193`, `mail/[id].tsx:57`) trust every origin on the internet and pre-load the account-server JWT into `localStorage` before the page renders. One misconfigured CDN redirect out of `chat.windyword.ai` or `windymail.ai` — or a subdomain takeover — and the redirect target walks off with the user's session. No current incident, but shipping without this is accepting a known hole into our one-sign-in model.

3. **#13 — heartbeat.start() wired** — documented in #12 and fixed in #13: `heartbeatService.start()` has never run in production. Users whose tier was downgraded server-side (refunds, revokes) keep Pro access on-device until they manually log out. `pairManager.ts:830`'s grace-period check is reading a timestamp that never advances. Once revenue flows through the app, this is a direct money + fairness leak. Not a security exploit (the JWT signing key is server-side, so tier can't be forged), but a real correctness bug that shows up the moment the first refund is processed.

Honourable mention: **#5** (docs drift) is in Bucket A but has a launch-adjacent risk — if you paste from the stale `PLAY_STORE_LISTING.md` / `APP_STORE_METADATA.md` into the store console, the public listings go live with the wrong app name. Mitigated by your manual review during submission, but worth merging first if you want the docs to match the app.
