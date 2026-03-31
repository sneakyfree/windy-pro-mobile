/**
 * Mock API for offline development
 * Intercepts cloudApi calls when MOCK_API=true.
 *
 * Usage:
 *   import { initMockApi } from '@/services/mock-api';
 *   if (__DEV__) initMockApi();
 */
import { createLogger } from './logger';

const log = createLogger('MockApi');

// ─── Fake Data ─────────────────────────────────────────────────

const FAKE_USER_ID = 'mock-user-001';
const FAKE_EMAIL = 'dev@windypro.local';

/** Generates a fake JWT with all expected fields */
function fakeJwt(): string {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({
        sub: FAKE_USER_ID,
        email: FAKE_EMAIL,
        tier: 'pro',
        windy_identity_id: 'wid-mock-' + Date.now().toString(36),
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400,
    }));
    const sig = btoa('mock-signature');
    return `${header}.${payload}.${sig}`;
}

const FAKE_SESSIONS = Array.from({ length: 5 }, (_, i) => ({
    id: `mock-session-${i + 1}`,
    filename: `recording-${i + 1}.wav`,
    size: Math.floor(Math.random() * 5_000_000) + 500_000,
    contentType: 'audio/wav',
    uploadedAt: new Date(Date.now() - i * 86400000).toISOString(),
    metadata: {
        duration: String(Math.floor(Math.random() * 300) + 30),
        transcript: [
            'The quick brown fox jumps over the lazy dog.',
            'Hello, this is a test recording for development.',
            'Meeting notes from the product sync call.',
            'Voice memo: pick up groceries after work.',
            'Interview with the engineering team lead.',
        ][i],
        language: 'en',
        engine: 'cloud-standard',
    },
}));

// ─── Response Handlers ─────────────────────────────────────────

type MockHandler = (url: string, init?: RequestInit) => Promise<Response | null>;

const handlers: MockHandler[] = [
    // POST /api/auth/login
    async (url, init) => {
        if (!url.includes('/api/auth/login') || init?.method !== 'POST') return null;
        log.info('mock', 'Login → returning fake JWT');
        return new Response(JSON.stringify({
            token: fakeJwt(),
            refreshToken: 'mock-refresh-' + Date.now(),
            userId: FAKE_USER_ID,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },

    // POST /api/auth/register
    async (url, init) => {
        if (!url.includes('/api/auth/register') || init?.method !== 'POST') return null;
        log.info('mock', 'Register → returning fake JWT');
        return new Response(JSON.stringify({
            token: fakeJwt(),
            refreshToken: 'mock-refresh-' + Date.now(),
            userId: FAKE_USER_ID,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },

    // GET /api/storage/files
    async (url) => {
        if (!url.includes('/api/storage/files') || url.includes('/upload')) return null;
        log.info('mock', 'List files → returning 5 fake sessions');
        return new Response(JSON.stringify({ files: FAKE_SESSIONS }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
        });
    },

    // POST /api/v1/translate/text
    async (url, init) => {
        if (!url.includes('/api/v1/translate') || init?.method !== 'POST') return null;
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        log.info('mock', `Translate → echoing with prefix`);
        return new Response(JSON.stringify({
            translatedText: `[TRANSLATED] ${body.text || ''}`,
            sourceLanguage: body.from || 'en',
            targetLanguage: body.to || 'es',
            confidence: 0.95,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },

    // POST /api/v1/license/verify or /api/v1/license/activate
    async (url, init) => {
        if (!url.includes('/api/v1/license')) return null;
        log.info('mock', 'License verify → returning pro tier');
        return new Response(JSON.stringify({
            success: true,
            tier: 'pro',
            key: 'MOCK-PRO-KEY',
            billingType: 'lifetime',
            cloudSttEnabled: true,
            activatedAt: new Date().toISOString(),
            devicesUsed: 1,
            devicesMax: 5,
            features: ['all-engines', 'all-languages', 'cloud-sync', 'quality-scoring'],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },

    // GET /api/storage/health
    async (url) => {
        if (!url.includes('/api/storage/health') && !url.includes('/health')) return null;
        return new Response(JSON.stringify({
            status: 'ok',
            nodeId: 'mock-node',
            version: '2.0.0-mock',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
];

// ─── Interceptor ───────────────────────────────────────────────

let originalFetch: typeof globalThis.fetch | null = null;

/**
 * Initialize the mock API interceptor.
 * Monkey-patches global.fetch to intercept matching requests.
 * Non-matching requests pass through to the real fetch.
 */
export function initMockApi(): void {
    if (originalFetch) return; // Already initialized

    originalFetch = globalThis.fetch;
    log.info('init', 'Mock API enabled — intercepting network requests');

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

        for (const handler of handlers) {
            const response = await handler(url, init);
            if (response) return response;
        }

        // Pass through to real fetch for unmatched requests
        return originalFetch!(input, init);
    };
}

/**
 * Disable the mock API and restore the original fetch.
 */
export function disableMockApi(): void {
    if (originalFetch) {
        globalThis.fetch = originalFetch;
        originalFetch = null;
        log.info('disable', 'Mock API disabled — real network requests restored');
    }
}
