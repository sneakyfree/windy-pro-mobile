/**
 * 🧬 M10.1 — License Validation Service
 * Manages tier-based feature access and Stripe integration
 */
import type { LicenseTier, LicenseValidation } from '@/types';

/** License validation API endpoint */
const LICENSE_API = 'https://windypro.thewindstorm.uk/api/license/validate';

/** Purchase page URL */
const PURCHASE_URL = 'https://windypro.thewindstorm.uk/pricing';

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
     * Validate a license key against the server
     */
    async validateLicense(key: string, deviceId: string): Promise<LicenseValidation> {
        try {
            const response = await fetch(LICENSE_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, deviceId }),
            });

            if (!response.ok) {
                throw new Error(`Validation failed: ${response.status}`);
            }

            const validation: LicenseValidation = await response.json();
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
     * Convenience method: activate a key with auto-detected device ID
     */
    async activateKey(key: string): Promise<LicenseValidation> {
        const deviceId = `device-${Date.now().toString(36)}`;
        return this.validateLicense(key, deviceId);
    }

    /**
     * Check if a specific feature is unlocked
     */
    isFeatureUnlocked(feature: string): boolean {
        const tierFeatures = FEATURE_MATRIX[this.tier];
        // Pro and above get all free features
        // Translate and above get all pro features
        // etc.
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
            const response = await fetch(`${PURCHASE_URL.replace('/pricing', '/api/stripe/checkout')}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId, tier: 'pro' }),
            });
            if (response.ok) {
                const data = await response.json();
                if (data.url) return data.url;
            }
        } catch {
            // Fall back to static URL
        }
        return `${PURCHASE_URL}?device=${encodeURIComponent(deviceId)}`;
    }
}

// Singleton instance
export const licenseService = new LicenseService();
