/**
 * 🧬 K2 — Windy Chat Onboarding Service
 * WhatsApp-style phone/email verification flow.
 * Users never see Matrix usernames — accounts are auto-provisioned
 * on chat.windypro.com behind the scenes.
 *
 * Flow:
 *   1. requestVerification(phone/email) → server sends 6-digit OTP
 *   2. verifyOtp(sessionId, code)       → server provisions Matrix account, returns credentials
 *   3. setProfile(displayName, avatar)  → sets user-facing profile
 *   4. completeOnboarding()             → stores creds, inits chat client
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL, ENDPOINTS, CHAT_HOMESERVER } from '@/config/api';
import { chatClient } from '@/services/chatClient';

// ─── Constants ──────────────────────────────────────────────────

const ONBOARDING_COMPLETE_KEY = 'windy_chat_onboarding_complete';
const CHAT_DISPLAY_NAME_KEY = 'windy_chat_display_name';
const REQUEST_TIMEOUT_MS = 15_000;

// ─── Types ──────────────────────────────────────────────────────

export type IdentifierType = 'phone' | 'email';

export interface VerificationRequest {
    identifier: string;    // Phone number or email
    type: IdentifierType;
}

export interface VerificationResult {
    success: boolean;
    sessionId?: string;
    error?: string;
    /** Seconds until the OTP expires */
    expiresIn?: number;
}

export interface OtpVerifyResult {
    success: boolean;
    error?: string;
    /** Pre-provisioned Matrix credentials — user never sees these */
    credentials?: {
        accessToken: string;
        userId: string;
        deviceId: string;
        homeserverUrl: string;
    };
}

export interface ProfileSetResult {
    success: boolean;
    error?: string;
}

// ─── Error Helpers ──────────────────────────────────────────────

type OnboardingErrorCode =
    | 'INVALID_IDENTIFIER'
    | 'RATE_LIMITED'
    | 'SERVER_ERROR'
    | 'NETWORK_ERROR'
    | 'INVALID_OTP'
    | 'OTP_EXPIRED'
    | 'SESSION_NOT_FOUND'
    | 'UNKNOWN';

function classifyError(status: number, body: any): { code: OnboardingErrorCode; message: string } {
    if (status === 429) {
        return { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a minute and try again.' };
    }
    if (status === 400) {
        const msg = body?.error || 'Invalid request';
        if (msg.includes('otp') || msg.includes('code')) {
            return { code: 'INVALID_OTP', message: 'Incorrect code. Please check and try again.' };
        }
        if (msg.includes('expired')) {
            return { code: 'OTP_EXPIRED', message: 'Code expired. Please request a new one.' };
        }
        if (msg.includes('session')) {
            return { code: 'SESSION_NOT_FOUND', message: 'Session expired. Please start over.' };
        }
        return { code: 'INVALID_IDENTIFIER', message: msg };
    }
    if (status >= 500) {
        return { code: 'SERVER_ERROR', message: 'Server error. Please try again later.' };
    }
    return { code: 'UNKNOWN', message: body?.error || 'Something went wrong. Please try again.' };
}

async function fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
            throw new Error('Request timed out — check your connection');
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

// ─── Service ────────────────────────────────────────────────────

class ChatOnboardingService {
    /**
     * Step 1: Request verification code sent to phone/email.
     */
    async requestVerification(request: VerificationRequest): Promise<VerificationResult> {
        const { identifier, type } = request;

        // Basic validation
        if (type === 'phone') {
            const cleaned = identifier.replace(/[\s\-()]/g, '');
            if (!/^\+?\d{7,15}$/.test(cleaned)) {
                return { success: false, error: 'Please enter a valid phone number' };
            }
        } else if (type === 'email') {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
                return { success: false, error: 'Please enter a valid email address' };
            }
        }

        try {
            const res = await fetchWithTimeout(
                `${API_BASE_URL}${ENDPOINTS.CHAT_REGISTER}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ identifier: identifier.trim(), type }),
                },
            );

            const body = await res.json().catch(() => ({}));

            if (res.ok) {
                return {
                    success: true,
                    sessionId: body.sessionId,
                    expiresIn: body.expiresIn || 300,
                };
            }

            const err = classifyError(res.status, body);
            return { success: false, error: err.message };
        } catch (err: unknown) {
            console.warn('[ChatOnboarding] requestVerification error:', err);
            return {
                success: false,
                error: err instanceof Error ? err.message : 'Network error — check your connection',
            };
        }
    }

    /**
     * Step 2: Verify the 6-digit OTP code.
     * On success, the server auto-provisions a Matrix account and returns credentials.
     */
    async verifyOtp(sessionId: string, code: string): Promise<OtpVerifyResult> {
        if (code.length !== 6 || !/^\d{6}$/.test(code)) {
            return { success: false, error: 'Please enter the 6-digit code' };
        }

        try {
            const res = await fetchWithTimeout(
                `${API_BASE_URL}${ENDPOINTS.CHAT_VERIFY_OTP}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, code }),
                },
            );

            const body = await res.json().catch(() => ({}));

            if (res.ok && body.credentials) {
                return {
                    success: true,
                    credentials: {
                        accessToken: body.credentials.accessToken,
                        userId: body.credentials.userId,
                        deviceId: body.credentials.deviceId,
                        homeserverUrl: body.credentials.homeserverUrl || CHAT_HOMESERVER,
                    },
                };
            }

            const err = classifyError(res.status, body);
            return { success: false, error: err.message };
        } catch (err: unknown) {
            console.warn('[ChatOnboarding] verifyOtp error:', err);
            return {
                success: false,
                error: err instanceof Error ? err.message : 'Network error — check your connection',
            };
        }
    }

    /**
     * Step 3: Set the user's display name and optionally avatar.
     * This calls our custom API which sets the Matrix profile behind the scenes.
     */
    async setProfile(
        accessToken: string,
        displayName: string,
        _avatarUri?: string,
    ): Promise<ProfileSetResult> {
        if (!displayName.trim()) {
            return { success: false, error: 'Please enter a display name' };
        }

        try {
            const res = await fetchWithTimeout(
                `${API_BASE_URL}${ENDPOINTS.CHAT_SET_PROFILE}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`,
                    },
                    body: JSON.stringify({
                        displayName: displayName.trim(),
                        // Avatar upload would be multipart — handled in future iteration
                    }),
                },
            );

            const body = await res.json().catch(() => ({}));

            if (res.ok) {
                // Store display name locally for quick access
                await SecureStore.setItemAsync(CHAT_DISPLAY_NAME_KEY, displayName.trim()).catch(() => {});
                return { success: true };
            }

            const err = classifyError(res.status, body);
            return { success: false, error: err.message };
        } catch (err: unknown) {
            console.warn('[ChatOnboarding] setProfile error:', err);
            // Even if server call fails, store locally — the name will sync eventually
            await SecureStore.setItemAsync(CHAT_DISPLAY_NAME_KEY, displayName.trim()).catch(() => {});
            return { success: true }; // Soft failure — don't block onboarding
        }
    }

    /**
     * Step 4: Complete onboarding — store credentials and initialize chat client.
     */
    async completeOnboarding(credentials: {
        accessToken: string;
        userId: string;
        deviceId: string;
        homeserverUrl: string;
    }): Promise<{ success: boolean; error?: string }> {
        // SEC-AUDIT: Validate credentials are non-empty before storing
        if (!credentials.accessToken || !credentials.userId || !credentials.homeserverUrl) {
            return { success: false, error: 'Invalid credentials received from server' };
        }

        // RC-AUDIT: Don't double-login if already authenticated
        if (chatClient.isLoggedIn() && chatClient.getUserId() === credentials.userId) {
            await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
            return { success: true };
        }

        try {
            // Use chatClient's new pre-provisioned login method
            const result = await chatClient.loginWithCredentials(
                credentials.accessToken,
                credentials.userId,
                credentials.deviceId,
                credentials.homeserverUrl,
            );

            if (!result.success) {
                return { success: false, error: result.error || 'Failed to initialize chat' };
            }

            // Mark onboarding complete
            await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
            return { success: true };
        } catch (err: unknown) {
            console.warn('[ChatOnboarding] completeOnboarding error:', err);
            return {
                success: false,
                error: err instanceof Error ? err.message : 'Failed to complete setup',
            };
        }
    }

    /**
     * Check if the user has completed chat onboarding.
     */
    async isOnboardingComplete(): Promise<boolean> {
        try {
            const value = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
            return value === 'true';
        } catch {
            return false;
        }
    }

    /**
     * Get the stored display name (for profile screen).
     */
    async getDisplayName(): Promise<string | null> {
        try {
            return await SecureStore.getItemAsync(CHAT_DISPLAY_NAME_KEY);
        } catch {
            return null;
        }
    }

    /**
     * Reset onboarding state (for testing / re-onboarding).
     */
    async resetOnboarding(): Promise<void> {
        await AsyncStorage.removeItem(ONBOARDING_COMPLETE_KEY).catch(() => {});
        await SecureStore.deleteItemAsync(CHAT_DISPLAY_NAME_KEY).catch(() => {});
    }
}

export const chatOnboarding = new ChatOnboardingService();
