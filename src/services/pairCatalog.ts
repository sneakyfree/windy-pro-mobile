/**
 * 🧬 L0.2 — Pair Catalog Service
 * Load, cache, and query the translation pair catalog.
 *
 * - Catalog source: CDN fetch → AsyncStorage cache → bundled fallback (shared/pair-catalog.json)
 * - Purchases: expo-secure-store (sensitive)
 * - Catalog cache: AsyncStorage (non-sensitive, large) with 24-hour TTL
 *
 * Hardening (Strand L):
 *   - CDN fetch failure gracefully falls back to cache → bundled
 *   - Catalog entries validated on load (required fields check)
 *   - Corrupt/malformed JSON handled gracefully with cache cleanup
 *   - Cache has 24-hour TTL
 */
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLogger } from './logger';

const log = createLogger('PairCatalog');

// ─── Storage keys ────────────────────────────────────────────
const CATALOG_CACHE_KEY = 'windy_pair_catalog_cache';
const CATALOG_CACHE_TS_KEY = 'windy_pair_catalog_cache_ts';
const OWNED_PAIRS_KEY = 'windy_owned_pairs';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const CDN_CATALOG_URL = 'https://windypro.thewindstorm.uk/api/v1/pairs/catalog.json';

// ─── Types ───────────────────────────────────────────────────

export type PairQuality = 1 | 2 | 3 | 4 | 5;
export type PairQualityLabel = 'Basic' | 'Functional' | 'Good' | 'Very Good' | 'Excellent';
export type PairRegion = 'europe' | 'americas' | 'asia' | 'meaf' | 'other';
export type PairTier = 'free' | 'pro' | 'ultra' | 'max' | 'none';

export interface TranslationPair {
    id: string;
    source: string;
    target: string;
    sourceName: string;
    targetName: string;
    sourceFlag: string;
    targetFlag: string;
    bidirectional: boolean;
    sizeMB: number;
    quality: PairQuality;
    qualityLabel: PairQualityLabel;
    region: PairRegion;
    cdnUrl: string;
    description: string;
    popularity: number;
    includedInTier: PairTier;
    price: number;
    revenueCatProductId: string;
}

export interface PairBundle {
    id: string;
    name: string;
    description: string;
    emoji: string;
    pairCount: number;
    price: number;
    revenueCatProductId: string;
    includedPairIds: string[] | 'all_catalog_pairs' | 'all';
    note?: string;
}

// ─── Required fields for validation ──────────────────────────
const REQUIRED_PAIR_FIELDS: (keyof TranslationPair)[] = [
    'id', 'source', 'target', 'sourceName', 'targetName', 'cdnUrl', 'sizeMB', 'quality',
];

/**
 * Validate a single catalog entry has all required fields.
 */
function isValidPairEntry(entry: unknown): entry is TranslationPair {
    if (typeof entry !== 'object' || entry === null) return false;
    const obj = entry as Record<string, unknown>;

    for (const field of REQUIRED_PAIR_FIELDS) {
        if (obj[field] === undefined || obj[field] === null) return false;
    }

    // Type checks for critical fields
    if (typeof obj.id !== 'string' || obj.id.length === 0) return false;
    if (typeof obj.source !== 'string' || obj.source.length === 0) return false;
    if (typeof obj.target !== 'string' || obj.target.length === 0) return false;
    if (typeof obj.sourceName !== 'string') return false;
    if (typeof obj.targetName !== 'string') return false;
    if (typeof obj.cdnUrl !== 'string') return false;
    if (typeof obj.sizeMB !== 'number' || obj.sizeMB < 0) return false;
    if (typeof obj.quality !== 'number' || obj.quality < 1 || obj.quality > 5) return false;

    return true;
}

/**
 * Validate and filter catalog entries, logging warnings for invalid ones.
 */
function validateCatalog(data: unknown[]): TranslationPair[] {
    const valid: TranslationPair[] = [];
    let invalidCount = 0;

    for (const entry of data) {
        if (isValidPairEntry(entry)) {
            valid.push(entry);
        } else {
            invalidCount++;
        }
    }

    if (invalidCount > 0) {
        log.warn('validateCatalog', `Filtered out ${invalidCount} invalid catalog entries`, {
            validCount: valid.length,
            invalidCount,
        });
    }

    return valid;
}

// ─── Bundled fallback data ───────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-var-requires
const bundledCatalog: TranslationPair[] = require('../../shared/pair-catalog.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bundledBundles: PairBundle[] = require('../../shared/pair-bundles.json');

// ─── Service ─────────────────────────────────────────────────

class PairCatalogService {
    private catalog: TranslationPair[] = [];
    private bundles: PairBundle[] = [];
    private ownedPairIds: Set<string> = new Set();
    private initialized = false;

    /**
     * Load catalogs from CDN (with AsyncStorage cache fallback),
     * then load owned pairs from SecureStore.
     *
     * Priority: CDN → AsyncStorage cache (24h TTL) → bundled JSON
     */
    async loadCatalog(): Promise<TranslationPair[]> {
        log.entry('loadCatalog');

        // Load owned pairs first
        await this.loadOwnedPairs();

        // Try CDN → cache → bundled fallback
        try {
            const cached = await this.getCachedCatalog();
            if (cached) {
                this.catalog = cached;
                log.info('loadCatalog', 'loaded from cache', { count: cached.length });
            } else {
                const response = await fetch(CDN_CATALOG_URL, {
                    headers: { Accept: 'application/json' },
                });
                if (response.ok) {
                    let rawData: unknown;
                    try {
                        rawData = await response.json();
                    } catch (parseErr) {
                        throw new Error('CDN returned invalid JSON');
                    }

                    if (!Array.isArray(rawData)) {
                        throw new Error('CDN response is not an array');
                    }

                    // Validate catalog entries
                    const validData = validateCatalog(rawData);
                    if (validData.length > 0) {
                        this.catalog = validData;
                        await this.setCachedCatalog(validData);
                        log.info('loadCatalog', 'fetched from CDN', { count: validData.length });
                    } else {
                        throw new Error('CDN returned no valid catalog entries');
                    }
                } else {
                    throw new Error(`CDN returned ${response.status}`);
                }
            }
        } catch (err) {
            // Fallback to bundled JSON
            log.warn('loadCatalog', 'CDN/cache unavailable, using bundled catalog', {
                error: err instanceof Error ? err.message : String(err),
            });
            this.catalog = bundledCatalog;
        }

        this.bundles = bundledBundles;
        this.initialized = true;
        log.exit('loadCatalog', { count: this.catalog.length });
        return this.catalog;
    }

    /**
     * Get a single pair by ID.
     */
    getPair(id: string): TranslationPair | undefined {
        if (!id || typeof id !== 'string') return undefined;
        return this.ensureLoaded().find((p) => p.id === id);
    }

    /**
     * Search pairs by language name (source or target).
     */
    searchPairs(query: string): TranslationPair[] {
        const q = (query ?? '').toLowerCase().trim();
        if (!q) return this.ensureLoaded();
        return this.ensureLoaded().filter(
            (p) =>
                p.sourceName.toLowerCase().includes(q) ||
                p.targetName.toLowerCase().includes(q) ||
                p.source.toLowerCase() === q ||
                p.target.toLowerCase() === q
        );
    }

    /**
     * Filter pairs by region.
     */
    filterByRegion(region: PairRegion): TranslationPair[] {
        return this.ensureLoaded().filter((p) => p.region === region);
    }

    /**
     * Filter pairs by minimum quality stars.
     */
    filterByQuality(minStars: PairQuality): TranslationPair[] {
        return this.ensureLoaded().filter((p) => p.quality >= minStars);
    }

    /**
     * Get pairs included in a subscription tier.
     * Tiers are cumulative: pro includes free, ultra includes pro+free, etc.
     */
    getIncludedPairs(tier: PairTier): TranslationPair[] {
        const tierHierarchy: PairTier[] = ['free', 'pro', 'ultra', 'max'];
        const tierIndex = tierHierarchy.indexOf(tier);
        if (tierIndex === -1) return [];

        const includedTiers = tierHierarchy.slice(0, tierIndex + 1);
        return this.ensureLoaded().filter((p) => includedTiers.includes(p.includedInTier));
    }

    /**
     * Get all owned pair IDs from secure storage.
     */
    async getOwnedPairs(): Promise<string[]> {
        await this.loadOwnedPairs();
        return Array.from(this.ownedPairIds);
    }

    /**
     * Check if a specific pair is owned (purchased or included in tier).
     */
    isOwned(pairId: string): boolean {
        return this.ownedPairIds.has(pairId);
    }

    /**
     * Record a pair purchase in secure storage.
     */
    async recordPurchase(pairId: string): Promise<void> {
        log.entry('recordPurchase', { pairId });
        this.ownedPairIds.add(pairId);
        await this.saveOwnedPairs();
        log.exit('recordPurchase', { pairId, totalOwned: this.ownedPairIds.size });
    }

    /**
     * Record a bundle purchase — mark all included pairs as owned.
     */
    async recordBundlePurchase(bundleId: string): Promise<void> {
        log.entry('recordBundlePurchase', { bundleId });
        const bundle = this.bundles.find((b) => b.id === bundleId);
        if (!bundle) {
            log.warn('recordBundlePurchase', 'bundle not found', { bundleId });
            return;
        }

        if (bundle.includedPairIds === 'all' || bundle.includedPairIds === 'all_catalog_pairs') {
            // Mark ALL catalog pairs as owned
            for (const pair of this.ensureLoaded()) {
                this.ownedPairIds.add(pair.id);
            }
        } else {
            for (const pairId of bundle.includedPairIds) {
                this.ownedPairIds.add(pairId);
            }
        }

        await this.saveOwnedPairs();
        log.exit('recordBundlePurchase', { bundleId, totalOwned: this.ownedPairIds.size });
    }

    /**
     * Get all bundles.
     */
    getBundles(): PairBundle[] {
        return this.bundles.length > 0 ? this.bundles : bundledBundles;
    }

    /**
     * Get the full catalog (sync, returns cached).
     */
    getCatalog(): TranslationPair[] {
        return this.ensureLoaded();
    }

    // ─── Private helpers ─────────────────────────────────────

    private ensureLoaded(): TranslationPair[] {
        if (!this.initialized || this.catalog.length === 0) {
            // Return bundled as fallback if not yet initialized
            return bundledCatalog;
        }
        return this.catalog;
    }

    private async getCachedCatalog(): Promise<TranslationPair[] | null> {
        try {
            const tsRaw = await AsyncStorage.getItem(CATALOG_CACHE_TS_KEY);
            if (!tsRaw) return null;

            const ts = parseInt(tsRaw, 10);
            if (isNaN(ts) || Date.now() - ts > CACHE_TTL_MS) {
                // Cache expired or corrupt timestamp — clean up
                await this.clearCatalogCache();
                return null;
            }

            const raw = await AsyncStorage.getItem(CATALOG_CACHE_KEY);
            if (!raw) return null;

            let parsed: unknown;
            try {
                parsed = JSON.parse(raw);
            } catch {
                // Corrupt JSON — clean up cache
                log.warn('getCachedCatalog', 'Corrupt catalog cache, clearing');
                await this.clearCatalogCache();
                return null;
            }

            if (!Array.isArray(parsed) || parsed.length === 0) return null;

            // Validate cached entries
            const valid = validateCatalog(parsed);
            return valid.length > 0 ? valid : null;
        } catch {
            return null;
        }
    }

    /**
     * Clear the catalog cache (used when corrupt data is detected).
     */
    private async clearCatalogCache(): Promise<void> {
        try {
            await AsyncStorage.multiRemove([CATALOG_CACHE_KEY, CATALOG_CACHE_TS_KEY]);
        } catch {
            // ignore
        }
    }

    private async setCachedCatalog(catalog: TranslationPair[]): Promise<void> {
        try {
            await AsyncStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(catalog));
            await AsyncStorage.setItem(CATALOG_CACHE_TS_KEY, String(Date.now()));
        } catch (err) {
            log.warn('setCachedCatalog', 'failed to cache catalog', {
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    private async loadOwnedPairs(): Promise<void> {
        try {
            const raw = await SecureStore.getItemAsync(OWNED_PAIRS_KEY);
            if (raw) {
                let parsed: unknown;
                try {
                    parsed = JSON.parse(raw);
                } catch {
                    log.warn('loadOwnedPairs', 'Corrupt owned pairs data, resetting');
                    this.ownedPairIds = new Set();
                    return;
                }
                if (Array.isArray(parsed)) {
                    this.ownedPairIds = new Set(
                        parsed.filter((v): v is string => typeof v === 'string')
                    );
                } else {
                    log.warn('loadOwnedPairs', 'Owned pairs data is not an array, resetting');
                    this.ownedPairIds = new Set();
                }
            }
        } catch (err) {
            log.warn('loadOwnedPairs', 'failed to load owned pairs', {
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    private async saveOwnedPairs(): Promise<void> {
        try {
            const ids = Array.from(this.ownedPairIds);
            await SecureStore.setItemAsync(OWNED_PAIRS_KEY, JSON.stringify(ids));
        } catch (err) {
            log.warn('saveOwnedPairs', 'failed to save owned pairs', {
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
}

// Singleton instance
export const pairCatalogService = new PairCatalogService();
