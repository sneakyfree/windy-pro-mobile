/**
 * 🧬 M10 — Subscription / Paywall Screen
 * Premium pricing cards, feature comparison table, free trial CTA, restore purchases
 * Billing toggle: Monthly | Annual (default) | Lifetime with savings badges
 */
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert, Animated, Linking } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius, fontSizes } from '@/theme';
import { CHECKOUT_API_URL, MARCO_POLO_URL } from '@/config/api';
import { useSettingsStore, setLicense } from '@/stores/useSettingsStore';
import { licenseService, FEATURE_MATRIX, RECORDING_LIMITS } from '@/services/license';
import { subscriptionService } from '@/services/subscription';
import { feedbackService } from '@/services/feedback';
import { useHaptic } from '@/hooks/useHaptic';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { fetchWithTimeout } from '@/utils/fetch-timeout';

// ── Billing period types ──
type BillingPeriod = 'monthly' | 'annual' | 'lifetime';

// ── Plan definitions ──
interface PlanPricing {
    price: string;
    period: string;
    /** Stripe product key suffix for checkout */
    stripeSuffix: string;
}

interface PlanInfo {
    id: string;
    tier: string;
    name: string;
    badge?: string;
    badgeColor?: string;
    color: string;
    features: string[];
    cta: string;
    recommended?: boolean;
    pricing: Record<BillingPeriod, PlanPricing>;
}

// ── Savings badge config ──
const BILLING_TABS: { key: BillingPeriod; label: string; savingsLabel?: string }[] = [
    { key: 'monthly', label: 'Monthly' },
    { key: 'annual', label: 'Annual', savingsLabel: 'Save 17%' },
    { key: 'lifetime', label: 'Lifetime', savingsLabel: 'Best Value' },
];

const PLANS: PlanInfo[] = [
    {
        id: 'free',
        tier: 'free',
        name: 'Free',
        color: colors.textTertiary,
        features: [
            '5-minute recordings',
            'Tiny & Base engines (on-device)',
            'Auto-detect — any of 99 languages',
            'Local history',
            'Text export',
            '500 MB WindyCloud storage',
            '1 offline translation engine',
        ],
        cta: 'Current Plan',
        pricing: {
            monthly: { price: '$0', period: 'forever', stripeSuffix: '' },
            annual: { price: '$0', period: 'forever', stripeSuffix: '' },
            lifetime: { price: '$0', period: 'forever', stripeSuffix: '' },
        },
    },
    {
        id: 'pro',
        tier: 'pro',
        name: 'Windy Word',
        badge: 'POPULAR',
        badgeColor: colors.accent,
        color: colors.accent,
        recommended: true,
        features: [
            '30-minute recordings',
            'All local engines + Cloud Processing*',
            'All 99 languages',
            'Cloud sync across devices',
            'Speaker identification',
            'LLM text cleanup',
            'Batch mode — drop files, walk away',
            'All export formats',
            'Quality scoring',
            '5 offline translation engines',
            '5 GB WindyCloud storage',
        ],
        cta: 'Start Free Trial',
        pricing: {
            monthly: { price: '$4.99', period: '/mo', stripeSuffix: '_monthly' },
            annual: { price: '$49', period: '/yr', stripeSuffix: '_annual' },
            lifetime: { price: '$99', period: 'one-time', stripeSuffix: '_lifetime' },
        },
    },
    {
        id: 'translate',
        tier: 'translate',
        name: 'Windy Ultra',
        badge: 'NEW',
        badgeColor: colors.accentSecondary,
        color: colors.accentSecondary,
        features: [
            'Everything in Pro',
            'Live translation (5 pairs)',
            'Conversation mode',
            'Cloud translation API + Cloud Processing*',
            '25 offline translation engines',
            '10 GB WindyCloud storage',
        ],
        cta: 'Upgrade',
        pricing: {
            monthly: { price: '$8.99', period: '/mo', stripeSuffix: '_monthly' },
            annual: { price: '$79', period: '/yr', stripeSuffix: '_annual' },
            lifetime: { price: '$199', period: 'one-time', stripeSuffix: '_lifetime' },
        },
    },
    {
        id: 'translate_pro',
        tier: 'translate_pro',
        name: 'Windy Max',
        badge: 'ULTIMATE',
        badgeColor: '#c084fc',
        color: '#c084fc',
        features: [
            'Everything in Ultra',
            '60-minute recordings',
            'Offline translation',
            '99 language pairs',
            'Text-to-speech output',
            'Medical glossary',
            'Legal glossary',
            'Priority Cloud Processing* — fastest processing',
            '100 offline translation engines',
            '25 GB WindyCloud storage',
        ],
        cta: 'Upgrade',
        pricing: {
            monthly: { price: '$14.99', period: '/mo', stripeSuffix: '_monthly' },
            annual: { price: '$149', period: '/yr', stripeSuffix: '_annual' },
            lifetime: { price: '$299', period: 'one-time', stripeSuffix: '_lifetime' },
        },
    },
];

// ── Feature comparison table data ──
const COMPARISON_FEATURES = [
    { name: 'Recording Limit', free: '5 min', pro: '30 min', translate: '30 min', translate_pro: '60 min' },
    { name: 'Engines', free: 'Tiny, Base', pro: 'All 15', translate: 'All 15', translate_pro: 'All 15' },
    { name: 'Languages', free: '99 (auto-detect)', pro: '99', translate: '99', translate_pro: '99' },
    { name: 'Offline Engines', free: '1', pro: '5', translate: '25', translate_pro: '100' },
    { name: 'Cloud Sync', free: '—', pro: '✓', translate: '✓', translate_pro: '✓' },
    { name: 'Cloud Processing*', free: '—', pro: '✓', translate: '✓', translate_pro: 'Priority' },
    { name: 'Translation', free: '—', pro: '—', translate: '5 pairs', translate_pro: '99 pairs' },
    { name: 'Conversation Mode', free: '—', pro: '—', translate: '✓', translate_pro: '✓' },
    { name: 'Offline Translation', free: '—', pro: '—', translate: '—', translate_pro: '✓' },
    { name: 'TTS Output', free: '—', pro: '—', translate: '—', translate_pro: '✓' },
    { name: 'Medical/Legal Glossary', free: '—', pro: '—', translate: '—', translate_pro: '✓' },
    { name: 'Speaker ID', free: '—', pro: '✓', translate: '✓', translate_pro: '✓' },
    { name: 'LLM Cleanup', free: '—', pro: '✓', translate: '✓', translate_pro: '✓' },
    { name: 'Quality Scoring', free: '—', pro: '✓', translate: '✓', translate_pro: '✓' },
    { name: 'WindyCloud Storage', free: '500 MB', pro: '5 GB', translate: '10 GB', translate_pro: '25 GB' },
];

/** Monthly equivalent for savings display on lifetime cards */
function lifetimeEquivalent(tier: string): string {
    const monthsMap: Record<string, number> = { pro: 20, translate: 22, translate_pro: 20 };
    const months = monthsMap[tier];
    return months ? `= ${months} months of monthly` : '';
}

/** Cloud Processing note based on billing period */
function cloudSttNote(tier: string, period: BillingPeriod): string | null {
    if (tier === 'free') return null;
    if (period === 'lifetime') return '🏠 Lifetime = device-only processing. Always private.';
    return '🌪️ 3 modes: Device Only · Device + WindyCloud · Auto. All fully private.';
}

export default function SubscriptionScreen() {
    const router = useRouter();
    const { licenseTier, cloudFallbackEnabled, setCloudFallbackEnabled } = useSettingsStore();
    const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('annual');
    const [purchasing, setPurchasing] = useState<string | null>(null);
    const [showComparison, setShowComparison] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [processingMode, setProcessingMode] = useState<'local' | 'hybrid' | 'auto'>(cloudFallbackEnabled ? 'auto' : 'local');
    const heroAnim = useRef(new Animated.Value(0)).current;
    const haptic = useHaptic();
    const { reduceMotion } = useReducedMotion();

    useEffect(() => {
        if (reduceMotion) {
            heroAnim.setValue(1);
            return;
        }
        Animated.spring(heroAnim, {
            toValue: 1,
            tension: 40,
            friction: 7,
            useNativeDriver: true,
        }).start();
    }, [reduceMotion]);

    const handlePurchase = async (plan: PlanInfo) => {
        if (plan.tier === licenseTier) return;
        if (plan.tier === 'free') return;

        const currentPricing = plan.pricing[billingPeriod];
        setPurchasing(plan.id);
        haptic.medium();

        try {
            // Try RevenueCat in-app purchase first
            const offerings = await subscriptionService.getOfferings();
            const pkg = offerings[0]?.packages.find(
                (p) => p.identifier.toLowerCase().includes(plan.id)
            );

            if (pkg) {
                // RC-AUDIT: purchasePackage now returns PurchaseResult
                const result = await subscriptionService.purchasePackage(pkg.rcPackage);

                if (result.cancelled) {
                    // User cancelled — do nothing
                } else if (result.success && result.tier && result.tier !== 'free') {
                    await setLicense(result.tier, `rc-${Date.now()}`);
                    // Sync entitlement to account-server
                    try {
                        const { cloudApi: api } = require('@/services/cloudApi');
                        const token = api.getToken();
                        if (token) {
                            fetchWithTimeout(`${require('@/config/api').API_BASE_URL}/api/v1/license/activate`, {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ tier: result.tier, source: 'revenuecat', billing: billingPeriod }),
                            }).catch(() => {}); // Non-blocking
                        }
                    } catch { /* ignore */ }
                    haptic.success();
                    Alert.alert(
                        '🎉 Welcome!',
                        `You now have ${plan.name} access!`,
                        [{ text: 'Awesome!', onPress: () => router.back() }]
                    );
                } else if (result.error) {
                    haptic.error();
                    Alert.alert('Purchase Failed', result.error);
                }
            } else {
                // Fallback: Stripe Checkout via web API
                const response = await fetchWithTimeout(
                    CHECKOUT_API_URL,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            tier: plan.tier,
                            billing: billingPeriod,
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
            haptic.error();
            const msg = (err instanceof Error ? err.message : null) || 'Could not complete purchase. Please try again.';
            Alert.alert('Purchase Failed', msg);
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
                await setLicense(tier, `rc-restored-${Date.now()}`);
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
                                    await setLicense(validation.tier, key.trim());
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
        <ScreenErrorBoundary screenName="Subscription">
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
                <Text style={styles.heroEmoji} importantForAccessibility="no">🌪️</Text>
                <Text style={styles.heroTitle} accessibilityRole="header">Unlock Windy Word</Text>
                <Text style={styles.heroSubtitle}>
                    Choose the plan that fits your workflow
                </Text>
                <View style={{ backgroundColor: 'rgba(59,130,246,0.08)', borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: 'rgba(59,130,246,0.15)' }}>
                    <Text style={{ color: '#60a5fa', fontSize: 13, fontWeight: '700', marginBottom: 4 }}>☁️ Cloud Voice-to-Text</Text>
                    <Text style={{ color: '#9ca3af', fontSize: 11, lineHeight: 16 }}>
                        Subscribers get GPU-powered cloud transcription — 3-5× faster, always the latest models, zero battery drain.{'\n'}
                        <Text style={{ color: '#c084fc', fontWeight: '600' }}>Lifetime = local engines only. Your device, your data, forever.</Text>
                    </Text>
                </View>
            </Animated.View>

            {/* ── Billing Period Toggle ── */}
            <View style={styles.billingToggle} accessibilityRole="tablist">
                {BILLING_TABS.map((tab) => {
                    const isActive = billingPeriod === tab.key;
                    return (
                        <Pressable
                            key={tab.key}
                            style={[styles.billingTab, isActive && styles.billingTabActive]}
                            onPress={() => {
                                setBillingPeriod(tab.key);
                                haptic.light();
                            }}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: isActive }}
                            accessibilityLabel={`${tab.label} billing${tab.savingsLabel ? `, ${tab.savingsLabel}` : ''}`}
                        >
                            <Text style={[styles.billingTabText, isActive && styles.billingTabTextActive]}>
                                {tab.label}
                            </Text>
                            {tab.savingsLabel && (
                                <View style={[styles.savingsBadge, isActive && styles.savingsBadgeActive]}>
                                    <Text style={[styles.savingsBadgeText, isActive && styles.savingsBadgeTextActive]}>
                                        {tab.savingsLabel}
                                    </Text>
                                </View>
                            )}
                        </Pressable>
                    );
                })}
            </View>

            {/* Processing Mode Selector — "Where should WindyTune process your voice?" */}
            {billingPeriod !== 'lifetime' && (
                <View style={{ marginHorizontal: 20, marginBottom: 16 }}>
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 4, textAlign: 'center' }}>
                        Where should WindyTune process your voice?
                    </Text>
                    <Text style={{ color: '#9ca3af', fontSize: 11, textAlign: 'center', marginBottom: 10 }}>
                        All three options are fully private — we never store your audio or sell your data.
                    </Text>

                    {/* Device Only */}
                    <Pressable
                        style={{
                            padding: 13, borderRadius: 12, marginBottom: 6,
                            backgroundColor: processingMode === 'local' ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)',
                            borderWidth: 2,
                            borderColor: processingMode === 'local' ? '#22C55E' : 'rgba(255,255,255,0.08)',
                        }}
                        onPress={() => { setProcessingMode('local'); setCloudFallbackEnabled(false); haptic.light(); }}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 17 }}>🏠</Text>
                            <Text style={{ color: '#22C55E', fontSize: 13, fontWeight: '700', flex: 1 }}>This device only</Text>
                        </View>
                        <Text style={{ color: '#9ca3af', fontSize: 10, marginTop: 3, lineHeight: 14 }}>
                            Everything runs right here. Works offline, anywhere. Your voice never leaves this device.
                        </Text>
                    </Pressable>

                    {/* Device + Cloud */}
                    <Pressable
                        style={{
                            padding: 13, borderRadius: 12, marginBottom: 6,
                            backgroundColor: processingMode === 'hybrid' ? 'rgba(167,139,250,0.1)' : 'rgba(255,255,255,0.03)',
                            borderWidth: 2,
                            borderColor: processingMode === 'hybrid' ? '#A78BFA' : 'rgba(255,255,255,0.08)',
                        }}
                        onPress={() => { setProcessingMode('hybrid'); setCloudFallbackEnabled(false); haptic.light(); }}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 17 }}>☁️</Text>
                            <Text style={{ color: '#A78BFA', fontSize: 13, fontWeight: '700', flex: 1 }}>This device + WindyCloud</Text>
                        </View>
                        <Text style={{ color: '#9ca3af', fontSize: 10, marginTop: 3, lineHeight: 14 }}>
                            Choose cloud when you want extra speed, fall back to local anytime. You control which one runs.
                        </Text>
                    </Pressable>

                    {/* Auto */}
                    <Pressable
                        style={{
                            padding: 13, borderRadius: 12,
                            backgroundColor: processingMode === 'auto' ? 'rgba(96,165,250,0.1)' : 'rgba(255,255,255,0.03)',
                            borderWidth: 2,
                            borderColor: processingMode === 'auto' ? '#60A5FA' : 'rgba(255,255,255,0.08)',
                        }}
                        onPress={() => { setProcessingMode('auto'); setCloudFallbackEnabled(true); haptic.light(); }}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 17 }}>🌪️</Text>
                            <Text style={{ color: '#60A5FA', fontSize: 13, fontWeight: '700', flex: 1 }}>Auto — always the best quality</Text>
                        </View>
                        <Text style={{ color: '#9ca3af', fontSize: 10, marginTop: 3, lineHeight: 14 }}>
                            WindyTune picks the fastest, most accurate option automatically. Cloud on strong signal, local when offline.
                        </Text>
                    </Pressable>

                    {/* Educational note */}
                    <View style={{ marginTop: 8, padding: 10, backgroundColor: 'rgba(96,165,250,0.05)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(96,165,250,0.1)' }}>
                        <Text style={{ color: '#60a5fa', fontSize: 9, lineHeight: 14 }}>
                            💡 On strong Wi-Fi or cell signal, cloud is usually faster and more accurate. On slow connections or offline, local is better. Auto mode handles this for you — but all three options keep your data private and encrypted.
                        </Text>
                    </View>

                    <Text style={{ color: '#6b7280', fontSize: 9, textAlign: 'center', marginTop: 6 }}>Change anytime in Settings → Voice Engine</Text>
                </View>
            )}

            {/* Pricing Cards */}
            {PLANS.map((plan) => {
                const isCurrentTier = plan.tier === licenseTier;
                const isRecommended = plan.recommended;
                const currentPricing = plan.pricing[billingPeriod];
                const equivalentNote = billingPeriod === 'lifetime' && plan.tier !== 'free'
                    ? lifetimeEquivalent(plan.tier)
                    : '';

                return (
                    <View
                        key={plan.id}
                        style={[
                            styles.card,
                            isRecommended && styles.cardRecommended,
                            isCurrentTier && styles.cardCurrent,
                        ]}
                        accessible={true}
                        accessibilityLabel={`${plan.name} plan, ${currentPricing.price} ${currentPricing.period}. ${plan.features.join(', ')}.${isCurrentTier ? ' Current plan.' : ''}`}
                        accessibilityRole="summary"
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
                                <Text style={styles.cardPrice}>{currentPricing.price}</Text>
                                <Text style={styles.cardPeriod}>{currentPricing.period}</Text>
                            </View>
                            {/* Lifetime equivalence note */}
                            {equivalentNote ? (
                                <Text style={styles.equivalentNote}>{equivalentNote}</Text>
                            ) : null}
                            {/* "Own forever" badge on lifetime */}
                            {billingPeriod === 'lifetime' && plan.tier !== 'free' && (
                                <View style={styles.ownForeverBadge}>
                                    <Text style={styles.ownForeverText}>✨ Own Forever — No Recurring Fees</Text>
                                </View>
                            )}
                        </View>

                        {/* Cloud Processing indicator */}
                        {cloudSttNote(plan.tier, billingPeriod) && (
                            <View style={[styles.ownForeverBadge, {
                                backgroundColor: billingPeriod === 'lifetime'
                                    ? 'rgba(139, 92, 246, 0.1)'
                                    : 'rgba(59, 130, 246, 0.1)',
                                marginBottom: spacing.sm,
                            }]}>
                                <Text style={[styles.ownForeverText, {
                                    color: billingPeriod === 'lifetime' ? '#c084fc' : '#60a5fa',
                                }]}>
                                    {cloudSttNote(plan.tier, billingPeriod)}
                                </Text>
                            </View>
                        )}

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
                            accessibilityLabel={isCurrentTier ? `${plan.name} is your current plan` : `Purchase ${plan.name} for ${currentPricing.price}`}
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
                        <Text style={[styles.compCell, styles.compHeaderText, { color: colors.accentSecondary }]}>Ultra</Text>
                        <Text style={[styles.compCell, styles.compHeaderText, { color: '#c084fc' }]}>Max</Text>
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

            {/* Marco Polo Card */}
            <View style={styles.marcoPoloCard} accessible={true} accessibilityLabel="Marco Polo bundle. $399 one-time. Every translation pair, forever. Includes all current and future language pairs." accessibilityRole="summary">
                <View style={styles.marcoPoloBadge}>
                    <Text style={styles.badgeText}>ULTIMATE</Text>
                </View>
                <Text style={styles.marcoPoloEmoji}>🧭</Text>
                <Text style={styles.marcoPoloTitle}>Marco Polo</Text>
                <Text style={styles.marcoPoloSubtitle}>Every translation pair, forever</Text>
                <View style={styles.priceRow}>
                    <Text style={styles.marcoPoloPrice}>$399</Text>
                    <Text style={styles.cardPeriod}>one-time</Text>
                </View>
                <View style={styles.marcoPoloFeatures}>
                    <Text style={styles.marcoPoloFeature}>🌍 All current & future language pairs</Text>
                    <Text style={styles.marcoPoloFeature}>⚡ Lifetime access, no recurring fees</Text>
                    <Text style={styles.marcoPoloFeature}>🥇 Priority support & early access</Text>
                </View>
                <Pressable
                    style={styles.marcoPoloCta}
                    onPress={() => Linking.openURL(MARCO_POLO_URL)}
                    accessibilityLabel="Purchase Marco Polo bundle for $399"
                    accessibilityRole="button"
                >
                    <Text style={styles.marcoPoloCtaText}>Get Marco Polo</Text>
                </Pressable>
            </View>

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

            {/* Web Payment Fallback */}
            <Pressable
                style={styles.restoreButton}
                onPress={() => Linking.openURL('https://windyword.ai/pricing')}
                accessibilityLabel="Subscribe on web — opens windyword.ai pricing page"
                accessibilityRole="link"
            >
                <Text style={styles.restoreText}>🌐 Subscribe on Web</Text>
            </Pressable>

            {/* Guarantee */}
            <View style={styles.guarantee}>
                <Text style={styles.guaranteeEmoji}>🛡️</Text>
                <Text style={styles.guaranteeText}>
                    30-day money-back guarantee. No questions asked.
                </Text>
            </View>

            {/* Cloud Processing footnote */}
            <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
                <Text style={{ color: '#6b7280', fontSize: 10, lineHeight: 14, textAlign: 'center' }}>
                    *Cloud Processing = GPU-powered voice-to-text via WindyCloud servers. Available with Monthly and Annual subscriptions. Lifetime purchases include all local/on-device engines forever but do not include cloud transcription — your device handles everything offline. Both paths deliver the same accuracy; cloud is faster and saves battery.
                </Text>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
                <Text style={styles.footerText}>
                    {billingPeriod === 'lifetime'
                        ? 'Pay once, own forever. No subscriptions. No recurring charges. Transcription runs 100% on your device.'
                        : billingPeriod === 'annual'
                            ? 'Billed annually. Cancel anytime. Includes cloud-powered voice-to-text. Or choose Lifetime to own it all locally.'
                            : 'Billed monthly. Cancel anytime. Includes cloud-powered voice-to-text. Switch to Annual to save 17%, or Lifetime to own locally forever.'}
                </Text>
            </View>
        </ScrollView>
        </ScreenErrorBoundary>
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
    backBtn: { minWidth: 48, minHeight: 48, justifyContent: 'center' },
    backText: { fontSize: fontSizes.base, color: colors.accent },

    // Hero
    hero: { alignItems: 'center', marginBottom: spacing.lg },
    heroEmoji: { fontSize: 56, marginBottom: spacing.sm },
    heroTitle: { fontSize: 28, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
    heroSubtitle: { fontSize: 15, color: colors.textSecondary, textAlign: 'center' },

    // ── Billing Period Toggle ──
    billingToggle: {
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: 4,
        marginBottom: spacing.lg,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    billingTab: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: spacing.sm + 2,
        borderRadius: borderRadius.md,
    },
    billingTabActive: {
        backgroundColor: colors.accent,
        shadowColor: colors.accent,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 3,
    },
    billingTabText: {
        fontSize: fontSizes.sm,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    billingTabTextActive: {
        color: colors.background,
        fontWeight: '700',
    },
    savingsBadge: {
        marginTop: 3,
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 6,
        backgroundColor: 'rgba(163, 230, 53, 0.15)',
    },
    savingsBadgeActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
    },
    savingsBadgeText: {
        fontSize: 9,
        fontWeight: '800',
        color: '#a3e635',
        letterSpacing: 0.5,
    },
    savingsBadgeTextActive: {
        color: colors.background,
    },

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
    cardName: { fontSize: fontSizes.xl, fontWeight: '700', marginBottom: 4 },
    priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
    cardPrice: { fontSize: fontSizes['4xl'], fontWeight: '800', color: colors.textPrimary },
    cardPeriod: { fontSize: fontSizes.sm, color: colors.textTertiary },

    equivalentNote: {
        fontSize: fontSizes.xs,
        color: colors.textTertiary,
        marginTop: 4,
        fontStyle: 'italic',
    },
    ownForeverBadge: {
        marginTop: 6,
        backgroundColor: 'rgba(163, 230, 53, 0.1)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: borderRadius.sm,
        alignSelf: 'flex-start',
    },
    ownForeverText: {
        fontSize: fontSizes.xs,
        fontWeight: '700',
        color: '#a3e635',
    },

    featureList: { marginBottom: spacing.md, gap: spacing.xs + 2 },
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    featureCheck: { fontSize: fontSizes.sm, fontWeight: '700' },
    featureText: { fontSize: fontSizes.sm, color: colors.textSecondary, flex: 1 },

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
    ctaText: { fontSize: fontSizes.base, fontWeight: '700', color: colors.background },
    ctaTextCurrent: { color: colors.accent },

    // Comparison toggle
    comparisonToggle: {
        alignItems: 'center',
        paddingVertical: spacing.md,
        marginBottom: spacing.sm,
    },
    comparisonToggleText: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.accent },

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
    restoreText: { fontSize: fontSizes.sm, color: colors.textSecondary },

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
    guaranteeEmoji: { fontSize: fontSizes['2xl'] },
    guaranteeText: { fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 18 },

    // Marco Polo card
    marcoPoloCard: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.lg,
        marginBottom: spacing.lg,
        borderWidth: 2,
        borderColor: '#d4a017',
        alignItems: 'center',
        shadowColor: '#d4a017',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 6,
    },
    marcoPoloBadge: {
        position: 'absolute',
        top: -10,
        right: 16,
        paddingHorizontal: spacing.sm + 2,
        paddingVertical: 3,
        borderRadius: borderRadius.sm,
        backgroundColor: '#d4a017',
    },
    marcoPoloEmoji: { fontSize: fontSizes['5xl'], marginBottom: spacing.sm },
    marcoPoloTitle: { fontSize: fontSizes['2xl'], fontWeight: '800', color: '#d4a017', marginBottom: 4 },
    marcoPoloSubtitle: { fontSize: fontSizes.sm, color: colors.textSecondary, marginBottom: spacing.md },
    marcoPoloPrice: { fontSize: fontSizes['4xl'], fontWeight: '800', color: colors.textPrimary },
    marcoPoloFeatures: { marginVertical: spacing.md, gap: spacing.sm, alignSelf: 'stretch' },
    marcoPoloFeature: { fontSize: fontSizes.sm, color: colors.textSecondary, textAlign: 'center' },
    marcoPoloCta: {
        backgroundColor: '#d4a017',
        paddingVertical: spacing.md - 2,
        paddingHorizontal: spacing.xl,
        borderRadius: borderRadius.md,
        alignItems: 'center',
        width: '100%',
    },
    marcoPoloCtaText: { fontSize: fontSizes.base, fontWeight: '700', color: colors.background },

    // Footer
    footer: { alignItems: 'center', paddingVertical: spacing.md },
    footerText: { fontSize: fontSizes.xs, color: colors.textTertiary, textAlign: 'center', lineHeight: 18 },
});
