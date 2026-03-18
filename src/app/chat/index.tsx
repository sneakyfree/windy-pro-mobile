/**
 * 🧬 Chat Home — Contact list with DMs
 * Shows direct message rooms with unread badges, last message preview,
 * online/offline indicators, pull-to-refresh, and connection status.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, StyleSheet,
    RefreshControl, ActivityIndicator, TextInput, Alert,
} from 'react-native';
import { INPUT_LIMITS } from '@/utils/validation';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme';
import { chatClient, type ChatRoom, type ChatContact, type SyncState } from '@/services/chatClient';
import { chatTranslateService } from '@/services/chatTranslate';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

// ─── Helpers ────────────────────────────────────────────────────

/** Strip HTML tags from display strings to prevent injection */
function stripHtml(str: string): string {
    if (!str) return '';
    return str.replace(/<[^>]*>/g, '').trim();
}

function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'now';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h`;
    return `${Math.floor(diff / 86400_000)}d`;
}

function presenceColor(presence: string): string {
    if (presence === 'online') return '#22c55e';
    if (presence === 'unavailable') return '#f59e0b';
    return colors.textTertiary;
}

// ─── Component ──────────────────────────────────────────────────

export default function ChatHomeScreen() {
    const [rooms, setRooms] = useState<ChatRoom[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<ChatContact[]>([]);
    const [searching, setSearching] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [syncState, setSyncState] = useState<SyncState>(chatClient.getSyncState());
    const [createError, setCreateError] = useState<string | null>(null);
    // PERF-AUDIT: Cache contacts outside render loop instead of calling per FlatList item
    const [contacts, setContacts] = useState<ChatContact[]>([]);

    const userLang = useSettingsStore(s => s.defaultLanguage);

    useEffect(() => {
        chatTranslateService.setUserLanguage(userLang);
    }, [userLang]);

    // ─── Connection State ───────────────────────────────────────

    useEffect(() => {
        const unsub = chatClient.onSyncStateChange((state) => {
            setSyncState(state);
        });
        return unsub;
    }, []);

    // ML-1: Register/unregister screen with chat client
    useEffect(() => {
        chatClient.incrementActiveScreens();
        return () => { chatClient.decrementActiveScreens(); };
    }, []);

    // ML-3: Track unmount to prevent setState on unmounted component
    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    const isOffline = syncState === 'reconnecting' || syncState === 'error';

    // ─── Load ───────────────────────────────────────────────────

    const loadRooms = useCallback(async () => {
        const loggedIn = chatClient.isLoggedIn();
        setIsLoggedIn(loggedIn);
        if (!loggedIn) {
            setLoading(false);
            return;
        }

        try {
            const dms = chatClient.getDMs();
            if (isMounted.current) setRooms(dms);
            // PERF-AUDIT: Cache contacts once per load
            if (isMounted.current) setContacts(chatClient.getContacts());
        } catch (err) {
            console.warn('[ChatHome] loadRooms error:', err);
            if (isMounted.current) {
                Alert.alert('Connection Error', 'Could not load conversations. Pull down to retry.');
            }
        } finally {
            if (isMounted.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadRooms();
        // Listen for new messages to refresh the list
        const unsub = chatClient.onMessage(() => {
            const dms = chatClient.getDMs();
            setRooms(dms);
            // PERF-AUDIT: Refresh contacts when room list changes
            setContacts(chatClient.getContacts());
        });
        return () => {
            unsub();
            // ML-AUDIT: Clear search debounce timer on unmount
            if (searchDebounce.current) clearTimeout(searchDebounce.current);
        };
    }, [loadRooms]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadRooms();
        setRefreshing(false);
    }, [loadRooms]);

    // ML-4: Debounced search (300ms delay)
    const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleSearch = (query: string) => {
        setSearchQuery(query);
        if (searchDebounce.current) clearTimeout(searchDebounce.current);
        if (query.trim().length < 2) {
            setSearchResults([]);
            setSearching(false);
            return;
        }
        setSearching(true);
        searchDebounce.current = setTimeout(async () => {
            try {
                const results = await chatClient.searchUsers(query.trim());
                if (isMounted.current) {
                    setSearchResults(results);
                    setSearching(false);
                }
            } catch {
                if (isMounted.current) setSearching(false);
            }
        }, 300);
    };

    const startChat = async (userId: string) => {
        setCreateError(null);
        const result = await chatClient.getOrCreateDM(userId);
        if (result.roomId) {
            setSearchQuery('');
            setSearchResults([]);
            router.push(`/chat/${result.roomId}`);
        } else {
            setCreateError(result.error || 'Failed to start conversation');
            Alert.alert('Error', result.error || 'Failed to start conversation');
        }
    };

    // ─── Not Logged In ──────────────────────────────────────────

    if (!isLoggedIn && !loading) {
        return (
            <ScreenErrorBoundary screenName="Chat">
            <SafeAreaView style={styles.container} edges={['top']}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}
                        accessibilityRole="header"
                    >💬 Chat</Text>
                </View>
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>💬</Text>
                    <Text style={styles.emptyTitle}>Windy Chat</Text>
                    <Text style={styles.emptySubtext}>
                        Chat with anyone in any language.{'\n'}
                        Messages are translated on-device automatically.
                    </Text>
                    <TouchableOpacity
                        style={styles.loginButton}
                        onPress={() => router.push('/chat/profile')}
                        accessibilityLabel="Set up chat account"
                        accessibilityRole="button"
                    >
                        <Text style={styles.loginButtonText}>Set Up Chat</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
            </ScreenErrorBoundary>
        );
    }

    // ─── Loading ────────────────────────────────────────────────

    if (loading) {
        return (
            <ScreenErrorBoundary screenName="Chat">
            <SafeAreaView style={styles.container} edges={['top']}>
                <View style={styles.loadingContainer}
                    accessibilityLabel="Connecting to chat" accessibilityRole="none"
                >
                    <ActivityIndicator size="large" color={colors.accent} />
                    <Text style={styles.loadingText}>Connecting to chat...</Text>
                </View>
            </SafeAreaView>
            </ScreenErrorBoundary>
        );
    }

    // ─── Main ───────────────────────────────────────────────────

    return (
        <ScreenErrorBoundary screenName="Chat">
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle} accessibilityRole="header">💬 Chat</Text>
                <TouchableOpacity
                    onPress={() => router.push('/chat/profile')}
                    style={styles.profileButton}
                    accessibilityLabel="Chat settings and profile"
                    accessibilityRole="button"
                >
                    <Text style={styles.profileIcon}>⚙️</Text>
                </TouchableOpacity>
            </View>

            {/* Offline Banner */}
            {isOffline && (
                <View style={styles.offlineBanner}
                    accessibilityLabel="Connection issues. Trying to reconnect."
                    accessibilityRole="alert"
                >
                    <Text style={styles.offlineBannerText}>
                        {syncState === 'reconnecting' ? '⏳ Reconnecting...' : '📡 Connection lost'}
                    </Text>
                </View>
            )}

            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <TextInput
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={handleSearch}
                    placeholder="Search users by name..."
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={INPUT_LIMITS.SEARCH_QUERY}
                    accessibilityLabel="Search for users to start a conversation"
                    accessibilityHint="Type a name to find people to chat with"
                />
            </View>

            {/* Search Results */}
            {searchQuery.trim().length >= 2 && (
                <View style={styles.searchResults}>
                    {searching ? (
                        <ActivityIndicator color={colors.accent} style={{ padding: 12 }} />
                    ) : searchResults.length === 0 ? (
                        <Text style={styles.noResults}
                            accessibilityRole="text"
                        >No users found</Text>
                    ) : (
                        searchResults.map(user => (
                            <TouchableOpacity
                                key={user.userId}
                                style={styles.searchResultRow}
                                onPress={() => startChat(user.userId)}
                                accessibilityLabel={`Start conversation with ${user.displayName}`}
                                accessibilityRole="button"
                            >
                                <View style={styles.avatar}>
                                    <Text style={styles.avatarText}>
                                        {stripHtml(user.displayName || '?')[0].toUpperCase()}
                                    </Text>
                                </View>
                                <View style={styles.searchResultInfo}>
                                    <Text style={styles.searchResultName}>{stripHtml(user.displayName)}</Text>
                                    <Text style={styles.searchResultId}>{user.userId}</Text>
                                </View>
                            </TouchableOpacity>
                        ))
                    )}
                </View>
            )}

            {/* Room List */}
            <FlatList
                data={rooms}
                keyExtractor={item => item.roomId}
                contentContainerStyle={rooms.length === 0 ? styles.emptyListContainer : undefined}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.accent}
                    />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyIcon}>🌍</Text>
                        <Text style={styles.emptyTitle}>No conversations yet</Text>
                        <Text style={styles.emptySubtext}>
                            Search for a user above to start chatting
                        </Text>
                    </View>
                }
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={styles.roomRow}
                        onPress={() => router.push(`/chat/${item.roomId}`)}
                        activeOpacity={0.6}
                        accessibilityLabel={
                            `${item.name}. ` +
                            (item.lastMessage ? `Last message: ${item.lastMessage}. ` : 'No messages. ') +
                            (item.unreadCount > 0 ? `${item.unreadCount} unread. ` : '') +
                            (item.lastMessageTime ? timeAgo(item.lastMessageTime) + ' ago' : '')
                        }
                        accessibilityRole="button"
                        accessibilityHint="Opens conversation"
                    >
                        {/* Avatar */}
                        <View style={styles.avatarContainer}>
                            <View style={styles.avatar} importantForAccessibility="no">
                                <Text style={styles.avatarText}>
                                    {(item.name || '?')[0].toUpperCase()}
                                </Text>
                            </View>
                            {/* Presence dot — RC-4: use cached contacts */}
                            {(() => {
                                const contact = contacts.find(c => item.members.includes(c.userId));
                                const memberPresence = contact?.presence || 'offline';
                                return (
                                    <View
                                        style={[styles.presenceDot, { backgroundColor: presenceColor(memberPresence) }]}
                                        accessibilityLabel={memberPresence === 'online' ? 'Online' : memberPresence === 'unavailable' ? 'Away' : 'Offline'}
                                    />
                                );
                            })()}
                        </View>

                        {/* Info */}
                        <View style={styles.roomInfo}>
                            <View style={styles.roomTop}>
                                <Text style={styles.roomName} numberOfLines={1}>
                                    {item.name}
                                </Text>
                                {item.lastMessageTime && (
                                    <Text style={styles.roomTime}>
                                        {timeAgo(item.lastMessageTime)}
                                    </Text>
                                )}
                            </View>
                            <View style={styles.roomBottom}>
                                <Text style={styles.roomPreview} numberOfLines={1}>
                                    {item.lastMessage || 'No messages yet'}
                                </Text>
                                {item.unreadCount > 0 && (
                                    <View style={styles.badge}
                                        accessibilityLabel={`${item.unreadCount} unread messages`}
                                    >
                                        <Text style={styles.badgeText}>
                                            {item.unreadCount > 99 ? '99+' : item.unreadCount}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    </TouchableOpacity>
                )}
            />
        </SafeAreaView>
        </ScreenErrorBoundary>
    );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
    profileButton: { padding: 10, minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
    profileIcon: { fontSize: 22 },

    // Offline banner
    offlineBanner: {
        backgroundColor: '#fbbf24',
        paddingVertical: 6,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    offlineBannerText: { fontSize: 12, fontWeight: '600', color: '#1a1a1a' },

    searchContainer: { paddingHorizontal: 16, paddingVertical: 8 },
    searchInput: {
        backgroundColor: colors.surface,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 15,
        color: colors.textPrimary,
        borderWidth: 1,
        borderColor: colors.borderLight,
        minHeight: 44, // VQ: iOS 44pt minimum tap target
    },

    searchResults: {
        marginHorizontal: 16,
        backgroundColor: colors.surface,
        borderRadius: 10,
        marginBottom: 8,
        overflow: 'hidden',
    },
    searchResultRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        minHeight: 44,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    searchResultInfo: { flex: 1 },
    searchResultName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    searchResultId: { fontSize: 12, color: colors.textTertiary, marginTop: 1 },
    noResults: { padding: 12, color: colors.textSecondary, textAlign: 'center' },

    roomRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        minHeight: 64,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    avatarContainer: { position: 'relative', marginRight: 12 },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.accentTransparent,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: { fontSize: 20, fontWeight: '700', color: colors.accent },
    presenceDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: colors.background,
        position: 'absolute',
        bottom: 0,
        right: 0,
    },

    roomInfo: { flex: 1 },
    roomTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    roomName: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, flex: 1 },
    roomTime: { fontSize: 12, color: colors.textTertiary, marginLeft: 8 },
    roomBottom: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    roomPreview: { fontSize: 14, color: colors.textSecondary, flex: 1 },
    badge: {
        backgroundColor: colors.accent,
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 6,
        marginLeft: 8,
    },
    badgeText: { fontSize: 11, fontWeight: '700', color: colors.background },

    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    emptyListContainer: { flexGrow: 1 },
    emptyIcon: { fontSize: 56, marginBottom: 16 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
    emptySubtext: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },

    loginButton: {
        backgroundColor: colors.accent,
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 48,
        marginTop: 24,
        minHeight: 48,
        justifyContent: 'center',
    },
    loginButtonText: { fontSize: 16, fontWeight: '700', color: colors.background },

    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { fontSize: 14, color: colors.textSecondary, marginTop: 12 },
});
