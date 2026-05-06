/**
 * Tests for the agent hatch flow — API calls, response handling, error states
 */

const mockFetch = jest.fn();
jest.mock('@/utils/fetch-timeout', () => ({
    fetchWithTimeout: mockFetch,
}));

jest.mock('@/services/cloudApi', () => ({
    cloudApi: { getToken: jest.fn(() => 'mock-jwt') },
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
        jest.fn(() => ({})),
        { getState: jest.fn(() => ({ setEcosystemStatus: jest.fn() })) },
    ),
}));

import { cloudApi } from '@/services/cloudApi';

describe('Agent Hatch API Flow', () => {
    beforeEach(() => jest.clearAllMocks());

    it('calls agent/provision with correct payload', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                passport_number: 'ET-TEST-001',
                eternitas_provisioned: true,
                chat_provisioned: true,
                matrix_user_id: '@agent_ET-TEST-001:chat.windychat.ai',
                dm_room_id: '!room:chat.windychat.ai',
            }),
        });

        const token = cloudApi.getToken();
        const res = await mockFetch('https://test.example.com/api/v1/identity/agent/provision', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ agent_name: 'TestBot', model_id: 'free' }),
        });

        expect(mockFetch).toHaveBeenCalledWith(
            'https://test.example.com/api/v1/identity/agent/provision',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ agent_name: 'TestBot', model_id: 'free' }),
            }),
        );

        const data = await res.json();
        expect(data.passport_number).toBe('ET-TEST-001');
        expect(data.chat_provisioned).toBe(true);
        expect(data.dm_room_id).toBe('!room:chat.windychat.ai');
    });

    it('handles provision failure', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 502,
            json: async () => ({ error: 'Eternitas unavailable' }),
        });

        const res = await mockFetch('https://test.example.com/api/v1/identity/agent/provision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agent_name: 'FailBot' }),
        });

        expect(res.ok).toBe(false);
        const data = await res.json();
        expect(data.error).toBe('Eternitas unavailable');
    });

    it('handles pending provision (retry queued)', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                passport_number: 'ET-PEND-001',
                eternitas_provisioned: true,
                chat_provisioned: false,
                pending: true,
            }),
        });

        const res = await mockFetch('https://test.example.com/api/v1/identity/agent/provision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agent_name: 'PendBot' }),
        });

        const data = await res.json();
        expect(data.pending).toBe(true);
        expect(data.passport_number).toBe('ET-PEND-001');
    });

    it('returns null token when not authenticated', () => {
        (cloudApi.getToken as jest.Mock).mockReturnValueOnce(null);
        expect(cloudApi.getToken()).toBeNull();
    });

    it('sends model_api_key when brain requires it', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ passport_number: 'ET-KEY-001', eternitas_provisioned: true }),
        });

        await mockFetch('https://test.example.com/api/v1/identity/agent/provision', {
            method: 'POST',
            body: JSON.stringify({
                agent_name: 'KeyBot',
                model_id: 'openai',
                model_api_key: 'sk-test-123',
            }),
        });

        const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(callBody.model_api_key).toBe('sk-test-123');
        expect(callBody.model_id).toBe('openai');
    });
});
