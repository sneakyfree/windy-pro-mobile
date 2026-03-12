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
import { createLogger } from './logger';

const log = createLogger('Subscription');

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
        log.entry('initialize', { platform: Platform.OS });

        try {
            const apiKey = Platform.OS === 'ios' ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY;

            if (!apiKey) {
                log.warn('initialize', 'No RevenueCat API key configured', { platform: Platform.OS });
                return false;
            }

            if (__DEV__) {
                Purchases.setLogLevel(LOG_LEVEL.DEBUG);
            }

            await Purchases.configure({ apiKey });
            this.initialized = true;
            log.exit('initialize', { success: true });
            return true;

        } catch (error) {
            log.error('initialize', error);
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
        if (!this.initialized) {
            log.warn('getOfferings', 'called before initialization');
            return [];
        }
        log.entry('getOfferings');

        try {
            const offerings = await Purchases.getOfferings();
            if (!offerings.current) {
                log.exit('getOfferings', { count: 0 });
                return [];
            }

            const mapped = [{
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
            log.exit('getOfferings', { count: mapped[0].packages.length });
            return mapped;
        } catch (error) {
            log.error('getOfferings', error);
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
        log.entry('purchasePackage', { pkgId: (pkg as any)?.identifier });

        if (this.purchaseInProgress) {
            log.warn('purchasePackage', 'blocked — purchase already in progress');
            return { success: false, tier: null, error: 'Purchase already in progress' };
        }
        this.purchaseInProgress = true;

        try {
            const { customerInfo } = await Purchases.purchasePackage(pkg);
            const tier = this.getTierFromCustomerInfo(customerInfo);
            log.exit('purchasePackage', { tier });
            return { success: true, tier };
        } catch (error: any) {
            if (error.userCancelled) {
                log.state('purchasePackage', 'user cancelled');
                return { success: false, tier: null, cancelled: true };
            }

            const message = this.classifyPurchaseError(error);
            log.error('purchasePackage', error, { classified: message });
            return { success: false, tier: null, error: message };
        } finally {
            this.purchaseInProgress = false;
        }
    }

    /**
     * Restore previous purchases (e.g. after reinstall or new device).
     * @returns The restored tier, or 'free' if no active subscription.
     */
    async restorePurchases(): Promise<LicenseTier> {
        this.ensureInitialized();
        log.entry('restorePurchases');

        try {
            const customerInfo = await Purchases.restorePurchases();
            const tier = this.getTierFromCustomerInfo(customerInfo);
            log.exit('restorePurchases', { tier });
            return tier;
        } catch (error) {
            log.error('restorePurchases', error);
            throw new Error('Could not restore purchases. Please check your connection and try again.');
        }
    }

    /**
     * Check current entitlements without making a purchase.
     * @returns Current active tier.
     */
    async checkEntitlements(): Promise<LicenseTier> {
        if (!this.initialized) return 'free';
        log.entry('checkEntitlements');

        try {
            const customerInfo = await Purchases.getCustomerInfo();
            const tier = this.getTierFromCustomerInfo(customerInfo);
            log.exit('checkEntitlements', { tier });
            return tier;
        } catch (error) {
            log.error('checkEntitlements', error);
            return 'free';
        }
    }

    /**
     * Set the user ID for RevenueCat (for cross-device syncing).
     */
    async identify(userId: string): Promise<void> {
        if (!userId?.trim()) {
            log.warn('identify', 'called with empty userId');
            return;
        }
        log.entry('identify', { userId: userId.slice(0, 3) + '…' });

        try {
            await Purchases.logIn(userId.trim());
            log.exit('identify');
        } catch (error) {
            log.error('identify', error);
        }
    }

    async logout(): Promise<void> {
        log.entry('logout');
        try {
            await Purchases.logOut();
            log.exit('logout');
        } catch (error) {
            log.error('logout', error);
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
