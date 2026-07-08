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

## Windy Admin telemetry (stress-test contract)

Mobile is a **client app — it deliberately ships NO telemetry emitter and NO
ingest token**. A `WINDY_ADMIN_INGEST_TOKEN__*` bearer inside a public app
binary would be extractable by anyone; never add one, and never loosen the
ingest guard to accommodate a client.

Mobile activity is observable server-side by design: every meaningful mobile
action lands as an event emitted by the backend it talks to —

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
