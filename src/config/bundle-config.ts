/**
 * 📦 Bundle Display Configuration
 * Pure display data for translation bundles in the marketplace UI.
 *
 * ⚠️  App Store Compliance Note:
 *   This file contains DISPLAY DATA ONLY — no purchase routing, no website URLs,
 *   no channel toggles. All purchases in-app go through RevenueCat (iOS/Android IAP).
 *   Website sales are handled entirely outside the app via windytraveler.com + Stripe.
 *   The app is agnostic to payment channel — it only knows the user's tier from the
 *   license server. This design complies with Apple App Store Guidelines 3.1.1.
 *
 * Entitlement model:
 *   1. User buys via App Store (RevenueCat)  → server sets tier
 *   2. User buys via website (Stripe)        → server sets tier
 *   3. App calls GET /api/v1/license/verify  → gets tier + pairsEntitled
 *   4. App unlocks models based on tier      → no knowledge of payment source
 */

// ─── Types ───────────────────────────────────────────────────

export interface BundleConfig {
    /** Internal bundle identifier */
    id: string;
    /** Display name */
    name: string;
    /** RevenueCat product ID for IAP */
    rcProductId: string;
    /** Price in USD (for display) */
    priceUsd: number;
    /** Emoji icon */
    emoji: string;
    /** Number of pairs in this bundle (-1 = all) */
    pairCount: number;
    /** Primary color for UI */
    color: string;
    /** Short description for the card */
    tagline: string;
}

// ─── Bundle Configuration ────────────────────────────────────

export const BUNDLE_CONFIG: Record<string, BundleConfig> = {
    traveler: {
        id: 'traveler',
        name: 'Traveler',
        rcProductId: 'windy_bundle_traveler',
        priceUsd: 49,
        emoji: '🧳',
        pairCount: 25,
        color: '#2dd4bf',
        tagline: 'Essential travel pairs',
    },
    polyglot: {
        id: 'polyglot',
        name: 'Polyglot',
        rcProductId: 'windy_bundle_polyglot',
        priceUsd: 149,
        emoji: '🗣️',
        pairCount: 200,
        color: '#a78bfa',
        tagline: 'For the language enthusiast',
    },
    marco_polo: {
        id: 'marco_polo',
        name: "Marco Polo's Magic Box",
        rcProductId: 'windy_bundle_marco_polo',
        priceUsd: 999,
        emoji: '🧭',
        pairCount: -1, // All 2,500+
        color: '#d4a017',
        tagline: 'Every pair, forever',
    },
};

// ─── Helper Functions ────────────────────────────────────────

/**
 * Get all bundle configs as an array (for iteration in UI).
 */
export function getAllBundles(): BundleConfig[] {
    return Object.values(BUNDLE_CONFIG);
}

/**
 * Get a specific bundle config.
 */
export function getBundleConfig(bundleId: string): BundleConfig | undefined {
    return BUNDLE_CONFIG[bundleId];
}
