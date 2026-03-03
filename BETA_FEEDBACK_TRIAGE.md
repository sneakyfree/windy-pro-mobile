# 🧪 Beta Feedback Triage — Windy Pro iOS

> **Last updated**: 2026-03-02 21:14 EST
> **Build**: `1.0.0` (2) · `e45abef`
> **Status**: TestFlight rollout — accepting tester feedback

---

## How to Add Feedback

1. Run `npx ts-node scripts/triage-feedback.ts` for interactive entry
2. Or add directly to the **Incoming Feedback** table below
3. Script auto-tags area and deduplicates against existing issues

---

## Incoming Feedback (Raw)

<!-- Paste tester reports here. Format: | Date | Tester | Raw Report | Device | iOS | -->

| Date | Tester | Raw Report | Device | iOS |
|------|--------|------------|--------|-----|
| — | — | _No feedback received yet_ | — | — |

---

## Normalized Issues

| ID | Area | Severity | Title | Repro Steps | Root Cause | Affected Files | Fix Plan | Status | Fixed In |
|----|------|----------|-------|-------------|------------|----------------|----------|--------|----------|
| BF-001 | history | P1 | `quality.score` null crash on malformed session | Open history with session missing quality data | No optional chaining on `quality.score` | `history.tsx`, `session/[id].tsx` | Defensive `?.score ?? 0` | ✅ Shipped | `e45abef` |
| BF-002 | session | P1 | loadSession unhandled exception crashes screen | Open session detail when storage corrupt | No try/catch on `getSession()` | `session/[id].tsx` | Wrap in try/catch + Alert | ✅ Shipped | `e45abef` |
| BF-003 | session | P1 | Clipboard/Share/Delete silent failures | Copy/share/delete with sandbox restrictions | No try/catch on Share/Clipboard | `session/[id].tsx` | try-catch + user Alerts | ✅ Shipped | `e45abef` |
| BF-004 | recording | P2 | No AppState backgrounding recovery | Background app during active recording | No `AppState` listener | `index.tsx` | Add AppState handler | ⬜ Deferred | — |

---

## Area Tags

| Tag | Screens / Modules |
|-----|-------------------|
| `recording` | `(tabs)/index.tsx`, `audio-capture.ts` |
| `translation` | `translate/index.tsx`, `translation.ts` |
| `history` | `(tabs)/history.tsx`, `storage-local.ts` |
| `session` | `session/[id].tsx` |
| `ocr` | `(tabs)/camera.tsx`, `ocr/index.tsx` |
| `deep-link` | `quick-translate.tsx`, `_layout.tsx` |
| `subscription` | `subscription/index.tsx`, `subscription.ts` |
| `onboarding` | `onboarding/index.tsx` |
| `accessibility` | All screens (VoiceOver, Dynamic Type) |
| `performance` | Services, hooks, memory mgmt |

---

## Severity Definitions

| Level | Criteria | Response Time |
|-------|----------|---------------|
| **P0** | Crash, data loss, security vulnerability | Hotfix within hours |
| **P1** | Broken feature, bad UX in core flow, silent failure | Fix in next batch (1-2 days) |
| **P2** | Polish, minor UI issue, non-critical edge case | Fix before GA or defer |

---

## Fix Batch Protocol

| Batch | Scope | Entry Criteria | Exit Criteria |
|-------|-------|----------------|---------------|
| **A** | P0 only | Any P0 in Normalized Issues | Typecheck + tests green, P0 verified fixed |
| **B** | P1 usability | All P0 shipped | Typecheck + tests green, a11y regression check |
| **C** | P2 polish | All P0+P1 shipped | Typecheck + tests green, no regressions |
