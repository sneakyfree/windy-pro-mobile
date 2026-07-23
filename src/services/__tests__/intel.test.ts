/**
 * 🧪 Intel service (INTEL-CONTRACT-V2) — journal seq/ack, idempotent
 * retry, overflow cap, metadata guard, and the inert-unless-configured
 * hard line.
 */

// In-memory AsyncStorage mock
const storage = new Map<string, string>();
const mockGetItem = jest.fn((k: string) => Promise.resolve(storage.get(k) ?? null));
const mockSetItem = jest.fn((k: string, v: string) => { storage.set(k, v); return Promise.resolve(); });
const mockRemoveItem = jest.fn((k: string) => { storage.delete(k); return Promise.resolve(); });

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: (...a: unknown[]) => mockGetItem(...(a as [string])),
        setItem: (...a: unknown[]) => mockSetItem(...(a as [string, string])),
        removeItem: (...a: unknown[]) => mockRemoveItem(...(a as [string])),
    },
}));

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

const INGEST_URL = 'https://admin.test.example';
const INGEST_TOKEN = 'wai_test_token';

function loadIntel(configured = true) {
    jest.resetModules();
    if (configured) {
        process.env.EXPO_PUBLIC_WINDY_ADMIN_INGEST_URL = INGEST_URL;
        process.env.EXPO_PUBLIC_WINDY_ADMIN_INGEST_TOKEN = INGEST_TOKEN;
    } else {
        delete process.env.EXPO_PUBLIC_WINDY_ADMIN_INGEST_URL;
        delete process.env.EXPO_PUBLIC_WINDY_ADMIN_INGEST_TOKEN;
    }
    return require('../intel');
}

/** Let emit()'s async ensureLoaded → enqueue chain settle. */
async function settle() {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

function ack(status = 202, body: object = { accepted: 1, duplicate: false }) {
    return Promise.resolve({ status, ok: status < 300, json: () => Promise.resolve(body) });
}

beforeEach(() => {
    storage.clear();
    mockFetch.mockReset();
    mockGetItem.mockClear();
    mockSetItem.mockClear();
});

describe('inert unless configured', () => {
    it('emit + flush are hard no-ops without env', async () => {
        const { intelService, intelEnabled } = loadIntel(false);
        expect(intelEnabled()).toBe(false);
        intelService.emit('session.start', { os: 'ios' });
        await settle();
        await intelService.flush();
        expect(mockFetch).not.toHaveBeenCalled();
        expect(storage.get('intel-queue')).toBeUndefined();
    });
});

describe('journal batching + seq/ack (contract §2)', () => {
    it('posts a batch at seq 0 and advances seq only after a 2xx ack', async () => {
        const { intelService } = loadIntel();
        intelService.emit('session.start', { os: 'ios', app_version: '2.0.0' });
        await settle();

        mockFetch.mockImplementationOnce(() => ack(202));
        await intelService.flush();

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toBe(`${INGEST_URL}/v1/journal`);
        expect(init.headers.Authorization).toBe(`Bearer ${INGEST_TOKEN}`);
        const body = JSON.parse(init.body);
        expect(body.batch_seq).toBe(0);
        expect(typeof body.journal_id).toBe('string');
        expect(body.events).toHaveLength(1);
        expect(body.events[0].event_type).toBe('session.start');
        expect(body.events[0].platform).toBe('windy-word');
        expect(body.events[0].service).toBe('mobile-ios');
        expect(storage.get('intel-seq')).toBe('1');

        // Next event goes out at seq 1
        intelService.emit('session.end', { reason: 'background' });
        await settle();
        mockFetch.mockImplementationOnce(() => ack(202));
        await intelService.flush();
        expect(JSON.parse(mockFetch.mock.calls[1][1].body).batch_seq).toBe(1);
    });

    it('keeps the unacked batch and replays the EXACT same seq+payload on retry', async () => {
        const { intelService } = loadIntel();
        intelService.emit('feature.usage.dictation', { seconds: 5, language: 'en-US', engine_tier: 'light', on_device: true });
        await settle();

        mockFetch.mockImplementationOnce(() => Promise.reject(new Error('offline')));
        await intelService.flush();
        expect(storage.get('intel-inflight')).toBeTruthy();
        expect(storage.get('intel-seq') ?? '0').toBe('0');

        mockFetch.mockImplementationOnce(() => ack(202));
        await intelService.flush();
        const first = JSON.parse(mockFetch.mock.calls[0][1].body);
        const second = JSON.parse(mockFetch.mock.calls[1][1].body);
        expect(second.batch_seq).toBe(first.batch_seq);
        expect(second.events).toEqual(first.events);
        expect(second.journal_id).toBe(first.journal_id);
        expect(storage.get('intel-inflight')).toBeUndefined();
    });

    it('treats a 200 duplicate replay as an ack (lost-ack path)', async () => {
        const { intelService } = loadIntel();
        intelService.emit('update.check', { current_version: '2.0.0', update_available: false });
        await settle();
        mockFetch.mockImplementationOnce(() => ack(200, { accepted: 0, duplicate: true }));
        await intelService.flush();
        expect(storage.get('intel-seq')).toBe('1');
        expect(storage.get('intel-inflight')).toBeUndefined();
    });

    it('drops the batch but advances past the seq on 409/422 (gaps allowed)', async () => {
        const { intelService } = loadIntel();
        intelService.emit('client.error', { code: 'x_test', surface: 'test' });
        await settle();
        mockFetch.mockImplementationOnce(() => ack(422, { detail: 'bad' }));
        await intelService.flush();
        expect(storage.get('intel-seq')).toBe('1');
        expect(storage.get('intel-inflight')).toBeUndefined();
    });
});

describe('queue cap (1000) → drop oldest + journal_overflow', () => {
    it('caps the buffer and queues a single client.error journal_overflow', async () => {
        const { intelService } = loadIntel();
        for (let i = 0; i < 1005; i++) {
            intelService.emit('feature.usage.tap', { count: i });
        }
        await settle();
        const queue = JSON.parse(storage.get('intel-queue') || '[]');
        expect(queue.length).toBeLessThanOrEqual(1001); // 1000 + overflow marker
        const overflows = queue.filter((e: any) => e.metadata?.code === 'journal_overflow');
        expect(overflows).toHaveLength(1);
    }, 20000); // 1005-emit loop needs headroom on a loaded 4-core CI box
});

describe('metadata guard (contract §0.3 — validate before buffering)', () => {
    it('drops events with content-ish metadata keys', async () => {
        const { intelService } = loadIntel();
        intelService.emit('client.error', { transcript: 'the actual words' });
        intelService.emit('client.error', { message_text: 'hello' });
        intelService.emit('client.error', { userPrompt: 'hi' });
        await settle();
        expect(JSON.parse(storage.get('intel-queue') || '[]')).toHaveLength(0);
    });

    it('allows the contract allowlist keys and typed values', async () => {
        const { intelService } = loadIntel();
        intelService.emit('marketing.impression', {
            message_id: 'msg_1', campaign_id: 'camp_1', surface: 'mobile', message_type: 'promo',
        });
        await settle();
        const queue = JSON.parse(storage.get('intel-queue') || '[]');
        expect(queue).toHaveLength(1);
        expect(queue[0].metadata.message_id).toBe('msg_1');
    });

    it('drops string values that look like emails (PII hard line)', () => {
        const { sanitizeMetadata } = loadIntel();
        expect(sanitizeMetadata({ who: 'a@b.com' })).toBeNull();
        expect(sanitizeMetadata({ code: 'mic_permission_denied' })).toEqual({ code: 'mic_permission_denied' });
    });
});

describe('helpers', () => {
    it('compareVersions orders semver numerically', () => {
        const { compareVersions } = loadIntel();
        expect(compareVersions('2.1.0', '2.0.9')).toBe(1);
        expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
        expect(compareVersions('1.9.0', '2.0.0')).toBe(-1);
        expect(compareVersions('2.0.10', '2.0.9')).toBe(1);
    });

    it('engineTier maps engines to the contract enum', () => {
        const { engineTier } = loadIntel();
        expect(engineTier('tiny')).toBe('ultralight');
        expect(engineTier('small')).toBe('light');
        expect(engineTier('medium')).toBe('standard');
        expect(engineTier('large-v3-turbo')).toBe('pro');
        expect(engineTier('cloud-standard')).toBe('cloud');
    });

    it('crashFrames strips paths and keeps only frame names', () => {
        const { crashFrames } = loadIntel();
        const stack = [
            'TypeError: x is not a function',
            '    at doThing (/Users/grant/app/src/services/foo.ts:12:3)',
            '    renderRow@http://localhost:8081/index.bundle:4411:22',
            '    at anonymous (address at main.jsbundle:1:999)',
        ].join('\n');
        const frames = crashFrames(stack);
        expect(frames.length).toBeGreaterThan(0);
        for (const f of frames) {
            expect(f).not.toMatch(/[/\\]/);
            expect(f).not.toMatch(/https?:/);
            expect(f).not.toMatch(/:\d+:\d+/);
        }
        expect(frames[0]).toContain('doThing');
        expect(frames[1]).toContain('renderRow');
    });
});
