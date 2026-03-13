/**
 * 🧬 L3.4 — Storage Bar Component
 * Visual bar showing used vs available disk space for translation pairs.
 */
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius } from '@/theme';

interface StorageBarProps {
    usedBytes: number;
    freeBytes: number;
}

function formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function StorageBar({ usedBytes, freeBytes }: StorageBarProps) {
    const totalBytes = usedBytes + freeBytes;
    const fraction = totalBytes > 0 ? Math.min(usedBytes / totalBytes, 1) : 0;
    const percentage = Math.round(fraction * 100);

    // Color shifts from green → yellow → red as storage fills
    let barColor: string = colors.accent;
    if (percentage > 80) barColor = colors.stateError;
    else if (percentage > 60) barColor = colors.stateProcessing;

    return (
        <View
            style={styles.container}
            accessible={true}
            accessibilityLabel={`Storage: ${formatBytes(usedBytes)} used of ${formatBytes(totalBytes)} total, ${percentage}% full`}
            accessibilityRole="progressbar"
        >
            <View style={styles.labelRow}>
                <Text style={styles.label}>
                    💾 Used: {formatBytes(usedBytes)} / {formatBytes(totalBytes)}
                </Text>
                <Text style={[styles.percentage, { color: barColor }]}>
                    {percentage}%
                </Text>
            </View>
            <View style={styles.track}>
                <View
                    style={[
                        styles.fill,
                        {
                            width: `${Math.max(fraction * 100, 1)}%`,
                            backgroundColor: barColor,
                        },
                    ]}
                />
            </View>
            <Text style={styles.freeLabel}>
                {formatBytes(freeBytes)} free
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
    },
    labelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    label: {
        fontSize: 13,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    percentage: {
        fontSize: 13,
        fontWeight: '700',
    },
    track: {
        height: 8,
        backgroundColor: colors.surfaceLight,
        borderRadius: 4,
        overflow: 'hidden',
    },
    fill: {
        height: 8,
        borderRadius: 4,
    },
    freeLabel: {
        fontSize: 11,
        color: colors.textTertiary,
        marginTop: spacing.xs,
        textAlign: 'right',
    },
});
