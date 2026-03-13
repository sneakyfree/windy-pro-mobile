/**
 * 🧬 L3.4 — Pair Card Component
 * Reusable card for displaying a translation pair with action buttons.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius } from '@/theme';
import type { TranslationPair } from '@/services/pairCatalog';

interface PairCardProps {
    pair: TranslationPair;
    onBuy?: (pairId: string) => void;
    onDownload?: (pairId: string) => void;
    progress?: number;         // 0.0 – 1.0 download progress
    isOwned: boolean;
    isDownloaded: boolean;
}

const QUALITY_LABELS: Record<number, { label: string; color: string }> = {
    5: { label: '★★★★★', color: colors.accent },
    4: { label: '★★★★☆', color: colors.accentSecondary },
    3: { label: '★★★☆☆', color: colors.stateProcessing },
    2: { label: '★★☆☆☆', color: colors.textTertiary },
    1: { label: '★☆☆☆☆', color: colors.textTertiary },
};

function PairCardInner({
    pair,
    onBuy,
    onDownload,
    progress,
    isOwned = false,
    isDownloaded = false,
}: PairCardProps) {
    const router = useRouter();

    // Guard against missing/undefined pair
    if (!pair || !pair.id) {
        return null;
    }

    const quality = QUALITY_LABELS[pair.quality] ?? QUALITY_LABELS[3];

    const handlePress = () => {
        router.push({ pathname: '/market/pair-detail', params: { id: pair.id } });
    };

    const renderAction = () => {
        if (isDownloaded) {
            return (
                <View style={[styles.actionBtn, styles.downloadedBtn]}>
                    <Text style={styles.downloadedText}>✅ Downloaded</Text>
                </View>
            );
        }

        if (progress !== undefined && progress > 0 && progress < 1) {
            return (
                <View style={styles.progressContainer}>
                    <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                    </View>
                    <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
                </View>
            );
        }

        if (isOwned) {
            return (
                <Pressable
                    style={[styles.actionBtn, styles.downloadBtn]}
                    onPress={() => onDownload?.(pair.id)}
                    accessibilityLabel={`Download ${pair.sourceName} to ${pair.targetName}`}
                    accessibilityRole="button"
                >
                    <Text style={styles.downloadBtnText}>⬇️ Download</Text>
                </Pressable>
            );
        }

        return (
            <Pressable
                style={[styles.actionBtn, styles.buyBtn]}
                onPress={() => onBuy?.(pair.id)}
                accessibilityLabel={`Buy ${pair.sourceName} to ${pair.targetName} for $${pair.price}`}
                accessibilityRole="button"
            >
                <Text style={styles.buyBtnText}>Buy ${pair.price}</Text>
            </Pressable>
        );
    };

    return (
        <Pressable
            style={styles.card}
            onPress={handlePress}
            accessible={true}
            accessibilityLabel={`${pair.sourceFlag} ${pair.sourceName} to ${pair.targetFlag} ${pair.targetName}, ${pair.qualityLabel} quality, ${pair.sizeMB} MB`}
            accessibilityRole="button"
            accessibilityHint="Opens pair details"
        >
            <View style={styles.flagRow}>
                <Text style={styles.flags}>
                    {pair.sourceFlag} → {pair.targetFlag}
                </Text>
                {pair.bidirectional && (
                    <Text style={styles.biLabel}>↔</Text>
                )}
            </View>

            <Text style={styles.pairName} numberOfLines={1}>
                {pair.sourceName} → {pair.targetName}
            </Text>

            <View style={styles.metaRow}>
                <Text style={[styles.quality, { color: quality.color }]}>{quality.label}</Text>
                <Text style={styles.size}>{pair.sizeMB} MB</Text>
            </View>

            {renderAction()}
        </Pressable>
    );
}

export const PairCard = React.memo(PairCardInner);

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginBottom: spacing.sm,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    flagRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        marginBottom: spacing.xs,
    },
    flags: {
        fontSize: 22,
    },
    biLabel: {
        fontSize: 14,
        color: colors.accentSecondary,
        fontWeight: '600',
    },
    pairName: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: spacing.xs,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.sm,
    },
    quality: {
        fontSize: 12,
        fontWeight: '600',
    },
    size: {
        fontSize: 12,
        color: colors.textTertiary,
    },
    actionBtn: {
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.md,
        alignItems: 'center',
        minHeight: 48,
        justifyContent: 'center',
    },
    buyBtn: {
        backgroundColor: colors.accent,
    },
    buyBtnText: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.background,
    },
    downloadBtn: {
        backgroundColor: colors.accentSecondary,
    },
    downloadBtnText: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.background,
    },
    downloadedBtn: {
        backgroundColor: 'rgba(163, 230, 53, 0.08)',
        borderWidth: 1,
        borderColor: colors.accent,
    },
    downloadedText: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.accent,
    },
    progressContainer: {
        gap: spacing.xs,
    },
    progressTrack: {
        height: 6,
        backgroundColor: colors.surfaceLight,
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: 6,
        backgroundColor: colors.accent,
        borderRadius: 3,
    },
    progressText: {
        fontSize: 11,
        color: colors.textSecondary,
        textAlign: 'center',
    },
});
