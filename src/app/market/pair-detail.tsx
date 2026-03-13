/**
 * 🧬 L3.3 — Pair Detail Screen
 * Individual translation pair detail with quality, description, sample
 * translations, and buy/download button.
 *
 * Route params:
 *   id: pair ID (e.g. "windy-pair-en-es")
 */
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Pressable,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius } from '@/theme';
import { pairCatalogService, type TranslationPair } from '@/services/pairCatalog';
import { pairManager, type DownloadProgress } from '@/services/pairManager';
import { useHaptic } from '@/hooks/useHaptic';
import { Linking } from 'react-native';

const QUALITY_MAP: Record<number, { stars: string; color: string }> = {
    5: { stars: '★★★★★', color: colors.accent },
    4: { stars: '★★★★☆', color: colors.accentSecondary },
    3: { stars: '★★★☆☆', color: colors.stateProcessing },
    2: { stars: '★★☆☆☆', color: colors.textTertiary },
    1: { stars: '★☆☆☆☆', color: colors.textTertiary },
};

/** Sample translations for demo — keyed by target language */
const SAMPLE_TRANSLATIONS: Record<string, { source: string; target: string }[]> = {
    es: [
        { source: 'Hello, how are you?', target: 'Hola, ¿cómo estás?' },
        { source: 'Where is the train station?', target: '¿Dónde está la estación de tren?' },
        { source: 'Thank you very much', target: 'Muchas gracias' },
    ],
    fr: [
        { source: 'Good morning', target: 'Bonjour' },
        { source: 'I would like a coffee, please', target: 'Je voudrais un café, s\'il vous plaît' },
        { source: 'How much does this cost?', target: 'Combien ça coûte ?' },
    ],
    de: [
        { source: 'Excuse me, where is the museum?', target: 'Entschuldigung, wo ist das Museum?' },
        { source: 'I need help', target: 'Ich brauche Hilfe' },
        { source: 'The weather is beautiful today', target: 'Das Wetter ist heute schön' },
    ],
    ja: [
        { source: 'Nice to meet you', target: 'はじめまして' },
        { source: 'Thank you', target: 'ありがとうございます' },
        { source: 'Where is the exit?', target: '出口はどこですか？' },
    ],
    zh: [
        { source: 'Hello', target: '你好' },
        { source: 'How much is this?', target: '这个多少钱？' },
        { source: 'I don\'t understand', target: '我不明白' },
    ],
};

const DEFAULT_SAMPLES = [
    { source: 'Hello', target: '(Translation available after download)' },
    { source: 'Thank you', target: '(Translation available after download)' },
    { source: 'Goodbye', target: '(Translation available after download)' },
];

export default function PairDetail() {
    const router = useRouter();
    const haptic = useHaptic();
    const { id } = useLocalSearchParams<{ id: string }>();

    const [pair, setPair] = useState<TranslationPair | null>(null);
    const [isOwned, setIsOwned] = useState(false);
    const [isDownloaded, setIsDownloaded] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);

    useEffect(() => {
        if (!id) return;

        const pairData = pairCatalogService.getPair(id);
        setPair(pairData ?? null);

        // Check ownership
        setIsOwned(pairCatalogService.isOwned(id));

        // Check download status
        pairManager.isDownloaded(id).then(setIsDownloaded).catch(() => {});
    }, [id]);

    const handleBuy = () => {
        if (!pair) return;
        haptic.medium();
        Linking.openURL(`https://windypro.thewindstorm.uk/pairs/${pair.revenueCatProductId}`).catch(() => {
            Alert.alert('Error', 'Could not open the purchase page.');
        });
    };

    const handleDownload = async () => {
        if (!pair) return;
        haptic.medium();
        setDownloading(true);

        const onProgress = (progress: DownloadProgress) => {
            setDownloadProgress(progress.fraction);
        };

        const success = await pairManager.downloadPair(pair.id, pair.cdnUrl, onProgress);

        setDownloading(false);
        setDownloadProgress(0);

        if (success) {
            haptic.success();
            setIsDownloaded(true);
        } else {
            haptic.error();
            Alert.alert('Download Failed', 'Could not download this pair. Check storage and try again.');
        }
    };

    const handleDelete = () => {
        if (!pair) return;
        Alert.alert(
            'Delete Engine',
            `Remove "${pair.sourceName} → ${pair.targetName}" from your device?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        haptic.medium();
                        await pairManager.deletePair(pair.id);
                        setIsDownloaded(false);
                    },
                },
            ]
        );
    };

    if (!pair) {
        return (
            <SafeAreaView style={styles.safeArea} edges={['top']}>
                <View style={styles.centered}>
                    <Text style={styles.errorText}>Pair not found</Text>
                    <Pressable onPress={() => router.back()} accessibilityRole="button">
                        <Text style={styles.backText}>← Back</Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        );
    }

    const q = QUALITY_MAP[pair.quality] ?? QUALITY_MAP[3];
    const samples = SAMPLE_TRANSLATIONS[pair.target] ?? DEFAULT_SAMPLES;

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

                {/* Pair header */}
                <View style={styles.pairHeader}>
                    <Text style={styles.pairFlags}>
                        {pair.sourceFlag} ↔ {pair.targetFlag}
                    </Text>
                    <Text style={styles.pairTitle}>
                        {pair.sourceName} ↔ {pair.targetName}
                    </Text>
                    {pair.bidirectional && (
                        <View style={styles.bidirectionalBadge}>
                            <Text style={styles.bidirectionalText}>↔ Bidirectional</Text>
                        </View>
                    )}
                </View>

                {/* Quality & Meta */}
                <View style={styles.metaCard}>
                    <View style={styles.metaRow}>
                        <Text style={styles.metaLabel}>Quality</Text>
                        <Text style={[styles.metaValue, { color: q.color }]}>
                            {q.stars} {pair.qualityLabel}
                        </Text>
                    </View>
                    <View style={styles.metaRow}>
                        <Text style={styles.metaLabel}>Size</Text>
                        <Text style={styles.metaValue}>{pair.sizeMB} MB</Text>
                    </View>
                    <View style={styles.metaRow}>
                        <Text style={styles.metaLabel}>Region</Text>
                        <Text style={styles.metaValue}>{pair.region.toUpperCase()}</Text>
                    </View>
                    <View style={[styles.metaRow, styles.metaRowLast]}>
                        <Text style={styles.metaLabel}>Source</Text>
                        <Text style={styles.metaValue}>{pair.source.toUpperCase()} ↔ {pair.target.toUpperCase()}</Text>
                    </View>
                </View>

                {/* Description */}
                <View style={styles.descCard}>
                    <Text style={styles.descTitle}>About</Text>
                    <Text style={styles.descText}>{pair.description}</Text>
                </View>

                {/* Sample translations */}
                <View style={styles.samplesCard}>
                    <Text style={styles.samplesTitle}>Sample Translations</Text>
                    {samples.map((s, i) => (
                        <View key={`sample-${i}`} style={styles.sampleRow}>
                            <Text style={styles.sampleSource}>"{s.source}"</Text>
                            <Text style={styles.sampleArrow}>→</Text>
                            <Text style={styles.sampleTarget}>"{s.target}"</Text>
                        </View>
                    ))}
                </View>

                {/* Action buttons */}
                <View style={styles.actions}>
                    {isDownloaded ? (
                        <>
                            <View style={styles.downloadedBanner}>
                                <Text style={styles.downloadedText}>✅ Downloaded & Ready</Text>
                            </View>
                            <Pressable
                                style={styles.deleteBtn}
                                onPress={handleDelete}
                                accessibilityLabel="Delete this translation pair"
                                accessibilityRole="button"
                            >
                                <Text style={styles.deleteBtnText}>🗑 Remove from Device</Text>
                            </Pressable>
                        </>
                    ) : downloading ? (
                        <View style={styles.downloadingContainer}>
                            <View style={styles.progressTrack}>
                                <View style={[styles.progressFill, { width: `${downloadProgress * 100}%` }]} />
                            </View>
                            <View style={styles.downloadingRow}>
                                <ActivityIndicator size="small" color={colors.accent} />
                                <Text style={styles.downloadingText}>
                                    Downloading… {Math.round(downloadProgress * 100)}%
                                </Text>
                            </View>
                        </View>
                    ) : isOwned ? (
                        <Pressable
                            style={styles.downloadBtn}
                            onPress={handleDownload}
                            accessibilityLabel={`Download ${pair.sourceName} to ${pair.targetName}`}
                            accessibilityRole="button"
                        >
                            <Text style={styles.downloadBtnText}>⬇️ Download ({pair.sizeMB} MB)</Text>
                        </Pressable>
                    ) : (
                        <Pressable
                            style={styles.buyBtn}
                            onPress={handleBuy}
                            accessibilityLabel={`Buy ${pair.sourceName} to ${pair.targetName} for $${pair.price}`}
                            accessibilityRole="button"
                        >
                            <Text style={styles.buyBtnText}>Buy — ${pair.price}</Text>
                        </Pressable>
                    )}
                </View>

                {/* Tier info */}
                {pair.includedInTier !== 'none' && (
                    <Text style={styles.tierNote}>
                        💎 Included in {pair.includedInTier.charAt(0).toUpperCase() + pair.includedInTier.slice(1)} tier
                    </Text>
                )}
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
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md },
    errorText: { fontSize: 16, color: colors.textSecondary },
    backBtn: { minWidth: 48, minHeight: 48, justifyContent: 'center', marginBottom: spacing.md },
    backText: { fontSize: 16, color: colors.accent },

    // Pair header
    pairHeader: {
        alignItems: 'center',
        marginBottom: spacing.lg,
    },
    pairFlags: {
        fontSize: 48,
        marginBottom: spacing.sm,
    },
    pairTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: colors.textPrimary,
        textAlign: 'center',
        marginBottom: spacing.xs,
    },
    bidirectionalBadge: {
        backgroundColor: colors.accentTransparent,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.full,
    },
    bidirectionalText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.accentSecondary,
    },

    // Meta card
    metaCard: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.lg,
        marginBottom: spacing.md,
    },
    metaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    metaRowLast: {
        borderBottomWidth: 0,
    },
    metaLabel: {
        fontSize: 14,
        color: colors.textSecondary,
    },
    metaValue: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
    },

    // Description
    descCard: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.lg,
        marginBottom: spacing.md,
    },
    descTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: spacing.sm,
    },
    descText: {
        fontSize: 14,
        color: colors.textSecondary,
        lineHeight: 20,
    },

    // Samples
    samplesCard: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.lg,
        marginBottom: spacing.lg,
    },
    samplesTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: spacing.md,
    },
    sampleRow: {
        marginBottom: spacing.md,
    },
    sampleSource: {
        fontSize: 14,
        color: colors.textPrimary,
        fontStyle: 'italic',
        marginBottom: 2,
    },
    sampleArrow: {
        fontSize: 12,
        color: colors.textTertiary,
        marginBottom: 2,
    },
    sampleTarget: {
        fontSize: 14,
        color: colors.accentSecondary,
        fontStyle: 'italic',
    },

    // Action buttons
    actions: {
        marginBottom: spacing.md,
    },
    buyBtn: {
        backgroundColor: colors.accent,
        paddingVertical: spacing.md,
        borderRadius: borderRadius.md,
        alignItems: 'center',
        minHeight: 56,
        justifyContent: 'center',
    },
    buyBtnText: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.background,
    },
    downloadBtn: {
        backgroundColor: colors.accentSecondary,
        paddingVertical: spacing.md,
        borderRadius: borderRadius.md,
        alignItems: 'center',
        minHeight: 56,
        justifyContent: 'center',
    },
    downloadBtnText: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.background,
    },
    downloadedBanner: {
        backgroundColor: 'rgba(163, 230, 53, 0.1)',
        paddingVertical: spacing.md,
        borderRadius: borderRadius.md,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.accent,
        marginBottom: spacing.sm,
    },
    downloadedText: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.accent,
    },
    deleteBtn: {
        paddingVertical: spacing.md,
        borderRadius: borderRadius.md,
        alignItems: 'center',
        minHeight: 48,
        justifyContent: 'center',
    },
    deleteBtnText: {
        fontSize: 14,
        color: colors.stateError,
        fontWeight: '600',
    },

    // Download progress
    downloadingContainer: {
        gap: spacing.sm,
    },
    progressTrack: {
        height: 8,
        backgroundColor: colors.surfaceLight,
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: 8,
        backgroundColor: colors.accent,
        borderRadius: 4,
    },
    downloadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
    },
    downloadingText: {
        fontSize: 14,
        color: colors.textSecondary,
    },

    // Tier note
    tierNote: {
        fontSize: 13,
        color: colors.textTertiary,
        textAlign: 'center',
        marginBottom: spacing.xl,
    },
});
