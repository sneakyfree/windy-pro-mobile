/**
 * Cloud File Browser — Browse and manage files in Windy Cloud
 * Lists files from GET /api/storage/files, grouped by type, with search.
 */
import { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, FlatList, Pressable, TextInput,
    ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { colors, spacing, borderRadius } from '@/theme';
import { typography } from '@/theme/typography';
import { cloudApi, type CloudFile } from '@/services/cloudApi';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

const PRODUCT_ICONS: Record<string, string> = {
    'audio': '🎤',
    'video': '🎥',
    'transcript': '📝',
    'image': '🖼️',
    'chat': '💬',
    'mail': '📧',
    'code': '⚙️',
    'default': '📄',
};

function getFileIcon(file: CloudFile): string {
    const ct = file.contentType || '';
    if (ct.startsWith('audio/')) return PRODUCT_ICONS.audio;
    if (ct.startsWith('video/')) return PRODUCT_ICONS.video;
    if (ct.startsWith('image/')) return PRODUCT_ICONS.image;
    if (ct.includes('json') || ct.includes('text')) return PRODUCT_ICONS.transcript;
    const meta = file.metadata as Record<string, string> | undefined;
    if (meta?.file_type) return PRODUCT_ICONS[meta.file_type] || PRODUCT_ICONS.default;
    return PRODUCT_ICONS.default;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(dateStr: string): string {
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return dateStr; }
}

export default function CloudFilesScreen() {
    const router = useRouter();
    const settings = useSettingsStore();
    const [files, setFiles] = useState<CloudFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [usage, setUsage] = useState<{ usedBytes: number; limitBytes: number; percentUsed: number; tierLabel: string } | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    const loadFiles = useCallback(async () => {
        try {
            setLoadError(null);
            const [fileResult, usageResult] = await Promise.all([
                cloudApi.listFiles(),
                cloudApi.getStorageUsage(settings.licenseTier),
            ]);
            setFiles(fileResult.files);
            setUsage(usageResult);
        } catch {
            setLoadError('Could not load files. Check your connection and pull to refresh.');
        }
    }, [settings.licenseTier]);

    useFocusEffect(useCallback(() => {
        setLoading(true);
        loadFiles().finally(() => setLoading(false));
    }, []));

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadFiles();
        setRefreshing(false);
    }, [loadFiles]);

    const filtered = searchQuery
        ? files.filter(f => f.filename.toLowerCase().includes(searchQuery.toLowerCase()))
        : files;

    const handleDelete = (file: CloudFile) => {
        Alert.alert('Delete File', `Delete "${file.filename}"?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive', onPress: async () => {
                    await cloudApi.deleteFile(file.id);
                    setFiles(prev => prev.filter(f => f.id !== file.id));
                },
            },
        ]);
    };

    const renderFile = useCallback(({ item }: { item: CloudFile }) => (
        <Pressable
            style={styles.fileRow}
            onPress={() => {
                // For now, show file info. Future: preview/download.
                Alert.alert(item.filename, [
                    `Size: ${formatBytes(item.size)}`,
                    `Type: ${item.contentType}`,
                    `Uploaded: ${formatDate(item.uploadedAt)}`,
                ].join('\n'), [
                    { text: 'Delete', style: 'destructive', onPress: () => handleDelete(item) },
                    { text: 'OK' },
                ]);
            }}
            accessibilityLabel={`${item.filename}, ${formatBytes(item.size)}`}
        >
            <Text style={styles.fileIcon}>{getFileIcon(item)}</Text>
            <View style={styles.fileInfo}>
                <Text style={styles.fileName} numberOfLines={1}>{item.filename}</Text>
                <Text style={styles.fileMeta}>{formatBytes(item.size)} · {formatDate(item.uploadedAt)}</Text>
            </View>
        </Pressable>
    ), []);

    if (!cloudApi.isAuthenticated()) {
        return (
            <ScreenErrorBoundary screenName="CloudFiles">
                <SafeAreaView style={styles.container} edges={['top']}>
                    <View style={styles.emptyState}>
                        <Text style={{ fontSize: 48, marginBottom: 16 }}>☁️</Text>
                        <Text style={styles.emptyTitle}>Sign in to browse files</Text>
                        <Pressable style={styles.signInBtn} onPress={() => router.push('/auth/login')}
                            accessibilityLabel="Sign in to browse cloud files" accessibilityRole="button"
                        >
                            <Text style={styles.signInText}>Sign In</Text>
                        </Pressable>
                    </View>
                </SafeAreaView>
            </ScreenErrorBoundary>
        );
    }

    return (
        <ScreenErrorBoundary screenName="CloudFiles">
            <SafeAreaView style={styles.container} edges={['top']}>
                {/* Header with usage bar */}
                {usage && (
                    <View style={styles.usageBar}>
                        <View style={styles.usageRow}>
                            <Text style={styles.usageText}>
                                {formatBytes(usage.usedBytes)} / {formatBytes(usage.limitBytes)}
                            </Text>
                            <Text style={styles.usageTier}>{usage.tierLabel}</Text>
                        </View>
                        <View style={styles.progressTrack}>
                            <View style={[styles.progressFill, {
                                width: `${Math.min(usage.percentUsed, 100)}%`,
                                backgroundColor: usage.percentUsed > 90 ? '#ef4444' : colors.accent,
                            }]} />
                        </View>
                        {usage.percentUsed > 80 && (
                            <Pressable onPress={() => router.push('/subscription')}>
                                <Text style={styles.upgradeLink}>Upgrade for more storage →</Text>
                            </Pressable>
                        )}
                    </View>
                )}

                {/* Search */}
                <View style={styles.searchBar}>
                    <TextInput
                        style={styles.searchInput}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder="Search files..."
                        placeholderTextColor={colors.textTertiary}
                        accessibilityLabel="Search files"
                    />
                </View>

                {loadError && (
                    <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', padding: 12, margin: 12, borderRadius: 8 }}>
                        <Text style={{ fontSize: 13, color: '#f87171', textAlign: 'center' }}>{loadError}</Text>
                    </View>
                )}

                {loading ? (
                    <View style={styles.emptyState}>
                        <ActivityIndicator color={colors.accent} />
                    </View>
                ) : (
                    <FlatList
                        data={filtered}
                        renderItem={renderFile}
                        keyExtractor={item => item.id}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
                        contentContainerStyle={files.length === 0 ? styles.emptyState : styles.listContent}
                        ListEmptyComponent={
                            <View style={{ alignItems: 'center' }}>
                                <Text style={{ fontSize: 48, marginBottom: 16 }}>📂</Text>
                                <Text style={styles.emptyTitle}>No files yet</Text>
                                <Text style={styles.emptySubtitle}>Recordings and files will appear here after syncing.</Text>
                            </View>
                        }
                    />
                )}
            </SafeAreaView>
        </ScreenErrorBoundary>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    usageBar: { padding: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    usageRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    usageText: { ...typography.bodySmall, fontWeight: '600', color: colors.textPrimary },
    usageTier: { ...typography.caption, color: colors.accent },
    progressTrack: { height: 6, backgroundColor: colors.surfaceLight, borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 3 },
    upgradeLink: { ...typography.caption, color: colors.accent, marginTop: 6 },

    searchBar: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    searchInput: {
        backgroundColor: colors.surface, borderRadius: borderRadius.md, paddingHorizontal: 14,
        paddingVertical: 10, ...typography.bodySmall, color: colors.textPrimary,
        borderWidth: 1, borderColor: colors.borderLight,
    },

    listContent: { paddingBottom: spacing.xxl },
    fileRow: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md,
        paddingVertical: 12, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight,
    },
    fileIcon: { fontSize: 28 },
    fileInfo: { flex: 1 },
    fileName: { ...typography.body, color: colors.textPrimary },
    fileMeta: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },

    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
    emptyTitle: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
    emptySubtitle: { ...typography.bodySmall, color: colors.textTertiary, marginTop: 4, textAlign: 'center' },
    signInBtn: { backgroundColor: colors.accent, paddingHorizontal: 24, paddingVertical: 10, borderRadius: borderRadius.md, marginTop: 16 },
    signInText: { ...typography.button, color: colors.background },
});
