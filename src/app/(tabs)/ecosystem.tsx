/**
 * Ecosystem Tab — All Windy products at a glance
 * Shows service status, quick-open, storage, agent, passport
 */
import { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { colors, spacing, borderRadius } from '@/theme';
import { typography } from '@/theme/typography';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { cloudApi } from '@/services/cloudApi';
import {
    getEcosystemStatus,
    PRODUCT_DISPLAY,
    getStatusLabel,
    getStatusColor,
    getStatusIcon,
    getProductSubtitle,
    type EcosystemStatus,
} from '@/services/ecosystem-status';
import { feedbackService } from '@/services/feedback';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

export default function EcosystemScreen() {
    const router = useRouter();
    const settings = useSettingsStore();
    const [ecosystem, setEcosystem] = useState<EcosystemStatus | null>(settings.ecosystemStatus);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const loadEcosystem = useCallback(async () => {
        try {
            const status = await getEcosystemStatus();
            if (status) {
                setEcosystem(status);
                settings.setEcosystemStatus(status);
            }
        } catch { /* ignore */ }
    }, []);

    useFocusEffect(
        useCallback(() => {
            if (!ecosystem) setLoading(true);
            loadEcosystem().finally(() => setLoading(false));
        }, [])
    );

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadEcosystem();
        setRefreshing(false);
    }, []);

    const isLoggedIn = cloudApi.isAuthenticated();

    // Not logged in state
    if (!isLoggedIn) {
        return (
            <ScreenErrorBoundary screenName="Ecosystem">
                <SafeAreaView style={styles.container} edges={['top']}>
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyEmoji}>🌪️</Text>
                        <Text style={styles.emptyTitle}>Your Windy Ecosystem</Text>
                        <Text style={styles.emptySubtitle}>
                            Sign in to see all your Windy products in one place.
                        </Text>
                        <Pressable style={styles.signInBtn} onPress={() => router.push('/auth/login')}>
                            <Text style={styles.signInText}>Sign In</Text>
                        </Pressable>
                    </View>
                </SafeAreaView>
            </ScreenErrorBoundary>
        );
    }

    return (
        <ScreenErrorBoundary screenName="Ecosystem">
            <SafeAreaView style={styles.container} edges={['top']}>
                <ScrollView
                    contentContainerStyle={styles.content}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>
                            {ecosystem?.creator_name ? `${ecosystem.creator_name}'s Ecosystem` : 'Your Ecosystem'}
                        </Text>
                        {ecosystem?.email && (
                            <Text style={styles.headerEmail}>{ecosystem.email}</Text>
                        )}
                    </View>

                    {loading && !ecosystem && (
                        <View style={styles.loadingBox}>
                            <ActivityIndicator color={colors.accent} />
                            <Text style={styles.loadingText}>Loading ecosystem...</Text>
                        </View>
                    )}

                    {/* Product Cards */}
                    {ecosystem && PRODUCT_DISPLAY.map((product) => {
                        const p = ecosystem.products[product.key];
                        if (!p) return null;
                        const statusLabel = getStatusLabel(p.status, p.detail);
                        const statusColor = getStatusColor(p.status);
                        const icon = getStatusIcon(p.status);
                        const subtitle = getProductSubtitle(product.key, p);
                        const needsSetup = p.status === 'not_provisioned' || p.status === 'available';
                        const isOffline = p.status === 'offline';

                        return (
                            <Pressable
                                key={product.key}
                                style={[styles.card, isOffline && styles.cardOffline]}
                                disabled={isOffline}
                                onPress={() => {
                                    feedbackService.tap().catch(() => {});
                                    if (product.route) router.push(product.route as any);
                                    else if (product.externalUrl) Linking.openURL(product.externalUrl).catch(() => {});
                                }}
                            >
                                <View style={styles.cardLeft}>
                                    <Text style={styles.cardEmoji}>{product.emoji}</Text>
                                </View>
                                <View style={styles.cardCenter}>
                                    <Text style={[styles.cardName, isOffline && { color: colors.textTertiary }]}>
                                        {product.label}
                                    </Text>
                                    {subtitle && (
                                        <Text style={styles.cardSubtitle} numberOfLines={1}>{subtitle}</Text>
                                    )}
                                    {!subtitle && !needsSetup && (
                                        <Text style={[styles.cardSubtitle, { color: statusColor }]}>{statusLabel}</Text>
                                    )}
                                </View>
                                <View style={styles.cardRight}>
                                    {needsSetup ? (
                                        <View style={styles.setupBadge}>
                                            <Text style={styles.setupText}>Set up</Text>
                                        </View>
                                    ) : isOffline ? (
                                        <Text style={styles.offlineText}>Offline</Text>
                                    ) : (
                                        <Text style={{ fontSize: 16 }}>{icon}</Text>
                                    )}
                                </View>
                            </Pressable>
                        );
                    })}

                    {/* Agent CTA if no fly agent */}
                    {ecosystem && ecosystem.products.windy_fly?.status === 'not_provisioned' && (
                        <Pressable
                            style={styles.ctaCard}
                            onPress={() => Linking.openURL('https://windypro.thewindstorm.uk/app/fly').catch(() => {})}
                        >
                            <Text style={styles.ctaEmoji}>{'\uD83E\uDEB0'}</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.ctaTitle}>Hatch your Windy Fly agent</Text>
                                <Text style={styles.ctaSubtitle}>Your own AI assistant that lives in Chat</Text>
                            </View>
                            <Text style={styles.ctaArrow}>→</Text>
                        </Pressable>
                    )}
                </ScrollView>
            </SafeAreaView>
        </ScreenErrorBoundary>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.screenPadding, paddingBottom: spacing.xxl },
    header: { marginBottom: spacing.lg },
    headerTitle: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
    headerEmail: { ...typography.bodySmall, color: colors.textTertiary, marginTop: 4 },

    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginBottom: spacing.sm,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    cardOffline: { opacity: 0.5 },
    cardLeft: { width: 44, alignItems: 'center' },
    cardEmoji: { fontSize: 28 },
    cardCenter: { flex: 1, marginLeft: 12 },
    cardName: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
    cardSubtitle: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
    cardRight: { marginLeft: 8, alignItems: 'center' },
    setupBadge: {
        backgroundColor: colors.accent,
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 14,
    },
    setupText: { ...typography.caption, fontWeight: '600', color: colors.background },
    offlineText: { ...typography.caption, color: colors.textTertiary },

    ctaCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(163,230,53,0.08)',
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginTop: spacing.md,
        borderWidth: 1,
        borderColor: colors.accent,
        gap: 12,
    },
    ctaEmoji: { fontSize: 32 },
    ctaTitle: { ...typography.body, fontWeight: '600', color: colors.accent },
    ctaSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
    ctaArrow: { fontSize: 20, color: colors.accent, fontWeight: '600' },

    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
    emptyEmoji: { fontSize: 64, marginBottom: spacing.lg },
    emptyTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
    emptySubtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
    signInBtn: {
        backgroundColor: colors.accent,
        paddingHorizontal: 32,
        paddingVertical: 12,
        borderRadius: borderRadius.md,
        marginTop: spacing.lg,
    },
    signInText: { ...typography.button, color: colors.background },

    loadingBox: { alignItems: 'center', padding: spacing.xl, gap: 8 },
    loadingText: { ...typography.caption, color: colors.textTertiary },
});
