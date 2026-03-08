/**
 * 🧬 M10.1 — License Validation Service
 * Manages tier-based feature access and Stripe integration
 *
 * Server contract:
 *   POST /api/v1/license/activate  — { key } (auth required via JWT)
 *   Response: { success, tier, key, activatedAt }
 */
import * as SecureStore from 'expo-secure-store';
import type { LicenseTier, LicenseValidation } from '@/types';
import { API_BASE_URL, ENDPOINTS, apiUrl } from '@/config/api';
import { fetchWithTimeout } from '@/utils/fetch-timeout';
import { parseApiError, createNetworkError, isAuthError, isRateLimited } from '@/utils/api-error';

const TOKEN_KEY = 'windy_jwt_token';

/**
 * 🧬 M10.1.1 — Feature matrix by tier
 */
export const FEATURE_MATRIX: Record<LicenseTier, string[]> = {
    free: [
        'record',
        'transcribe-local-tiny',
        'transcribe-local-base',
        'transcribe-cloud-standard',
        'language-en',
        'history',
        'export-text',
    ],
    pro: [
        // All free features plus:
        'all-engines',
        'all-languages',
        'cloud-sync',
        'speaker-id',
        'llm-cleanup',
        'batch-mode',
        'long-recording', // 30 min
        'export-all',
        'quality-scoring',
    ],
    translate: [
        // All Pro features plus:
        'translate-cloud',
        'conversation-mode',
        'translate-5-pairs',
    ],
    translate_pro: [
        // All Translate features plus:
        'translate-offline',
        'translate-99-pairs',
        'tts-output',
        'medical-glossary',
        'legal-glossary',
        'priority-cloud',
    ],
};

/** Recording limits by tier */
export const RECORDING_LIMITS: Record<LicenseTier, number> = {
    free: 300,          // 5 minutes
    pro: 1800,          // 30 minutes
    translate: 1800,    // 30 minutes
    translate_pro: 1800, // 30 minutes
};

class LicenseService {
    private tier: LicenseTier = 'free';
    private licenseKey: string | null = null;
    private isValidated = false;
    private cachedValidation: LicenseValidation | null = null;
    private cacheExpiry: number = 0; // timestamp

    /**
     * Validate a license key against the server.
     * POST /api/v1/license/activate — auth required, sends { key }.
     */
    async validateLicense(key: string): Promise<LicenseValidation> {
        try {
            // Get JWT from secure store for auth
            let token: string | null = null;
            try {
                token = await SecureStore.getItemAsync(TOKEN_KEY);
            } catch (err) { console.warn('[License] Failed to get token:', err); }

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetchWithTimeout(apiUrl(ENDPOINTS.LICENSE_ACTIVATE), {
                method: 'POST',
                headers,
                body: JSON.stringify({ key }),
            });

            if (!response.ok) {
                const apiErr = await parseApiError(response);
                if (isAuthError(response.status)) {
                    throw new Error('Session expired — please log in again before activating your license');
                }
                if (isRateLimited(response.status)) {
                    throw new Error('Too many attempts, please try again later');
                }
                throw apiErr;
            }

            const data = await response.json();
            const validation: LicenseValidation = {
                key: data.key || key,
                tier: data.tier || 'free',
                validUntil: data.activatedAt || null,
                devicesUsed: data.devicesUsed ?? 1,
                devicesMax: data.devicesMax ?? 5,
                features: data.features || [],
            };

            this.tier = validation.tier;
            this.licenseKey = key;
            this.isValidated = true;

            // Cache for 24 hours
            this.cachedValidation = validation;
            this.cacheExpiry = Date.now() + 24 * 60 * 60 * 1000;

            return validation;
        } catch (error) {
            // If offline, use cached validation
            if (this.cachedValidation && Date.now() < this.cacheExpiry) {
                return this.cachedValidation;
            }
            // No cache + offline → degrade to free
            this.tier = 'free';
            throw error;
        }
    }

    /**
     * Convenience method: activate a key (no deviceId needed, server gets it from JWT)
     */
    async activateKey(key: string): Promise<LicenseValidation> {
        return this.validateLicense(key);
    }

    /**
     * Check if a specific feature is unlocked
     */
    isFeatureUnlocked(feature: string): boolean {
        const allFeatures = this.getUnlockedFeatures();
        return allFeatures.includes(feature);
    }

    /**
     * Get all features unlocked by current tier
     */
    getUnlockedFeatures(): string[] {
        const tiers: LicenseTier[] = ['free', 'pro', 'translate', 'translate_pro'];
        const currentIndex = tiers.indexOf(this.tier);
        const features: string[] = [];

        for (let i = 0; i <= currentIndex; i++) {
            features.push(...FEATURE_MATRIX[tiers[i]]);
        }

        return Array.from(new Set(features)); // deduplicate
    }

    /**
     * Get recording duration limit for current tier
     */
    getMaxRecordingDuration(): number {
        return RECORDING_LIMITS[this.tier];
    }

    /**
     * Get current tier
     */
    getTier(): LicenseTier {
        return this.tier;
    }

    /**
     * Get purchase page URL — tries dynamic checkout, falls back to static
     */
    async getPurchaseUrl(deviceId: string): Promise<string> {
        try {
            const response = await fetchWithTimeout(apiUrl(ENDPOINTS.STRIPE_CHECKOUT), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId, tier: 'pro' }),
            });
            if (response.ok) {
                const data = await response.json();
                if (data.url) return data.url;
            }
        } catch (err) {
            console.warn('[License] getPurchaseUrl failed:', err);
            // Fall back to static URL
        }
        return `${API_BASE_URL}/pricing?device=${encodeURIComponent(deviceId)}`;
    }
}

// Singleton instance
export const licenseService = new LicenseService();
