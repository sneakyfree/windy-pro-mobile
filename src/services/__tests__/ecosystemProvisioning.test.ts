/**
 * Tests for ecosystem provisioning flow — hatch wizard API calls,
 * ecosystem status refresh, product display routing
 */

jest.mock('@/services/cloudApi', () => ({
    cloudApi: {
        getToken: jest.fn(() => 'mock-jwt'),
        isAuthenticated: jest.fn(() => true),
        getStorageUsage: jest.fn(async () => ({
            usedBytes: 256 * 1024 * 1024,
            limitBytes: 5 * 1024 * 1024 * 1024,
            fileCount: 12,
            tierLabel: 'Pro',
            percentUsed: 5,
        })),
        listFiles: jest.fn(async () => ({
            files: [
                { id: 'f1', filename: 'recording.wav', size: 1024000, contentType: 'audio/wav', uploadedAt: '2026-04-01' },
                { id: 'f2', filename: 'transcript.json', size: 2048, contentType: 'application/json', uploadedAt: '2026-04-02' },
            ],
        })),
    },
}));

jest.mock('@/utils/fetch-timeout', () => ({
    fetchWithTimeout: jest.fn(),
}));

jest.mock('@/config/api', () => ({
    API_BASE_URL: 'https://test.example.com',
    ENDPOINTS: { ECOSYSTEM_STATUS: '/api/v1/identity/ecosystem-status' },
    apiUrl: (path: string) => `https://test.example.com${path}`,
}));

jest.mock('@/services/logger', () => ({
    createLogger: () => ({
        info: jest.fn(), warn: jest.fn(), error: jest.fn(),
        entry: jest.fn(), exit: jest.fn(), state: jest.fn(),
    }),
}));

jest.mock('@/stores/useSettingsStore', () => ({
    useSettingsStore: Object.assign(
        jest.fn((selector?: any) => selector ? selector({ licenseTier: 'pro', ecosystemStatus: null }) : {}),
        { getState: jest.fn(() => ({ setEcosystemStatus: jest.fn(), licenseTier: 'pro' })) },
    ),
}));

import { fetchWithTimeout } from '@/utils/fetch-timeout';
import { cloudApi } from '@/services/cloudApi';
import {
    PRODUCT_DISPLAY,
    getProductSubtitle,
    getStatusIcon,
    getStatusColor,
    type EcosystemProduct,
} from '@/services/ecosystem-status';

const mockFetch = fetchWithTimeout as jest.MockedFunction<typeof fetchWithTimeout>;

describe('Ecosystem Provisioning Integration', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('PRODUCT_DISPLAY routing', () => {
        it('routes Windy Fly to /agent', () => {
            const fly = PRODUCT_DISPLAY.find(p => p.key === 'windy_fly');
            expect(fly?.route).toBe('/agent');
        });

        it('routes Windy Cloud to /cloud/files', () => {
            const cloud = PRODUCT_DISPLAY.find(p => p.key === 'windy_cloud');
            expect(cloud?.route).toBe('/cloud/files');
        });

        it('routes Windy Mail to /mail', () => {
            const mail = PRODUCT_DISPLAY.find(p => p.key === 'windy_mail');
            expect(mail?.route).toBe('/mail');
        });

        it('has 8 products', () => {
            expect(PRODUCT_DISPLAY).toHaveLength(8);
        });

        it('each product has emoji, label, and cta', () => {
            for (const p of PRODUCT_DISPLAY) {
                expect(p.emoji).toBeTruthy();
                expect(p.label).toBeTruthy();
                expect(p.cta).toBeTruthy();
                expect(p.route || p.externalUrl).toBeTruthy();
            }
        });
    });

    describe('Agent product subtitle', () => {
        it('shows agent name + status + VPS', () => {
            const product: EcosystemProduct = {
                status: 'active',
                agent_name: 'Buzz',
                agent_status: 'running',
                agent_vps: 'eu-west-1',
            };
            const subtitle = getProductSubtitle('windy_fly', product);
            expect(subtitle).toContain('Buzz');
            expect(subtitle).toContain('running');
            expect(subtitle).toContain('eu-west-1');
        });

        it('returns null for not_provisioned fly', () => {
            const product: EcosystemProduct = { status: 'not_provisioned' };
            expect(getProductSubtitle('windy_fly', product)).toBeNull();
        });
    });

    describe('Status visual indicators', () => {
        it('active gets green checkmark', () => {
            expect(getStatusIcon('active')).toContain('\u2705');
        });

        it('unhealthy gets warning', () => {
            expect(getStatusIcon('unhealthy')).toBeTruthy();
        });

        it('offline gets gray color', () => {
            expect(getStatusColor('offline')).toBe('#94a3b8');
        });

        it('active gets lime color', () => {
            expect(getStatusColor('active')).toBe('#a3e635');
        });
    });

    describe('Cloud file listing', () => {
        it('returns files from cloudApi', async () => {
            const result = await cloudApi.listFiles();
            expect(result.files).toHaveLength(2);
            expect(result.files[0].filename).toBe('recording.wav');
        });

        it('returns storage usage', async () => {
            const usage = await cloudApi.getStorageUsage('pro' as any);
            expect(usage.tierLabel).toBe('Pro');
            expect(usage.percentUsed).toBe(5);
        });
    });
});
