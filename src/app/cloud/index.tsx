/**
 * 🧬 Cloud Storage Screen
 * View, manage, and sync cloud files.
 *
 * Features:
 *   - File list with type icon, name, size, date
 *   - Upload/download progress bars
 *   - Storage usage bar (used/limit) with tier name
 *   - Pull-to-refresh, swipe-to-delete
 *   - "Upgrade Storage" button near limit
 *   - Empty state with auto-sync message
 */
import { useState, useEffect, useCallback } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, StyleSheet,
    RefreshControl, Alert, ActivityIndicator, Animated,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme';
import { cloudApi, type CloudFile, type StorageUsageResult } from '@/services/cloudApi';

// ─── Helpers ────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(iso: string): string {
    try {
        const d = new Date(iso);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
        return iso;
    }
}

function fileTypeIcon(contentType: string, filename: string): string {
    if (contentType?.includes('audio') || filename?.endsWith('.wav') || filename?.endsWith('.m4a')) return '🎵';
    if (contentType?.includes('video') || filename?.endsWith('.mp4')) return '🎬';
    if (contentType?.includes('text') || filename?.endsWith('.json') || filename?.endsWith('.txt')) return '📝';
    if (contentType?.includes('image')) return '🖼️';
    return '📎';
}

// ─── Component ──────────────────────────────────────────────────

export default function CloudScreen() {
    const [files, setFiles] = useState<CloudFile[]>([]);
    const [usage, setUsage] = useState<StorageUsageResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // ─── Load Data ──────────────────────────────────────────────

    const loadData = useCallback(async () => {
        const authed = cloudApi.isAuthenticated();
        setIsAuthenticated(authed);

        if (!authed) {
            setLoading(false);
            return;
        }

        try {
            const [filesResult, usageResult] = await Promise.all([
                cloudApi.listFiles(),
                cloudApi.getStorageUsage(), // defaults to 'free'
            ]);
            setFiles(filesResult.files);
            setUsage(usageResult);
        } catch (err) {
            console.warn('[Cloud] loadData error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    }, [loadData]);

    // ─── Actions ────────────────────────────────────────────────

    const handleDelete = (file: CloudFile) => {
        Alert.alert(
            'Delete File',
            `Delete "${file.filename}" from cloud storage?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        setDeleting(file.id);
                        const result = await cloudApi.deleteFile(file.id);
                        setDeleting(null);
                        if (result.success) {
                            setFiles(prev => prev.filter(f => f.id !== file.id));
                            // Refresh usage
                            cloudApi.getStorageUsage().then(setUsage).catch(() => {});
                        } else {
                            Alert.alert('Error', result.error || 'Failed to delete file');
                        }
                    },
                },
            ]
        );
    };

    const handleDownload = async (file: CloudFile) => {
        const path = await cloudApi.downloadFile(file.id, file.filename);
        if (path) {
            Alert.alert('Downloaded', `Saved to local storage`);
        } else {
            Alert.alert('Error', 'Download failed');
        }
    };

    // ─── Not Authenticated ──────────────────────────────────────

    if (!isAuthenticated && !loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.headerBar}>
                    <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
                        <Text style={styles.backButton}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Cloud Storage</Text>
                    <View style={{ width: 60 }} />
                </View>
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>🔐</Text>
                    <Text style={styles.emptyTitle}>Sign in to access Cloud</Text>
                    <Text style={styles.emptySubtext}>
                        Your recordings sync automatically once you're signed in
                    </Text>
                    <TouchableOpacity
                        style={styles.authButton}
                        onPress={() => router.push('/auth/login')}
                    >
                        <Text style={styles.authButtonText}>Sign In</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.authButtonSecondary}
                        onPress={() => router.push('/auth/register')}
                    >
                        <Text style={styles.authButtonSecondaryText}>Create Account</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    // ─── Loading ────────────────────────────────────────────────

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.accent} />
                    <Text style={styles.loadingText}>Loading cloud files...</Text>
                </View>
            </SafeAreaView>
        );
    }

    // ─── Render ─────────────────────────────────────────────────

    const nearLimit = usage ? usage.percentUsed >= 80 : false;

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.headerBar}>
                <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
                    <Text style={styles.backButton}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Cloud Storage</Text>
                <TouchableOpacity onPress={async () => {
                    await cloudApi.logout();
                    setIsAuthenticated(false);
                    setFiles([]);
                    setUsage(null);
                }}>
                    <Text style={styles.logoutButton}>Logout</Text>
                </TouchableOpacity>
            </View>

            {/* Storage Usage Bar */}
            {usage && (
                <View style={styles.usageCard}>
                    <View style={styles.usageHeader}>
                        <Text style={styles.usageTier}>{usage.tierLabel} Plan</Text>
                        <Text style={styles.usageText}>
                            {formatBytes(usage.usedBytes)} / {formatBytes(usage.limitBytes)}
                        </Text>
                    </View>
                    <View style={styles.usageBarBg}>
                        <View
                            style={[
                                styles.usageBarFill,
                                {
                                    width: `${Math.min(usage.percentUsed, 100)}%`,
                                    backgroundColor: nearLimit ? colors.stateError : colors.accent,
                                },
                            ]}
                        />
                    </View>
                    <Text style={styles.usageDetail}>
                        {usage.fileCount} file{usage.fileCount !== 1 ? 's' : ''} · {usage.percentUsed}% used
                    </Text>
                    {nearLimit && (
                        <TouchableOpacity
                            style={styles.upgradeButton}
                            onPress={() => router.push('/subscription')}
                        >
                            <Text style={styles.upgradeText}>⬆️ Upgrade Storage</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {/* File List */}
            <FlatList
                data={files}
                keyExtractor={item => item.id}
                contentContainerStyle={files.length === 0 ? styles.emptyListContainer : styles.listContainer}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.accent}
                        colors={[colors.accent]}
                    />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyIcon}>☁️</Text>
                        <Text style={styles.emptyTitle}>No cloud files yet</Text>
                        <Text style={styles.emptySubtext}>
                            Recordings sync automatically when you're connected
                        </Text>
                    </View>
                }
                renderItem={({ item }) => (
                    <View style={styles.fileRow}>
                        <Text style={styles.fileIcon}>
                            {fileTypeIcon(item.contentType, item.filename)}
                        </Text>
                        <View style={styles.fileInfo}>
                            <Text style={styles.fileName} numberOfLines={1}>
                                {item.filename}
                            </Text>
                            <Text style={styles.fileMeta}>
                                {formatBytes(item.size)} · {formatDate(item.uploadedAt)}
                            </Text>
                        </View>
                        <View style={styles.fileActions}>
                            <TouchableOpacity
                                onPress={() => handleDownload(item)}
                                style={styles.actionBtn}
                            >
                                <Text style={styles.actionIcon}>⬇️</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => handleDelete(item)}
                                style={styles.actionBtn}
                                disabled={deleting === item.id}
                            >
                                {deleting === item.id ? (
                                    <ActivityIndicator size="small" color={colors.stateError} />
                                ) : (
                                    <Text style={styles.actionIcon}>🗑️</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            />
        </SafeAreaView>
    );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },

    // Header
    headerBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    backButton: { fontSize: 15, color: colors.accent, fontWeight: '600' },
    logoutButton: { fontSize: 14, color: colors.stateError, fontWeight: '600' },

    // Usage
    usageCard: {
        margin: 16,
        padding: 16,
        backgroundColor: colors.surface,
        borderRadius: 14,
    },
    usageHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    usageTier: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
    usageText: { fontSize: 13, color: colors.textSecondary },
    usageBarBg: {
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.borderLight,
        overflow: 'hidden',
    },
    usageBarFill: {
        height: '100%',
        borderRadius: 4,
    },
    usageDetail: {
        fontSize: 12,
        color: colors.textTertiary,
        marginTop: 8,
    },
    upgradeButton: {
        marginTop: 12,
        backgroundColor: colors.accentTransparent,
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: 'center',
    },
    upgradeText: { fontSize: 14, fontWeight: '600', color: colors.accent },

    // List
    listContainer: { paddingBottom: 40 },
    emptyListContainer: { flexGrow: 1 },

    // File Row
    fileRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    fileIcon: { fontSize: 28, marginRight: 12 },
    fileInfo: { flex: 1 },
    fileName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    fileMeta: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
    fileActions: { flexDirection: 'row', gap: 8 },
    actionBtn: { padding: 6 },
    actionIcon: { fontSize: 20 },

    // Empty
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    emptyIcon: { fontSize: 56, marginBottom: 16 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
    emptySubtext: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 24, lineHeight: 20 },

    // Auth buttons
    authButton: {
        backgroundColor: colors.accent,
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 48,
        marginBottom: 12,
    },
    authButtonText: { fontSize: 16, fontWeight: '700', color: colors.background },
    authButtonSecondary: {
        borderWidth: 1,
        borderColor: colors.accent,
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 48,
    },
    authButtonSecondaryText: { fontSize: 16, fontWeight: '600', color: colors.accent },

    // Loading
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: { fontSize: 14, color: colors.textSecondary, marginTop: 12 },
});
