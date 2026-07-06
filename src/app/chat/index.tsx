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
import { colors, fontSizes } from '@/theme';
import { chatClient, isAgentRoom, type ChatRoom, type ChatContact, type SyncState } from '@/services/chatClient';
import { chatSso } from '@/services/chatSso';
import { identityApi } from '@/services/identityApi';
import { pushNotificationService } from '@/services/push-notifications';
import { chatTranslateService } from '@/services/chatTranslate';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useChatBadgeStore } from '@/stores/useChatBadgeStore';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import EternitasPassport from '@/components/EternitasPassport';
import type { EcosystemStatus } from '@/services/ecosystem-status';

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
    const [connectError, setConnectError] = useState<string | null>(null);
    const [syncState, setSyncState] = useState<SyncState>(chatClient.getSyncState());
    const [createError, setCreateError] = useState<string | null>(null);
    // PERF-AUDIT: Cache contacts outside render loop instead of calling per FlatList item
    const [contacts, setContacts] = useState<ChatContact[]>([]);
    const [showHatchBanner, setShowHatchBanner] = useState(false);
    const [showAgentTooltip, setShowAgentTooltip] = useState(false);

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

    // ─── Agent DM (Windy Fly) ──────────────────────────────────
    const ecosystem: EcosystemStatus | null = useSettingsStore(s => s.ecosystemStatus);
    const flyProduct = ecosystem?.products?.windy_fly;
    const agentProvisioned = flyProduct?.status === 'active';
    const agentName = flyProduct?.agent_name || 'Windy Fly';
    const agentMatrixId = flyProduct?.matrix_user_id;
    const passportId = flyProduct?.passport_id || ecosystem?.products?.eternitas?.passport_id;

    // Detect agent room: from ecosystem response, or by scanning rooms with isAgentRoom()
    const agentRoomId = flyProduct?.room_id ||
        rooms.find(room => isAgentRoom(room) || room.members?.includes(agentMatrixId || ''))?.roomId || null;

    // Sort agent rooms to top of the list
    const sortedRooms = [...rooms].sort((a, b) => {
        const aIsAgent = isAgentRoom(a);
        const bIsAgent = isAgentRoom(b);
        if (aIsAgent && !bIsAgent) return -1;
        if (!aIsAgent && bIsAgent) return 1;
        return (b.lastMessageTime || 0) - (a.lastMessageTime || 0);
    });

    // Detect newly hatched agent (show banner once)
    const prevAgentRoomRef = useRef<string | null>(null);
    useEffect(() => {
        if (agentRoomId && agentRoomId !== prevAgentRoomRef.current && prevAgentRoomRef.current !== null) {
            setShowHatchBanner(true);
            setTimeout(() => setShowHatchBanner(false), 8000);
        }
        prevAgentRoomRef.current = agentRoomId;
    }, [agentRoomId]);

    // Show first-time agent tooltip (once per device)
    useEffect(() => {
        if (agentProvisioned && agentRoomId) {
            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
            AsyncStorage.getItem('windy_agent_tooltip_shown').then((shown: string | null) => {
                if (!shown) {
                    setShowAgentTooltip(true);
                    AsyncStorage.setItem('windy_agent_tooltip_shown', '1');
                    setTimeout(() => setShowAgentTooltip(false), 10000);
                }
            }).catch(() => {});
        }
    }, [agentProvisioned, agentRoomId]);

    // ─── Load ───────────────────────────────────────────────────

    const setUnreadBadge = useChatBadgeStore(s => s.setUnreadCount);

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
            // Tab badge = total unread across DMs
            setUnreadBadge(dms.reduce((sum, r) => sum + (r.unreadCount || 0), 0));
        } catch (err) {
            console.warn('[ChatHome] loadRooms error:', err);
            if (isMounted.current) {
                Alert.alert('Connection Error', 'Could not load conversations. Pull down to retry.');
            }
        } finally {
            if (isMounted.current) setLoading(false);
        }
    }, [setUnreadBadge]);

    // ─── Connect: Windy account → Matrix session (unified-login) ──
    // Restores a stored Matrix session, else provisions one from the
    // signed-in Windy account. No separate chat login exists for users.
    const connectChat = useCallback(async () => {
        setConnectError(null);
        if (!chatClient.isLoggedIn()) {
            setLoading(true);
            const result = await chatSso.ensureChatSession();
            if (!isMounted.current) return;
            if (!result.success && identityApi.isAuthenticated()) {
                setConnectError(result.error || 'Could not connect to chat');
            }
        }
        if (chatClient.isLoggedIn()) {
            // Device push: register with the chat push-gateway AND set the
            // Synapse pusher (needs the Matrix session, hence here).
            pushNotificationService.registerForChatPush().catch(() => {});
        }
        await loadRooms();
    }, [loadRooms]);

    // First successful sync after connect populates rooms — a fresh login
    // lands with an empty list otherwise (rooms arrive with the initial sync).
    useEffect(() => {
        const unsub = chatClient.onSyncStateChange((state) => {
            if (state === 'syncing') loadRooms();
        });
        return unsub;
    }, [loadRooms]);

    useEffect(() => {
        connectChat();
        // Listen for new messages to refresh the list
        const unsub = chatClient.onMessage(() => {
            const dms = chatClient.getDMs();
            setRooms(dms);
            // PERF-AUDIT: Refresh contacts when room list changes
            setContacts(chatClient.getContacts());
            setUnreadBadge(dms.reduce((sum, r) => sum + (r.unreadCount || 0), 0));
        });
        return () => {
            unsub();
            // ML-AUDIT: Clear search debounce timer on unmount
            if (searchDebounce.current) clearTimeout(searchDebounce.current);
        };
    }, [connectChat, setUnreadBadge]);

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
        if (isOffline) {
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
                if (isMounted.current) {
                    setSearching(false);
                    setSearchResults([]);
                }
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
            const friendlyMsg = 'Could not start conversation. Please check your connection and try again.';
            setCreateError(friendlyMsg);
            Alert.alert('Conversation Error', friendlyMsg);
        }
    };

    // ─── Not Logged In ──────────────────────────────────────────

    if (!isLoggedIn && !loading) {
        const hasWindyAccount = identityApi.isAuthenticated();
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
                        {connectError
                            ? connectError
                            : 'Chat with your AI agent and friends in any language.\nOne Windy account is all you need.'}
                    </Text>
                    <TouchableOpacity
                        style={styles.loginButton}
                        onPress={() => {
                            if (hasWindyAccount) {
                                connectChat();
                            } else {
                                router.push('/auth/login');
                            }
                        }}
                        accessibilityLabel={hasWindyAccount ? 'Connect chat' : 'Sign in with Windy'}
                        accessibilityRole="button"
                    >
                        <Text style={styles.loginButtonText}>
                            {hasWindyAccount ? (connectError ? 'Try Again' : 'Connect Chat') : 'Sign in with Windy'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
            </ScreenErrorBoundary>
        );
    }

    // ─── Memoized renderItem for FlatList ─────────────────────────
    const renderRoom = useCallback(({ item }: any) => (
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
            <View style={styles.avatarContainer}>
                <View style={styles.avatar} importantForAccessibility="no">
                    <Text style={styles.avatarText}>{(item.name || '?')[0].toUpperCase()}</Text>
                </View>
                {(() => {
                    const contact = contacts.find((c: any) => item.members.includes(c.userId));
                    const memberPresence = contact?.presence || 'offline';
                    return (
                        <View
                            style={[styles.presenceDot, { backgroundColor: presenceColor(memberPresence) }]}
                            accessibilityLabel={memberPresence === 'online' ? 'Online' : memberPresence === 'unavailable' ? 'Away' : 'Offline'}
                        />
                    );
                })()}
            </View>
            <View style={styles.roomInfo}>
                <View style={styles.roomTop}>
                    <Text style={styles.roomName} numberOfLines={1}>{item.name}</Text>
                    {isAgentRoom(item) && (
                        <View style={styles.agentTag}>
                            <Text style={styles.agentTagText}>{'\uD83E\uDEB0'} AI Agent</Text>
                        </View>
                    )}
                    {item.lastMessageTime && <Text style={styles.roomTime}>{timeAgo(item.lastMessageTime)}</Text>}
                </View>
                <View style={styles.roomBottom}>
                    <Text style={styles.roomPreview} numberOfLines={1}>{item.lastMessage || 'No messages yet'}</Text>
                    {item.unreadCount > 0 && (
                        <View style={styles.badge} accessibilityLabel={`${item.unreadCount} unread messages`}>
                            <Text style={styles.badgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
                        </View>
                    )}
                </View>
            </View>
        </TouchableOpacity>
    ), [contacts]);

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

            {/* Create Error Banner */}
            {createError && (
                <View style={styles.offlineBanner}
                    accessibilityLabel={createError}
                    accessibilityRole="alert"
                >
                    <Text style={styles.offlineBannerText}>{createError}</Text>
                </View>
            )}

            {/* Search Results */}
            {searchQuery.trim().length >= 2 && (
                <View style={styles.searchResults}>
                    {isOffline ? (
                        <Text style={styles.noResults}
                            accessibilityRole="text"
                        >Search unavailable while offline</Text>
                    ) : searching ? (
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

            {/* Agent Hatch Banner */}
            {showHatchBanner && (
                <TouchableOpacity
                    style={{
                        backgroundColor: 'rgba(163,230,53,0.15)',
                        paddingVertical: 12,
                        paddingHorizontal: 16,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                    }}
                    onPress={() => {
                        setShowHatchBanner(false);
                        if (agentRoomId) router.push(`/chat/${agentRoomId}`);
                    }}
                    accessibilityLabel={`${agentName} just hatched! Tap to chat.`}
                    accessibilityRole="button"
                >
                    <Text style={{ fontSize: 24 }}>{'\uD83E\uDEB0'}</Text>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.accent }}>{agentName} just hatched!</Text>
                        <Text style={{ fontSize: 12, color: colors.textSecondary }}>Tap to start chatting with your AI agent</Text>
                    </View>
                    <Text style={{ fontSize: 18, color: colors.textTertiary }}>›</Text>
                </TouchableOpacity>
            )}

            {/* Pinned Agent DM */}
            {agentProvisioned && agentRoomId ? (
                <TouchableOpacity
                    style={styles.agentCard}
                    onPress={() => router.push(`/chat/${agentRoomId}`)}
                    activeOpacity={0.7}
                    accessibilityLabel={`${agentName}, your AI agent. Tap to chat.`}
                    accessibilityRole="button"
                >
                    <View style={styles.agentBadge}>
                        <Text style={styles.agentEmoji}>🪰</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.agentName}>{agentName}</Text>
                            <View style={styles.agentTag}>
                                <Text style={styles.agentTagText}>AI Agent</Text>
                            </View>
                        </View>
                        <Text style={styles.agentSubtext}>
                            {flyProduct?.agent_status || 'Your Windy Fly agent'}
                            {flyProduct?.trust_score != null ? ` \u00B7 Trust: ${flyProduct.trust_score}%` : ''}
                        </Text>
                    </View>
                    {passportId && <EternitasPassport passportId={passportId} compact />}
                    <Text style={styles.agentChevron}>›</Text>
                </TouchableOpacity>
            ) : !agentProvisioned && isLoggedIn ? (
                <TouchableOpacity
                    style={styles.agentCtaCard}
                    onPress={() => {
                        const Linking = require('expo-linking');
                        Linking.openURL('https://windyword.ai/app/fly').catch(() => {});
                    }}
                    activeOpacity={0.7}
                    accessibilityLabel="Hatch your Windy Fly AI agent"
                    accessibilityRole="button"
                >
                    <Text style={styles.agentCtaEmoji}>🪰</Text>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.agentCtaTitle}>Hatch your Windy Fly agent</Text>
                        <Text style={styles.agentCtaSubtext}>Your own AI that lives in chat</Text>
                    </View>
                    <Text style={styles.agentChevron}>›</Text>
                </TouchableOpacity>
            ) : null}

            {/* First-time agent tooltip */}
            {showAgentTooltip && (
                <TouchableOpacity
                    style={{
                        backgroundColor: 'rgba(163,230,53,0.1)',
                        borderLeftWidth: 3,
                        borderLeftColor: colors.accent,
                        paddingVertical: 10,
                        paddingHorizontal: 14,
                        marginHorizontal: 12,
                        marginBottom: 8,
                        borderRadius: 8,
                    }}
                    onPress={() => setShowAgentTooltip(false)}
                    accessibilityLabel="Agent introduction tooltip. Tap to dismiss."
                >
                    <Text style={{ fontSize: 13, color: colors.textPrimary, lineHeight: 18 }}>
                        {'\uD83D\uDCA1'} This is your AI agent. It can help with emails, messages, translations, and more. Just ask!
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 4 }}>Tap to dismiss</Text>
                </TouchableOpacity>
            )}

            {/* Room List */}
            <FlatList
                data={sortedRooms}
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
                renderItem={renderRoom}
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
    offlineBannerText: { fontSize: fontSizes.xs, fontWeight: '600', color: '#1a1a1a' },

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
    searchResultId: { fontSize: fontSizes.xs, color: colors.textTertiary, marginTop: 1 },
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
    avatarText: { fontSize: fontSizes.xl, fontWeight: '700', color: colors.accent },
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
    roomName: { fontSize: fontSizes.base, fontWeight: '600', color: colors.textPrimary, flex: 1 },
    roomTime: { fontSize: fontSizes.xs, color: colors.textTertiary, marginLeft: 8 },
    roomBottom: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    roomPreview: { fontSize: fontSizes.sm, color: colors.textSecondary, flex: 1 },
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
    emptyTitle: { fontSize: fontSizes.xl, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
    emptySubtext: { fontSize: fontSizes.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },

    loginButton: {
        backgroundColor: colors.accent,
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 48,
        marginTop: 24,
        minHeight: 48,
        justifyContent: 'center',
    },
    loginButtonText: { fontSize: fontSizes.base, fontWeight: '700', color: colors.background },

    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { fontSize: fontSizes.sm, color: colors.textSecondary, marginTop: 12 },

    // Agent DM card
    agentCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 20, paddingVertical: 14,
        backgroundColor: 'rgba(163,230,53,0.06)',
        borderBottomWidth: 1, borderBottomColor: colors.borderLight,
    },
    agentBadge: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: 'rgba(163,230,53,0.15)',
        justifyContent: 'center', alignItems: 'center',
    },
    agentEmoji: { fontSize: 22 },
    agentName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    agentTag: {
        backgroundColor: 'rgba(163,230,53,0.2)',
        paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    },
    agentTagText: { fontSize: 10, fontWeight: '700', color: colors.accent, textTransform: 'uppercase' },
    agentSubtext: { fontSize: fontSizes.xs, color: colors.textTertiary, marginTop: 2 },
    agentChevron: { fontSize: fontSizes.xl, color: colors.textTertiary },

    // Agent CTA card (not provisioned)
    agentCtaCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 20, paddingVertical: 14,
        backgroundColor: colors.surface,
        borderBottomWidth: 1, borderBottomColor: colors.borderLight,
    },
    agentCtaEmoji: { fontSize: 28 },
    agentCtaTitle: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.accent },
    agentCtaSubtext: { fontSize: fontSizes.xs, color: colors.textTertiary },
});
