/**
 * 🧬 M5.2 — Subscription Service (RevenueCat)
 * Manages in-app purchases via RevenueCat SDK.
 * Handles: initialization, offerings, purchases, restore, entitlement checks.
 *
 * API keys are read from app.json extra config (set via EAS build env vars).
 * This service does NOT work in Expo Go — requires native build.
 */
import Purchases, {
    type PurchasesPackage,
    type CustomerInfo,
    LOG_LEVEL,
} from 'react-native-purchases';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { LicenseTier } from '@/types';

// Read RevenueCat keys from app.json extra config
const REVENUECAT_IOS_KEY = Constants.expoConfig?.extra?.revenueCatIosKey || '';
const REVENUECAT_ANDROID_KEY = Constants.expoConfig?.extra?.revenueCatAndroidKey || '';

/** Entitlement → LicenseTier mapping */
const ENTITLEMENT_MAP: Record<string, LicenseTier> = {
    'pro': 'pro',
    'translate': 'translate',
    'translate_pro': 'translate_pro',
};

// SEC-AUDIT: Sanitize error messages to prevent token leakage
function sanitizeSubError(err: unknown): string {
    if (err instanceof Error) {
        return err.message.replace(/[\w-]{20,}/g, '[REDACTED]');
    }
    return String(err).replace(/[\w-]{20,}/g, '[REDACTED]');
}

/** Subscription tier info */
export interface SubscriptionOffering {
    identifier: string;
    title: string;
    description: string;
    packages: SubscriptionPackage[];
}

export interface SubscriptionPackage {
    identifier: string;
    product: {
        title: string;
        description: string;
        priceString: string;
        price: number;
        currencyCode: string;
    };
    packageType: string;
    rcPackage: PurchasesPackage;
}

/** Purchase result with structured error info */
export interface PurchaseResult {
    success: boolean;
    tier: LicenseTier | null;
    cancelled?: boolean;
    error?: string;
}

class SubscriptionService {
    private initialized = false;

    // RC-AUDIT: Mutex to prevent concurrent purchase attempts
    private purchaseInProgress = false;

    /**
     * Initialize RevenueCat SDK. Call once at app startup.
     * @returns true if initialized successfully
     */
    async initialize(): Promise<boolean> {
        if (this.initialized) return true;

        try {
            const apiKey = Platform.OS === 'ios' ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY;

            // ERR-AUDIT: Validate API key exists
            if (!apiKey) {
                console.warn('[Subscription] No RevenueCat API key configured for', Platform.OS);
                return false;
            }

            if (__DEV__) {
                Purchases.setLogLevel(LOG_LEVEL.DEBUG);
            }

            await Purchases.configure({ apiKey });
            this.initialized = true;
            return true;

        } catch (error) {
            console.warn('[Subscription] Failed to initialize RevenueCat:', sanitizeSubError(error));
            return false;
        }
    }

    /** Check if the service has been initialized */
    isInitialized(): boolean {
        return this.initialized;
    }

    // ERR-AUDIT: Guard that throws if SDK not initialized
    private ensureInitialized(): void {
        if (!this.initialized) {
            throw new Error('Subscription service not initialized. Call initialize() first.');
        }
    }

    /**
     * Get available subscription offerings.
     */
    async getOfferings(): Promise<SubscriptionOffering[]> {
        // ERR-AUDIT: Safe guard — return empty if not initialized
        if (!this.initialized) {
            console.warn('[Subscription] getOfferings called before initialization');
            return [];
        }

        try {
            const offerings = await Purchases.getOfferings();
            if (!offerings.current) return [];

            return [{
                identifier: offerings.current.identifier,
                title: 'Windy Pro',
                description: 'Choose your plan',
                packages: offerings.current.availablePackages.map((pkg) => ({
                    identifier: pkg.identifier,
                    product: {
                        title: pkg.product.title,
                        description: pkg.product.description,
                        priceString: pkg.product.priceString,
                        price: pkg.product.price,
                        currencyCode: pkg.product.currencyCode,
                    },
                    packageType: pkg.packageType,
                    rcPackage: pkg,
                })),
            }];
        } catch (error) {
            console.warn('[Subscription] Failed to get offerings:', sanitizeSubError(error));
            return [];
        }
    }

    /**
     * Purchase a specific package.
     * RC-AUDIT: Uses mutex to prevent concurrent purchases from double-taps.
     * @returns Structured result with tier, cancellation state, or error.
     */
    async purchasePackage(pkg: PurchasesPackage): Promise<PurchaseResult> {
        this.ensureInitialized();

        // RC-AUDIT: Prevent concurrent purchase attempts (double-tap)
        if (this.purchaseInProgress) {
            return { success: false, tier: null, error: 'Purchase already in progress' };
        }
        this.purchaseInProgress = true;

        try {
            const { customerInfo } = await Purchases.purchasePackage(pkg);
            const tier = this.getTierFromCustomerInfo(customerInfo);
            return { success: true, tier };
        } catch (error: any) {
            // EC-AUDIT: User cancelled — not an error
            if (error.userCancelled) {
                return { success: false, tier: null, cancelled: true };
            }

            // EC-AUDIT: Handle store-specific errors with user-friendly messages
            const message = this.classifyPurchaseError(error);
            console.warn('[Subscription] Purchase failed:', sanitizeSubError(error));
            return { success: false, tier: null, error: message };
        } finally {
            // RC-AUDIT: Always release mutex, even on error
            this.purchaseInProgress = false;
        }
    }

    /**
     * Restore previous purchases (e.g. after reinstall or new device).
     * @returns The restored tier, or 'free' if no active subscription.
     */
    async restorePurchases(): Promise<LicenseTier> {
        this.ensureInitialized();

        try {
            const customerInfo = await Purchases.restorePurchases();
            return this.getTierFromCustomerInfo(customerInfo);
        } catch (error) {
            console.warn('[Subscription] Restore failed:', sanitizeSubError(error));
            throw new Error('Could not restore purchases. Please check your connection and try again.');
        }
    }

    /**
     * Check current entitlements without making a purchase.
     * @returns Current active tier.
     */
    async checkEntitlements(): Promise<LicenseTier> {
        // ERR-AUDIT: Gracefully return free if not initialized
        if (!this.initialized) return 'free';

        try {
            const customerInfo = await Purchases.getCustomerInfo();
            return this.getTierFromCustomerInfo(customerInfo);
        } catch (error) {
            console.warn('[Subscription] Entitlements check failed:', sanitizeSubError(error));
            return 'free';
        }
    }

    /**
     * Set the user ID for RevenueCat (for cross-device syncing).
     */
    async identify(userId: string): Promise<void> {
        // EC-AUDIT: Validate userId is non-empty
        if (!userId?.trim()) {
            console.warn('[Subscription] identify called with empty userId');
            return;
        }

        try {
            await Purchases.logIn(userId.trim());
        } catch (error) {
            console.warn('[Subscription] Identify failed:', sanitizeSubError(error));
        }
    }

    /**
     * Log out the current user (revert to anonymous).
     */
    async logout(): Promise<void> {
        try {
            await Purchases.logOut();
        } catch (error) {
            console.warn('[Subscription] Logout failed:', sanitizeSubError(error));
        }
    }

    // ─── Helpers ──────────────────────────────────────────────

    private getTierFromCustomerInfo(info: CustomerInfo): LicenseTier {
        // Check entitlements from highest to lowest tier
        const tierPrecedence: LicenseTier[] = ['translate_pro', 'translate', 'pro'];

        for (const tier of tierPrecedence) {
            const entitlement = info.entitlements.active[tier];
            if (entitlement && entitlement.isActive) {
                return tier;
            }
        }

        return 'free';
    }

    // ERR-AUDIT: Classify purchase errors into user-friendly messages
    private classifyPurchaseError(error: any): string {
        const code = error?.code || error?.errorCode;
        const message = error?.message || '';

        // RevenueCat error codes: https://docs.revenuecat.com/reference/error-codes
        if (code === 2 || message.includes('network')) {
            return 'Network error. Please check your connection and try again.';
        }
        if (code === 1 || message.includes('already') || message.includes('duplicate')) {
            return 'You already have an active subscription.';
        }
        if (message.includes('declined') || message.includes('payment')) {
            return 'Payment was declined. Please check your payment method.';
        }
        if (message.includes('not available') || message.includes('storefront')) {
            return 'This subscription is not available in your region.';
        }
        if (message.includes('deferred') || message.includes('pending')) {
            return 'Purchase pending approval. It will activate once approved.';
        }

        return 'Purchase could not be completed. Please try again.';
    }
}

export const subscriptionService = new SubscriptionService();
