# Bucket C — Review Request

Five PRs from the Wave-7 batch-merge. Each touches auth, crypto, identity, or
license enforcement, or changes deep-link routing that affects those systems.
Buckets A + B merged cleanly; these are the ones that need a second pair of
eyes before landing. Test baseline after Bucket A + B: **3 failed / 777
passed / 786 total**, all 3 failures are pre-existing P1-6 RECORDING_LIMITS
drift.

## [#1](https://github.com/sneakyfree/windy-pro-mobile/pull/1) — GAP ANALYSIS — what's actually broken before launch

**Why high-risk** — mixed PR: the gap-analysis doc is safe, and the P0-3 Play
Store URL string fix is a one-line swap. But the PR also ships P1-1
`sanitizeMatrixRoomId()` in `src/app/_layout.tsx`, which changes how
`windychat://room/{id}` deep-links are routed. Matrix room IDs have
flexible grammar (`!localpart:server`, `#alias:server`, or opaque
router-friendly IDs) and a sanitizer too strict rejects legitimate
deep-links silently with just a warn log — the user taps the SMS, nothing
visible happens.

**What needs eyes** — the regex on line 81-92 (new
`sanitizeMatrixRoomId` helper): does it accept every canonical Matrix ID
your Chat app actually emits? Check fixtures from a live chat session.
Also confirm no current `windychat://room/...` URLs in SMS templates,
mail signatures, or onboarding flows use a shape the sanitizer rejects.

**Post-merge smoke** — send yourself a `windychat://room/!realRoom:chat.windychat.ai`
link via SMS, tap it, confirm it opens the correct Matrix room (not the
`/(tabs)/chat` fallback). Then try `windychat://room/..%2Fauth%2Flogin`
and confirm it falls back without routing.

---

## [#2](https://github.com/sneakyfree/windy-pro-mobile/pull/2) — fix(webview): lock JWT-injecting WebViews to our own origins (P0-1, P0-2)

**Why high-risk** — tightens `originWhitelist` on the Chat tab WebView
(`(tabs)/chat.tsx:193`) and the Mail reader WebView
(`mail/[id].tsx:57`). Both WebViews pre-inject the account-server JWT
into `localStorage` before content load, so unlimited origin was a
real token-theft surface. The fix is correct, but if `chat.windyword.ai`
ever legitimately redirects (an OAuth federation bounce, a CDN auth
handshake, a tracking domain), the Chat tab will break until reverted.
Mail is lower risk because `windymail.ai` has no known redirect chain.

**What needs eyes** — the `buildNavigationGuard` logic in
`src/lib/webviewOrigins.ts` (non-http(s) URLs pass through; anything
http(s) either matches the whitelist or gets opened in the system
browser via `Linking.openURL`). Confirm the chat web app doesn't embed
third-party iframes or load hard-coded resources from non-`chat.windyword.ai`
hosts.

**Post-merge smoke** — Chat tab: send a voice message (mic grant still
works), send a photo (camera grant still works), tap a hyperlink inside
a chat message that points to an external domain (should open in system
browser, not in-WebView). Mail reader: open any message, confirm it
renders; tap any link inside, confirm system browser opens.

---

## [#4](https://github.com/sneakyfree/windy-pro-mobile/pull/4) — feat(auth): client-side JWT exp check on restore + isAuthenticated (P1-2)

**Why high-risk** — modifies the session-restore path in
`src/services/identityApi.ts`. On boot, if the stored access token's
`exp` claim is in the past (minus a 30 s grace), the new code skips
hydration and either runs a refresh (if refresh-token exists) or
logs the user out. If my `exp`-parse has a bug, legitimate users get
unnecessarily logged out on every app open.

**What needs eyes** — `isTokenExpired(token, graceSeconds)` at line
399-407. Check: what happens if `exp` is a string instead of a
number (legacy JWT format), what happens if `exp` is missing (current
behaviour: return false, trust the server — this is correct), what
happens with a token whose `exp` is in 29 seconds (within grace, should
still be accepted).

**Post-merge smoke** — sign in, force-quit, roll the system clock forward
by 16 min, reopen. App should silently refresh (not kick to login) if
the refresh-token is still valid. Then roll forward by 31 days (past
refresh-token TTL), reopen. App should kick to login screen.

---

## [#10](https://github.com/sneakyfree/windy-pro-mobile/pull/10) — feat(auth): device-code poll backoff + circuit breaker (P2-3)

**Why high-risk** — changes the polling loop in
`identityApi.pollForToken()`. Before: poll every 5 s for up to 15 min.
After: same baseline, but consecutive 5xx failures trigger exponential
backoff (3 failures before backoff starts; 6 failures triggers a hard
abort with "network" error). Also wires a new `onWarning` callback
that the DeviceCodeScreen uses to surface a "Having trouble reaching
the server" banner. If I got the state machine wrong, users either
give up too early (hard abort when server was about to respond) or
stare at a spinner longer than before.

**What needs eyes** — the while-loop body starting at line 179. The
`consecutiveFailures` counter is reset by `authorization_pending` /
`slow_down` responses (those are successful "still waiting" replies,
not failures). Confirm the reset is correct — a flaky server that
alternates 503 / authorization_pending won't infinite-retry.

**Post-merge smoke** — on the device-code screen, block
`/api/v1/oauth/token` via proxy / firewall and confirm the yellow
warning banner appears after ~15 s, then the hard-abort error UI
appears after ~3 min (5s × ~30 polls with backoff). Unblock and retry;
confirm normal flow resumes.

---

## [#13](https://github.com/sneakyfree/windy-pro-mobile/pull/13) — fix(license): actually start the heartbeat service at app init (P1-8)

**Why high-risk** — wires `heartbeatService.start()` in
`src/app/_layout.tsx`. This is a **product-behaviour change**:
license enforcement now runs in production for the first time.
Revoked licenses flip the client's `revoked` flag; server-side tier
downgrades propagate; pair-manager's grace-period gate at line 830
starts reading a timestamp that actually advances. A bug in the
existing heartbeat service (which has never run in production and
therefore has never been exercised against real traffic) could brick
paying users. The service has graceful fallback — `consecutiveFailures`
counter + tier-specific grace period (24h free / 7d pro / 14d translate
/ 30d translate_pro) — but those code paths have never been battle-tested.

**What needs eyes** — confirm `/api/v1/license/activate` is healthy
and returns the expected shape (`{ valid: boolean, tier?, revoked?,
reason? }`). Confirm no paying user's server-side tier differs from
their local SecureStore tier (a mismatch would flip them to the server
value on first heartbeat, which could be a surprise).

**Post-merge smoke** — a legitimate paying-user install: sign in, wait
for the immediate post-init heartbeat, confirm Pro features stay
unlocked. Then on the server side, revoke that user's license; reopen
the app; confirm the `revoked` banner appears and paid models lock
after grace. Also try a offline launch (airplane mode) — grace period
should kick in; Pro features still work for 7 days.
