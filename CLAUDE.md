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
