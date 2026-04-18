# Known Test Failures (post-Wave-7)

## Current state

`npm test` → **2 failing suites / 3 failing tests / 703 passing / 6 skipped
(712 total)**. All 3 failures trace to a single source: the
`RECORDING_LIMITS.pro` constant drifted from `1800` (30 min) to `900`
(15 min) at some point under the "Bible v2" comment at
`src/services/license.ts:83`, but the product copy (`APP_STORE_METADATA.md`
line 32, "Pro ($49 one-time) — 30-minute recordings") and both test
suites still assume the old 30-minute value. Either the constant is wrong
or the copy + tests are wrong — needs a product call (**P1-6**).

Failing cases:

- `tests/contract/test-tier-contract.test.ts:73` — `RECORDING_LIMITS.pro`
  expected `1800`, got `900`.
- `src/services/__tests__/license.test.ts:64` — same.
- `src/services/__tests__/license.test.ts:68` — asserts `pro` equals
  `translate`; fails because `pro=900` vs `translate=1800`.

Fix is one line either way; not doing it here because I don't know the
right answer.

## What was resolved in Wave-7

Five test files that exercised the password-login flow that Wave 3
deliberately removed (`cloudApi.login()` / `cloudApi.register()` → now
throw `AuthFlowDeprecatedError`) were **deleted** on the
`wave-7-port-red-test-suites` branch:

- `tests/contract/test-cloud-api-contract.test.ts` — OAuth contract tests
  for the dead `/api/auth/login|register|refresh` endpoints. Equivalent
  coverage for the new OAuth device-code + refresh grants lives in
  `src/services/__tests__/identityApi.test.ts`.
- `tests/contract/test-upload-contract.test.ts` — upload contract gated on
  `cloudApi.login()` setup. Covered by the `uploadFile` cases in
  `src/services/__tests__/cloudApi.test.ts` (shim).
- `tests/hardening/test-offline-behavior.test.ts` — offline-queue tests
  gated on password login. The queue path itself is covered by the
  `queues on network error` case in the shim tests.
- `tests/hardening/test-secure-store.test.ts` — SecureStore failure modes
  during password login. Two representative cases (set rejects, get
  throws) were ported to `identityApi.test.ts` under the new
  `identityApi SecureStore resilience` describe block.
- `tests/stress/api-stress-test.test.ts` — 654 lines of concurrent login
  stress. Refresh-mutex coverage moved into the `refresh` + `authedFetch`
  tests on identityApi.

Net: **787 total → 712 total**; **48 failures → 3**.

## Running only the green Wave-3 / 4 subset

```bash
npm test -- identityApi cloudApi trustApi mailApi trust-monitor
```

(`mailApi.test.ts` and `trust-monitor.test.ts` land on the
`wave-7-mail-trust-monitor-tests` PR — see #3.)
