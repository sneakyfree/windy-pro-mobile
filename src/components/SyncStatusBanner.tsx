/**
 * 🧬 RP2-3.1 — Sync Status Banner
 * Shows sync progress, last sync time, and pending count
 */
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useState, useEffect } from 'react';
import { colors, spacing, borderRadius } from '@/theme';
import { syncEngine } from '@/services/sync-engine';
import { feedbackService } from '@/services/feedback';

export function SyncStatusBanner() {
    const [status, setStatus] = useState<{
        totalSessions: number;
        syncedSessions: number;
        pendingUploadBytes: number;
        lastSyncAt: string | null;
    } | null>(null);
    const [syncing, setSyncing] = useState(false);

    useEffect(() => {
        loadStatus();
    }, []);

    const loadStatus = async () => {
        try {
            const s = await syncEngine.getSyncStatus();
            setStatus(s);
        } catch {
            // Sync not available
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        await feedbackService.tap();
        try {
            await syncEngine.syncNow();
        } catch (err) {
            console.warn('[Sync] Manual sync failed:', err);
        }
        setSyncing(false);
        await loadStatus();
    };

    if (!status) return null;

    const pending = status.totalSessions - status.syncedSessions;
    const lastSync = status.lastSyncAt
        ? new Date(status.lastSyncAt).toLocaleString()
        : 'Never';

    return (
        <View style={styles.container}>
            <View style={styles.row}>
                <Text style={styles.label}>☁️ Cloud Sync</Text>
                <Pressable onPress={handleSync} style={styles.syncBtn}>
                    <Text style={styles.syncBtnText}>
                        {syncing ? '⏳ Syncing...' : '🔄 Sync Now'}
                    </Text>
                </Pressable>
            </View>
            <Text style={styles.detail}>
                {status.syncedSessions}/{status.totalSessions} synced
                {pending > 0 ? ` · ${pending} pending` : ''}
            </Text>
            <Text style={styles.detail}>Last sync: {lastSync}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.md,
        padding: spacing.md,
        marginTop: spacing.sm,
        borderWidth: 1,
        borderColor: colors.border,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.xs,
    },
    label: {
        color: colors.textPrimary,
        fontSize: 15,
        fontWeight: '600',
    },
    syncBtn: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        backgroundColor: colors.accent + '20',
        borderRadius: borderRadius.sm,
    },
    syncBtnText: {
        color: colors.accent,
        fontSize: 13,
        fontWeight: '500',
    },
    detail: {
        color: colors.textSecondary,
        fontSize: 13,
        marginTop: 2,
    },
});
