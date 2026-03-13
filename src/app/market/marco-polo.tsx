/**
 * 🧬 L3.3 — Marco Polo Detail Screen
 * Immersive screen for the ultimate translation bundle.
 * Shows savings math, storage check, and purchase CTA.
 */
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Pressable,
    Alert,
    Linking,
    ActivityIndicator,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius } from '@/theme';
import { pairCatalogService } from '@/services/pairCatalog';
import { pairManager } from '@/services/pairManager';
import { useHaptic } from '@/hooks/useHaptic';

const PAIR_PRICE = 6.99;
const MARCO_POLO_PRICE = 999;
const ESTIMATED_PAIR_SIZE_MB = 550;
/** Minimum pair count for savings math — matches marketing (includes future pairs) */
const MIN_MARKETED_PAIRS = 2500;

export default function MarcoPolo() {
    const router = useRouter();
    const haptic = useHaptic();
    const [pairCount, setPairCount] = useState(MIN_MARKETED_PAIRS);
    const [freeMB, setFreeMB] = useState(0);
    const [purchasing, setPurchasing] = useState(false);
    const [loadingStorage, setLoadingStorage] = useState(true);

    useEffect(() => {
        const catalog = pairCatalogService.getCatalog();
        // Use the larger of catalog length or marketed count (includes future pairs)
        setPairCount(Math.max(catalog.length, MIN_MARKETED_PAIRS));

        pairManager.getStorageInfo().then((info) => {
            setFreeMB(Math.round(info.freeBytes / (1024 * 1024)));
        }).catch(() => {}).finally(() => setLoadingStorage(false));
    }, []);

    const totalValue = Math.round(pairCount * PAIR_PRICE * 100) / 100;
    const savings = Math.max(0, Math.round((totalValue - MARCO_POLO_PRICE) * 100) / 100);
    const estimatedStorageGB = Math.round((pairCount * ESTIMATED_PAIR_SIZE_MB) / 1024 * 10) / 10;
    const hasEnoughStorage = freeMB > estimatedStorageGB * 1024;

    const handlePurchase = () => {
        if (purchasing) return;
        setPurchasing(true);
        haptic.medium();
        Linking.openURL('https://windypro.thewindstorm.uk/marco-polo').catch(() => {
            Alert.alert('Error', 'Could not open the purchase page.');
        }).finally(() => setPurchasing(false));
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={['top']}>
            <ScrollView style={styles.container} contentContainerStyle={styles.content}>
                {/* Back button */}
                <Pressable
                    onPress={() => router.back()}
                    style={styles.backBtn}
                    accessibilityLabel="Go back"
                    accessibilityRole="button"
                >
                    <Text style={styles.backText}>← Back</Text>
                </Pressable>

                {/* Hero */}
                <View
                    style={styles.hero}
                >
                    <Text style={styles.heroEmoji}>🧭</Text>
                    <Text style={styles.heroTitle}>Marco Polo</Text>
                    <Text style={styles.heroSubtitle}>Every translation pair, forever</Text>
                </View>

                {/* Savings math */}
                <View style={styles.savingsCard}>
                    <Text style={styles.savingsTitle}>💰 The Math</Text>
                    <View style={styles.mathRow}>
                        <Text style={styles.mathLabel}>{pairCount} pairs × ${PAIR_PRICE}</Text>
                        <Text style={styles.mathValue}>${totalValue.toLocaleString()}</Text>
                    </View>
                    <View style={styles.mathRow}>
                        <Text style={styles.mathLabel}>Marco Polo price</Text>
                        <Text style={[styles.mathValue, styles.mathHighlight]}>${MARCO_POLO_PRICE}</Text>
                    </View>
                    <View style={[styles.mathRow, styles.mathTotal]}>
                        <Text style={styles.mathLabel}>You save</Text>
                        <Text style={styles.mathSavings}>${savings.toLocaleString()}</Text>
                    </View>
                </View>

                {/* Features */}
                <View style={styles.featuresCard}>
                    <Text style={styles.featuresTitle}>What's Included</Text>
                    {[
                        '🌍 All current translation pairs',
                        '🔮 All future pairs — forever',
                        '⚡ Lifetime access, no recurring fees',
                        '🥇 Priority support & early access',
                        '🔒 Encrypted at rest (L6)',
                        '📱 Works completely offline',
                    ].map((feat) => (
                        <Text key={feat} style={styles.featureItem}>{feat}</Text>
                    ))}
                </View>

                {/* Storage check */}
                {loadingStorage ? (
                    <View style={[styles.storageCard, { alignItems: 'center' as const }]}>
                        <ActivityIndicator size="small" color={colors.accent} />
                        <Text style={[styles.storageText, { marginTop: spacing.sm }]}>Checking storage…</Text>
                    </View>
                ) : (
                    <View style={[styles.storageCard, !hasEnoughStorage && styles.storageWarning]}>
                        <Text style={styles.storageTitle}>
                            {hasEnoughStorage ? '✅ Storage Check' : '⚠️ Storage Warning'}
                        </Text>
                        <Text style={styles.storageText}>
                            Estimated total: ~{estimatedStorageGB} GB
                        </Text>
                        <Text style={styles.storageText}>
                            Available: {(freeMB / 1024).toFixed(1)} GB
                        </Text>
                        {!hasEnoughStorage && (
                            <Text style={styles.storageWarnText}>
                                You may not have enough space for all pairs. You can download them selectively.
                            </Text>
                        )}
                    </View>
                )}

                {/* Purchase CTA */}
                <Pressable
                    style={[styles.purchaseBtn, purchasing && { opacity: 0.6 }]}
                    onPress={handlePurchase}
                    disabled={purchasing}
                    accessibilityLabel="Purchase Marco Polo bundle for $999"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: purchasing }}
                >
                    <Text style={styles.purchaseBtnText}>🧭 Get Marco Polo — $999</Text>
                </Pressable>

                <Text style={styles.guarantee}>
                    🛡️ 30-day money-back guarantee. No questions asked.
                </Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1 },
    content: {
        paddingHorizontal: spacing.screenPadding,
        paddingTop: spacing.md,
        paddingBottom: 60,
    },
    backBtn: { minWidth: 48, minHeight: 48, justifyContent: 'center', marginBottom: spacing.md },
    backText: { fontSize: 16, color: colors.accent },

    // Hero
    hero: {
        borderRadius: borderRadius.xl,
        padding: spacing.xl,
        alignItems: 'center',
        marginBottom: spacing.lg,
        backgroundColor: '#1e1b4b',
    },
    heroEmoji: { fontSize: 64, marginBottom: spacing.sm },
    heroTitle: {
        fontSize: 32,
        fontWeight: '800',
        color: '#f8fafc',
        marginBottom: spacing.xs,
    },
    heroSubtitle: {
        fontSize: 16,
        color: '#c7d2fe',
        textAlign: 'center',
    },

    // Savings
    savingsCard: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.lg,
        marginBottom: spacing.md,
    },
    savingsTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: spacing.md,
    },
    mathRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    mathTotal: {
        borderBottomWidth: 0,
        paddingTop: spacing.md,
    },
    mathLabel: {
        fontSize: 15,
        color: colors.textSecondary,
    },
    mathValue: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    mathHighlight: {
        color: colors.accent,
        fontWeight: '800',
    },
    mathSavings: {
        fontSize: 22,
        fontWeight: '800',
        color: '#d4a017',
    },

    // Features
    featuresCard: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.lg,
        marginBottom: spacing.md,
    },
    featuresTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: spacing.md,
    },
    featureItem: {
        fontSize: 15,
        color: colors.textSecondary,
        paddingVertical: spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },

    // Storage
    storageCard: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.lg,
        marginBottom: spacing.lg,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    storageWarning: {
        borderColor: colors.stateProcessing,
    },
    storageTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: spacing.sm,
    },
    storageText: {
        fontSize: 14,
        color: colors.textSecondary,
        marginBottom: spacing.xs,
    },
    storageWarnText: {
        fontSize: 13,
        color: colors.stateProcessing,
        marginTop: spacing.sm,
    },

    // CTA
    purchaseBtn: {
        backgroundColor: '#d4a017',
        paddingVertical: spacing.md,
        borderRadius: borderRadius.md,
        alignItems: 'center',
        marginBottom: spacing.md,
        minHeight: 56,
        justifyContent: 'center',
        shadowColor: '#d4a017',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 6,
    },
    purchaseBtnText: {
        fontSize: 18,
        fontWeight: '800',
        color: '#1e1b4b',
    },
    guarantee: {
        fontSize: 13,
        color: colors.textTertiary,
        textAlign: 'center',
        marginBottom: spacing.xl,
    },
});
