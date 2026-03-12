/**
 * 🧬 M10 — Subscription / Paywall Screen
 * Premium pricing cards, feature comparison table, free trial CTA, restore purchases
 */
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert, Animated, Linking } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius } from '@/theme';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { licenseService, FEATURE_MATRIX, RECORDING_LIMITS } from '@/services/license';
import { subscriptionService } from '@/services/subscription';
import { feedbackService } from '@/services/feedback';
import { useHaptic } from '@/hooks/useHaptic';

// ── Plan definitions ──
interface PlanInfo {
    id: string;
    tier: string;
    name: string;
    price: string;
    period: string;
    badge?: string;
    badgeColor?: string;
    color: string;
    features: string[];
    cta: string;
    recommended?: boolean;
}

const PLANS: PlanInfo[] = [
    {
        id: 'free',
        tier: 'free',
        name: 'Free',
        price: '$0',
        period: 'forever',
        color: colors.textTertiary,
        features: [
            '5-minute recordings',
            'Tiny & Base engines',
            'English only',
            'Local history',
            'Text export',
        ],
        cta: 'Current Plan',
    },
    {
        id: 'pro',
        tier: 'pro',
        name: 'Pro',
        price: '$49',
        period: 'one-time',
        badge: 'POPULAR',
        badgeColor: colors.accent,
        color: colors.accent,
        recommended: true,
        features: [
            '30-minute recordings',
            'All engines (cloud + local)',
            'All languages',
            'Cloud sync',
            'Speaker identification',
            'LLM text cleanup',
            'Batch mode',
            'All export formats',
            'Quality scoring',
        ],
        cta: 'Start Free Trial',
    },
    {
        id: 'translate',
        tier: 'translate',
        name: 'Translate',
        price: '$79',
        period: 'one-time',
        badge: 'NEW',
        badgeColor: colors.accentSecondary,
        color: colors.accentSecondary,
        features: [
            'Everything in Pro',
            'Live translation (5 pairs)',
            'Conversation mode',
            'Cloud translation API',
        ],
        cta: 'Upgrade',
    },
    {
        id: 'translate_pro',
        tier: 'translate_pro',
        name: 'Translate Pro',
        price: '$149',
        period: 'one-time',
        badge: 'ULTIMATE',
        badgeColor: '#c084fc',
        color: '#c084fc',
        features: [
            'Everything in Translate',
            'Offline translation',
            '99 language pairs',
            'Text-to-speech output',
            'Medical glossary',
            'Legal glossary',
            'Priority cloud processing',
        ],
        cta: 'Upgrade',
    },
];

// ── Feature comparison table data ──
const COMPARISON_FEATURES = [
    { name: 'Recording Limit', free: '5 min', pro: '30 min', translate: '30 min', translate_pro: '30 min' },
    { name: 'Engines', free: 'Tiny, Base', pro: 'All', translate: 'All', translate_pro: 'All' },
    { name: 'Languages', free: 'English', pro: 'All', translate: 'All', translate_pro: 'All' },
    { name: 'Cloud Sync', free: '—', pro: '✓', translate: '✓', translate_pro: '✓' },
    { name: 'Translation', free: '—', pro: '—', translate: '5 pairs', translate_pro: '99 pairs' },
    { name: 'Conversation Mode', free: '—', pro: '—', translate: '✓', translate_pro: '✓' },
    { name: 'Offline Translation', free: '—', pro: '—', translate: '—', translate_pro: '✓' },
    { name: 'TTS Output', free: '—', pro: '—', translate: '—', translate_pro: '✓' },
    { name: 'Medical/Legal Glossary', free: '—', pro: '—', translate: '—', translate_pro: '✓' },
    { name: 'Speaker ID', free: '—', pro: '✓', translate: '✓', translate_pro: '✓' },
    { name: 'LLM Cleanup', free: '—', pro: '✓', translate: '✓', translate_pro: '✓' },
    { name: 'Quality Scoring', free: '—', pro: '✓', translate: '✓', translate_pro: '✓' },
];

export default function SubscriptionScreen() {
    const router = useRouter();
    const { licenseTier } = useSettingsStore();
    const [purchasing, setPurchasing] = useState<string | null>(null);
    const [showComparison, setShowComparison] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const heroAnim = useRef(new Animated.Value(0)).current;
    const haptic = useHaptic();

    useEffect(() => {
        Animated.spring(heroAnim, {
            toValue: 1,
            tension: 40,
            friction: 7,
            useNativeDriver: true,
        }).start();
    }, []);

    const handlePurchase = async (plan: PlanInfo) => {
        if (plan.tier === licenseTier) return;
        if (plan.tier === 'free') return;

        setPurchasing(plan.id);
        haptic.medium();

        try {
            // Try RevenueCat in-app purchase first
            const offerings = await subscriptionService.getOfferings();
            const pkg = offerings[0]?.packages.find(
                (p) => p.identifier.toLowerCase().includes(plan.id)
            );

            if (pkg) {
                const tier = await subscriptionService.purchasePackage(pkg.rcPackage);
                if (tier && tier !== 'free') {
                    useSettingsStore.getState().setLicense(tier, `rc-${Date.now()}`);
                    haptic.success();
                    Alert.alert(
                        '🎉 Welcome!',
                        `You now have ${plan.name} access!`,
                        [{ text: 'Awesome!', onPress: () => router.back() }]
                    );
                }
            } else {
                // Fallback: Stripe Checkout via web API
                const response = await fetch(
                    'https://windypro.thewindstorm.uk/api/v1/payments/create-checkout',
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            tier: plan.tier,
                            successUrl: 'windypro://subscription?status=success',
                            cancelUrl: 'windypro://subscription?status=cancel',
                        }),
                    }
                );
                const data: Record<string, unknown> = await response.json();
                const checkoutUrl = data.url as string | undefined;
                if (checkoutUrl) {
                    await Linking.openURL(checkoutUrl);
                } else {
                    throw new Error((data.error as string) || 'Could not create checkout session');
                }
            }
        } catch (err: unknown) {
            const e = err as Record<string, unknown> | null;
            if (!e?.userCancelled) {
                haptic.error();
                const msg = (e?.message as string) || 'Could not complete purchase. Please try again.';
                Alert.alert('Purchase Failed', msg);
            }
        } finally {
            setPurchasing(null);
        }
    };

    const handleRestore = async () => {
        haptic.medium();
        setRestoring(true);

        try {
            // Try RevenueCat restore first
            const tier = await subscriptionService.restorePurchases();
            if (tier !== 'free') {
                useSettingsStore.getState().setLicense(tier, `rc-restored-${Date.now()}`);
                haptic.success();
                Alert.alert(
                    '✅ Restored!',
                    `Welcome back to ${tier.replace('_', ' ')} tier!`,
                    [{ text: 'Awesome!', onPress: () => router.back() }]
                );
            } else {
                // Fallback: manual key entry
                Alert.prompt(
                    'No Subscription Found',
                    'Enter a license key to restore your purchase:',
                    [
                        { text: 'Cancel', style: 'cancel' },
                        {
                            text: 'Restore',
                            onPress: async (key?: string) => {
                                if (!key?.trim()) return;
                                try {
                                    const validation = await licenseService.activateKey(key.trim());
                                    useSettingsStore.getState().setLicense(validation.tier, key.trim());
                                    haptic.success();
                                    Alert.alert('✅ Restored!', `Welcome back to ${validation.tier.replace('_', ' ')} tier!`);
                                } catch (err) { console.warn("[Subscription] Error:", err);
                                    haptic.error();
                                    Alert.alert('Error', 'Invalid license key.');
                                }
                            },
                        },
                    ],
                    'plain-text'
                );
            }
        } catch (err: unknown) {
            haptic.error();
            Alert.alert('Restore Failed', 'Could not restore purchases. Please try again.');
        } finally {
            setRestoring(false);
        }
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Go back" accessibilityRole="button">
                    <Text style={styles.backText}>← Back</Text>
                </Pressable>
            </View>

            {/* Hero */}
            <Animated.View style={[styles.hero, {
                opacity: heroAnim,
                transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
            }]}>
                <Text style={styles.heroEmoji}>🌪️</Text>
                <Text style={styles.heroTitle}>Unlock Windy Pro</Text>
                <Text style={styles.heroSubtitle}>
                    Choose the plan that fits your workflow
                </Text>
            </Animated.View>

            {/* Pricing Cards */}
            {PLANS.map((plan) => {
                const isCurrentTier = plan.tier === licenseTier;
                const isRecommended = plan.recommended;
                return (
                    <View
                        key={plan.id}
                        style={[
                            styles.card,
                            isRecommended && styles.cardRecommended,
                            isCurrentTier && styles.cardCurrent,
                        ]}
                    >
                        {/* Badge */}
                        {plan.badge && (
                            <View style={[styles.badge, { backgroundColor: plan.badgeColor }]}>
                                <Text style={styles.badgeText}>{plan.badge}</Text>
                            </View>
                        )}

                        <View style={styles.cardHeader}>
                            <Text style={[styles.cardName, { color: plan.color }]}>{plan.name}</Text>
                            <View style={styles.priceRow}>
                                <Text style={styles.cardPrice}>{plan.price}</Text>
                                <Text style={styles.cardPeriod}>{plan.period}</Text>
                            </View>
                        </View>

                        {/* Feature list */}
                        <View style={styles.featureList}>
                            {plan.features.map((feat, i) => (
                                <View key={`${plan.id}-${i}`} style={styles.featureRow}>
                                    <Text style={[styles.featureCheck, { color: plan.color }]}>✓</Text>
                                    <Text style={styles.featureText}>{feat}</Text>
                                </View>
                            ))}
                        </View>

                        {/* CTA Button */}
                        <Pressable
                            style={[
                                styles.ctaButton,
                                isCurrentTier && styles.ctaButtonCurrent,
                                !isCurrentTier && { backgroundColor: plan.color },
                            ]}
                            onPress={() => handlePurchase(plan)}
                            disabled={isCurrentTier || purchasing === plan.id}
                            accessibilityLabel={isCurrentTier ? `${plan.name} is your current plan` : `Purchase ${plan.name} for ${plan.price}`}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: isCurrentTier || purchasing === plan.id }}
                        >
                            <Text style={[
                                styles.ctaText,
                                isCurrentTier && styles.ctaTextCurrent,
                            ]}>
                                {purchasing === plan.id ? '⏳ Redirecting...'
                                    : isCurrentTier ? '✓ Current Plan'
                                        : plan.cta}
                            </Text>
                        </Pressable>
                    </View>
                );
            })}

            {/* Feature Comparison Toggle */}
            <Pressable
                style={styles.comparisonToggle}
                onPress={() => setShowComparison(!showComparison)}
                accessibilityLabel={showComparison ? 'Hide feature comparison table' : 'Show feature comparison table'}
                accessibilityRole="button"
            >
                <Text style={styles.comparisonToggleText}>
                    {showComparison ? '▼ Hide' : '▶ Show'} Feature Comparison
                </Text>
            </Pressable>

            {/* Feature Comparison Table */}
            {showComparison && (
                <View style={styles.comparisonTable}>
                    {/* Table header */}
                    <View style={[styles.compRow, styles.compHeaderRow]}>
                        <Text style={[styles.compCell, styles.compFeatureCell, styles.compHeaderText]}>Feature</Text>
                        <Text style={[styles.compCell, styles.compHeaderText]}>Free</Text>
                        <Text style={[styles.compCell, styles.compHeaderText, { color: colors.accent }]}>Pro</Text>
                        <Text style={[styles.compCell, styles.compHeaderText, { color: colors.accentSecondary }]}>Trans</Text>
                        <Text style={[styles.compCell, styles.compHeaderText, { color: '#c084fc' }]}>T.Pro</Text>
                    </View>
                    {COMPARISON_FEATURES.map((feat, i) => (
                        <View key={`comp-${i}`} style={[styles.compRow, i % 2 === 0 && styles.compRowAlt]}>
                            <Text style={[styles.compCell, styles.compFeatureCell]}>{feat.name}</Text>
                            <Text style={styles.compCell}>{feat.free}</Text>
                            <Text style={styles.compCell}>{feat.pro}</Text>
                            <Text style={styles.compCell}>{feat.translate}</Text>
                            <Text style={styles.compCell}>{feat.translate_pro}</Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Restore Purchases */}
            <Pressable
                style={[styles.restoreButton, restoring && { opacity: 0.6 }]}
                onPress={handleRestore}
                disabled={restoring}
                accessibilityLabel={restoring ? 'Restoring purchases' : 'Restore previous purchase'}
                accessibilityRole="button"
                accessibilityState={{ disabled: restoring }}
            >
                <Text style={styles.restoreText}>
                    {restoring ? '⏳ Restoring...' : '🔑 Restore Purchase'}
                </Text>
            </Pressable>

            {/* Guarantee */}
            <View style={styles.guarantee}>
                <Text style={styles.guaranteeEmoji}>🛡️</Text>
                <Text style={styles.guaranteeText}>
                    30-day money-back guarantee. No questions asked.
                </Text>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
                <Text style={styles.footerText}>
                    Prices are one-time payments. No subscriptions. No recurring charges.
                </Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: {
        padding: spacing.screenPadding,
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingBottom: 60,
    },

    // Header
    header: { marginBottom: spacing.md },
    backBtn: {},
    backText: { fontSize: 16, color: colors.accent },

    // Hero
    hero: { alignItems: 'center', marginBottom: spacing.xl },
    heroEmoji: { fontSize: 56, marginBottom: spacing.sm },
    heroTitle: { fontSize: 28, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
    heroSubtitle: { fontSize: 15, color: colors.textSecondary, textAlign: 'center' },

    // Pricing Cards
    card: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.lg,
        marginBottom: spacing.md,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    cardRecommended: {
        borderColor: colors.accent,
        borderWidth: 2,
        shadowColor: colors.accent,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 5,
    },
    cardCurrent: {
        borderColor: colors.accent,
        borderWidth: 2,
    },
    badge: {
        position: 'absolute',
        top: -10,
        right: 16,
        paddingHorizontal: spacing.sm + 2,
        paddingVertical: 3,
        borderRadius: borderRadius.sm,
    },
    badgeText: { fontSize: 10, fontWeight: '800', color: colors.background, letterSpacing: 1 },

    cardHeader: { marginBottom: spacing.md },
    cardName: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
    priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
    cardPrice: { fontSize: 36, fontWeight: '800', color: colors.textPrimary },
    cardPeriod: { fontSize: 14, color: colors.textTertiary },

    featureList: { marginBottom: spacing.md, gap: spacing.xs + 2 },
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    featureCheck: { fontSize: 14, fontWeight: '700' },
    featureText: { fontSize: 14, color: colors.textSecondary, flex: 1 },

    ctaButton: {
        paddingVertical: spacing.md - 2,
        borderRadius: borderRadius.md,
        alignItems: 'center',
    },
    ctaButtonCurrent: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: colors.accent,
    },
    ctaText: { fontSize: 16, fontWeight: '700', color: colors.background },
    ctaTextCurrent: { color: colors.accent },

    // Comparison toggle
    comparisonToggle: {
        alignItems: 'center',
        paddingVertical: spacing.md,
        marginBottom: spacing.sm,
    },
    comparisonToggleText: { fontSize: 14, fontWeight: '600', color: colors.accent },

    // Comparison table
    comparisonTable: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        overflow: 'hidden',
        marginBottom: spacing.lg,
    },
    compRow: {
        flexDirection: 'row',
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.xs,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    compRowAlt: { backgroundColor: 'rgba(255,255,255,0.02)' },
    compHeaderRow: { backgroundColor: colors.surfaceLight },
    compCell: {
        flex: 1,
        fontSize: 11,
        color: colors.textSecondary,
        textAlign: 'center',
    },
    compFeatureCell: {
        flex: 1.8,
        textAlign: 'left',
        paddingLeft: spacing.xs,
        fontWeight: '500',
        color: colors.textPrimary,
    },
    compHeaderText: { fontWeight: '700', fontSize: 11 },

    // Restore
    restoreButton: {
        alignItems: 'center',
        paddingVertical: spacing.md,
        marginBottom: spacing.md,
    },
    restoreText: { fontSize: 14, color: colors.textSecondary },

    // Guarantee
    guarantee: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: 'rgba(163, 230, 53, 0.08)',
        borderRadius: borderRadius.md,
        padding: spacing.md,
        marginBottom: spacing.lg,
    },
    guaranteeEmoji: { fontSize: 24 },
    guaranteeText: { fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 18 },

    // Footer
    footer: { alignItems: 'center', paddingVertical: spacing.md },
    footerText: { fontSize: 12, color: colors.textTertiary, textAlign: 'center', lineHeight: 18 },
});
