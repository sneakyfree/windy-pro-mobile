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
    pack_grand_tour: {
        id: 'pack_grand_tour',
        name: 'The Grand Tour',
        rcProductId: 'windy_pack_grand_tour',
        priceUsd: 129,
        emoji: '🇪🇺',
        pairCount: 1087,
        color: '#3B82F6',
        tagline: 'Paris to Prague to Porto',
    },
    pack_safari: {
        id: 'pack_safari',
        name: 'The Safari',
        rcProductId: 'windy_pack_safari',
        priceUsd: 79,
        emoji: '🌍',
        pairCount: 200,
        color: '#22C55E',
        tagline: 'Cairo to Cape Town',
    },
    pack_silk_road: {
        id: 'pack_silk_road',
        name: 'The Silk Road',
        rcProductId: 'windy_pack_silk_road',
        priceUsd: 59,
        emoji: '🌏',
        pairCount: 75,
        color: '#F59E0B',
        tagline: 'Dubai to Delhi',
    },
    pack_dragon: {
        id: 'pack_dragon',
        name: 'The Dragon',
        rcProductId: 'windy_pack_dragon',
        priceUsd: 49,
        emoji: '🐉',
        pairCount: 45,
        color: '#EF4444',
        tagline: 'Tokyo to Beijing — 1.5 billion people',
    },
    pack_archipelago: {
        id: 'pack_archipelago',
        name: 'The Archipelago',
        rcProductId: 'windy_pack_archipelago',
        priceUsd: 69,
        emoji: '🌺',
        pairCount: 170,
        color: '#EC4899',
        tagline: 'Bali to Fiji',
    },
    pack_explorer: {
        id: 'pack_explorer',
        name: 'The Explorer',
        rcProductId: 'windy_pack_explorer',
        priceUsd: 49,
        emoji: '🌎',
        pairCount: 75,
        color: '#8B5CF6',
        tagline: 'The Amazon to the Arctic',
    },
    pack_marco_polo: {
        id: 'pack_marco_polo',
        name: "Marco Polo's Magic Box",
        rcProductId: 'windy_pack_marco_polo',
        priceUsd: 399,
        emoji: '🧭',
        pairCount: -1, // All 3,500+
        color: '#d4a017',
        tagline: 'The whole world. Every language. One box.',
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
