/**
 * 🧬 RP2-3.1 — Sync Status Banner (Enhanced)
 * Shows Wi-Fi sync progress, pending count, network type, last sync time
 */
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { colors, spacing, borderRadius, fontSizes } from '@/theme';
import { syncManager, type SyncState } from '@/services/sync-manager';
import { feedbackService } from '@/services/feedback';

export function SyncStatusBanner() {
    const [state, setState] = useState<SyncState | null>(null);
    const progressAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        syncManager.initialize().then(() => {
            setState(syncManager.getState());
        });

        const unsub = syncManager.onStateChange((s) => {
            setState(s);
            Animated.timing(progressAnim, {
                toValue: s.overallProgress / 100,
                duration: 300,
                useNativeDriver: false,
            }).start();
        });

        return unsub;
    }, []);

    const handleSync = async () => {
        await feedbackService.tap();
        await syncManager.manualSync();
    };

    if (!state) return null;

    const { pendingCount, isSyncing, overallProgress, lastSyncTime, networkType } = state;

    const networkIcon = networkType === 'wifi' ? '📶' : networkType === 'cellular' ? '📱' : '📵';
    const networkLabel = networkType === 'wifi' ? 'Wi-Fi' : networkType === 'cellular' ? 'Cellular' : 'Offline';

    const lastSync = lastSyncTime
        ? new Date(lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'Never';

    if (pendingCount === 0 && !isSyncing) return null;

    return (
        <View style={styles.container}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            accessibilityLabel={
                isSyncing
                    ? `Syncing: ${overallProgress}% complete on ${networkLabel}`
                    : `${pendingCount} items pending sync on ${networkLabel}. Last sync: ${lastSync}`
            }
        >
            <View style={styles.row}>
                <View style={styles.leftCol}>
                    <Text style={styles.label} importantForAccessibility="no">{networkIcon} {networkLabel}</Text>
                    <Text style={styles.detail} importantForAccessibility="no">
                        {isSyncing
                            ? `⬆️ Uploading... ${overallProgress}%`
                            : `${pendingCount} pending`}
                    </Text>
                </View>
                <View style={styles.rightCol}>
                    <Pressable onPress={handleSync} style={styles.syncBtn} disabled={isSyncing}
                        accessibilityLabel={isSyncing ? 'Syncing in progress' : 'Start sync now'}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: isSyncing }}
                    >
                        <Text style={styles.syncBtnText} importantForAccessibility="no">
                            {isSyncing ? '⌛ Syncing' : '🔄 Sync'}
                        </Text>
                    </Pressable>
                    <Text style={styles.lastSync} importantForAccessibility="no">Last: {lastSync}</Text>
                </View>
            </View>

            {/* Queue overflow warning */}
            {pendingCount > 100 && !isSyncing && (
                <View style={styles.warningRow}
                    accessibilityRole="alert"
                >
                    <Text style={styles.warningText}>
                        ⚠️ {pendingCount} items queued — connect to Wi-Fi to sync
                    </Text>
                </View>
            )}

            {/* Progress bar */}
            {isSyncing && (
                <View style={styles.progressTrack} importantForAccessibility="no">
                    <Animated.View
                        style={[
                            styles.progressFill,
                            {
                                width: progressAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: ['0%', '100%'],
                                }),
                            },
                        ]}
                    />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.md,
        padding: spacing.sm,
        marginHorizontal: spacing.screenPadding,
        marginTop: spacing.sm,
        borderWidth: 1,
        borderColor: colors.border,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    leftCol: { flex: 1 },
    rightCol: { alignItems: 'flex-end' },
    label: {
        color: colors.textPrimary,
        fontSize: fontSizes.sm,
        fontWeight: '600',
    },
    detail: {
        color: colors.textSecondary,
        fontSize: fontSizes.xs,
        marginTop: 2,
    },
    syncBtn: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
        backgroundColor: colors.accent + '20',
        borderRadius: borderRadius.sm,
    },
    syncBtnText: {
        color: colors.accent,
        fontSize: fontSizes.xs,
        fontWeight: '600',
    },
    lastSync: {
        color: colors.textTertiary,
        fontSize: 10,
        marginTop: 3,
    },
    progressTrack: {
        height: 4,
        backgroundColor: colors.border,
        borderRadius: 2,
        marginTop: spacing.xs,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: colors.accent,
        borderRadius: 2,
    },
    warningRow: {
        marginTop: spacing.xs,
        paddingVertical: 4,
        paddingHorizontal: spacing.xs,
        backgroundColor: 'rgba(234, 179, 8, 0.15)',
        borderRadius: borderRadius.sm,
    },
    warningText: {
        color: '#eab308',
        fontSize: 11,
        fontWeight: '600',
    },
});
