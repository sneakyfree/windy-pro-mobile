/**
 * 🧬 L3.3 — Bundle Selection Screen
 * Pair picker with checkboxes, region quick-select, confirm → download.
 *
 * Route params:
 *   count: "25" (Traveler) or "200" (Polyglot)
 */
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    FlatList,
    Pressable,
    Alert,
    Platform,
    ActivityIndicator,
} from 'react-native';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius } from '@/theme';
import { pairCatalogService, type TranslationPair, type PairRegion } from '@/services/pairCatalog';
import { pairManager, type DownloadProgress } from '@/services/pairManager';
import { useHaptic } from '@/hooks/useHaptic';
import { Linking } from 'react-native';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

const REGION_LABELS: Record<PairRegion, string> = {
    europe: '🇪🇺 Europe',
    americas: '🌎 Americas',
    asia: '🌏 Asia',
    meaf: '🌍 ME/AF',
    other: '🌐 Other',
};

const BUNDLE_META: Record<string, { name: string; emoji: string; price: number; rcId: string }> = {
    '25': { name: 'Traveler', emoji: '🧳', price: 49, rcId: 'windy_bundle_traveler' },
    '200': { name: 'Polyglot', emoji: '🗣️', price: 149, rcId: 'windy_bundle_polyglot' },
};

export default function BundleSelect() {
    const router = useRouter();
    const haptic = useHaptic();
    const { count: countParam } = useLocalSearchParams<{ count: string }>();
    const maxCount = parseInt(countParam || '25', 10);
    const bundleInfo = BUNDLE_META[countParam || '25'] ?? BUNDLE_META['25'];

    const [catalog, setCatalog] = useState<TranslationPair[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [activeRegions, setActiveRegions] = useState<Set<PairRegion>>(new Set());
    const [downloading, setDownloading] = useState(false);
    const [downloadStatus, setDownloadStatus] = useState('');
    const [loading, setLoading] = useState(true);
    const [confirmDisabled, setConfirmDisabled] = useState(false);

    useEffect(() => {
        const pairs = pairCatalogService.getCatalog();
        setCatalog(pairs);
        setLoading(false);

        // Pre-select top pairs up to max
        const preSelected = new Set(
            pairs.slice(0, Math.min(maxCount, pairs.length)).map((p) => p.id)
        );
        setSelected(preSelected);
    }, [maxCount]);

    const togglePair = useCallback((pairId: string) => {
        haptic.light();
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(pairId)) {
                next.delete(pairId);
            } else if (next.size < maxCount) {
                next.add(pairId);
            } else {
                Alert.alert('Limit Reached', `You can select up to ${maxCount} pairs in this bundle.`);
            }
            return next;
        });
    }, [maxCount, haptic]);

    const selectRegion = (region: PairRegion) => {
        haptic.light();
        const regionPairs = catalog.filter((p) => p.region === region);
        setActiveRegions((prev) => {
            const next = new Set(prev);
            if (next.has(region)) {
                // Deselect all pairs from this region
                next.delete(region);
                setSelected((prevSel) => {
                    const nextSel = new Set(prevSel);
                    for (const p of regionPairs) nextSel.delete(p.id);
                    return nextSel;
                });
            } else {
                // Select all pairs from this region (up to limit)
                next.add(region);
                setSelected((prevSel) => {
                    const nextSel = new Set(prevSel);
                    for (const p of regionPairs) {
                        if (nextSel.size < maxCount) nextSel.add(p.id);
                    }
                    return nextSel;
                });
            }
            return next;
        });
    };

    const clearAll = () => {
        haptic.light();
        setSelected(new Set());
        setActiveRegions(new Set());
    };

    const handleConfirm = async () => {
        if (selected.size === 0) {
            Alert.alert('No Pairs Selected', 'Select at least one translation pair.');
            return;
        }
        // Prevent double-tap
        if (confirmDisabled || downloading) return;

        setConfirmDisabled(true);
        haptic.medium();

        // Open purchase URL (follows existing pattern)
        try {
            await Linking.openURL(`https://windypro.thewindstorm.uk/bundles/${bundleInfo.rcId}`);
        } catch {
            Alert.alert('Error', 'Could not open the purchase page.');
            setConfirmDisabled(false);
            return;
        }

        // Start downloads for selected pairs
        setDownloading(true);
        const pairsToDownload = catalog
            .filter((p) => selected.has(p.id))
            .map((p) => ({ id: p.id, cdnUrl: p.cdnUrl }));

        let completed = 0;
        let failed = 0;
        for (const pair of pairsToDownload) {
            setDownloadStatus(`Downloading ${completed + 1}/${pairsToDownload.length}…`);
            const result = await pairManager.downloadPair(pair.id, pair.cdnUrl);
            if (result === true) {
                completed++;
            } else {
                failed++;
            }
        }

        // Record bundle purchase
        const bundleId = maxCount === 25 ? 'bundle-traveler' : 'bundle-polyglot';
        await pairCatalogService.recordBundlePurchase(bundleId);

        setDownloading(false);
        setConfirmDisabled(false);
        haptic.success();

        if (failed > 0) {
            Alert.alert(
                '🎉 Bundle Activated',
                `${completed} pairs downloaded successfully. ${failed} failed — you can retry later from the Marketplace.`,
                [{ text: 'OK', onPress: () => router.back() }]
            );
        } else {
            Alert.alert(
                '🎉 Bundle Activated!',
                `${completed} translation pairs are ready to use.`,
                [{ text: 'Awesome!', onPress: () => router.back() }]
            );
        }
    };

    const regions: PairRegion[] = ['europe', 'americas', 'asia', 'meaf'];

    const renderPair = useCallback(({ item }: { item: TranslationPair }) => {
        const isSelected = selected.has(item.id);
        return (
            <Pressable
                style={[styles.pairRow, isSelected && styles.pairRowSelected]}
                onPress={() => togglePair(item.id)}
                accessible={true}
                accessibilityLabel={`${item.sourceFlag} ${item.sourceName} to ${item.targetFlag} ${item.targetName}${isSelected ? ', selected' : ''}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
            >
                <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.pairFlags}>
                    {item.sourceFlag} → {item.targetFlag}
                </Text>
                <View style={styles.pairInfo}>
                    <Text style={styles.pairName} numberOfLines={1}>
                        {item.sourceName} → {item.targetName}
                    </Text>
                    <Text style={styles.pairMeta}>
                        {item.qualityLabel} · {item.sizeMB} MB
                    </Text>
                </View>
            </Pressable>
        );
    }, [selected, togglePair]);

    if (loading) {
        return (
            <SafeAreaView style={styles.safeArea} edges={['top']}>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={colors.accent} />
                    <Text style={{ fontSize: 15, color: colors.textSecondary, marginTop: spacing.md }}>Loading pairs…</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <ScreenErrorBoundary screenName="Bundle Select">
        <SafeAreaView style={styles.safeArea} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable
                    onPress={() => router.back()}
                    style={styles.backBtn}
                    accessibilityLabel="Go back"
                    accessibilityRole="button"
                >
                    <Text style={styles.backText}>← Back</Text>
                </Pressable>
                <View style={styles.headerInfo}>
                    <Text style={styles.headerTitle}>
                        {bundleInfo.emoji} {bundleInfo.name}
                    </Text>
                    <Text style={styles.headerSubtitle}>
                        Select up to {maxCount} pairs · ${bundleInfo.price}
                    </Text>
                </View>
            </View>

            {/* Counter */}
            <View style={styles.counter}>
                <Text style={styles.counterText}>
                    {selected.size} / {maxCount} selected
                </Text>
                <Pressable
                    onPress={clearAll}
                    style={styles.clearBtn}
                    accessibilityLabel="Clear selection"
                    accessibilityRole="button"
                >
                    <Text style={styles.clearBtnText}>Clear All</Text>
                </Pressable>
            </View>

            {/* Region quick-select */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.regionScroll}
                contentContainerStyle={styles.regionScrollContent}
            >
                {regions.map((region) => {
                    const isActive = activeRegions.has(region);
                    return (
                        <Pressable
                            key={region}
                            style={[styles.regionBtn, isActive && styles.regionBtnActive]}
                            onPress={() => selectRegion(region)}
                            accessibilityLabel={`${isActive ? 'Deselect' : 'Select'} all ${REGION_LABELS[region]} pairs`}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: isActive }}
                        >
                            <Text style={[styles.regionBtnText, isActive && styles.regionBtnTextActive]}>
                                {isActive ? '✓ ' : ''}{REGION_LABELS[region]}
                            </Text>
                        </Pressable>
                    );
                })}
            </ScrollView>

            {/* Pair list */}
            <FlatList
                data={catalog}
                renderItem={renderPair}
                keyExtractor={(item) => item.id}
                style={styles.list}
                contentContainerStyle={styles.listContent}
            />

            {/* Confirm button */}
            <View style={styles.bottomBar}>
                {downloading ? (
                    <View style={styles.downloadingRow}>
                        <ActivityIndicator color={colors.accent} />
                        <Text style={styles.downloadingText}>{downloadStatus}</Text>
                    </View>
                ) : (
                    <Pressable
                        style={[styles.confirmBtn, (selected.size === 0 || confirmDisabled) && styles.confirmBtnDisabled]}
                        onPress={handleConfirm}
                        disabled={selected.size === 0 || confirmDisabled}
                        accessibilityLabel={`Confirm ${bundleInfo.name} bundle with ${selected.size} pairs for $${bundleInfo.price}`}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: selected.size === 0 || confirmDisabled }}
                    >
                        <Text style={styles.confirmBtnText}>
                            Confirm {bundleInfo.name} · ${bundleInfo.price}
                        </Text>
                    </Pressable>
                )}
            </View>
        </SafeAreaView>
        </ScreenErrorBoundary>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    header: {
        paddingHorizontal: spacing.screenPadding,
        paddingTop: spacing.md,
        paddingBottom: spacing.sm,
    },
    backBtn: { minWidth: 48, minHeight: 48, justifyContent: 'center' },
    backText: { fontSize: 16, color: colors.accent },
    headerInfo: { marginTop: spacing.xs },
    headerTitle: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
    headerSubtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },

    // Counter
    counter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.screenPadding,
        paddingVertical: spacing.sm,
    },
    counterText: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.accent,
    },
    clearBtn: {
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.md,
        minHeight: 36,
        justifyContent: 'center',
    },
    clearBtnText: {
        fontSize: 13,
        color: colors.stateError,
        fontWeight: '600',
    },

    // Region buttons
    regionScroll: {
        paddingHorizontal: spacing.screenPadding,
        marginBottom: spacing.sm,
        maxHeight: 50,
    },
    regionScrollContent: {
        gap: spacing.sm,
    },
    regionBtn: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.full,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.borderLight,
        minHeight: 36,
        justifyContent: 'center',
    },
    regionBtnActive: {
        backgroundColor: colors.accentTransparent,
        borderColor: colors.accent,
    },
    regionBtnText: {
        fontSize: 13,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    regionBtnTextActive: {
        color: colors.accent,
        fontWeight: '700',
    },

    // Pair list
    list: { flex: 1 },
    listContent: {
        paddingHorizontal: spacing.screenPadding,
        paddingBottom: spacing.md,
    },
    pairRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: borderRadius.md,
        padding: spacing.md,
        marginBottom: spacing.xs,
        gap: spacing.sm,
        minHeight: 56,
    },
    pairRowSelected: {
        borderWidth: 1,
        borderColor: colors.accent,
        backgroundColor: 'rgba(163, 230, 53, 0.05)',
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxActive: {
        backgroundColor: colors.accent,
        borderColor: colors.accent,
    },
    checkmark: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.background,
    },
    pairFlags: { fontSize: 18 },
    pairInfo: { flex: 1 },
    pairName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    pairMeta: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },

    // Bottom bar
    bottomBar: {
        paddingHorizontal: spacing.screenPadding,
        paddingVertical: spacing.md,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        backgroundColor: colors.background,
    },
    confirmBtn: {
        backgroundColor: colors.accent,
        paddingVertical: spacing.md,
        borderRadius: borderRadius.md,
        alignItems: 'center',
        minHeight: 56,
        justifyContent: 'center',
    },
    confirmBtnDisabled: {
        opacity: 0.4,
    },
    confirmBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.background,
    },
    downloadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.md,
    },
    downloadingText: {
        fontSize: 14,
        color: colors.textSecondary,
    },
});
