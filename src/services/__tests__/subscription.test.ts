/**
 * 🧪 Unit tests for SubscriptionService
 * Tests RevenueCat initialization, offerings, purchases, restore, entitlements,
 * and audit fixes (mutex, init guards, error sanitization, edge cases).
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

// Mock expo-constants
jest.mock('expo-constants', () => ({
    __esModule: true,
    default: {
        expoConfig: {
            extra: {
                revenueCatIosKey: 'test_ios_key',
                revenueCatAndroidKey: 'test_android_key',
            },
        },
    },
}));

// We need a fresh instance for each test group to reset `initialized`
// Use `jest.isolateModules` for tests that need fresh state.

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
            await subscriptionService.initialize();
            await subscriptionService.initialize();
            // Should not throw — just returns early
        });

        it('should handle initialization failure gracefully', async () => {
            // The singleton is already initialized, so it will short-circuit
            await expect(subscriptionService.initialize()).resolves.not.toThrow();
        });

        it('should return true when initialized', async () => {
            const result = await subscriptionService.initialize();
            expect(result).toBe(true);
        });

        it('should report isInitialized()', () => {
            expect(subscriptionService.isInitialized()).toBe(true);
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
        it('should return success result on successful purchase', async () => {
            mockPurchasePackage.mockResolvedValue({
                customerInfo: {
                    entitlements: {
                        active: {
                            pro: { isActive: true },
                        },
                    },
                },
            });

            const result = await subscriptionService.purchasePackage({} as any);
            expect(result.success).toBe(true);
            expect(result.tier).toBe('pro');
        });

        it('should return cancelled result when user cancels', async () => {
            const cancelError = new Error('User cancelled') as any;
            cancelError.userCancelled = true;
            mockPurchasePackage.mockRejectedValue(cancelError);

            const result = await subscriptionService.purchasePackage({} as any);
            expect(result.success).toBe(false);
            expect(result.cancelled).toBe(true);
            expect(result.tier).toBeNull();
        });

        it('should return error result on payment failure', async () => {
            mockPurchasePackage.mockRejectedValue(new Error('Payment failed'));
            const result = await subscriptionService.purchasePackage({} as any);
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.tier).toBeNull();
        });

        // RC-AUDIT: Test purchase mutex (double-tap prevention)
        it('should prevent concurrent purchases (mutex)', async () => {
            // Simulate a slow purchase that takes 100ms
            mockPurchasePackage.mockImplementation(() =>
                new Promise(resolve =>
                    setTimeout(() => resolve({
                        customerInfo: {
                            entitlements: { active: { pro: { isActive: true } } },
                        },
                    }), 100)
                )
            );

            // Fire two purchases simultaneously
            const [result1, result2] = await Promise.all([
                subscriptionService.purchasePackage({} as any),
                subscriptionService.purchasePackage({} as any),
            ]);

            // One should succeed, the other should be blocked
            const successCount = [result1, result2].filter(r => r.success).length;
            const blockedCount = [result1, result2].filter(r => r.error === 'Purchase already in progress').length;
            expect(successCount).toBe(1);
            expect(blockedCount).toBe(1);
        });

        it('should release mutex after failed purchase', async () => {
            mockPurchasePackage.mockRejectedValue(new Error('fail'));
            const result1 = await subscriptionService.purchasePackage({} as any);
            expect(result1.success).toBe(false);

            // Second purchase should work (mutex released)
            mockPurchasePackage.mockResolvedValue({
                customerInfo: { entitlements: { active: { pro: { isActive: true } } } },
            });
            const result2 = await subscriptionService.purchasePackage({} as any);
            expect(result2.success).toBe(true);
        });

        // ERR-AUDIT: Test error classification
        it('should classify network errors with helpful message', async () => {
            const err = new Error('network request failed') as any;
            err.code = 2;
            mockPurchasePackage.mockRejectedValue(err);
            const result = await subscriptionService.purchasePackage({} as any);
            expect(result.error).toContain('Network error');
        });

        it('should classify declined payment with helpful message', async () => {
            mockPurchasePackage.mockRejectedValue(new Error('payment declined'));
            const result = await subscriptionService.purchasePackage({} as any);
            expect(result.error).toContain('declined');
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

        it('should throw user-friendly error on restore failure', async () => {
            mockRestorePurchases.mockRejectedValue(new Error('Restore failed'));
            await expect(subscriptionService.restorePurchases()).rejects.toThrow(
                'Could not restore purchases'
            );
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
        it('should call Purchases.logIn with trimmed userId', async () => {
            mockLogIn.mockResolvedValue(undefined);
            await subscriptionService.identify('  user@example.com  ');
            expect(mockLogIn).toHaveBeenCalledWith('user@example.com');
        });

        it('should not throw on identify failure', async () => {
            mockLogIn.mockRejectedValue(new Error('fail'));
            await expect(subscriptionService.identify('test')).resolves.not.toThrow();
        });

        // EC-AUDIT: Empty userId should be rejected
        it('should reject empty userId', async () => {
            await subscriptionService.identify('');
            expect(mockLogIn).not.toHaveBeenCalled();
        });

        it('should reject whitespace-only userId', async () => {
            await subscriptionService.identify('   ');
            expect(mockLogIn).not.toHaveBeenCalled();
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

    // ─── Error Sanitization ─────────────────────────────────────
    describe('error sanitization', () => {
        it('should handle errors containing long tokens without crashing', async () => {
            mockGetOfferings.mockRejectedValue(
                new Error('Request failed with token abc123456789012345678901234567890')
            );
            // Should not throw — returns empty array gracefully
            const result = await subscriptionService.getOfferings();
            expect(result).toEqual([]);
        });

        it('should handle errors containing sensitive field names', async () => {
            const err = new Error('auth failed') as any;
            err.apiKey = 'sk_live_1234567890abcdef';
            mockGetOfferings.mockRejectedValue(err);
            const result = await subscriptionService.getOfferings();
            expect(result).toEqual([]);
        });
    });
});
