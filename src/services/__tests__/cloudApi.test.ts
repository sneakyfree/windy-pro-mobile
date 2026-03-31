/**
 * 🧪 Unit tests for CloudApiClient
 * Tests auth, file operations, health checks, retry queue, and error handling.
 */

// ─── Mocks ──────────────────────────────────────────────────────

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

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: jest.fn().mockResolvedValue(null),
        setItem: jest.fn().mockResolvedValue(undefined),
    },
}));

jest.mock('../ecosystem-status', () => ({
    getEcosystemStatus: jest.fn().mockResolvedValue(null),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';

// We need to import after mocks are set up
let cloudApi: typeof import('../cloudApi').cloudApi;

beforeAll(() => {
    cloudApi = require('../cloudApi').cloudApi;
});

describe('CloudApiClient', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockReset();
    });

    // ─── Auth: Register ────────────────────────────────────────

    describe('register()', () => {
        it('should register successfully and persist auth', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ token: 'jwt123', userId: 'user1' }),
            });

            const result = await cloudApi.register('test@example.com', 'password123');

            expect(result.success).toBe(true);
            expect(result.token).toBe('jwt123');
            expect(result.userId).toBe('user1');
            expect(SecureStore.setItemAsync).toHaveBeenCalledWith('windy_cloud_jwt', 'jwt123');
        });

        it('should handle registration failure with error message', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 409,
                json: () => Promise.resolve({ error: 'Email already registered' }),
            });

            const result = await cloudApi.register('test@example.com', 'password123');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Email already registered');
        });

        it('should handle network error during registration', async () => {
            mockFetch.mockRejectedValue(new Error('Network timeout'));

            const result = await cloudApi.register('test@example.com', 'password123');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Network timeout');
        });
    });

    // ─── Auth: Login ───────────────────────────────────────────

    describe('login()', () => {
        it('should login successfully and persist auth', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ token: 'jwt456', userId: 'user2' }),
            });

            const result = await cloudApi.login('test@example.com', 'password123');

            expect(result.success).toBe(true);
            expect(result.token).toBe('jwt456');
            expect(cloudApi.isAuthenticated()).toBe(true);
        });

        it('should handle invalid credentials', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 401,
                json: () => Promise.resolve({ error: 'Invalid email or password' }),
            });

            const result = await cloudApi.login('wrong@email.com', 'wrong');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid');
        });
    });

    // ─── Auth: Session ─────────────────────────────────────────

    describe('restoreSession()', () => {
        it('should restore from secure store', async () => {
            (SecureStore.getItemAsync as jest.Mock)
                .mockResolvedValueOnce('stored_jwt')   // TOKEN
                .mockResolvedValueOnce('stored_user')  // USER_ID
                .mockResolvedValueOnce('test@ex.com'); // EMAIL

            const result = await cloudApi.restoreSession();

            expect(result).toBe(true);
            expect(cloudApi.isAuthenticated()).toBe(true);
        });

        it('should return false when no stored token', async () => {
            (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

            const result = await cloudApi.restoreSession();

            expect(result).toBe(false);
        });
    });

    describe('logout()', () => {
        it('should clear auth state and secure store', async () => {
            // Login first
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ token: 'jwt789', userId: 'user3' }),
            });
            await cloudApi.login('test@example.com', 'pass');

            await cloudApi.logout();

            expect(cloudApi.isAuthenticated()).toBe(false);
            expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('windy_cloud_jwt');
        });
    });

    // ─── Storage: Upload ───────────────────────────────────────

    describe('uploadFile()', () => {
        it('should fail when not authenticated', async () => {
            await cloudApi.logout();
            const result = await cloudApi.uploadFile('file:///audio.wav', 'audio.wav');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Not authenticated');
        });

        it('should upload successfully', async () => {
            // Login first
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ token: 'jwt_upload', userId: 'u1' }),
            });
            await cloudApi.login('test@ex.com', 'pass');

            (FileSystem.uploadAsync as jest.Mock).mockResolvedValue({
                status: 200,
                body: JSON.stringify({ fileId: 'file_123' }),
            });

            const result = await cloudApi.uploadFile('file:///audio.wav', 'audio.wav', 'audio/wav');

            expect(result.success).toBe(true);
            expect(result.fileId).toBe('file_123');
        });

        it('should handle 401 and trigger auth expired', async () => {
            // Login first
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ token: 'jwt_exp', userId: 'u1' }),
            });
            await cloudApi.login('test@ex.com', 'pass');

            const authHandler = jest.fn();
            cloudApi.setAuthExpiredHandler(authHandler);

            (FileSystem.uploadAsync as jest.Mock).mockResolvedValue({
                status: 401,
                body: '{}',
            });

            const result = await cloudApi.uploadFile('file:///audio.wav', 'audio.wav');

            expect(result.success).toBe(false);
            expect(result.error).toContain('expired');
            expect(authHandler).toHaveBeenCalled();
        });

        it('should queue failed uploads for retry', async () => {
            // Login first
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ token: 'jwt_retry', userId: 'u1' }),
            });
            await cloudApi.login('test@ex.com', 'pass');

            (FileSystem.uploadAsync as jest.Mock).mockRejectedValue(new Error('ENETUNREACH'));

            const result = await cloudApi.uploadFile('file:///audio.wav', 'audio.wav');

            expect(result.success).toBe(false);
            expect(cloudApi.getRetryQueueLength()).toBeGreaterThan(0);
        });
    });

    // ─── Storage: List ─────────────────────────────────────────

    describe('listFiles()', () => {
        it('should return file list', async () => {
            // Login first
            mockFetch
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ token: 'jwt_list', userId: 'u1' }) })
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ files: [{ id: 'f1', filename: 'test.wav', size: 1024, contentType: 'audio/wav', uploadedAt: '2026-01-01' }] }), status: 200 });

            await cloudApi.login('test@ex.com', 'pass');
            const result = await cloudApi.listFiles();

            expect(result.files).toHaveLength(1);
            expect(result.files[0].id).toBe('f1');
        });
    });

    // ─── Storage: Delete ───────────────────────────────────────

    describe('deleteFile()', () => {
        it('should delete successfully', async () => {
            // Login first
            mockFetch
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ token: 'jwt_del', userId: 'u1' }) })
                .mockResolvedValueOnce({ ok: true, status: 200 });

            await cloudApi.login('test@ex.com', 'pass');
            const result = await cloudApi.deleteFile('file_123');

            expect(result.success).toBe(true);
        });
    });

    // ─── Health ─────────────────────────────────────────────────

    describe('getHealth()', () => {
        it('should return health status', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ status: 'ok', nodeId: 'n1' }),
            });

            const result = await cloudApi.getHealth();

            expect(result.ok).toBe(true);
            expect(result.nodeId).toBe('n1');
        });

        it('should handle health check failure', async () => {
            mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

            const result = await cloudApi.getHealth();

            expect(result.ok).toBe(false);
        });
    });

    describe('getGatewayHealth()', () => {
        it('should return true when gateway is healthy', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ status: 'ok' }),
            });

            const result = await cloudApi.getGatewayHealth();
            expect(result).toBe(true);
        });

        it('should return false on failure', async () => {
            mockFetch.mockRejectedValue(new Error('timeout'));

            const result = await cloudApi.getGatewayHealth();
            expect(result).toBe(false);
        });
    });

    // ─── Storage Usage ──────────────────────────────────────────

    describe('getStorageUsage()', () => {
        it('should calculate usage from file list', async () => {
            // Login
            mockFetch
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ token: 'jwt_usage', userId: 'u1' }) })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        files: [
                            { id: 'f1', size: 1024 * 1024 },       // 1 MB
                            { id: 'f2', size: 2 * 1024 * 1024 },   // 2 MB
                        ],
                    }),
                });

            await cloudApi.login('test@ex.com', 'pass');
            const usage = await cloudApi.getStorageUsage('free');

            expect(usage.usedBytes).toBe(3 * 1024 * 1024);
            expect(usage.fileCount).toBe(2);
            expect(usage.tierLabel).toBe('Free');
        });
    });

    // ─── Retry Queue ───────────────────────────────────────────

    describe('processRetryQueue()', () => {
        it('should return zeros when not authenticated', async () => {
            await cloudApi.logout();
            const result = await cloudApi.processRetryQueue();

            expect(result.succeeded).toBe(0);
            expect(result.failed).toBe(0);
        });
    });

    // ─── Token Accessor ────────────────────────────────────────

    describe('getToken()', () => {
        it('should return null when not authenticated', async () => {
            await cloudApi.logout();
            expect(cloudApi.getToken()).toBeNull();
        });

        it('should return token after login', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ token: 'jwt_token_test', userId: 'u1' }),
            });
            await cloudApi.login('test@ex.com', 'pass');

            expect(cloudApi.getToken()).toBe('jwt_token_test');
        });
    });
});
