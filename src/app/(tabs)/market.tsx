/**
 * 🧬 L3.2 — Marketplace Screen
 * Browse, purchase, and download translation pairs.
 *
 * Sections:
 *   1. Marco Polo Hero (dismissible, 7-day reshow)
 *   2. Bundle Cards (horizontal scroll)
 *   3. Your Engines (downloaded pairs)
 *   4. Discover (full catalog with search & filters)
 *   5. Storage Bar
 */
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    FlatList,
    TextInput,
    Pressable,
    Alert,
    Platform,
    RefreshControl,
    ActivityIndicator,
} from 'react-native';
import { useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, borderRadius } from '@/theme';
import { pairCatalogService, type TranslationPair, type PairRegion } from '@/services/pairCatalog';
import { pairManager, type DownloadProgress } from '@/services/pairManager';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useHaptic } from '@/hooks/useHaptic';
import { PairCard } from '@/components/PairCard';
import { StorageBar } from '@/components/StorageBar';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

// ─── Constants ───────────────────────────────────────────────
const MARCO_POLO_DISMISS_KEY = 'windy-marco-polo-dismissed';
const MARCO_POLO_RESHOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const REGIONS: { id: PairRegion | 'all'; label: string }[] = [
    { id: 'all', label: '🌍 All' },
    { id: 'europe', label: '🇪🇺 Europe' },
    { id: 'americas', label: '🌎 Americas' },
    { id: 'asia', label: '🌏 Asia' },
    { id: 'meaf', label: '🌍 ME/AF' },
];

const TIER_PAIR_LIMITS: Record<string, number> = {
    free: 1,
    pro: 5,
    translate: 25,
    translate_pro: 100,
};

// ─── Main Screen ─────────────────────────────────────────────

function MarketScreenInner() {
    const router = useRouter();
    const haptic = useHaptic();
    const { licenseTier } = useSettingsStore();

    // State
    const [showHero, setShowHero] = useState(false);
    const [catalog, setCatalog] = useState<TranslationPair[]>([]);
    const [downloadedIds, setDownloadedIds] = useState<string[]>([]);
    const [ownedIds, setOwnedIds] = useState<string[]>([]);
    const [usedBytes, setUsedBytes] = useState(0);
    const [freeBytes, setFreeBytes] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [regionFilter, setRegionFilter] = useState<PairRegion | 'all'>('all');
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
    const activeDownloadsRef = useRef<Set<string>>(new Set());

    const loadAllData = useCallback(async () => {
        try {
            setError(null);

            // Load catalog
            const pairs = await pairCatalogService.loadCatalog();
            setCatalog(pairs);

            // Load downloaded pairs
            const downloaded = await pairManager.getDownloadedPairs();
            setDownloadedIds(downloaded);

            // Load owned pairs
            const owned = await pairCatalogService.getOwnedPairs();
            setOwnedIds(owned);

            // Load storage info
            const storageInfo = await pairManager.getStorageInfo();
            setUsedBytes(storageInfo.usedBytes);
            setFreeBytes(storageInfo.freeBytes);

            // Check hero visibility
            const dismissedAt = await AsyncStorage.getItem(MARCO_POLO_DISMISS_KEY);
            if (dismissedAt) {
                const ts = parseInt(dismissedAt, 10);
                setShowHero(Date.now() - ts > MARCO_POLO_RESHOW_MS);
            } else {
                setShowHero(true);
            }
        } catch (err) {
            setError('Failed to load marketplace data. Pull down to retry.');
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadAllData();
        }, [loadAllData])
    );

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadAllData();
        setRefreshing(false);
    };

    const handleDismissHero = async () => {
        setShowHero(false);
        await AsyncStorage.setItem(MARCO_POLO_DISMISS_KEY, String(Date.now()));
    };

    const handleDownload = async (pairId: string) => {
        // Prevent duplicate simultaneous downloads
        if (activeDownloadsRef.current.has(pairId)) return;

        haptic.medium();
        const pair = pairCatalogService.getPair(pairId);
        if (!pair) return;

        activeDownloadsRef.current.add(pairId);

        const onProgress = (progress: DownloadProgress) => {
            setDownloadProgress((prev) => ({ ...prev, [pairId]: progress.fraction }));
        };

        try {
            const result = await pairManager.downloadPair(pairId, pair.cdnUrl, onProgress);
            setDownloadProgress((prev) => {
                const next = { ...prev };
                delete next[pairId];
                return next;
            });

            if (result === true) {
                haptic.success();
                setDownloadedIds((prev) => [...prev, pairId]);
                // Refresh storage
                const storageInfo = await pairManager.getStorageInfo();
                setUsedBytes(storageInfo.usedBytes);
                setFreeBytes(storageInfo.freeBytes);
            } else if (typeof result === 'object' && result.reason === 'offline_queued') {
                haptic.error();
                Alert.alert('You\'re Offline', 'This download has been queued and will start when you reconnect.');
            } else if (typeof result === 'object' && result.reason === 'limit_reached') {
                haptic.error();
                Alert.alert('Pair Limit Reached', `Your ${result.tier} plan allows ${result.limit} pairs. Upgrade to download more.`);
            } else {
                haptic.error();
                Alert.alert('Download Failed', 'Could not download this translation pair. Please try again.');
            }
        } finally {
            activeDownloadsRef.current.delete(pairId);
        }
    };

    const handleBuy = (pairId: string) => {
        haptic.medium();
        router.push({ pathname: '/market/pair-detail', params: { id: pairId } });
    };

    const handleDeletePair = (pairId: string, pairName: string) => {
        Alert.alert(
            'Delete Engine',
            `Remove "${pairName}" from your device? You can re-download it later.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        haptic.medium();
                        await pairManager.deletePair(pairId);
                        setDownloadedIds((prev) => prev.filter((id) => id !== pairId));
                        const storageInfo = await pairManager.getStorageInfo();
                        setUsedBytes(storageInfo.usedBytes);
                        setFreeBytes(storageInfo.freeBytes);
                    },
                },
            ]
        );
    };

    // ── Filtered catalog ──
    const filteredCatalog = catalog.filter((p) => {
        if (regionFilter !== 'all' && p.region !== regionFilter) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (
                p.sourceName.toLowerCase().includes(q) ||
                p.targetName.toLowerCase().includes(q) ||
                p.source.toLowerCase() === q ||
                p.target.toLowerCase() === q
            );
        }
        return true;
    });

    // ── Downloaded pair details ──
    const downloadedPairs = downloadedIds
        .map((id) => pairCatalogService.getPair(id))
        .filter((p): p is TranslationPair => p !== undefined);

    const tierLimit = TIER_PAIR_LIMITS[licenseTier] ?? 1;

    if (loading) {
        return (
            <SafeAreaView style={styles.loadingContainer} edges={['top']}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={styles.loadingText}>Loading marketplace…</Text>
            </SafeAreaView>
        );
    }

    if (error && catalog.length === 0) {
        return (
            <SafeAreaView style={styles.loadingContainer} edges={['top']}>
                <Text style={styles.errorEmoji}>⚠️</Text>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable
                    style={styles.retryBtn}
                    onPress={() => {
                        setLoading(true);
                        loadAllData();
                    }}
                    accessibilityLabel="Retry loading marketplace"
                    accessibilityRole="button"
                >
                    <Text style={styles.retryBtnText}>Retry</Text>
                </Pressable>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea} edges={['top']}>
            <ScrollView
                style={styles.container}
                contentContainerStyle={styles.content}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        tintColor={colors.accent}
                    />
                }
            >
                {/* Header */}
                <Text style={styles.headerTitle} accessibilityRole="header">
                    🛒 Marketplace
                </Text>
                <Text style={styles.headerSubtitle}>
                    Translation engines for offline use
                </Text>

                {/* ── 1. Marco Polo Hero ── */}
                {showHero && (
                    <View style={styles.heroWrapper}>
                    <View style={styles.heroCard}>
                            <Pressable
                                style={styles.heroDismiss}
                                onPress={handleDismissHero}
                                accessibilityLabel="Dismiss Marco Polo banner"
                                accessibilityRole="button"
                            >
                                <Text style={styles.heroDismissText}>✕</Text>
                            </Pressable>

                            <Text style={styles.heroEmoji}>🧭</Text>
                            <Text style={styles.heroTitle}>Marco Polo's Magic Box</Text>
                            <Text style={styles.heroStats}>
                                2,500 engines · $999 · Forever
                            </Text>
                            <Text style={styles.heroSavings}>
                                $17,475 value — Save $16,476
                            </Text>

                            <Pressable
                                style={styles.heroBtn}
                                onPress={() => router.push('/market/marco-polo')}
                                accessibilityLabel="Explore Marco Polo bundle"
                                accessibilityRole="button"
                            >
                                <Text style={styles.heroBtnText}>Explore →</Text>
                            </Pressable>
                        </View>
                    </View>
                )}

                {/* ── 2. Bundle Cards ── */}
                <Text style={styles.sectionTitle} accessibilityRole="header">
                    Bundles
                </Text>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.bundleScroll}
                    contentContainerStyle={styles.bundleScrollContent}
                >
                    <BundleCard
                        emoji="🧳"
                        name="Traveler"
                        count={25}
                        price={49}
                        color="#2dd4bf"
                        onPress={() => router.push({ pathname: '/market/bundle-select', params: { count: '25' } })}
                    />
                    <BundleCard
                        emoji="🗣️"
                        name="Polyglot"
                        count={200}
                        price={149}
                        color="#a78bfa"
                        onPress={() => router.push({ pathname: '/market/bundle-select', params: { count: '200' } })}
                    />
                    <BundleCard
                        emoji="🧭"
                        name="Marco Polo"
                        count={-1}
                        price={999}
                        color="#d4a017"
                        onPress={() => router.push('/market/marco-polo')}
                    />
                </ScrollView>

                {/* ── 3. Your Engines ── */}
                <Text style={styles.sectionTitle} accessibilityRole="header">
                    Your Engines
                </Text>
                {downloadedPairs.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyEmoji}>📦</Text>
                        <Text style={styles.emptyTitle}>No engines yet</Text>
                        <Text style={styles.emptySubtitle}>
                            Your plan includes {tierLimit} free engine{tierLimit !== 1 ? 's' : ''}!
                        </Text>
                    </View>
                ) : (
                    <View style={styles.engineList}>
                        {downloadedPairs.map((pair) => (
                            <Pressable
                                key={pair.id}
                                style={styles.engineRow}
                                onLongPress={() =>
                                    handleDeletePair(pair.id, `${pair.sourceName} → ${pair.targetName}`)
                                }
                                accessibilityLabel={`${pair.sourceFlag} ${pair.sourceName} to ${pair.targetFlag} ${pair.targetName}, downloaded. Long press to delete.`}
                                accessibilityRole="button"
                                accessibilityHint="Long press to delete this engine"
                            >
                                <Text style={styles.engineFlags}>
                                    {pair.sourceFlag} → {pair.targetFlag}
                                </Text>
                                <View style={styles.engineInfo}>
                                    <Text style={styles.engineName} numberOfLines={1}>
                                        {pair.sourceName} → {pair.targetName}
                                    </Text>
                                    <Text style={styles.engineMeta}>
                                        {pair.qualityLabel} · {pair.sizeMB} MB
                                    </Text>
                                </View>
                                <Text style={styles.engineBadge}>✅</Text>
                            </Pressable>
                        ))}
                    </View>
                )}

                {/* ── 4. Discover ── */}
                <Text style={styles.sectionTitle} accessibilityRole="header">
                    Discover
                </Text>

                {/* Search */}
                <View style={styles.searchRow}>
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search languages…"
                        placeholderTextColor={colors.textTertiary}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        autoCapitalize="none"
                        autoCorrect={false}
                        accessibilityLabel="Search translation pairs"
                        maxLength={50}
                    />
                </View>

                {/* Region filter chips */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.chipScroll}
                    contentContainerStyle={styles.chipScrollContent}
                >
                    {REGIONS.map((r) => (
                        <Pressable
                            key={r.id}
                            style={[
                                styles.chip,
                                regionFilter === r.id && styles.chipActive,
                            ]}
                            onPress={() => setRegionFilter(r.id)}
                            accessibilityLabel={`Filter by ${r.label}${regionFilter === r.id ? ', selected' : ''}`}
                            accessibilityRole="button"
                            accessibilityState={{ selected: regionFilter === r.id }}
                        >
                            <Text
                                style={[
                                    styles.chipText,
                                    regionFilter === r.id && styles.chipTextActive,
                                ]}
                            >
                                {r.label}
                            </Text>
                        </Pressable>
                    ))}
                </ScrollView>

                {/* Catalog cards */}
                {filteredCatalog.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyTitle}>No pairs found</Text>
                        <Text style={styles.emptySubtitle}>Try a different search or filter</Text>
                    </View>
                ) : (
                    filteredCatalog.map((pair) => (
                        <PairCard
                            key={pair.id}
                            pair={pair}
                            isOwned={ownedIds.includes(pair.id)}
                            isDownloaded={downloadedIds.includes(pair.id)}
                            progress={downloadProgress[pair.id]}
                            onBuy={handleBuy}
                            onDownload={handleDownload}
                        />
                    ))
                )}

                {/* ── 5. Storage Bar ── */}
                <View style={styles.storageSection}>
                    <StorageBar usedBytes={usedBytes} freeBytes={freeBytes} />
                </View>

                <View style={styles.footer}>
                    <Text style={styles.footerText}>
                        Prices are one-time purchases. Download once, use forever.
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

export default function MarketScreen() {
    return (
        <ScreenErrorBoundary screenName="Market">
            <MarketScreenInner />
        </ScreenErrorBoundary>
    );
}

// ─── Bundle Card Sub-component ───────────────────────────────

interface BundleCardProps {
    emoji: string;
    name: string;
    count: number;
    price: number;
    color: string;
    onPress: () => void;
}

function BundleCard({ emoji, name, count, price, color, onPress }: BundleCardProps) {
    return (
        <Pressable
            style={[styles.bundleCard, { borderColor: color }]}
            onPress={onPress}
            accessible={true}
            accessibilityLabel={`${name} bundle, ${count === -1 ? 'all' : count} pairs, $${price}`}
            accessibilityRole="button"
        >
            <Text style={styles.bundleEmoji}>{emoji}</Text>
            <Text style={[styles.bundleName, { color }]}>{name}</Text>
            <Text style={styles.bundleCount}>
                {count === -1 ? 'All pairs' : `${count} pairs`}
            </Text>
            <Text style={styles.bundlePrice}>${price}</Text>
        </Pressable>
    );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: colors.background,
    },
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    content: {
        paddingHorizontal: spacing.screenPadding,
        paddingTop: spacing.md,
        paddingBottom: 60,
    },
    loadingContainer: {
        flex: 1,
        backgroundColor: colors.background,
        justifyContent: 'center',
        alignItems: 'center',
        gap: spacing.md,
    },
    loadingText: {
        fontSize: 15,
        color: colors.textSecondary,
    },
    errorEmoji: {
        fontSize: 48,
        marginBottom: spacing.sm,
    },
    errorText: {
        fontSize: 15,
        color: colors.textSecondary,
        textAlign: 'center',
        paddingHorizontal: spacing.xl,
    },
    retryBtn: {
        backgroundColor: colors.accent,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.xl,
        borderRadius: borderRadius.md,
        marginTop: spacing.md,
        minHeight: 48,
        justifyContent: 'center',
    },
    retryBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.background,
    },

    // Header
    headerTitle: {
        fontSize: 28,
        fontWeight: '800',
        color: colors.textPrimary,
        marginBottom: spacing.xs,
    },
    headerSubtitle: {
        fontSize: 14,
        color: colors.textSecondary,
        marginBottom: spacing.lg,
    },

    // Section titles
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.textPrimary,
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
    },

    // Hero
    heroWrapper: {
        marginBottom: spacing.md,
    },
    heroCard: {
        borderRadius: borderRadius.xl,
        padding: spacing.lg,
        alignItems: 'center',
        overflow: 'hidden',
        backgroundColor: '#1e1b4b',
    },
    heroDismiss: {
        position: 'absolute',
        top: spacing.sm,
        right: spacing.sm,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    },
    heroDismissText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    heroEmoji: {
        fontSize: 48,
        marginBottom: spacing.sm,
    },
    heroTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#f8fafc',
        marginBottom: spacing.xs,
        textAlign: 'center',
    },
    heroStats: {
        fontSize: 14,
        color: '#c7d2fe',
        marginBottom: spacing.xs,
        textAlign: 'center',
    },
    heroSavings: {
        fontSize: 15,
        fontWeight: '700',
        color: '#d4a017',
        marginBottom: spacing.md,
        textAlign: 'center',
    },
    heroBtn: {
        backgroundColor: '#d4a017',
        paddingVertical: spacing.sm + 2,
        paddingHorizontal: spacing.xl,
        borderRadius: borderRadius.md,
        minHeight: 48,
        justifyContent: 'center',
    },
    heroBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1e1b4b',
    },

    // Bundle cards
    bundleScroll: {
        marginBottom: spacing.sm,
    },
    bundleScrollContent: {
        gap: spacing.sm,
        paddingRight: spacing.md,
    },
    bundleCard: {
        width: 140,
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        borderWidth: 2,
        alignItems: 'center',
        gap: spacing.xs,
    },
    bundleEmoji: {
        fontSize: 32,
    },
    bundleName: {
        fontSize: 15,
        fontWeight: '700',
    },
    bundleCount: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    bundlePrice: {
        fontSize: 20,
        fontWeight: '800',
        color: colors.textPrimary,
    },

    // Empty state
    emptyState: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.xl,
        alignItems: 'center',
        gap: spacing.xs,
    },
    emptyEmoji: {
        fontSize: 40,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    emptySubtitle: {
        fontSize: 13,
        color: colors.textSecondary,
        textAlign: 'center',
    },

    // Engine list (Your Engines)
    engineList: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        overflow: 'hidden',
    },
    engineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md - 2,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
        minHeight: 56,
        gap: spacing.sm,
    },
    engineFlags: {
        fontSize: 20,
    },
    engineInfo: {
        flex: 1,
    },
    engineName: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    engineMeta: {
        fontSize: 11,
        color: colors.textTertiary,
        marginTop: 2,
    },
    engineBadge: {
        fontSize: 18,
    },

    // Search
    searchRow: {
        marginBottom: spacing.sm,
    },
    searchInput: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: Platform.OS === 'ios' ? spacing.md - 2 : spacing.sm,
        fontSize: 15,
        color: colors.textPrimary,
        borderWidth: 1,
        borderColor: colors.borderLight,
        minHeight: 48,
    },

    // Region chips
    chipScroll: {
        marginBottom: spacing.md,
    },
    chipScrollContent: {
        gap: spacing.sm,
    },
    chip: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.full,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.borderLight,
        minHeight: 36,
        justifyContent: 'center',
    },
    chipActive: {
        backgroundColor: colors.accentTransparent,
        borderColor: colors.accent,
    },
    chipText: {
        fontSize: 13,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    chipTextActive: {
        color: colors.accent,
        fontWeight: '700',
    },

    // Storage
    storageSection: {
        marginTop: spacing.xl,
    },

    // Footer
    footer: {
        alignItems: 'center',
        paddingVertical: spacing.lg,
    },
    footerText: {
        fontSize: 12,
        color: colors.textTertiary,
        textAlign: 'center',
    },
});
