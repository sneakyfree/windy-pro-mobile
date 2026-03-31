/**
 * 🧬 Clone Data Dashboard
 * Lists all recording bundles with thumbnails, duration, file size, sync status.
 * Filter: audio-only vs video+audio, synced vs pending, training-ready.
 */
import { View, Text, StyleSheet, FlatList, Pressable, Platform, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius } from '@/theme';
import { feedbackService } from '@/services/feedback';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { cloneBundleService, type CloneBundle, type BundleStats } from '@/services/clone-bundle';
import { cloudApi } from '@/services/cloudApi';

type FilterMode = 'all' | 'video' | 'audio-only' | 'training-ready' | 'synced' | 'pending';

export default function CloneDataDashboard() {
    const router = useRouter();
    const [bundles, setBundles] = useState<CloneBundle[]>([]);
    const [stats, setStats] = useState<BundleStats | null>(null);
    const [filter, setFilter] = useState<FilterMode>('all');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [uploading, setUploading] = useState<Set<string>>(new Set());

    const loadData = useCallback(async () => {
        try {
            const filterOpts: Record<string, boolean | string> = {};
            if (filter === 'video') filterOpts.hasVideo = true;
            if (filter === 'audio-only') filterOpts.hasVideo = false;
            if (filter === 'training-ready') filterOpts.trainingReady = true;
            if (filter === 'synced') filterOpts.syncStatus = 'synced';
            if (filter === 'pending') filterOpts.syncStatus = 'pending';

            const [b, s] = await Promise.all([
                cloneBundleService.getBundles(Object.keys(filterOpts).length > 0 ? filterOpts : undefined),
                cloneBundleService.getStats(),
            ]);
            setBundles(b);
            setStats(s);
        } catch (err) { console.warn("[CloneData] Error:", err); }
        setLoading(false);
        setRefreshing(false);
    }, [filter]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleRefresh = () => { setRefreshing(true); loadData(); };

    const handleDelete = (bundleId: string) => {
        Alert.alert('Delete Bundle', 'This will delete the local audio and video files permanently.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive', onPress: async () => {
                    await cloneBundleService.deleteBundle(bundleId);
                    await feedbackService.tap();
                    loadData();
                },
            },
        ]);
    };

    const handleUpload = async (bundleId: string) => {
        setUploading(prev => new Set(prev).add(bundleId));
        await feedbackService.tap();
        const result = await cloneBundleService.uploadBundle(bundleId, cloudApi.getToken() ?? '');
        if (result.success) {
            await feedbackService.success();
        } else {
            Alert.alert('Upload Failed', result.error || 'Please try again later.');
        }
        setUploading(prev => { const n = new Set(prev); n.delete(bundleId); return n; });
        loadData();
    };

    const formatBytes = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
        return `${(bytes / 1073741824).toFixed(1)} GB`;
    };

    const formatDuration = (secs: number): string => {
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        if (m > 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const getSyncBadge = (status: CloneBundle['sync_status']): { text: string; color: string } => {
        switch (status) {
            case 'synced': return { text: '☁️ Synced', color: '#10b981' };
            case 'uploading': return { text: '⬆️ Uploading', color: '#f59e0b' };
            case 'failed': return { text: '❌ Failed', color: '#ef4444' };
            default: return { text: '⏳ Pending', color: colors.textTertiary };
        }
    };

    const FILTERS: { key: FilterMode; label: string; emoji: string }[] = [
        { key: 'all', label: 'All', emoji: '📦' },
        { key: 'video', label: 'Video', emoji: '🎥' },
        { key: 'audio-only', label: 'Audio', emoji: '🎙️' },
        { key: 'training-ready', label: 'Ready', emoji: '✅' },
        { key: 'synced', label: 'Synced', emoji: '☁️' },
        { key: 'pending', label: 'Pending', emoji: '⏳' },
    ];

    const renderFilter = useCallback(({ item: f }: any) => (
        <Pressable
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
        >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
                {f.emoji} {f.label}
            </Text>
        </Pressable>
    ), [filter]);

    const renderBundle = useCallback(({ item: bundle }: any) => {
        const syncBadge = getSyncBadge(bundle.sync_status);
        const totalSize = bundle.audio.size_bytes + (bundle.video?.size_bytes || 0);
        const isUploading = uploading.has(bundle.bundle_id);

        return (
            <Pressable style={styles.bundleCard} onLongPress={() => handleDelete(bundle.bundle_id)}>
                {/* Left: Type indicator */}
                <View style={styles.bundleIcon}>
                    <Text style={styles.bundleIconText}>
                        {bundle.video ? '🎥' : '🎙️'}
                    </Text>
                </View>

                {/* Center: Info */}
                <View style={styles.bundleInfo}>
                    <View style={styles.bundleTopRow}>
                        <Text style={styles.bundleDuration} numberOfLines={1}>
                            {formatDuration(bundle.duration_seconds)}
                        </Text>
                        {bundle.clone_training_ready && (
                            <View style={styles.readyBadge}>
                                <Text style={styles.readyBadgeText}>✅ Training Ready</Text>
                            </View>
                        )}
                    </View>

                    <Text style={styles.bundleTranscript} numberOfLines={2}>
                        {bundle.transcript.text || '[No transcript]'}
                    </Text>

                    <View style={styles.bundleMetaRow}>
                        <Text style={styles.bundleMeta}>
                            {bundle.video ? `${bundle.video.resolution} ${bundle.video.camera}` : 'Audio only'}
                        </Text>
                        <Text style={styles.bundleMeta}>•</Text>
                        <Text style={styles.bundleMeta}>{formatBytes(totalSize)}</Text>
                        <Text style={styles.bundleMeta}>•</Text>
                        <Text style={[styles.bundleMeta, { color: syncBadge.color }]}>{syncBadge.text}</Text>
                    </View>
                </View>

                {/* Right: Upload button */}
                {bundle.sync_status !== 'synced' && (
                    <Pressable
                        style={styles.uploadBtn}
                        onPress={() => handleUpload(bundle.bundle_id)}
                        disabled={isUploading}
                    >
                        {isUploading ? (
                            <ActivityIndicator color={colors.accent} size="small" />
                        ) : (
                            <Text style={styles.uploadBtnText}>⬆️</Text>
                        )}
                    </Pressable>
                )}
            </Pressable>
        );
    }, [uploading]);

    return (
        <ScreenErrorBoundary screenName="CloneData">
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <Pressable onPress={() => router.back()} style={styles.backBtn}>
                        <Text style={styles.backText}>← Back</Text>
                    </Pressable>
                    <Text style={styles.title}>🧬 Clone Data</Text>
                </View>

                {/* Stats Cards */}
                {stats && (
                    <View style={styles.statsRow}>
                        <View style={styles.statCard}>
                            <Text style={styles.statValue}>{stats.total_bundles}</Text>
                            <Text style={styles.statLabel}>Bundles</Text>
                        </View>
                        <View style={styles.statCard}>
                            <Text style={[styles.statValue, { color: '#10b981' }]}>{stats.training_ready}</Text>
                            <Text style={styles.statLabel}>Ready</Text>
                        </View>
                        <View style={styles.statCard}>
                            <Text style={styles.statValue}>{formatDuration(stats.total_duration_seconds)}</Text>
                            <Text style={styles.statLabel}>Total</Text>
                        </View>
                        <View style={styles.statCard}>
                            <Text style={styles.statValue}>{formatBytes(stats.local_bytes)}</Text>
                            <Text style={styles.statLabel}>Storage</Text>
                        </View>
                    </View>
                )}

                {/* Filters */}
                <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={FILTERS}
                    keyExtractor={f => f.key}
                    contentContainerStyle={styles.filterRow}
                    style={styles.filterScroll}
                    renderItem={renderFilter}
                />

                {/* Bundle List */}
                <FlatList
                    data={bundles}
                    keyExtractor={b => b.bundle_id}
                    contentContainerStyle={styles.listContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
                    ListEmptyComponent={
                        loading ? (
                            <View style={styles.empty}><ActivityIndicator color={colors.accent} size="large" /></View>
                        ) : (
                            <View style={styles.empty}>
                                <Text style={styles.emptyEmoji}>📦</Text>
                                <Text style={styles.emptyText}>
                                    {filter !== 'all' ? 'No bundles match this filter' : 'No recording bundles yet.\nRecord with video enabled to start building your clone.'}
                                </Text>
                            </View>
                        )
                    }
                    renderItem={renderBundle}
                />
            </View>
        </ScreenErrorBoundary>
    );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.screenPadding, marginBottom: spacing.md },
    backBtn: { marginRight: spacing.sm },
    backText: { fontSize: 16, color: colors.accent },
    title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },

    statsRow: { flexDirection: 'row', paddingHorizontal: spacing.screenPadding, gap: 8, marginBottom: spacing.md },
    statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: colors.borderLight },
    statValue: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
    statLabel: { fontSize: 11, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },

    filterScroll: { maxHeight: 44, marginBottom: spacing.sm },
    filterRow: { paddingHorizontal: spacing.screenPadding, gap: 8 },
    filterChip: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
    filterChipActive: { borderColor: colors.accent, backgroundColor: colors.accentTransparent },
    filterText: { fontSize: 13, color: colors.textSecondary },
    filterTextActive: { color: colors.accent, fontWeight: '600' },

    listContent: { paddingHorizontal: spacing.screenPadding, paddingBottom: 80 },

    bundleCard: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.sm, gap: spacing.sm, borderWidth: 1, borderColor: colors.borderLight },
    bundleIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentTransparent, alignItems: 'center', justifyContent: 'center' },
    bundleIconText: { fontSize: 18 },
    bundleInfo: { flex: 1 },
    bundleTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    bundleDuration: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
    readyBadge: { backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
    readyBadgeText: { fontSize: 11, color: '#10b981', fontWeight: '600' },
    bundleTranscript: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: 6 },
    bundleMetaRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
    bundleMeta: { fontSize: 11, color: colors.textTertiary },

    uploadBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentTransparent, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
    uploadBtnText: { fontSize: 16 },

    empty: { alignItems: 'center', paddingTop: 80 },
    emptyEmoji: { fontSize: 48, marginBottom: spacing.md },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
});
