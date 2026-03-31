/**
 * Deep Link Route Tests
 * Validates that all windypro:// deep link routes resolve correctly.
 */

// Mock expo-router
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
    router: { push: mockPush },
}));

// Mock expo-linking — replicates Expo's Linking.parse() for custom schemes
jest.mock('expo-linking', () => ({
    parse: (url: string) => {
        // windypro://translate?text=hello → { path: 'translate', queryParams: { text: 'hello' } }
        const schemeEnd = url.indexOf('://');
        const rest = schemeEnd >= 0 ? url.slice(schemeEnd + 3) : url;
        const [pathAndQuery] = rest.split('#');
        const qIdx = pathAndQuery.indexOf('?');
        const path = qIdx >= 0 ? pathAndQuery.slice(0, qIdx) : pathAndQuery;
        const queryParams: Record<string, string> = {};
        if (qIdx >= 0) {
            const qs = pathAndQuery.slice(qIdx + 1);
            qs.split('&').forEach((pair) => {
                const [k, v] = pair.split('=');
                if (k) queryParams[decodeURIComponent(k)] = decodeURIComponent(v || '');
            });
        }
        return { path: path || null, queryParams };
    },
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    getInitialURL: jest.fn(() => Promise.resolve(null)),
}));

// Mock dependencies
jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
}));
jest.mock('@/services/license', () => ({
    licenseService: {
        validateLicense: jest.fn().mockResolvedValue({ tier: 'pro', key: 'test-key' }),
    },
}));

import * as Linking from 'expo-linking';

// Simulate the deep link handler from _layout.tsx
const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;
const INPUT_LIMITS = { LICENSE_KEY: 64, TRANSLATE_TEXT: 5000 };
const TIER_1_LANGUAGES = new Set(['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh', 'ar', 'hi', 'ru', 'nl', 'sv', 'pl']);

function sanitizeSessionId(raw: string): string | null {
    if (!raw || raw.length > 128 || raw.includes('..') || raw.includes('/')) return null;
    return SAFE_ID_RE.test(raw) ? raw : null;
}

function sanitizeLangCode(code: unknown): string | null {
    if (typeof code !== 'string') return null;
    const cleaned = code.trim().toLowerCase().slice(0, 5);
    return TIER_1_LANGUAGES.has(cleaned) ? cleaned : null;
}

function sanitizeDeepLinkText(text: unknown): string | null {
    if (typeof text !== 'string') return null;
    const trimmed = text.trim().slice(0, INPUT_LIMITS.TRANSLATE_TEXT);
    return trimmed.length > 0 ? trimmed : null;
}

async function handleDeepLink(url: string): Promise<string | null> {
    const parsed = Linking.parse(url);

    // License activation
    if (parsed.path === 'license' && parsed.queryParams?.key) {
        const rawKey = String(parsed.queryParams.key).trim().slice(0, INPUT_LIMITS.LICENSE_KEY);
        if (!rawKey || !SAFE_ID_RE.test(rawKey)) return null;
        return '/license-activated';
    }

    // Session deep link
    if (parsed.path?.startsWith('session/')) {
        const rawId = parsed.path.replace('session/', '');
        const sessionId = sanitizeSessionId(rawId);
        if (!sessionId) return null;
        return `/session/${sessionId}`;
    }

    // Translate deep link
    if (parsed.path === 'translate') {
        const { text, from, to } = parsed.queryParams || {};
        const safeText = sanitizeDeepLinkText(text);
        if (safeText) {
            const params = new URLSearchParams();
            params.set('text', safeText);
            const safeFrom = sanitizeLangCode(from);
            const safeTo = sanitizeLangCode(to);
            if (safeFrom) params.set('from', safeFrom);
            if (safeTo) params.set('to', safeTo);
            return `/quick-translate?${params.toString()}`;
        }
        return '/translate';
    }

    // Static route map
    const routeMap: Record<string, string> = {
        'cloud': '/cloud',
        'clone': '/clone',
        'subscribe': '/subscription',
        'subscription': '/subscription',
        'video': '/video',
        'settings': '/(tabs)/settings',
    };

    const route = routeMap[parsed.path || ''];
    return route || null;
}

describe('Deep Link Routing', () => {
    beforeEach(() => {
        mockPush.mockClear();
    });

    describe('windypro://translate', () => {
        it('should open quick translate with text and language params', async () => {
            const route = await handleDeepLink('windypro://translate?text=hello&to=es');
            expect(route).toBe('/quick-translate?text=hello&to=es');
        });

        it('should open quick translate with all params', async () => {
            const route = await handleDeepLink('windypro://translate?text=hello&from=en&to=es');
            expect(route).toBe('/quick-translate?text=hello&from=en&to=es');
        });

        it('should open full translate screen without text param', async () => {
            const route = await handleDeepLink('windypro://translate');
            expect(route).toBe('/translate');
        });

        it('should reject invalid language codes', async () => {
            const route = await handleDeepLink('windypro://translate?text=hello&to=xx');
            expect(route).toBe('/quick-translate?text=hello');
        });
    });

    describe('windypro://session/{id}', () => {
        it('should open session detail with valid ID', async () => {
            const route = await handleDeepLink('windypro://session/abc-123_def');
            expect(route).toBe('/session/abc-123_def');
        });

        it('should reject path traversal in session ID', async () => {
            const route = await handleDeepLink('windypro://session/../etc/passwd');
            expect(route).toBeNull();
        });

        it('should reject overly long session IDs', async () => {
            const longId = 'a'.repeat(200);
            const route = await handleDeepLink(`windypro://session/${longId}`);
            expect(route).toBeNull();
        });
    });

    describe('windypro://clone', () => {
        it('should open clone dashboard', async () => {
            const route = await handleDeepLink('windypro://clone');
            expect(route).toBe('/clone');
        });
    });

    describe('windypro://settings', () => {
        it('should open settings tab', async () => {
            const route = await handleDeepLink('windypro://settings');
            expect(route).toBe('/(tabs)/settings');
        });
    });

    describe('windypro://subscribe', () => {
        it('should open paywall', async () => {
            const route = await handleDeepLink('windypro://subscribe');
            expect(route).toBe('/subscription');
        });

        it('should also work with /subscription', async () => {
            const route = await handleDeepLink('windypro://subscription');
            expect(route).toBe('/subscription');
        });
    });

    describe('windypro://license', () => {
        it('should trigger license activation with valid key', async () => {
            const route = await handleDeepLink('windypro://license?key=WINDY-PRO-ABC123');
            expect(route).toBe('/license-activated');
        });

        it('should reject keys with invalid characters', async () => {
            const route = await handleDeepLink('windypro://license?key=<script>alert(1)</script>');
            expect(route).toBeNull();
        });

        it('should reject missing key', async () => {
            const route = await handleDeepLink('windypro://license');
            expect(route).toBeNull();
        });
    });

    describe('unknown routes', () => {
        it('should return null for unknown deep links', async () => {
            const route = await handleDeepLink('windypro://nonexistent');
            expect(route).toBeNull();
        });
    });

    describe('input sanitization', () => {
        it('should sanitize session IDs (alphanumeric + dash + underscore only)', () => {
            expect(sanitizeSessionId('valid-id_123')).toBe('valid-id_123');
            expect(sanitizeSessionId('../../etc/passwd')).toBeNull();
            expect(sanitizeSessionId('id with spaces')).toBeNull();
            expect(sanitizeSessionId('')).toBeNull();
        });

        it('should validate language codes against tier-1 list', () => {
            expect(sanitizeLangCode('es')).toBe('es');
            expect(sanitizeLangCode('EN')).toBe('en');
            expect(sanitizeLangCode('xx')).toBeNull();
            expect(sanitizeLangCode(null)).toBeNull();
        });

        it('should sanitize deep link text (max length, trimming)', () => {
            expect(sanitizeDeepLinkText('hello')).toBe('hello');
            expect(sanitizeDeepLinkText('  hello  ')).toBe('hello');
            expect(sanitizeDeepLinkText('')).toBeNull();
            expect(sanitizeDeepLinkText(null)).toBeNull();
        });
    });
});
