/**
 * Tests for chatOnboarding.ts — Chat verification and onboarding flow
 */

// ── Mocks ─────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.mock('@react-native-async-storage/async-storage', () => ({
    default: {
        getItem: jest.fn(async () => null),
        setItem: jest.fn(async () => undefined),
        removeItem: jest.fn(async () => undefined),
    },
    __esModule: true,
}));

jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn(async () => null),
    setItemAsync: jest.fn(async () => undefined),
    deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock('@/config/api', () => ({
    API_BASE_URL: 'https://test.windyword.ai',
    ENDPOINTS: {
        CHAT_REGISTER: '/api/v1/chat/register',
        CHAT_VERIFY_OTP: '/api/v1/chat/verify',
        CHAT_SET_PROFILE: '/api/v1/chat/profile',
    },
    CHAT_HOMESERVER: 'https://chat.windychat.ai',
    DEFAULT_CHAT_HOMESERVER: 'https://chat.windychat.ai',
    getChatHomeserver: jest.fn(() => 'https://chat.windychat.ai'),
}));

jest.mock('@/services/chatClient', () => ({
    chatClient: {
        isLoggedIn: jest.fn(() => false),
        getUserId: jest.fn(() => null),
        loginWithCredentials: jest.fn(async () => ({ success: true })),
    },
}));

jest.mock('../logger', () => ({
    createLogger: () => ({
        entry: jest.fn(),
        exit: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

import { chatOnboarding } from '../chatOnboarding';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { chatClient } from '@/services/chatClient';

// ── Tests ─────────────────────────────────────────────────────

describe('ChatOnboardingService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockReset();
    });

    // ─── requestVerification ──────────────────────────────────

    describe('requestVerification', () => {
        it('should reject invalid phone number', async () => {
            const result = await chatOnboarding.requestVerification({
                identifier: '123',
                type: 'phone',
            });
            expect(result.success).toBe(false);
            expect(result.error).toContain('valid phone number');
        });

        it('should reject invalid email', async () => {
            const result = await chatOnboarding.requestVerification({
                identifier: 'not-an-email',
                type: 'email',
            });
            expect(result.success).toBe(false);
            expect(result.error).toContain('valid email');
        });

        it('should accept valid phone number and return sessionId', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ sessionId: 'sess-123', expiresIn: 300 }),
            });

            const result = await chatOnboarding.requestVerification({
                identifier: '+441234567890',
                type: 'phone',
            });
            expect(result.success).toBe(true);
            expect(result.sessionId).toBe('sess-123');
            expect(result.expiresIn).toBe(300);
        });

        it('should accept valid email', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ sessionId: 'sess-456' }),
            });

            const result = await chatOnboarding.requestVerification({
                identifier: 'user@example.com',
                type: 'email',
            });
            expect(result.success).toBe(true);
            expect(result.sessionId).toBe('sess-456');
        });

        it('should handle rate limiting (429)', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 429,
                json: async () => ({ error: 'rate limited' }),
            });

            const result = await chatOnboarding.requestVerification({
                identifier: '+441234567890',
                type: 'phone',
            });
            expect(result.success).toBe(false);
            expect(result.error).toContain('wait');
        });

        it('should handle server error (500)', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: async () => ({}),
            });

            const result = await chatOnboarding.requestVerification({
                identifier: '+441234567890',
                type: 'phone',
            });
            expect(result.success).toBe(false);
            expect(result.error).toContain('Server error');
        });

        it('should handle network failure', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await chatOnboarding.requestVerification({
                identifier: '+441234567890',
                type: 'phone',
            });
            expect(result.success).toBe(false);
            expect(result.error).toContain('Network error');
        });

        it('should default expiresIn to 300 when not in response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ sessionId: 'sess-no-expiry' }),
            });

            const result = await chatOnboarding.requestVerification({
                identifier: '+441234567890',
                type: 'phone',
            });
            expect(result.expiresIn).toBe(300);
        });
    });

    // ─── verifyOtp ────────────────────────────────────────────

    describe('verifyOtp', () => {
        it('should reject non-6-digit code', async () => {
            const result = await chatOnboarding.verifyOtp('sess-1', '123');
            expect(result.success).toBe(false);
            expect(result.error).toContain('6-digit');
        });

        it('should reject non-numeric code', async () => {
            const result = await chatOnboarding.verifyOtp('sess-1', 'abcdef');
            expect(result.success).toBe(false);
        });

        it('should return credentials on valid OTP', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    credentials: {
                        accessToken: 'tok-abc',
                        userId: '@user:chat.windychat.ai',
                        deviceId: 'DEV123',
                        homeserverUrl: 'https://chat.windychat.ai',
                    },
                }),
            });

            const result = await chatOnboarding.verifyOtp('sess-1', '123456');
            expect(result.success).toBe(true);
            expect(result.credentials?.accessToken).toBe('tok-abc');
            expect(result.credentials?.userId).toBe('@user:chat.windychat.ai');
        });

        it('should use CHAT_HOMESERVER as fallback homeserverUrl', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    credentials: {
                        accessToken: 'tok-abc',
                        userId: '@user:chat.windychat.ai',
                        deviceId: 'DEV123',
                        // No homeserverUrl in response
                    },
                }),
            });

            const result = await chatOnboarding.verifyOtp('sess-1', '654321');
            expect(result.credentials?.homeserverUrl).toBe('https://chat.windychat.ai');
        });

        it('should handle invalid OTP error (400)', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => ({ error: 'invalid otp code' }),
            });

            const result = await chatOnboarding.verifyOtp('sess-1', '000000');
            expect(result.success).toBe(false);
            expect(result.error).toContain('Incorrect code');
        });

        it('should handle expired OTP (400)', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => ({ error: 'code expired' }),
            });

            const result = await chatOnboarding.verifyOtp('sess-1', '111111');
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    // ─── setProfile ───────────────────────────────────────────

    describe('setProfile', () => {
        it('should reject empty display name', async () => {
            const result = await chatOnboarding.setProfile('token', '   ');
            expect(result.success).toBe(false);
            expect(result.error).toContain('display name');
        });

        it('should call API with auth header and store name locally', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            });

            const result = await chatOnboarding.setProfile('my-token', 'Grant');
            expect(result.success).toBe(true);
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/v1/chat/profile'),
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        Authorization: 'Bearer my-token',
                    }),
                }),
            );
            expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
                expect.any(String),
                'Grant',
            );
        });

        it('should soft-fail on network error (still succeeds)', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await chatOnboarding.setProfile('token', 'Grant');
            // Soft failure — returns success even on error
            expect(result.success).toBe(true);
            // Should still store locally
            expect(SecureStore.setItemAsync).toHaveBeenCalled();
        });
    });

    // ─── completeOnboarding ───────────────────────────────────

    describe('completeOnboarding', () => {
        const validCreds = {
            accessToken: 'tok-abc',
            userId: '@user:chat.windychat.ai',
            deviceId: 'DEV123',
            homeserverUrl: 'https://chat.windychat.ai',
        };

        it('should reject empty credentials', async () => {
            const result = await chatOnboarding.completeOnboarding({
                accessToken: '',
                userId: '@user:chat.windychat.ai',
                deviceId: 'DEV123',
                homeserverUrl: 'https://chat.windychat.ai',
            });
            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid credentials');
        });

        it('should skip login if already authenticated as same user', async () => {
            (chatClient.isLoggedIn as jest.Mock).mockReturnValue(true);
            (chatClient.getUserId as jest.Mock).mockReturnValue('@user:chat.windychat.ai');

            const result = await chatOnboarding.completeOnboarding(validCreds);
            expect(result.success).toBe(true);
            expect(chatClient.loginWithCredentials).not.toHaveBeenCalled();
            expect(AsyncStorage.setItem).toHaveBeenCalledWith(
                expect.stringContaining('onboarding'),
                'true',
            );
        });

        it('should login and mark onboarding complete', async () => {
            (chatClient.isLoggedIn as jest.Mock).mockReturnValue(false);
            (chatClient.loginWithCredentials as jest.Mock).mockResolvedValue({ success: true });

            const result = await chatOnboarding.completeOnboarding(validCreds);
            expect(result.success).toBe(true);
            expect(chatClient.loginWithCredentials).toHaveBeenCalledWith(
                'tok-abc',
                '@user:chat.windychat.ai',
                'DEV123',
                'https://chat.windychat.ai',
            );
        });

        it('should return error when login fails', async () => {
            (chatClient.isLoggedIn as jest.Mock).mockReturnValue(false);
            (chatClient.loginWithCredentials as jest.Mock).mockResolvedValue({
                success: false,
                error: 'Auth failed',
            });

            const result = await chatOnboarding.completeOnboarding(validCreds);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Auth failed');
        });
    });

    // ─── State management ─────────────────────────────────────

    describe('isOnboardingComplete', () => {
        it('should return true when flag is set', async () => {
            (AsyncStorage.getItem as jest.Mock).mockResolvedValue('true');
            expect(await chatOnboarding.isOnboardingComplete()).toBe(true);
        });

        it('should return false when flag is not set', async () => {
            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
            expect(await chatOnboarding.isOnboardingComplete()).toBe(false);
        });

        it('should return false on storage error', async () => {
            (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'));
            expect(await chatOnboarding.isOnboardingComplete()).toBe(false);
        });
    });

    describe('getDisplayName', () => {
        it('should return stored name', async () => {
            (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('Grant');
            expect(await chatOnboarding.getDisplayName()).toBe('Grant');
        });

        it('should return null when no name stored', async () => {
            (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
            expect(await chatOnboarding.getDisplayName()).toBeNull();
        });
    });

    describe('resetOnboarding', () => {
        it('should clear onboarding flag and display name', async () => {
            await chatOnboarding.resetOnboarding();
            expect(AsyncStorage.removeItem).toHaveBeenCalled();
            expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
        });
    });
});
