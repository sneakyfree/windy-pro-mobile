/**
 * Tests for agent management — ecosystem product data, routing, status display
 */

jest.mock('@/services/cloudApi', () => ({
    cloudApi: { getToken: jest.fn(() => 'mock-jwt') },
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
    getProductSubtitle,
    getStatusLabel,
    getStatusColor,
    getStatusIcon,
    type EcosystemProduct,
    type EcosystemStatus,
} from '@/services/ecosystem-status';

describe('Agent Management Data', () => {
    describe('Fly agent product rendering', () => {
        it('shows full agent info when all fields present', () => {
            const product: EcosystemProduct = {
                status: 'active',
                agent_name: 'Jarvis',
                agent_status: 'running',
                agent_vps: 'us-east-1',
                passport_id: 'ET-AGENT-001',
                trust_score: 95,
                clearance_level: 4,
                matrix_user_id: '@windy_jarvis:chat.windypro.com',
                room_id: '!room:chat.windypro.com',
            };

            const subtitle = getProductSubtitle('windy_fly', product);
            expect(subtitle).toContain('Jarvis');
            expect(subtitle).toContain('running');
            expect(subtitle).toContain('us-east-1');
        });

        it('shows just name when minimal data', () => {
            const product: EcosystemProduct = {
                status: 'active',
                agent_name: 'Buzz',
            };
            expect(getProductSubtitle('windy_fly', product)).toBe('Buzz');
        });
    });

    describe('Eternitas passport rendering', () => {
        it('shows passport + trust + clearance', () => {
            const product: EcosystemProduct = {
                status: 'active',
                passport_id: 'ET-12345',
                trust_score: 87,
                clearance_level: 3,
            };
            const subtitle = getProductSubtitle('eternitas', product)!;
            expect(subtitle).toContain('ET-12345');
            expect(subtitle).toContain('87%');
            expect(subtitle).toContain('CL-3');
        });

        it('shows just passport when no trust/clearance', () => {
            const product: EcosystemProduct = {
                status: 'active',
                passport_id: 'ET-99999',
            };
            expect(getProductSubtitle('eternitas', product)).toBe('ET-99999');
        });
    });

    describe('Cloud storage rendering', () => {
        it('shows storage breakdown', () => {
            const product: EcosystemProduct = {
                status: 'active',
                storage_used_bytes: 1.5 * 1024 * 1024 * 1024,
                storage_limit_bytes: 5 * 1024 * 1024 * 1024,
            };
            const subtitle = getProductSubtitle('windy_cloud', product)!;
            expect(subtitle).toContain('1.50 GB');
            expect(subtitle).toContain('5.00 GB');
        });
    });

    describe('Mail rendering', () => {
        it('shows email address', () => {
            const product: EcosystemProduct = {
                status: 'active',
                email_address: 'grandma@windymail.ai',
            };
            expect(getProductSubtitle('windy_mail', product)).toBe('grandma@windymail.ai');
        });
    });

    describe('Status for all product types', () => {
        const allStatuses = ['active', 'unhealthy', 'pending', 'not_provisioned', 'upgrade_required', 'available', 'offline'] as const;

        for (const status of allStatuses) {
            it(`getStatusLabel returns string for ${status}`, () => {
                expect(typeof getStatusLabel(status)).toBe('string');
                expect(getStatusLabel(status).length).toBeGreaterThan(0);
            });

            it(`getStatusColor returns hex for ${status}`, () => {
                expect(getStatusColor(status)).toMatch(/^#[0-9a-f]{6}$/i);
            });

            it(`getStatusIcon returns string for ${status}`, () => {
                expect(typeof getStatusIcon(status)).toBe('string');
            });
        }
    });
});
