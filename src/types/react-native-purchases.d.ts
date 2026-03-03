/**
 * Type declarations for react-native-purchases (RevenueCat)
 * Minimal declarations to satisfy TypeScript compilation.
 * Replace with actual package types when RevenueCat is installed.
 */
declare module 'react-native-purchases' {
    export interface PurchasesPackage {
        identifier: string;
        packageType: string;
        product: {
            title: string;
            description: string;
            priceString: string;
            price: number;
            currencyCode: string;
        };
    }

    export interface PurchasesEntitlementInfo {
        isActive: boolean;
        identifier: string;
    }

    export interface CustomerInfo {
        entitlements: {
            active: Record<string, PurchasesEntitlementInfo>;
        };
    }

    export interface PurchasesOfferings {
        current: {
            identifier: string;
            availablePackages: PurchasesPackage[];
        } | null;
    }

    export const LOG_LEVEL: {
        DEBUG: string;
        INFO: string;
        WARN: string;
        ERROR: string;
    };

    const Purchases: {
        configure(config: { apiKey: string }): Promise<void>;
        setLogLevel(level: string): void;
        getOfferings(): Promise<PurchasesOfferings>;
        purchasePackage(pkg: PurchasesPackage): Promise<{ customerInfo: CustomerInfo }>;
        restorePurchases(): Promise<CustomerInfo>;
        getCustomerInfo(): Promise<CustomerInfo>;
        logIn(userId: string): Promise<{ customerInfo: CustomerInfo }>;
        logOut(): Promise<CustomerInfo>;
    };

    export default Purchases;
}
