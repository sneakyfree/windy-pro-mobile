# Known Test Failures at `wave-4-verified`

As of the `wave-4-verified` tag the **Wave 3 + Wave 4 code is green**:

- `npx tsc --noEmit` → exit 0, no errors
- Wave-specific tests pass: `identityApi.test.ts`, `trustApi.test.ts`,
  and the rewritten `cloudApi.test.ts` (shim) — 41 / 41 pass.

The full suite (`npm test`) still reports **7 failing suites / 48 failing
tests / 733 passing / 6 skipped (787 total)**. Each failing suite is
classified below. None is a regression of Wave 3 + 4 *code behaviour* — they
are either tests written against the password login flow that Wave 3
deliberately removed, or pre-existing drift unrelated to either wave.

## 1. Tests that exercised the removed password-login flow

Wave 3 replaced `cloudApi.login(email, password)` / `cloudApi.register(...)`
with the OAuth2 device-code flow owned by `identityApi`. The shim throws
`AuthFlowDeprecatedError` on those calls (by design — the ecosystem has a
single canonical IdP now). Any test file that still invokes those methods
fails at the first line of each `it(...)`.

These suites need to be either (a) deleted, (b) rewritten to prime the
mocked `identityApi` directly, or (c) kept only for the subset of tests
that don't touch auth:

- `tests/contract/test-cloud-api-contract.test.ts`
- `tests/contract/test-upload-contract.test.ts`
- `tests/hardening/test-offline-behavior.test.ts`
- `tests/hardening/test-secure-store.test.ts`
- `tests/stress/api-stress-test.test.ts`

The auth-critical coverage they used to provide (refresh mutex, 401 retry,
SecureStore persistence) is replaced by `src/services/__tests__/identityApi.test.ts`.
The non-auth coverage (upload queue, retry semantics, concurrent requests)
still has value and should be ported to the mocked-identity pattern that
`src/services/__tests__/cloudApi.test.ts` uses.

## 2. Tier constant drift

- `tests/contract/test-tier-contract.test.ts:73`
  `expect(RECORDING_LIMITS.pro).toBe(1800)` → actual 900. Unrelated to
  Wave 3 / 4 — predates both. A tier-limit constant was changed elsewhere
  without updating the contract test. Fix either the constant or the
  assertion.

## 3. Unrelated pre-existing failure

- `src/services/__tests__/license.test.ts` — does not touch the auth
  shim. Pre-existing; investigate independently.

## Running only the green Wave-3 / 4 subset

```bash
npm test -- identityApi cloudApi trustApi mailApi
```

(No `mailApi.test.ts` ships yet — Wave 3 covered the inbox client code but
the unit test is a follow-up.)
