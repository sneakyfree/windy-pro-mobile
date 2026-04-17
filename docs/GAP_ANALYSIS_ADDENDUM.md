# GAP ANALYSIS — addendum (heartbeat discovery)

A follow-up finding from the Wave-7 audit. The primary `GAP_ANALYSIS.md`
lives on PR #1 (`wave-7-gap-analysis`). This addendum documents one item
that surfaced while investigating P2-2 — material enough to re-rank.

---

## P1-8 (new) — `heartbeatService.start()` is never called in production

**Severity** — **P1**. The license-verification heartbeat does not run.
Every licensed feature gate that depends on it is operating on default,
never-verified state. In practice this means a forged or stolen JWT's
tier claim is effectively trusted forever (until the user
manually logs out) because no server re-verification ever happens.

**Repro**

```bash
grep -rn "heartbeatService\.\(start\|performCheck\)" src/ --include="*.ts" --include="*.tsx" \
  | grep -v __tests__
```

Yields exactly two call sites, both in `src/services/heartbeat.ts`
itself (the declaration and an internal invocation). Nothing in
`src/app/_layout.tsx` starts the service, and no other service
imports it for that purpose. `pairManager.ts:830` calls
`heartbeatService.getStatus()` but the returned state is the in-memory
default (`lastSuccessTimestamp: 0`, `tier: 'free'`) — the service has
never loaded its persisted state, let alone attempted a network check.

**Why P1, not P0** — the practical exploit requires a forged JWT with
an elevated tier. Without the account-server's signing key the JWT
can't be forged, so the realistic attack surface is:
  1. Replay-after-theft (attacker gets the victim's actual tier, not
     an elevated one).
  2. A compromised account-server issuing a bad JWT (in which case
     heartbeat against the same server wouldn't catch it anyway).

The real cost today is **UX + correctness**, not security:
  - Users whose tier was downgraded server-side (refund, revoke)
    keep Pro access on-device until they manually log out.
  - Licenses that were revoked on the server don't flip the client's
    `revoked` flag; paid models keep downloading.
  - `pairManager`'s grace-period logic is meaningless — grace is
    measured from `lastSuccessTimestamp`, which never advances.

**Fix**

Add to `src/app/_layout.tsx`'s post-first-frame init block, next to
`trustMonitor.start()`:

```ts
import { heartbeatService } from '@/services/heartbeat';
// ...
heartbeatService.start();  // runs immediate performCheck + 15-min interval
```

Then P2-2 (tier-pre-heartbeat window) becomes a real concern and the
fix from the primary gap analysis (gate Pro UI on
`heartbeat.lastSuccess && tier`) applies. Until heartbeat runs, P2-2
is moot.

**Caveat for reviewer** — starting heartbeat causes `performCheck()`
to run on boot. If the `LICENSE_ACTIVATE` endpoint is unavailable,
the `consecutiveFailures` counter starts ticking up and the
grace-period logic activates. The service already handles this
gracefully (returns `valid` while within interval, `grace` during
grace window, `locked` only after grace expires), but be sure the
endpoint is healthy before enabling in prod.

**Source** — `src/services/heartbeat.ts:106-126` (`start()`
implementation); `src/services/heartbeat.ts:435` (singleton export);
`src/services/pairManager.ts:830` (lone `getStatus()` consumer).

---

## Correction to gap-analysis P2-2

The primary GAP_ANALYSIS described P2-2 as:

> `identityApi.persistTokens` mirrors the JWT's `tier` claim into
> Zustand. Paid features unlock immediately. The server heartbeat
> (`license.ts`) is the authoritative check and runs on app start +
> on resume. An attacker with a stolen pre-heartbeat JWT can unlock
> Pro for 5–10 s before heartbeat fails.

The 5-10 s window claim was wrong. Heartbeat doesn't run, so the
window is infinite. See P1-8 above. Any P2-2 fix has to land *after*
heartbeat is actually wired up.

## Correction to gap-analysis P1-3

The primary GAP_ANALYSIS estimated P1-3 (`storage-cloud.ts` cleanup)
at 45 minutes. The real scope (see PR #7) was larger — the file had
live recording-list methods that had to be verified unused first.
Actual delete: 1,205 lines across `storage-cloud.ts` +
`cloud-sync.ts` + tests. Time spent: ~90 min. Recording it for future
estimation honesty.
