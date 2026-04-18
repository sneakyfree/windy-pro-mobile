# Bucket D — Decisions Needed from Grant

**Zero PRs in this bucket.** No open PR is blocked on a decision.

But five open `GAP_ANALYSIS` items are blocked on your input, with no
corresponding PR yet — writing them here so they don't slip between
now and launch. Each is one-paragraph: what to choose between and what
the implications are.

## P1-6 — `RECORDING_LIMITS.pro`: 30 minutes or 15 minutes?

`src/services/license.ts:83` currently sets `pro: 900` (15 min) with a
comment "Bible v2". Both test suites (`license.test.ts:64,68` +
`test-tier-contract.test.ts:73`) expect `1800` (30 min). Your store
copy (`APP_STORE_METADATA.md:32` — "Pro ($49 one-time) — 30-minute
recordings") also says 30 min. Three sources say 30, one says 15.
Pick one and the 3 remaining red tests in the suite turn green.
Implication: if 15 is right, the store copy is false-advertising 30 min
recordings to buyers — material. If 30 is right, the constant is a
stale oversight. Either way, change one file.

## P2-2 — Gate Pro UI on heartbeat-verified tier (unblocked by #13)

Now that #13 wires the heartbeat, we can optionally add a second layer:
refuse to render Pro-unlocked UI until `heartbeatService.getStatus()`
has confirmed the tier with the server. Trade-off: safer (rejects
forged/stale JWTs with elevated tier) vs. 1-2 s of "Free tier" UI
shown to Pro users on first launch (before heartbeat completes).
Default: don't do it yet — the JWT can't be forged without the
server's signing key, so the exploit surface is narrow. But revisit
if you see credential-stuffing attempts in the logs.

## P2-6 — Biometric gating on SecureStore?

`expo-secure-store` today uses Keychain (iOS) + EncryptedSharedPreferences
(Android) with device-lock only. You can add `requireAuthentication:
true` per-key so Face ID / Touch ID is required before reading the JWT.
Trade-off: materially harder for a thief holding an unlocked device to
exfiltrate the session, at the cost of a biometric prompt every time
the app restores a session (every app resume, worst case). Banking
apps do this. Windy Word is not a banking app. Decision: do we care
enough about the thief-with-unlocked-device threat to add a Face ID
prompt on every resume? Default: no.

## P2-9 — Retire `EternitasBadge` in favour of `TrustBadge`?

Both currently coexist on `/agent/index.tsx:99-100`. Wave 4's
`TrustBadge` is simpler (pill, server-fetched band + score), but it
lacks the tap-to-view-passport modal the legacy `EternitasBadge`
provides. Two UX options: (a) replace `EternitasBadge` with
`TrustBadge` and accept the loss of the passport modal, (b) extend
`TrustBadge` with a tap-to-details sheet that reuses Eternitas's
new `/api/v1/trust/{passport}` data. (a) ships in 30 min; (b) is
~2 h. What's the user value of the passport modal?

## P1-8 follow-up — smoke test `/api/v1/license/activate` health

#13 is merged-or-ready-to-merge (pending Bucket C review). Before it
lands in production, confirm the license endpoint is healthy and
returns the expected `{ valid, tier?, revoked? }` shape. If it's
currently broken or never-been-hit-in-production, every paying user's
first foregrounding will enter the grace period and start a 7-day
countdown to lock. Decision: sanity-check the endpoint first, then
green-light the merge.
