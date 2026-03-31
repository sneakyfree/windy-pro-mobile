/**
 * Contract Test: Upload with X-Windy-Identity-Id
 * Verifies upload requests include correct auth headers and identity propagation.
 */

jest.mock('expo-secure-store', () => {
    const store: Record<string, string> = {};
    return {
        getItemAsync: jest.fn((key: string) => Promise.resolve(store[key] || null)),
        setItemAsync: jest.fn((key: string, value: string) => { store[key] = value; return Promise.resolve(); }),
        deleteItemAsync: jest.fn((key: string) => { delete store[key]; return Promise.resolve(); }),
        __store: store,
    };
});

const mockUploadAsync = jest.fn();

jest.mock('expo-file-system', () => ({
    uploadAsync: mockUploadAsync,
    downloadAsync: jest.fn(),
    makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
    FileSystemUploadType: { MULTIPART: 1 },
    documentDirectory: '/mock/docs/',
}));

jest.mock('@/stores/useSettingsStore', () => ({
    useSettingsStore: { getState: () => ({ setWindyIdentityId: jest.fn(), setTier: jest.fn() }) },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

function createFakeJwt(payload: Record<string, unknown>): string {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = btoa(JSON.stringify(payload));
    const sig = btoa('test-signature');
    return `${header}.${body}.${sig}`;
}

let cloudApi: typeof import('../../src/services/cloudApi').cloudApi;

beforeAll(() => {
    cloudApi = require('../../src/services/cloudApi').cloudApi;
});

describe('Upload Contract', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockReset();
        mockUploadAsync.mockReset();
        const store = (require('expo-secure-store') as any).__store;
        for (const key of Object.keys(store)) delete store[key];
    });

    describe('POST /api/storage/files/upload', () => {
        it('includes Authorization and X-Windy-Identity-Id headers', async () => {
            const fakeToken = createFakeJwt({
                sub: 'u-upload',
                windy_identity_id: 'wid-upload-123',
                tier: 'pro',
            });

            // Login first to set JWT and identity
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    token: fakeToken,
                    userId: 'u-upload',
                    refreshToken: 'rt-upload',
                }),
            });
            await cloudApi.login('upload@test.com', 'pass');

            // Mock successful upload
            mockUploadAsync.mockResolvedValueOnce({
                status: 200,
                body: JSON.stringify({ fileId: 'file-1' }),
            });

            const result = await cloudApi.uploadFile(
                'file:///test/recording.wav',
                'recording.wav',
                'audio/wav',
                { sessionId: 'sess-1' },
            );

            expect(result.success).toBe(true);
            expect(result.fileId).toBe('file-1');

            // Verify uploadAsync was called with correct args
            expect(mockUploadAsync).toHaveBeenCalledTimes(1);
            const [url, , opts] = mockUploadAsync.mock.calls[0];

            // Verify URL
            expect(url).toContain('/api/storage/files/upload');

            // Verify headers
            expect(opts.headers['Authorization']).toBe(`Bearer ${fakeToken}`);
            expect(opts.headers['X-Windy-Identity-Id']).toBe('wid-upload-123');

            // Verify upload type
            expect(opts.uploadType).toBe(1); // MULTIPART
            expect(opts.fieldName).toBe('file');
            expect(opts.mimeType).toBe('audio/wav');

            // Verify metadata
            expect(opts.parameters.metadata).toBe(JSON.stringify({ sessionId: 'sess-1' }));
        });

        it('does not include X-Windy-Identity-Id when identity is not set', async () => {
            const fakeToken = createFakeJwt({
                sub: 'u-no-id',
                tier: 'free',
                // No windy_identity_id
            });

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    token: fakeToken,
                    userId: 'u-no-id',
                }),
            });
            await cloudApi.login('noid@test.com', 'pass');

            mockUploadAsync.mockResolvedValueOnce({
                status: 200,
                body: JSON.stringify({ fileId: 'file-2' }),
            });

            await cloudApi.uploadFile('file:///test/file.wav', 'file.wav');

            const [, , opts] = mockUploadAsync.mock.calls[0];
            expect(opts.headers['Authorization']).toContain('Bearer');
            expect(opts.headers['X-Windy-Identity-Id']).toBeUndefined();
        });

        it('returns error when not authenticated', async () => {
            // Logout to clear auth
            await cloudApi.logout();

            const result = await cloudApi.uploadFile('file:///test/file.wav', 'file.wav');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Not authenticated');
            expect(mockUploadAsync).not.toHaveBeenCalled();
        });

        it('retries upload with new token after 401 + refresh', async () => {
            const loginToken = createFakeJwt({ sub: 'u-retry', windy_identity_id: 'wid-retry', tier: 'pro' });
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ token: loginToken, userId: 'u-retry', refreshToken: 'rt-retry' }),
            });
            await cloudApi.login('retry@test.com', 'pass');

            // First upload: 401
            mockUploadAsync.mockResolvedValueOnce({ status: 401, body: '{}' });

            // Refresh succeeds
            const newToken = createFakeJwt({ sub: 'u-retry', windy_identity_id: 'wid-retry', tier: 'pro' });
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ token: newToken, refreshToken: 'rt-new' }),
            });

            // Retry upload succeeds
            mockUploadAsync.mockResolvedValueOnce({
                status: 200,
                body: JSON.stringify({ fileId: 'file-retried' }),
            });

            const result = await cloudApi.uploadFile('file:///test/audio.wav', 'audio.wav');

            expect(result.success).toBe(true);
            expect(result.fileId).toBe('file-retried');

            // Should have been called twice (original + retry)
            expect(mockUploadAsync).toHaveBeenCalledTimes(2);

            // Retry should use new token
            const retryHeaders = mockUploadAsync.mock.calls[1][2].headers;
            expect(retryHeaders['Authorization']).toBe(`Bearer ${newToken}`);
            expect(retryHeaders['X-Windy-Identity-Id']).toBe('wid-retry');
        });
    });
});
