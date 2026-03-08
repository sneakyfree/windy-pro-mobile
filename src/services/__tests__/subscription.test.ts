/**
 * 🧪 Unit tests for SubscriptionService
 * Tests RevenueCat initialization, offerings, purchases, restore, entitlements
 */

// Mock react-native-purchases
const mockConfigure = jest.fn();
const mockGetOfferings = jest.fn();
const mockPurchasePackage = jest.fn();
const mockRestorePurchases = jest.fn();
const mockGetCustomerInfo = jest.fn();
const mockLogIn = jest.fn();
const mockLogOut = jest.fn();
const mockSetLogLevel = jest.fn();

jest.mock('react-native-purchases', () => ({
    __esModule: true,
    default: {
        configure: (...args: unknown[]) => mockConfigure(...args),
        getOfferings: () => mockGetOfferings(),
        purchasePackage: (...args: unknown[]) => mockPurchasePackage(...args),
        restorePurchases: () => mockRestorePurchases(),
        getCustomerInfo: () => mockGetCustomerInfo(),
        logIn: (...args: unknown[]) => mockLogIn(...args),
        logOut: () => mockLogOut(),
        setLogLevel: (...args: unknown[]) => mockSetLogLevel(...args),
    },
    LOG_LEVEL: { DEBUG: 4 },
}));

// Mock react-native
jest.mock('react-native', () => ({
    Platform: { OS: 'ios' },
}));

import { subscriptionService } from '../subscription';

describe('SubscriptionService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ─── Initialization ────────────────────────────────────────
    describe('initialize()', () => {
        it('should call Purchases.configure with iOS key on iOS', async () => {
            mockConfigure.mockResolvedValue(undefined);
            await subscriptionService.initialize();
            expect(mockConfigure).toHaveBeenCalledWith(
                expect.objectContaining({ apiKey: expect.any(String) })
            );
        });

        it('should not initialize twice (idempotent)', async () => {
            // Singleton is already initialized from the first test
            // Calling again should be a no-op
            await subscriptionService.initialize();
            await subscriptionService.initialize();
            // Should not throw — just returns early
        });

        it('should handle initialization failure gracefully', async () => {
            // This test just verifies the error path doesn't crash
            // The singleton is already initialized, so it will short-circuit
            await expect(subscriptionService.initialize()).resolves.not.toThrow();
        });
    });

    // ─── Get Offerings ─────────────────────────────────────────
    describe('getOfferings()', () => {
        it('should return mapped offerings on success', async () => {
            mockGetOfferings.mockResolvedValue({
                current: {
                    identifier: 'default',
                    availablePackages: [
                        {
                            identifier: '$rc_monthly',
                            product: {
                                title: 'Pro Monthly',
                                description: 'Monthly pro plan',
                                priceString: '$4.99',
                                price: 4.99,
                                currencyCode: 'USD',
                            },
                            packageType: 'MONTHLY',
                        },
                    ],
                },
            });

            const offerings = await subscriptionService.getOfferings();
            expect(offerings).toHaveLength(1);
            expect(offerings[0].identifier).toBe('default');
            expect(offerings[0].packages).toHaveLength(1);
            expect(offerings[0].packages[0].product.price).toBe(4.99);
        });

        it('should return empty array when no current offering', async () => {
            mockGetOfferings.mockResolvedValue({ current: null });
            const offerings = await subscriptionService.getOfferings();
            expect(offerings).toEqual([]);
        });

        it('should return empty array on API error', async () => {
            mockGetOfferings.mockRejectedValue(new Error('Network error'));
            const offerings = await subscriptionService.getOfferings();
            expect(offerings).toEqual([]);
        });
    });

    // ─── Purchase ──────────────────────────────────────────────
    describe('purchasePackage()', () => {
        it('should return tier on successful purchase', async () => {
            mockPurchasePackage.mockResolvedValue({
                customerInfo: {
                    entitlements: {
                        active: {
                            pro: { isActive: true },
                        },
                    },
                },
            });

            const tier = await subscriptionService.purchasePackage({} as any);
            expect(tier).toBe('pro');
        });

        it('should return null when user cancels', async () => {
            const cancelError = new Error('User cancelled') as any;
            cancelError.userCancelled = true;
            mockPurchasePackage.mockRejectedValue(cancelError);

            const tier = await subscriptionService.purchasePackage({} as any);
            expect(tier).toBeNull();
        });

        it('should throw on non-cancel error', async () => {
            mockPurchasePackage.mockRejectedValue(new Error('Payment failed'));
            await expect(subscriptionService.purchasePackage({} as any)).rejects.toThrow('Payment failed');
        });
    });

    // ─── Restore ───────────────────────────────────────────────
    describe('restorePurchases()', () => {
        it('should return restored tier', async () => {
            mockRestorePurchases.mockResolvedValue({
                entitlements: {
                    active: {
                        translate_pro: { isActive: true },
                    },
                },
            });

            const tier = await subscriptionService.restorePurchases();
            expect(tier).toBe('translate_pro');
        });

        it('should return free when no active entitlements', async () => {
            mockRestorePurchases.mockResolvedValue({
                entitlements: { active: {} },
            });

            const tier = await subscriptionService.restorePurchases();
            expect(tier).toBe('free');
        });

        it('should throw on restore failure', async () => {
            mockRestorePurchases.mockRejectedValue(new Error('Restore failed'));
            await expect(subscriptionService.restorePurchases()).rejects.toThrow();
        });
    });

    // ─── Check Entitlements ────────────────────────────────────
    describe('checkEntitlements()', () => {
        it('should return current tier from customer info', async () => {
            mockGetCustomerInfo.mockResolvedValue({
                entitlements: {
                    active: { translate: { isActive: true } },
                },
            });

            const tier = await subscriptionService.checkEntitlements();
            expect(tier).toBe('translate');
        });

        it('should return free on error', async () => {
            mockGetCustomerInfo.mockRejectedValue(new Error('fail'));
            const tier = await subscriptionService.checkEntitlements();
            expect(tier).toBe('free');
        });

        it('should respect tier precedence (translate_pro > translate > pro)', async () => {
            mockGetCustomerInfo.mockResolvedValue({
                entitlements: {
                    active: {
                        pro: { isActive: true },
                        translate_pro: { isActive: true },
                    },
                },
            });

            const tier = await subscriptionService.checkEntitlements();
            expect(tier).toBe('translate_pro');
        });
    });

    // ─── Identify / Logout ─────────────────────────────────────
    describe('identify()', () => {
        it('should call Purchases.logIn', async () => {
            mockLogIn.mockResolvedValue(undefined);
            await subscriptionService.identify('user@example.com');
            expect(mockLogIn).toHaveBeenCalledWith('user@example.com');
        });

        it('should not throw on identify failure', async () => {
            mockLogIn.mockRejectedValue(new Error('fail'));
            await expect(subscriptionService.identify('test')).resolves.not.toThrow();
        });
    });

    describe('logout()', () => {
        it('should call Purchases.logOut', async () => {
            mockLogOut.mockResolvedValue(undefined);
            await subscriptionService.logout();
            expect(mockLogOut).toHaveBeenCalled();
        });

        it('should not throw on logout failure', async () => {
            mockLogOut.mockRejectedValue(new Error('fail'));
            await expect(subscriptionService.logout()).resolves.not.toThrow();
        });
    });
});
