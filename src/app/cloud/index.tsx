/**
 * 🧬 Cloud Storage Screen
 * Shows cloud sync status, uploaded sessions, and storage quota.
 * Accessed from Settings → Cloud Storage
 */
import { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Pressable,
    Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius } from '@/theme';
import { syncManager } from '@/services/sync-manager';
import { localStorageService } from '@/services/storage-local';
import { feedbackService } from '@/services/feedback';
import { useHaptic } from '@/hooks/useHaptic';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { SyncStatusBanner } from '@/components/SyncStatusBanner';

interface SyncStats {
    totalSessions: number;
    syncedCount: number;
    pendingCount: number;
    failedCount: number;
}

export default function CloudStorageScreen() {
    const router = useRouter();
    const haptic = useHaptic();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [stats, setStats] = useState<SyncStats>({
        totalSessions: 0,
        syncedCount: 0,
        pendingCount: 0,
        failedCount: 0,
    });

    const loadData = useCallback(async () => {
        try {
            const sessions = await localStorageService.getSessions();
            const syncedSessions = sessions.filter(s => s.synced);
            const pendingSessions = sessions.filter(s => !s.synced);

            setStats({
                totalSessions: sessions.length,
                syncedCount: syncedSessions.length,
                pendingCount: pendingSessions.length,
                failedCount: 0,
            });
        } catch {
            // Silently handle — show zeros
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [loadData])
    );

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const handleSyncNow = async () => {
        haptic.medium();
        setSyncing(true);
        try {
            await syncManager.manualSync();
            await loadData();
            feedbackService.success();
            Alert.alert('Sync Started', 'Uploads are processing in the background.');
        } catch {
            Alert.alert('Sync Error', 'Could not start sync. Check your connection.');
        } finally {
            setSyncing(false);
        }
    };

    const handleClearCompleted = () => {
        Alert.alert(
            'Clear Synced Data',
            'Remove completed uploads from the queue? This does not delete your recordings.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: async () => {
                        haptic.medium();
                        await syncManager.clearCompleted();
                        await loadData();
                        feedbackService.success();
                        Alert.alert('Cleared', 'Synced data queue cleared.');
                    },
                },
            ]
        );
    };

    const syncSettings = syncManager.getSettings();

    if (loading) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.accent} />
                    <Text style={styles.loadingText}>Loading cloud data…</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <ScreenErrorBoundary screenName="Cloud Storage">
            <SafeAreaView style={styles.container} edges={['top']}>
                <ScrollView
                    style={styles.scrollView}
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
                    <View style={styles.header}>
                        <Pressable
                            onPress={() => router.back()}
                            style={styles.backBtn}
                            accessibilityLabel="Go back"
                            accessibilityRole="button"
                        >
                            <Text style={styles.backText}>← Back</Text>
                        </Pressable>
                        <Text style={styles.headerTitle} accessibilityRole="header">
                            ☁️ Cloud Storage
                        </Text>
                        <Text style={styles.headerSubtitle}>
                            Sync recordings to the cloud
                        </Text>
                    </View>

                    {/* Sync Status Banner */}
                    <SyncStatusBanner />

                    {/* Stats Cards */}
                    <View style={styles.statsGrid}>
                        <View style={styles.statCard}>
                            <Text style={styles.statEmoji}>📊</Text>
                            <Text style={styles.statValue}>{stats.totalSessions}</Text>
                            <Text style={styles.statLabel}>Total Sessions</Text>
                        </View>
                        <View style={styles.statCard}>
                            <Text style={styles.statEmoji}>✅</Text>
                            <Text style={[styles.statValue, { color: '#22c55e' }]}>{stats.syncedCount}</Text>
                            <Text style={styles.statLabel}>Synced</Text>
                        </View>
                        <View style={styles.statCard}>
                            <Text style={styles.statEmoji}>⏳</Text>
                            <Text style={[styles.statValue, { color: '#eab308' }]}>{stats.pendingCount}</Text>
                            <Text style={styles.statLabel}>Pending</Text>
                        </View>
                    </View>

                    {/* Sync Settings */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Sync Settings</Text>
                        <View style={styles.settingRow}>
                            <Text style={styles.settingLabel}>Auto-Sync</Text>
                            <Text style={styles.settingValue}>
                                {syncSettings.auto_sync ? '✅ On' : '❌ Off'}
                            </Text>
                        </View>
                        <View style={styles.settingRow}>
                            <Text style={styles.settingLabel}>Sync on Cellular</Text>
                            <Text style={styles.settingValue}>
                                {syncSettings.sync_on_cellular ? '✅ On' : '❌ Off'}
                            </Text>
                        </View>
                    </View>

                    {/* Actions */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Actions</Text>
                        <Pressable
                            style={[styles.actionBtn, syncing && styles.actionBtnDisabled]}
                            onPress={handleSyncNow}
                            disabled={syncing}
                            accessibilityLabel={syncing ? 'Syncing in progress' : 'Sync now'}
                            accessibilityRole="button"
                        >
                            {syncing ? (
                                <ActivityIndicator size="small" color={colors.background} />
                            ) : (
                                <Text style={styles.actionBtnText}>🔄 Sync Now</Text>
                            )}
                        </Pressable>

                        <Pressable
                            style={styles.secondaryBtn}
                            onPress={handleClearCompleted}
                            accessibilityLabel="Clear completed syncs"
                            accessibilityRole="button"
                        >
                            <Text style={styles.secondaryBtnText}>🗑 Clear Completed</Text>
                        </Pressable>
                    </View>

                    {/* Info */}
                    <View style={styles.infoBox}>
                        <Text style={styles.infoText}>
                            💡 Cloud sync securely backs up your recordings and makes them
                            available across all your devices. Manage sync preferences in Settings.
                        </Text>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </ScreenErrorBoundary>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollView: { flex: 1 },
    content: { paddingBottom: 40 },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: spacing.md,
    },
    loadingText: {
        fontSize: 15,
        color: colors.textSecondary,
    },

    // Header
    header: {
        paddingHorizontal: spacing.screenPadding,
        paddingTop: spacing.md,
        paddingBottom: spacing.sm,
    },
    backBtn: { minWidth: 48, minHeight: 48, justifyContent: 'center' },
    backText: { fontSize: 16, color: colors.accent },
    headerTitle: {
        fontSize: 28,
        fontWeight: '800',
        color: colors.textPrimary,
        marginTop: spacing.xs,
    },
    headerSubtitle: {
        fontSize: 14,
        color: colors.textSecondary,
        marginTop: 2,
    },

    // Stats
    statsGrid: {
        flexDirection: 'row',
        gap: spacing.sm,
        paddingHorizontal: spacing.screenPadding,
        marginTop: spacing.lg,
        marginBottom: spacing.md,
    },
    statCard: {
        flex: 1,
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        alignItems: 'center',
        gap: 4,
    },
    statEmoji: { fontSize: 24 },
    statValue: {
        fontSize: 28,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    statLabel: {
        fontSize: 11,
        color: colors.textTertiary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },

    // Section
    section: {
        paddingHorizontal: spacing.screenPadding,
        marginTop: spacing.lg,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: spacing.sm,
    },
    settingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
        minHeight: 48,
    },
    settingLabel: {
        fontSize: 15,
        color: colors.textPrimary,
    },
    settingValue: {
        fontSize: 14,
        color: colors.textSecondary,
    },

    // Actions
    actionBtn: {
        backgroundColor: colors.accent,
        paddingVertical: spacing.md,
        borderRadius: borderRadius.md,
        alignItems: 'center',
        minHeight: 56,
        justifyContent: 'center',
        marginBottom: spacing.sm,
    },
    actionBtnDisabled: { opacity: 0.5 },
    actionBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.background,
    },
    secondaryBtn: {
        paddingVertical: spacing.md,
        borderRadius: borderRadius.md,
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.borderLight,
        minHeight: 48,
        justifyContent: 'center',
    },
    secondaryBtnText: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.textSecondary,
    },

    // Info
    infoBox: {
        marginHorizontal: spacing.screenPadding,
        marginTop: spacing.xl,
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
    },
    infoText: {
        fontSize: 13,
        color: colors.textTertiary,
        lineHeight: 20,
    },
});
