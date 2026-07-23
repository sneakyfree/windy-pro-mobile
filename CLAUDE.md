# CLAUDE.md — repo conventions for agents

## Branching policy

All code changes land on a feature branch and ship through a PR against `main`.
**No direct commits to `main` except for `docs/*`.**

### Wave-7 batch self-merge exception (wave-7-batch-only)

One-time exception approved for the Wave-7 audit batch-merge of 2026-04-17.
Bucket A PRs (pure doc or tests-only — no production code paths touched) may
be self-merged by the agent with `gh pr merge --squash --delete-branch
--admin`, with a `npm test` smoke between each merge. Baseline before the
batch: **3 red tests, all from `RECORDING_LIMITS.pro` drift (P1-6)** — any
new red is a regression and halts the batch.

This exception does NOT apply to:
- Bucket B (user-visible behaviour) — merged with full integration suite,
  not self-merged.
- Bucket C (auth / crypto / money / identity / deep-link routing) — human
  review required, agent writes review request, does not merge.
- Any future PR outside this specific Wave-7 batch.
- Any emergency "revert" — use the normal process, not `--admin`.

See `docs/MERGE_TRIAGE.md` for the bucket assignments.

## Tests

- `npm test` — full Jest suite.
- `npm test -- identityApi cloudApi trustApi` — Wave-3/4 subset (fastest green).
- `npx tsc --noEmit` — types.

## Windy Admin telemetry (INTEL-CONTRACT-V2)

> **Policy supersession (2026-07-08, Grant-approved):** this section
> previously said mobile ships NO telemetry emitter and NO ingest token.
> That policy is superseded by INTEL-CONTRACT-V2 §5
> (`windy-admin/docs/INTEL-CONTRACT-V2.md`), which gives windy-pro-mobile
> its own ingest service token. Rationale: a per-surface token is
> independently revocable, and this token is **low-trust, rotatable, and
> mobile-only — it authorizes nothing but event ingest**. Extraction from
> the app binary buys an attacker nothing beyond the ability to post
> validated, content-free telemetry events, and the token can be rotated
> at any time without touching any other surface.

Mobile emits the contract §1.1–1.8 client families (`session.*`,
`feature.usage.dictation`, `client.error`, `client.crash`, `wall.hit`,
`update.*`, `install.first_run.step`, `marketing.*`) to
`admin.windyword.ai` via the idempotent offline journal (`/v1/journal`),
and fetches `/v1/client/config` on launch + foreground (TTL-aware). The
emitter is `src/services/intel.ts` (+ `intelConfig.ts`, `IntelBanner.tsx`).

Client hard lines (do not weaken):
- Fire-and-forget background path — never blocks UI, never crashes the app
  if the ingest is down.
- **Inert unless configured**: hard no-op when the env below is unset.
- NO content, NO PII, no free-text, no geo in any event — counts,
  durations, codes, enums, opaque ids only. Validate before buffering.
- Banners only, one-tap dismissible, never during active recording or
  dictation. The only blocking surface is the contract-mandated
  `min_version` update wall.

Build-time configuration (values injected via `EXPO_PUBLIC` env — inlined
by Expo at bundle time; unset ⇒ telemetry is fully inert):
- `EXPO_PUBLIC_WINDY_ADMIN_INGEST_URL` — `https://admin.windyword.ai`
  (non-secret; committed in `eas.json` production profile).
- `EXPO_PUBLIC_WINDY_ADMIN_INGEST_TOKEN` — the mobile-only ingest token.
  **Name only here — never commit the value.** Grant sets it as an EAS
  env var for the production build (`eas env:create`); the value lives in
  the lockbox at `secrets/windy-admin/ingest-tokens.env`.

Mobile activity additionally remains observable server-side: every
meaningful mobile action lands as an event emitted by the backend it talks
to —

| Mobile action            | Emitting platform/service          | Event                                    |
|--------------------------|------------------------------------|------------------------------------------|
| Sign-up (native form)    | windy-pro / account-server         | `funnel.signup_completed`                |
| Hatch from the app       | windy-pro / account-server         | `hatch.started` / `hatch.completed`      |
| Agent + owner chat setup | windy-chat / chat-onboarding       | `hatch.agent_chat_provisioned` etc.      |
| Agent DM turns           | windy-chat / agent-roster          | `llm.call`, `roster.exchange`            |
| Push fanout              | windy-chat / push-gateway          | `chat.message_fanout`                    |

To verify during a stress session: drive the flow from the app, then tail
`https://admin.windyword.ai/v1/events/tail?platform=windy-pro` (and
`windy-chat`) with the `verify-oc5` read token from the lockbox
(`secrets/windy-admin/ingest-tokens.env`). Verified live 2026-07-08: in-app
signup + hatch + DM traffic all landed with the mobile user's identity ids.

## CI: self-hosted runner (since 2026-07)
GitHub Actions runs on OUR runner (kit0-windy-pro-mobile on the Kit 0 VPS), not GitHub's cloud.
Always `runs-on: [self-hosted, linux, x64]` — NEVER `ubuntu-latest` (billing-locked; runner-lint enforces).
Jobs stuck "Queued" = runner down, not billing: ssh Kit 0 → cd /home/github-runner/runners/windy-pro-mobile && sudo ./svc.sh status
Full runbook: ~/kit-army-config/docs/ci-runner-runbook.md
