/**
 * RevenueCat ↔ Windy identity sync.
 *
 * WHY THIS EXISTS: the server-side RevenueCat webhook (windy-pro
 * account-server, PR #269) can only match a purchase to a Windy account when
 * RevenueCat's app_user_id EQUALS the account-server user id — the webhook
 * resolves users.id → windy_identity_id → email. Without Purchases.logIn the
 * SDK generates an anonymous $RCAnonymousID and webhook provisioning silently
 * fails. subscriptionService.identify() existed but was never called from
 * production code (only tests) — this module is the production wiring.
 *
 * ID CHOICE: identityApi.getUserId() — the JWT `sub` claim, i.e. the
 * account-server users.id. That is the first key the webhook resolves.
 * (Note: identityApi's windyIdentityId falls back to `sub` when the
 * windy_identity_id claim is absent, so for current tokens the two coincide;
 * users.id is the safer canonical choice.)
 *
 * CHOKEPOINT: every auth entry point funnels through identityApi.emitChange —
 * device-code sign-in (pollForToken), in-app registration (register), session
 * restore on app start (restoreSession), token refresh, sign-out (logout) and
 * auth-expiry (handleAuthExpired). One onChange listener therefore covers
 * "identify after login", "identify returning users on app start", and
 * "disassociate on sign-out" without touching identityApi itself.
 *
 * GUARANTEES:
 *  - Idempotent: only re-syncs when the effective user id actually changes,
 *    so the ~15-min token refresh (which re-emits the same id) is a no-op and
 *    Purchases.logIn is never spammed.
 *  - Never blocks UI, never throws: all promise chains swallow errors
 *    (identify()/logout() already swallow their own too). Purchases stay
 *    usable anonymously if anything here fails.
 *  - Boot-race safe: subscriptionService.initialize() is awaited before
 *    identify(). initialize() is idempotent (early-returns once configured),
 *    so this never re-configures the SDK — it only closes the race where
 *    restoreSession resolves before RevenueCat finished configuring in
 *    _layout.tsx's Promise.allSettled boot block.
 */
import { identityApi } from './identityApi';
import { subscriptionService } from './subscription';

let lastSyncedUserId: string | null = null;

/** Test-only: reset the module-level dedupe state between test cases. */
export function _resetRevenueCatIdentitySyncForTests(): void {
    lastSyncedUserId = null;
}

/**
 * Reconcile the RevenueCat app_user_id with the current Windy auth state.
 * Safe to call repeatedly; no-ops unless the user id changed.
 */
export function syncRevenueCatIdentity(): void {
    const userId = identityApi.isAuthenticated() ? identityApi.getUserId() : null;
    if (userId === lastSyncedUserId) return;
    lastSyncedUserId = userId;

    if (userId) {
        // initialize() is idempotent — this never re-inits, it only waits out
        // the boot race. Fire-and-forget: a dead RC SDK must never break auth.
        subscriptionService.initialize()
            .then(() => subscriptionService.identify(userId))
            .catch(() => { /* never propagate — purchases stay anonymous */ });
    } else {
        // Signed out on this device — detach the RC identity so a shared
        // device doesn't cross-attribute the next user's purchases.
        subscriptionService.logout().catch(() => { /* never propagate */ });
    }
}

/**
 * Start syncing: run once immediately (restoreSession may already have
 * completed before the caller mounted) and subscribe to auth changes.
 * Returns the unsubscribe function.
 */
export function startRevenueCatIdentitySync(): () => void {
    syncRevenueCatIdentity();
    return identityApi.onChange(syncRevenueCatIdentity);
}
