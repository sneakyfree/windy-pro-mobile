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

class SubscriptionService {
    private initialized = false;

    /**
     * Initialize RevenueCat SDK. Call once at app startup.
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            const apiKey = Platform.OS === 'ios' ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY;

            if (__DEV__) {
                Purchases.setLogLevel(LOG_LEVEL.DEBUG);
            }

            await Purchases.configure({ apiKey });
            this.initialized = true;

        } catch (error) {
            console.warn('[Subscription] Failed to initialize RevenueCat:', error);
        }
    }

    /**
     * Get available subscription offerings.
     */
    async getOfferings(): Promise<SubscriptionOffering[]> {
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
            console.warn('[Subscription] Failed to get offerings:', error);
            return [];
        }
    }

    /**
     * Purchase a specific package.
     * @returns The tier that was purchased, or null if cancelled/failed.
     */
    async purchasePackage(pkg: PurchasesPackage): Promise<LicenseTier | null> {
        try {
            const { customerInfo } = await Purchases.purchasePackage(pkg);
            return this.getTierFromCustomerInfo(customerInfo);
        } catch (error: any) {
            if (error.userCancelled) {

                return null;
            }
            console.warn('[Subscription] Purchase failed:', error);
            throw error;
        }
    }

    /**
     * Restore previous purchases (e.g. after reinstall or new device).
     * @returns The restored tier, or 'free' if no active subscription.
     */
    async restorePurchases(): Promise<LicenseTier> {
        try {
            const customerInfo = await Purchases.restorePurchases();
            return this.getTierFromCustomerInfo(customerInfo);
        } catch (error) {
            console.warn('[Subscription] Restore failed:', error);
            throw error;
        }
    }

    /**
     * Check current entitlements without making a purchase.
     * @returns Current active tier.
     */
    async checkEntitlements(): Promise<LicenseTier> {
        try {
            const customerInfo = await Purchases.getCustomerInfo();
            return this.getTierFromCustomerInfo(customerInfo);
        } catch (error) {
            console.warn('[Subscription] Entitlements check failed:', error);
            return 'free';
        }
    }

    /**
     * Set the user ID for RevenueCat (for cross-device syncing).
     */
    async identify(userId: string): Promise<void> {
        try {
            await Purchases.logIn(userId);
        } catch (error) {
            console.warn('[Subscription] Identify failed:', error);
        }
    }

    /**
     * Log out the current user (revert to anonymous).
     */
    async logout(): Promise<void> {
        try {
            await Purchases.logOut();
        } catch (error) {
            console.warn('[Subscription] Logout failed:', error);
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
}

export const subscriptionService = new SubscriptionService();
