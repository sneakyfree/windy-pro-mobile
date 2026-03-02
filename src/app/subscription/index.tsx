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
import { feedbackService } from '@/services/feedback';

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
    const heroAnim = useRef(new Animated.Value(0)).current;

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
        await feedbackService.tap();

        try {
            const url = await licenseService.getPurchaseUrl(`device-${Date.now().toString(36)}`);
            await Linking.openURL(url);
        } catch (err) {
            Alert.alert('Error', 'Could not open purchase page. Please try again.');
        } finally {
            setPurchasing(null);
        }
    };

    const handleRestore = async () => {
        await feedbackService.tap();
        Alert.prompt(
            'Restore Purchase',
            'Enter your license key to restore your purchase:',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Restore',
                    onPress: async (key?: string) => {
                        if (!key?.trim()) return;
                        try {
                            const validation = await licenseService.activateKey(key.trim());
                            useSettingsStore.getState().setLicense(validation.tier, key.trim());
                            await feedbackService.success();
                            Alert.alert('✅ Restored!', `Welcome back to ${validation.tier.replace('_', ' ')} tier!`);
                        } catch (err) {
                            Alert.alert('Error', 'Invalid license key. Please check and try again.');
                        }
                    },
                },
            ],
            'plain-text'
        );
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backBtn}>
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
            <Pressable style={styles.restoreButton} onPress={handleRestore}>
                <Text style={styles.restoreText}>🔑 Restore Purchase</Text>
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
