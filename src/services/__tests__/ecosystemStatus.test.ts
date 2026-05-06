/**
 * Tests for ecosystem-status.ts — status helpers, product subtitle, API transform
 */

jest.mock('@/services/cloudApi', () => ({
    cloudApi: { getToken: jest.fn(() => 'mock-jwt-token') },
}));

jest.mock('@/utils/fetch-timeout', () => ({
    fetchWithTimeout: jest.fn(),
}));

jest.mock('@/config/api', () => ({
    ENDPOINTS: { ECOSYSTEM_STATUS: '/api/v1/identity/ecosystem-status' },
    apiUrl: (path: string) => `https://test.example.com${path}`,
}));

jest.mock('@/services/logger', () => ({
    createLogger: () => ({
        info: jest.fn(), warn: jest.fn(), error: jest.fn(),
        entry: jest.fn(), exit: jest.fn(), state: jest.fn(),
    }),
}));

import {
    getStatusLabel,
    getStatusColor,
    getStatusIcon,
    getProductSubtitle,
    getEcosystemStatus,
    type EcosystemProduct,
    type EcosystemStatus,
    type ProductStatus,
} from '../ecosystem-status';
import { fetchWithTimeout } from '@/utils/fetch-timeout';
import { cloudApi } from '@/services/cloudApi';

const mockFetch = fetchWithTimeout as jest.MockedFunction<typeof fetchWithTimeout>;

// ─── Status Helpers ────────────────────────────────────────────

describe('getStatusLabel', () => {
    it('returns correct labels for all statuses', () => {
        expect(getStatusLabel('active')).toBe('Active');
        expect(getStatusLabel('active', 'Custom detail')).toBe('Custom detail');
        expect(getStatusLabel('unhealthy')).toBe('Degraded');
        expect(getStatusLabel('pending')).toBe('Setting up...');
        expect(getStatusLabel('not_provisioned')).toBe('Not set up');
        expect(getStatusLabel('upgrade_required')).toBe('Upgrade required');
        expect(getStatusLabel('available')).toBe('Available');
        expect(getStatusLabel('offline')).toBe('Offline');
        expect(getStatusLabel('unknown_status' as any)).toBe('Unknown');
    });
});

describe('getStatusColor', () => {
    it('returns hex colors for all statuses', () => {
        expect(getStatusColor('active')).toBe('#a3e635');
        expect(getStatusColor('unhealthy')).toBe('#facc15');
        expect(getStatusColor('pending')).toBe('#facc15');
        expect(getStatusColor('not_provisioned')).toBe('#64748b');
        expect(getStatusColor('upgrade_required')).toBe('#f97316');
        expect(getStatusColor('available')).toBe('#60a5fa');
        expect(getStatusColor('offline')).toBe('#94a3b8');
    });
});

describe('getStatusIcon', () => {
    it('returns icons for all statuses', () => {
        expect(getStatusIcon('active')).toBeTruthy();
        expect(getStatusIcon('unhealthy')).toBeTruthy();
        expect(getStatusIcon('offline')).toBeTruthy();
        expect(getStatusIcon('not_provisioned')).toBeTruthy();
    });
});

// ─── Product Subtitle ──────────────────────────────────────────

describe('getProductSubtitle', () => {
    it('returns matrix user ID for chat', () => {
        const product: EcosystemProduct = {
            status: 'active',
            matrix_user_id: '@user:chat.windychat.ai',
        };
        expect(getProductSubtitle('windy_chat', product)).toBe('@user:chat.windychat.ai');
    });

    it('shows offline indicator for chat', () => {
        const product: EcosystemProduct = {
            status: 'active',
            matrix_user_id: '@user:chat.windychat.ai',
            online: false,
        };
        expect(getProductSubtitle('windy_chat', product)).toContain('offline');
    });

    it('returns email for mail', () => {
        const product: EcosystemProduct = {
            status: 'active',
            email_address: 'grant@windymail.ai',
        };
        expect(getProductSubtitle('windy_mail', product)).toBe('grant@windymail.ai');
    });

    it('returns storage breakdown for cloud', () => {
        const product: EcosystemProduct = {
            status: 'active',
            storage_used_bytes: 256 * 1024 * 1024,
            storage_limit_bytes: 5 * 1024 * 1024 * 1024,
        };
        const result = getProductSubtitle('windy_cloud', product);
        expect(result).toContain('256.0 MB');
        expect(result).toContain('5.00 GB');
    });

    it('returns passport + trust + clearance for eternitas', () => {
        const product: EcosystemProduct = {
            status: 'active',
            passport_id: 'ET-12345',
            trust_score: 85,
            clearance_level: 3,
        };
        const result = getProductSubtitle('eternitas', product)!;
        expect(result).toContain('ET-12345');
        expect(result).toContain('Trust: 85%');
        expect(result).toContain('CL-3');
    });

    it('returns agent name + status + vps for fly', () => {
        const product: EcosystemProduct = {
            status: 'active',
            agent_name: 'FlyBot',
            agent_status: 'running',
            agent_vps: 'eu-west-1',
        };
        const result = getProductSubtitle('windy_fly', product)!;
        expect(result).toContain('FlyBot');
        expect(result).toContain('running');
        expect(result).toContain('eu-west-1');
    });

    it('returns null for not_provisioned services', () => {
        const product: EcosystemProduct = { status: 'not_provisioned' };
        expect(getProductSubtitle('windy_chat', product)).toBeNull();
        expect(getProductSubtitle('windy_mail', product)).toBeNull();
    });
});

// ─── API Transform ─────────────────────────────────────────────

describe('getEcosystemStatus', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (cloudApi.getToken as jest.Mock).mockReturnValue('mock-jwt-token');
    });

    it('returns null when no token', async () => {
        (cloudApi.getToken as jest.Mock).mockReturnValue(null);
        expect(await getEcosystemStatus()).toBeNull();
    });

    it('returns null on HTTP error', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 500 } as any);
        expect(await getEcosystemStatus()).toBeNull();
    });

    it('returns null on network error', async () => {
        mockFetch.mockRejectedValue(new Error('Network error'));
        expect(await getEcosystemStatus()).toBeNull();
    });

    it('transforms backend response to mobile types', async () => {
        const backendResponse = {
            windy_identity_id: 'wid-123',
            email: 'test@example.com',
            tier: 'pro',
            creator_name: 'Test User',
            products: {
                windy_word: { status: 'active', tier: 'pro' },
                windy_chat: {
                    provisioned: true,
                    health: 'ok',
                    matrix_user_id: '@user:chat.windychat.ai',
                    status: 'active',
                },
                windy_mail: {
                    provisioned: true,
                    health: 'ok',
                    address: 'user@windymail.ai', // backend field name
                    status: 'active',
                },
                windy_cloud: {
                    provisioned: true,
                    health: 'ok',
                    status: 'active',
                    storage_used: 268435456,   // backend field name
                    storage_limit: 524288000,  // backend field name
                },
                eternitas: {
                    provisioned: true,
                    health: 'ok',
                    passport: 'ET-99999',      // backend field name
                    trust_score: 92,
                    status: 'active',
                },
                windy_fly: { status: 'not_provisioned', provisioned: false },
                windy_clone: { status: 'available', provisioned: false },
                windy_traveler: { status: 'active', provisioned: true },
            },
        };

        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(backendResponse),
        } as any);

        const result = await getEcosystemStatus();

        expect(result).not.toBeNull();
        expect(result!.windy_identity_id).toBe('wid-123');
        expect(result!.tier).toBe('pro');

        // Chat: matrix_user_id passed through
        expect(result!.products.windy_chat.matrix_user_id).toBe('@user:chat.windychat.ai');
        expect(result!.products.windy_chat.healthy).toBe(true);

        // Mail: 'address' → 'email_address'
        expect(result!.products.windy_mail.email_address).toBe('user@windymail.ai');

        // Cloud: storage_used → storage_used_bytes, storage_limit → storage_limit_bytes
        expect(result!.products.windy_cloud.storage_used_bytes).toBe(268435456);
        expect(result!.products.windy_cloud.storage_limit_bytes).toBe(524288000);

        // Eternitas: 'passport' → 'passport_id', trust_score passed through
        expect(result!.products.eternitas.passport_id).toBe('ET-99999');
        expect(result!.products.eternitas.trust_score).toBe(92);

        // Fly: not provisioned
        expect(result!.products.windy_fly.status).toBe('not_provisioned');
    });

    it('marks active services with health=down as unhealthy', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                windy_identity_id: 'wid-1',
                email: 'a@b.com',
                tier: 'free',
                products: {
                    windy_chat: { status: 'active', health: 'down', provisioned: true },
                },
            }),
        } as any);

        const result = await getEcosystemStatus();
        expect(result!.products.windy_chat.status).toBe('unhealthy');
        expect(result!.products.windy_chat.healthy).toBe(false);
    });

    it('fills missing products with not_provisioned defaults', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                windy_identity_id: 'wid-1',
                email: 'a@b.com',
                tier: 'free',
                products: {},
            }),
        } as any);

        const result = await getEcosystemStatus();
        expect(result!.products.windy_word.status).toBe('not_provisioned');
        expect(result!.products.windy_chat.status).toBe('not_provisioned');
        expect(result!.products.windy_mail.status).toBe('not_provisioned');
        expect(result!.products.windy_cloud.status).toBe('not_provisioned');
        expect(result!.products.windy_fly.status).toBe('not_provisioned');
        expect(result!.products.windy_clone.status).toBe('not_provisioned');
        expect(result!.products.windy_traveler.status).toBe('not_provisioned');
        expect(result!.products.eternitas.status).toBe('not_provisioned');
    });
});

// ─── Backend Field-Alias Contract ──────────────────────────────
//
// `getEcosystemStatus()` accepts multiple historical field names per product
// (e.g. backend has emitted `address` vs `email_address` for mail at
// different times). This table locks the current alias set so any
// future server rename lights up CI with a clear failure rather than
// silently dropping a field. When the server team pins a final name,
// delete the losing alias from both the transform code at
// ecosystem-status.ts:215-220 AND the corresponding row here.

describe('EcosystemStatus backend field-alias contract', () => {
    type AliasCase = {
        label: string;
        /** What the server sends (pre-transform). */
        serverProduct: Record<string, unknown>;
        /** Which mobile field we expect the server field to map into. */
        mobileField: keyof EcosystemProduct;
        expectedValue: unknown;
    };

    const ALIASES: AliasCase[] = [
        // Mail: backend has used `address` and `email_address`
        { label: 'windy_mail.address → email_address',
          serverProduct: { status: 'active', address: 'user@windymail.ai' },
          mobileField: 'email_address', expectedValue: 'user@windymail.ai' },
        { label: 'windy_mail.email_address passthrough',
          serverProduct: { status: 'active', email_address: 'u@m.ai' },
          mobileField: 'email_address', expectedValue: 'u@m.ai' },

        // Cloud storage: backend has used `storage_used` + `storage_used_bytes`
        { label: 'windy_cloud.storage_used → storage_used_bytes',
          serverProduct: { status: 'active', storage_used: 1024, storage_limit: 2048 },
          mobileField: 'storage_used_bytes', expectedValue: 1024 },
        { label: 'windy_cloud.storage_limit → storage_limit_bytes',
          serverProduct: { status: 'active', storage_used: 1024, storage_limit: 2048 },
          mobileField: 'storage_limit_bytes', expectedValue: 2048 },
        { label: 'windy_cloud.storage_used_bytes takes priority over storage_used',
          serverProduct: { status: 'active', storage_used: 1, storage_used_bytes: 99 },
          mobileField: 'storage_used_bytes', expectedValue: 99 },

        // Eternitas: backend has used `passport` and `passport_id`
        { label: 'eternitas.passport → passport_id',
          serverProduct: { status: 'active', passport: 'ET-1' },
          mobileField: 'passport_id', expectedValue: 'ET-1' },
        { label: 'eternitas.passport_id takes priority over passport',
          serverProduct: { status: 'active', passport: 'ET-old', passport_id: 'ET-new' },
          mobileField: 'passport_id', expectedValue: 'ET-new' },

        // Health: backend string `'ok'` | `'down'` → mobile boolean
        { label: 'health "ok" → healthy: true',
          serverProduct: { status: 'active', health: 'ok' },
          mobileField: 'healthy', expectedValue: true },
        { label: 'health "down" → healthy: false',
          serverProduct: { status: 'active', health: 'down' },
          mobileField: 'healthy', expectedValue: false },
        { label: 'no health field → healthy: undefined',
          serverProduct: { status: 'active' },
          mobileField: 'healthy', expectedValue: undefined },
    ];

    it.each(ALIASES)('$label', async ({ serverProduct, mobileField, expectedValue }) => {
        // Use windy_mail for mail aliases, windy_cloud for cloud, eternitas for passport,
        // windy_chat for health. Pick by which field we're testing.
        const productKey =
            mobileField === 'email_address' ? 'windy_mail'
            : mobileField === 'storage_used_bytes' || mobileField === 'storage_limit_bytes' ? 'windy_cloud'
            : mobileField === 'passport_id' ? 'eternitas'
            : 'windy_chat';

        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                windy_identity_id: 'wid', email: 'e@x', tier: 'pro',
                products: { [productKey]: serverProduct },
            }),
        } as any);

        const result = await getEcosystemStatus();
        expect(result).not.toBeNull();
        expect(result!.products[productKey][mobileField]).toBe(expectedValue);
    });
});
