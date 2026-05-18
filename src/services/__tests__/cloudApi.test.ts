/**
 * Shim-era tests for cloudApi. Auth lives in identityApi; cloudApi is now a
 * thin delegation layer, so these tests verify:
 *   - Deprecated password methods throw AuthFlowDeprecatedError
 *   - Getters and lifecycle delegate to identityApi
 *   - Storage APIs use identityApi's token + authedFetch + refresh
 *   - Unauthenticated health endpoints still work
 */

jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn().mockResolvedValue(null),
    setItemAsync: jest.fn().mockResolvedValue(undefined),
    deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-file-system', () => ({
    uploadAsync: jest.fn(),
    downloadAsync: jest.fn(),
    makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
    FileSystemUploadType: { MULTIPART: 1 },
    documentDirectory: '/mock/docs/',
}));

jest.mock('../ecosystem-status', () => ({
    getEcosystemStatus: jest.fn().mockResolvedValue(null),
}));

// Define the identityApi mock inline in the factory so it survives jest.mock
// hoisting (outer `const` references hit TDZ at factory-eval time).
jest.mock('../identityApi', () => ({
    identityApi: {
        restoreSession: jest.fn().mockResolvedValue(true),
        logout: jest.fn().mockResolvedValue(undefined),
        isAuthenticated: jest.fn().mockReturnValue(true),
        getToken: jest.fn().mockReturnValue('mock_jwt'),
        getUserId: jest.fn().mockReturnValue('user_1'),
        getEmail: jest.fn().mockReturnValue('u@ex.com'),
        getWindyIdentityId: jest.fn().mockReturnValue('identity_1'),
        setAuthExpiredHandler: jest.fn(),
        authedFetch: jest.fn(),
        refresh: jest.fn().mockResolvedValue(true),
    },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import * as FileSystem from 'expo-file-system/legacy';
import { cloudApi, AuthFlowDeprecatedError } from '../cloudApi';
import { identityApi } from '../identityApi';

// Short-hand typed handle to the mocked methods so the assertions are clean.
const mockIdentity = identityApi as unknown as {
    restoreSession: jest.Mock;
    logout: jest.Mock;
    isAuthenticated: jest.Mock;
    getToken: jest.Mock;
    getUserId: jest.Mock;
    getEmail: jest.Mock;
    getWindyIdentityId: jest.Mock;
    setAuthExpiredHandler: jest.Mock;
    authedFetch: jest.Mock;
    refresh: jest.Mock;
};

describe('cloudApi shim', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockReset();
        // Re-seed defaults after clearAllMocks wipes them.
        mockIdentity.isAuthenticated.mockReturnValue(true);
        mockIdentity.getToken.mockReturnValue('mock_jwt');
        mockIdentity.getWindyIdentityId.mockReturnValue('identity_1');
        mockIdentity.refresh.mockResolvedValue(true);
    });

    describe('deprecated password flow', () => {
        it('login() throws AuthFlowDeprecatedError', async () => {
            await expect(cloudApi.login('a', 'b')).rejects.toBeInstanceOf(AuthFlowDeprecatedError);
        });
        it('register() throws AuthFlowDeprecatedError', async () => {
            await expect(cloudApi.register('a', 'b')).rejects.toBeInstanceOf(AuthFlowDeprecatedError);
        });
    });

    describe('lifecycle delegation', () => {
        it('restoreSession delegates to identityApi', async () => {
            await cloudApi.restoreSession();
            expect(mockIdentity.restoreSession).toHaveBeenCalled();
        });
        it('logout delegates to identityApi', async () => {
            await cloudApi.logout();
            expect(mockIdentity.logout).toHaveBeenCalled();
        });
        it('setAuthExpiredHandler delegates', () => {
            const handler = () => {};
            cloudApi.setAuthExpiredHandler(handler);
            expect(mockIdentity.setAuthExpiredHandler).toHaveBeenCalledWith(handler);
        });
    });

    describe('getters read from identityApi', () => {
        it('getToken returns identityApi token', () => {
            expect(cloudApi.getToken()).toBe('mock_jwt');
        });
        it('isAuthenticated reflects identityApi state', () => {
            mockIdentity.isAuthenticated.mockReturnValue(false);
            expect(cloudApi.isAuthenticated()).toBe(false);
        });
        it('getWindyIdentityId reads through', () => {
            expect(cloudApi.getWindyIdentityId()).toBe('identity_1');
        });
    });

    describe('uploadFile', () => {
        it('fails when no token', async () => {
            mockIdentity.getToken.mockReturnValue(null);
            const r = await cloudApi.uploadFile('file:///a.wav', 'a.wav');
            expect(r.success).toBe(false);
            expect(r.error).toContain('Not authenticated');
        });
        it('succeeds on 2xx', async () => {
            (FileSystem.uploadAsync as jest.Mock).mockResolvedValue({
                status: 200,
                body: JSON.stringify({ fileId: 'f1' }),
            });
            const r = await cloudApi.uploadFile('file:///a.wav', 'a.wav');
            expect(r.success).toBe(true);
            expect(r.fileId).toBe('f1');
        });
        it('on 401, refreshes then retries once', async () => {
            (FileSystem.uploadAsync as jest.Mock)
                .mockResolvedValueOnce({ status: 401, body: '{}' })
                .mockResolvedValueOnce({ status: 200, body: JSON.stringify({ fileId: 'f2' }) });
            mockIdentity.refresh.mockResolvedValue(true);
            mockIdentity.getToken
                .mockReturnValueOnce('old_jwt')
                .mockReturnValue('new_jwt');
            const r = await cloudApi.uploadFile('file:///a.wav', 'a.wav');
            expect(mockIdentity.refresh).toHaveBeenCalled();
            expect(r.success).toBe(true);
            expect(r.fileId).toBe('f2');
        });
        it('queues on network error', async () => {
            (FileSystem.uploadAsync as jest.Mock).mockRejectedValue(new Error('ENETUNREACH'));
            const r = await cloudApi.uploadFile('file:///a.wav', 'a.wav');
            expect(r.success).toBe(false);
            expect(cloudApi.getRetryQueueLength()).toBeGreaterThan(0);
        });
    });

    describe('listFiles uses authedFetch', () => {
        it('returns files on ok', async () => {
            mockIdentity.authedFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ files: [{ id: 'f1' }] }),
            });
            const r = await cloudApi.listFiles();
            expect(mockIdentity.authedFetch).toHaveBeenCalled();
            expect(r.files).toHaveLength(1);
        });
        it('returns error when authedFetch returns null', async () => {
            mockIdentity.authedFetch.mockResolvedValue(null);
            const r = await cloudApi.listFiles();
            expect(r.files).toHaveLength(0);
            expect(r.error).toContain('Not authenticated');
        });
    });

    describe('deleteFile uses authedFetch', () => {
        it('success on 2xx', async () => {
            mockIdentity.authedFetch.mockResolvedValue({ ok: true, status: 200 });
            const r = await cloudApi.deleteFile('f1');
            expect(r.success).toBe(true);
        });
        it('failure on 4xx', async () => {
            mockIdentity.authedFetch.mockResolvedValue({
                ok: false, status: 404,
                json: () => Promise.resolve({ error: 'Not found' }),
            });
            const r = await cloudApi.deleteFile('f1');
            expect(r.success).toBe(false);
            expect(r.error).toContain('Not found');
        });
    });

    describe('getHealth (unauthed)', () => {
        it('returns ok when healthy', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ status: 'ok', nodeId: 'n1' }),
            });
            const r = await cloudApi.getHealth();
            expect(r.ok).toBe(true);
            expect(r.nodeId).toBe('n1');
        });
        it('returns not-ok on network error', async () => {
            mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
            const r = await cloudApi.getHealth();
            expect(r.ok).toBe(false);
        });
    });

    describe('processRetryQueue', () => {
        it('returns zeros when not authenticated', async () => {
            mockIdentity.isAuthenticated.mockReturnValue(false);
            const r = await cloudApi.processRetryQueue();
            expect(r.succeeded).toBe(0);
            expect(r.failed).toBe(0);
        });
    });
});
