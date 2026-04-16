/**
 * In-memory holder for a deep link that arrived while the user was unauthed.
 * Consumed by the auth success handler so the user lands on the intended screen
 * instead of the default tabs route after signing in.
 *
 * Intentionally not persisted — if the process dies mid-auth, losing the deep
 * link is acceptable; the user can tap the original link again.
 */
import type { ParsedWindyUrl } from '@/lib/parseWindyUrl';

let pending: ParsedWindyUrl | null = null;

export const pendingDeepLink = {
    set(link: ParsedWindyUrl): void { pending = link; },
    peek(): ParsedWindyUrl | null { return pending; },
    consume(): ParsedWindyUrl | null {
        const out = pending;
        pending = null;
        return out;
    },
    clear(): void { pending = null; },
};
