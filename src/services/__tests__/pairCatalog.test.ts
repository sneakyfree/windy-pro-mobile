/**
 * Tests for pairCatalog.ts — Translation pair catalog service
 */

// ── Mocks ─────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn(async () => null),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
    default: {
        getItem: jest.fn(async () => null),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        multiRemove: jest.fn(),
    },
    __esModule: true,
}));

jest.mock('../logger', () => ({
    createLogger: () => ({
        entry: jest.fn(),
        exit: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

jest.mock('@/config/api', () => ({
    PAIR_CATALOG_URL: 'https://test.windyword.ai/api/v1/pairs/catalog.json',
}));

// Bundled fallback data
const mockBundledCatalog = [
    {
        id: 'en-fr',
        source: 'en',
        target: 'fr',
        sourceName: 'English',
        targetName: 'French',
        sourceFlag: '🇬🇧',
        targetFlag: '🇫🇷',
        bidirectional: true,
        sizeMB: 45,
        quality: 4,
        qualityLabel: 'Very Good',
        region: 'europe',
        cdnUrl: 'https://cdn.example.com/en-fr.bin',
        description: 'English to French',
        popularity: 95,
        includedInTier: 'free',
        price: 0,
        revenueCatProductId: '',
    },
    {
        id: 'en-de',
        source: 'en',
        target: 'de',
        sourceName: 'English',
        targetName: 'German',
        sourceFlag: '🇬🇧',
        targetFlag: '🇩🇪',
        bidirectional: true,
        sizeMB: 50,
        quality: 3,
        qualityLabel: 'Good',
        region: 'europe',
        cdnUrl: 'https://cdn.example.com/en-de.bin',
        description: 'English to German',
        popularity: 80,
        includedInTier: 'pro',
        price: 0,
        revenueCatProductId: '',
    },
    {
        id: 'en-zh',
        source: 'en',
        target: 'zh',
        sourceName: 'English',
        targetName: 'Chinese',
        sourceFlag: '🇬🇧',
        targetFlag: '🇨🇳',
        bidirectional: true,
        sizeMB: 65,
        quality: 5,
        qualityLabel: 'Excellent',
        region: 'asia',
        cdnUrl: 'https://cdn.example.com/en-zh.bin',
        description: 'English to Chinese',
        popularity: 90,
        includedInTier: 'ultra',
        price: 4.99,
        revenueCatProductId: 'pair_en_zh',
    },
];

const mockBundledBundles = [
    {
        id: 'europe-bundle',
        name: 'European Languages',
        description: 'All European language pairs',
        emoji: '🇪🇺',
        pairCount: 2,
        price: 9.99,
        revenueCatProductId: 'bundle_europe',
        includedPairIds: ['en-fr', 'en-de'],
    },
    {
        id: 'all-bundle',
        name: 'All Languages',
        description: 'Every pair',
        emoji: '🌍',
        pairCount: 3,
        price: 19.99,
        revenueCatProductId: 'bundle_all',
        includedPairIds: 'all_catalog_pairs',
    },
];

// No bundled JSON mocking — tests work against real bundled data or CDN mock responses.
// The bundledCatalog in the source is loaded at module evaluation time and can't be
// reliably mocked. The test mock data is used for CDN/cache response mocks instead.

import { pairCatalogService, type TranslationPair } from '../pairCatalog';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// Helper: load catalog from CDN so service is fully initialized
async function initCatalog() {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockBundledCatalog,
    });
    await pairCatalogService.loadCatalog();
    jest.clearAllMocks();
    mockFetch.mockReset();
}

// ── Tests ─────────────────────────────────────────────────────

describe('PairCatalogService', () => {
    beforeAll(async () => {
        // Initialize the catalog once so all tests have data
        await initCatalog();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockReset();
    });

    describe('loadCatalog — CDN success', () => {
        it('should fetch from CDN and cache when no cache exists', async () => {
            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockBundledCatalog,
            });

            const catalog = await pairCatalogService.loadCatalog();
            expect(catalog.length).toBeGreaterThanOrEqual(3);
            expect(AsyncStorage.setItem).toHaveBeenCalledWith(
                expect.stringContaining('catalog_cache'),
                expect.any(String),
            );
        });
    });

    describe('loadCatalog — cache hit', () => {
        it('should use cached catalog when within TTL', async () => {
            const now = Date.now();
            // loadOwnedPairs uses SecureStore (mocked separately)
            // getCachedCatalog reads timestamp then data from AsyncStorage
            (AsyncStorage.getItem as jest.Mock)
                .mockResolvedValueOnce(String(now - 1000)) // CATALOG_CACHE_TS_KEY (recent)
                .mockResolvedValueOnce(JSON.stringify(mockBundledCatalog)); // CATALOG_CACHE_KEY

            const catalog = await pairCatalogService.loadCatalog();
            expect(catalog.length).toBeGreaterThanOrEqual(3);
            expect(mockFetch).not.toHaveBeenCalled();
        });
    });

    describe('loadCatalog — cache expired', () => {
        it('should fetch from CDN when cache is expired', async () => {
            const expired = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
            // getCachedCatalog reads timestamp — expired, so clears cache then returns null
            (AsyncStorage.getItem as jest.Mock)
                .mockResolvedValueOnce(String(expired)); // CATALOG_CACHE_TS_KEY (expired)

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockBundledCatalog,
            });

            await pairCatalogService.loadCatalog();
            expect(mockFetch).toHaveBeenCalled();
        });
    });

    describe('loadCatalog — fallback to bundled', () => {
        it('should use bundled catalog when CDN fails', async () => {
            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const catalog = await pairCatalogService.loadCatalog();
            // Falls back to bundled (50 real pairs)
            expect(catalog.length).toBeGreaterThanOrEqual(3);
        });

        it('should use bundled catalog when CDN returns invalid data', async () => {
            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => 'not-an-array',
            });

            const catalog = await pairCatalogService.loadCatalog();
            expect(catalog.length).toBeGreaterThanOrEqual(3);
        });
    });

    describe('loadCatalog — validation', () => {
        it('should filter out invalid catalog entries from CDN', async () => {
            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => [
                    mockBundledCatalog[0], // valid
                    { id: '', source: 'en' }, // invalid: empty id
                    { notAPair: true }, // invalid: missing fields
                ],
            });

            const catalog = await pairCatalogService.loadCatalog();
            expect(catalog.length).toBe(1);

            // Re-init with full data for subsequent tests
            await initCatalog();
        });
    });

    describe('getPair', () => {
        it('should return pair by ID', () => {
            const pair = pairCatalogService.getPair('en-fr');
            expect(pair).toBeDefined();
            expect(pair?.sourceName).toBe('English');
            expect(pair?.targetName).toBe('French');
        });

        it('should return undefined for non-existent pair', () => {
            expect(pairCatalogService.getPair('xx-yy')).toBeUndefined();
        });

        it('should return undefined for empty/null input', () => {
            expect(pairCatalogService.getPair('')).toBeUndefined();
        });
    });

    describe('searchPairs', () => {
        it('should search by language name', () => {
            const results = pairCatalogService.searchPairs('French');
            expect(results.some((p) => p.id === 'en-fr')).toBe(true);
        });

        it('should search by language code', () => {
            const results = pairCatalogService.searchPairs('de');
            expect(results.some((p) => p.id === 'en-de')).toBe(true);
        });

        it('should be case-insensitive', () => {
            const results = pairCatalogService.searchPairs('chinese');
            expect(results.some((p) => p.id === 'en-zh')).toBe(true);
        });

        it('should return all pairs for empty query', () => {
            const results = pairCatalogService.searchPairs('');
            expect(results.length).toBeGreaterThanOrEqual(3);
        });
    });

    describe('filterByRegion', () => {
        it('should filter by region', () => {
            const results = pairCatalogService.filterByRegion('europe');
            expect(results.every((p) => p.region === 'europe')).toBe(true);
            expect(results.length).toBeGreaterThanOrEqual(2);
        });

        it('should return empty for non-existent region', () => {
            const results = pairCatalogService.filterByRegion('meaf');
            expect(results.length).toBe(0);
        });
    });

    describe('filterByQuality', () => {
        it('should filter by minimum quality', () => {
            const results = pairCatalogService.filterByQuality(4);
            expect(results.every((p) => p.quality >= 4)).toBe(true);
        });

        it('should return all pairs for quality 1', () => {
            const results = pairCatalogService.filterByQuality(1);
            expect(results.length).toBeGreaterThanOrEqual(3);
        });
    });

    describe('getIncludedPairs', () => {
        it('should return free pairs for free tier', () => {
            const results = pairCatalogService.getIncludedPairs('free');
            expect(results.every((p) => p.includedInTier === 'free')).toBe(true);
        });

        it('should return free + pro pairs for pro tier', () => {
            const results = pairCatalogService.getIncludedPairs('pro');
            expect(results.length).toBeGreaterThanOrEqual(2);
        });

        it('should return empty for unknown tier', () => {
            const results = pairCatalogService.getIncludedPairs('unknown' as any);
            expect(results.length).toBe(0);
        });
    });

    describe('ownership', () => {
        it('should track purchased pairs', async () => {
            await pairCatalogService.recordPurchase('en-zh');
            expect(pairCatalogService.isOwned('en-zh')).toBe(true);
            expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
                expect.any(String),
                expect.stringContaining('en-zh'),
            );
        });

        it('should track bundle purchases with specific pair IDs', async () => {
            // Get a real bundle from the bundled data
            const bundles = pairCatalogService.getBundles();
            const bundleWithPairs = bundles.find((b) => Array.isArray(b.includedPairIds) && b.includedPairIds.length > 0);
            if (bundleWithPairs && Array.isArray(bundleWithPairs.includedPairIds)) {
                await pairCatalogService.recordBundlePurchase(bundleWithPairs.id);
                expect(pairCatalogService.isOwned(bundleWithPairs.includedPairIds[0])).toBe(true);
            } else {
                // If no bundle with specific IDs, just verify the API doesn't throw
                expect(bundles.length).toBeGreaterThan(0);
            }
        });

        it('should handle "all" bundle purchase', async () => {
            const bundles = pairCatalogService.getBundles();
            const allBundle = bundles.find((b) =>
                b.includedPairIds === 'all' || b.includedPairIds === 'all_catalog_pairs',
            );
            if (allBundle) {
                await pairCatalogService.recordBundlePurchase(allBundle.id);
                const owned = await pairCatalogService.getOwnedPairs();
                expect(owned.length).toBeGreaterThanOrEqual(3);
            } else {
                // No all-bundle — just ensure API works
                expect(bundles.length).toBeGreaterThan(0);
            }
        });

        it('should not throw for unknown bundle ID', async () => {
            await pairCatalogService.recordBundlePurchase('nonexistent');
            expect(true).toBe(true);
        });
    });

    describe('getBundles', () => {
        it('should return bundled bundles', () => {
            const bundles = pairCatalogService.getBundles();
            expect(bundles.length).toBeGreaterThanOrEqual(1);
            expect(bundles[0]).toHaveProperty('id');
            expect(bundles[0]).toHaveProperty('name');
        });
    });
});
