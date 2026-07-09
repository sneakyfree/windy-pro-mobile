/**
 * 🧪 Intel client config (INTEL-CONTRACT-V2 §3) — message frequency caps,
 * scheduling windows, dismissal persistence, and TTL-respecting refresh.
 */

// In-memory AsyncStorage mock
const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: (k: string) => Promise.resolve(mockStorage.get(k) ?? null),
        setItem: (k: string, v: string) => { mockStorage.set(k, v); return Promise.resolve(); },
        removeItem: (k: string) => { mockStorage.delete(k); return Promise.resolve(); },
    },
}));

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

const HOUR = 3600_000;

function loadModule() {
    jest.resetModules();
    process.env.EXPO_PUBLIC_WINDY_ADMIN_INGEST_URL = 'https://admin.test.example';
    process.env.EXPO_PUBLIC_WINDY_ADMIN_INGEST_TOKEN = 'wai_test_token';
    return require('../intelConfig');
}

function msg(overrides: Record<string, unknown> = {}) {
    return {
        message_id: 'msg_a',
        campaign_id: 'camp_a',
        type: 'promo',
        priority: 10,
        title: 'Try Windy Translate',
        body: 'Now with 30 languages.',
        dismissible: true,
        frequency_cap: { max_impressions: 3, per_hours: 168, cooldown_hours: 24 },
        ...overrides,
    };
}

beforeEach(() => {
    mockStorage.clear();
    mockFetch.mockReset();
});

describe('frequency caps (client-enforced, §3)', () => {
    it('blocks after max_impressions inside per_hours', () => {
        const { intelConfig } = loadModule();
        const now = Date.now();
        const m = msg();
        expect(intelConfig.passesFrequencyCap(m, [], now)).toBe(true);
        // 3 impressions in the window (well past cooldown each) → capped
        const shown = [now - 6 * 24 * HOUR, now - 4 * 24 * HOUR, now - 2 * 24 * HOUR];
        expect(intelConfig.passesFrequencyCap(m, shown, now)).toBe(false);
        // Same count but outside the 168h window → allowed again
        const old = [now - 200 * HOUR, now - 190 * HOUR, now - 180 * HOUR];
        expect(intelConfig.passesFrequencyCap(m, old, now)).toBe(true);
    });

    it('honors cooldown_hours between shows', () => {
        const { intelConfig } = loadModule();
        const now = Date.now();
        const m = msg();
        expect(intelConfig.passesFrequencyCap(m, [now - 2 * HOUR], now)).toBe(false); // < 24h
        expect(intelConfig.passesFrequencyCap(m, [now - 25 * HOUR], now)).toBe(true);
    });
});

describe('pickMessage', () => {
    it('respects starts_at/ends_at windows', async () => {
        const { intelConfig } = loadModule();
        const future = new Date(Date.now() + 24 * HOUR).toISOString();
        const past = new Date(Date.now() - 24 * HOUR).toISOString();
        expect(await intelConfig.pickMessage([msg({ starts_at: future })])).toBeNull();
        expect(await intelConfig.pickMessage([msg({ ends_at: past })])).toBeNull();
        const live = await intelConfig.pickMessage([msg({ starts_at: past, ends_at: future })]);
        expect(live?.message_id).toBe('msg_a');
    });

    it('picks the highest-priority eligible message', async () => {
        const { intelConfig } = loadModule();
        const picked = await intelConfig.pickMessage([
            msg({ message_id: 'low', priority: 1 }),
            msg({ message_id: 'high', priority: 99 }),
        ]);
        expect(picked?.message_id).toBe('high');
    });

    it('never re-shows a dismissed message', async () => {
        const { intelConfig } = loadModule();
        await intelConfig.dismissMessage(msg());
        expect(await intelConfig.pickMessage([msg()])).toBeNull();
    });

    it('impressions recorded via recordImpression count against the cap', async () => {
        const { intelConfig } = loadModule();
        const m = msg({ frequency_cap: { max_impressions: 1, per_hours: 168, cooldown_hours: 0 } });
        expect(await intelConfig.pickMessage([m])).not.toBeNull();
        await intelConfig.recordImpression(m);
        expect(await intelConfig.pickMessage([m])).toBeNull();
    });

    it('snooze hides the message for cooldown_hours', async () => {
        const { intelConfig } = loadModule();
        const m = msg();
        await intelConfig.snoozeMessage(m);
        expect(await intelConfig.pickMessage([m])).toBeNull();
    });
});

describe('refresh TTL (§3 config_ttl_seconds)', () => {
    function configResponse(config: Record<string, unknown>) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(config) });
    }

    it('fetches on first refresh, then does NOT refetch inside the TTL', async () => {
        const { intelConfig } = loadModule();
        mockFetch.mockImplementation(() => configResponse({
            latest_version: '9.9.9', min_version: '0.0.1',
            messages: [], maintenance: null, config_ttl_seconds: 21600,
        }));
        await intelConfig.refresh();
        // config GET (+ possibly no journal traffic in this module)
        const configCalls = mockFetch.mock.calls.filter((c) => String(c[0]).includes('/v1/client/config'));
        expect(configCalls).toHaveLength(1);
        expect(String(configCalls[0][0])).toContain('platform=windy-word');
        expect(String(configCalls[0][0])).toContain('service=mobile-ios');

        await intelConfig.refresh(); // inside TTL → served from cache
        const configCalls2 = mockFetch.mock.calls.filter((c) => String(c[0]).includes('/v1/client/config'));
        expect(configCalls2).toHaveLength(1);
    });

    it('applies update-available state from latest_version', async () => {
        const { intelConfig, useIntelUiStore } = loadModule();
        mockFetch.mockImplementation(() => configResponse({
            latest_version: '99.0.0', min_version: '0.0.0',
            messages: [], maintenance: null, config_ttl_seconds: 21600,
        }));
        await intelConfig.refresh();
        const state = useIntelUiStore.getState();
        expect(state.updateRequired).toBeNull();
        expect(state.updateAvailable?.latestVersion).toBe('99.0.0');
    });

    it('applies the blocking wall when min_version > current', async () => {
        const { intelConfig, useIntelUiStore } = loadModule();
        mockFetch.mockImplementation(() => configResponse({
            latest_version: '99.0.0', min_version: '99.0.0',
            update_url: 'https://apps.apple.com/app/windy-word/id6759985867',
            messages: [], maintenance: null, config_ttl_seconds: 21600,
        }));
        await intelConfig.refresh();
        const state = useIntelUiStore.getState();
        expect(state.updateRequired).not.toBeNull();
        expect(state.updateAvailable).toBeNull();
    });

    it('fails quiet offline and serves last-good cache', async () => {
        const { intelConfig, useIntelUiStore } = loadModule();
        mockStorage.set('intel-config-cache', JSON.stringify({
            at: 1, // ancient → TTL lapsed
            config: { latest_version: '99.0.0', min_version: '0.0.0', messages: [], config_ttl_seconds: 60 },
        }));
        mockFetch.mockImplementation(() => Promise.reject(new Error('offline')));
        await expect(intelConfig.refresh()).resolves.toBeUndefined();
        expect(useIntelUiStore.getState().updateAvailable?.latestVersion).toBe('99.0.0');
    });
});
