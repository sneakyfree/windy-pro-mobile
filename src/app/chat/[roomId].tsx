/**
 * 🧬 Conversation Screen — Message Bubbles with Translation
 * Shows message history with real-time updates, typing indicators,
 * on-device translation, offline queue, and connection status.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, FlatList, TextInput, TouchableOpacity,
    StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme';
import { chatClient, type ChatMessage, type SyncState } from '@/services/chatClient';
import { chatTranslateService, type TranslatedMessage } from '@/services/chatTranslate';
import { subscriptionService } from '@/services/subscription';
import { pairManager } from '@/services/pairManager';
import { translationService, TIER_1_LANGUAGES } from '@/services/translation';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { PAIR_CDN_BASE } from '@/config/api';

// ─── Types ──────────────────────────────────────────────────────

interface DisplayMessage extends TranslatedMessage {
    pending?: boolean;
    pairNeeded?: string;
}

/** Strip HTML tags from display strings to prevent injection */
function stripHtml(str: string): string {
    if (!str) return '';
    return str.replace(/<[^>]*>/g, '').trim();
}

// ─── Component ──────────────────────────────────────────────────

export default function ConversationScreen() {
    const { roomId } = useLocalSearchParams<{ roomId: string }>();
    const [messages, setMessages] = useState<DisplayMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [typingUsers, setTypingUsers] = useState<string[]>([]);
    const [roomName, setRoomName] = useState('Chat');
    const [syncState, setSyncState] = useState<SyncState>(chatClient.getSyncState());
    const [loadError, setLoadError] = useState<string | null>(null);
    const flatListRef = useRef<FlatList>(null);
    const savedInputRef = useRef('');
    const sendingRef = useRef(false); // RC-1: Synchronous guard against double-tap
    const isMounted = useRef(true); // ML-3: Unmount guard for async callbacks
    const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null); // PC-4: Typing debounce

    const userLang = useSettingsStore(s => s.defaultLanguage);

    useEffect(() => {
        chatTranslateService.setUserLanguage(userLang);
    }, [userLang]);

    // ML-3: Track unmount to prevent setState on unmounted component
    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    // ML-1: Register/unregister screen with chat client
    useEffect(() => {
        chatClient.incrementActiveScreens();
        return () => { chatClient.decrementActiveScreens(); };
    }, []);

    // ─── Connection State ───────────────────────────────────────

    useEffect(() => {
        const unsub = chatClient.onSyncStateChange((state) => {
            if (isMounted.current) setSyncState(state);
        });
        return unsub;
    }, []);

    const isOffline = syncState === 'reconnecting' || syncState === 'error' || syncState === 'stopped';

    // ─── Load + Real-time Listeners (RC-2: sequenced) ───────────

    useEffect(() => {
        if (!roomId) return;
        let cleanupFns: (() => void)[] = [];
        let cancelled = false;

        const init = async () => {
            // Load initial messages first
            try {
                const name = chatClient.getRoomName(roomId);
                if (isMounted.current) setRoomName(name);

                const rawMessages = chatClient.getMessages(roomId, 100);
                const translated = await chatTranslateService.translateMessages(rawMessages);
                if (!isMounted.current || cancelled) return;

                // Append any pending (queued) messages
                const pending = chatClient.getPendingMessages(roomId).map(m => ({
                    ...m,
                    translatedBody: null,
                    detectedLang: null,
                    langFlag: null,
                    langName: null,
                    wasTranslated: false,
                    pending: true,
                }));

                setMessages([...translated, ...pending]);
            } catch {
                if (isMounted.current) setLoadError('Could not load messages. Pull down to retry.');
            } finally {
                if (isMounted.current) setLoading(false);
            }

            // Scroll to bottom
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: false });
            }, 100);

            // RC-2: Only start listening AFTER initial load completes
            if (!isMounted.current) return;

            const unsubMsg = chatClient.onMessage(async (msg: ChatMessage) => {
                if (msg.roomId !== roomId || !isMounted.current) return;
                const translated = await chatTranslateService.translateMessage(msg);
                if (!isMounted.current) return; // ML-3: guard
                setMessages(prev => [...prev.filter(m => !m.pending), translated]);
                setTimeout(() => {
                    flatListRef.current?.scrollToEnd({ animated: true });
                }, 50);
            });

            const unsubTyping = chatClient.onTyping((typingRoomId: string, userIds: string[]) => {
                if (typingRoomId !== roomId || !isMounted.current) return;
                setTypingUsers(userIds);
            });

            // Set presence to online
            chatClient.setPresence('online');

            cleanupFns = [unsubMsg, unsubTyping];
        };

        init();

        return () => {
            cancelled = true;
            cleanupFns.forEach(fn => fn());
            // PC-5: Set presence back to unavailable when leaving room
            chatClient.setPresence('unavailable');
            // Clear typing debounce
            if (typingTimeout.current) clearTimeout(typingTimeout.current);
        };
    }, [roomId, userLang]);

    // ─── Send ───────────────────────────────────────────────────

    const handleSend = async () => {
        const text = inputText.trim();
        if (!text || !roomId || sendingRef.current) return; // RC-1: use ref guard
        sendingRef.current = true;

        if (isMounted.current) setSending(true);
        if (isMounted.current) setSendError(null);
        savedInputRef.current = inputText;
        if (isMounted.current) setInputText('');

        const result = await chatClient.sendMessage(roomId, text, chatTranslateService.getSendLanguage());

        sendingRef.current = false;
        if (isMounted.current) setSending(false);

        if (!result.success) {
            if (result.pending) {
                // Message queued — reload to show pending indicator
            } else {
                // Real failure — restore input text and show error
                if (isMounted.current) setInputText(savedInputRef.current);
                if (isMounted.current) setSendError('Message could not be sent. Tap Retry to try again.');
            }
        }
    };

    const handleRetrySend = () => {
        // RC-AUDIT: Restore saved text and retry — inputText may have been cleared by handleSend
        if (savedInputRef.current && isMounted.current) {
            setInputText(savedInputRef.current);
        }
        setSendError(null);
        // Defer to allow inputText state to update before handleSend reads it
        setTimeout(() => handleSend(), 0);
    };

    // PC-4: Debounced typing notifications (3s window)
    const handleTextChange = (text: string) => {
        setInputText(text);
        setSendError(null);
        if (roomId && text.length > 0) {
            if (!typingTimeout.current) {
                chatClient.sendTyping(roomId, true);
            }
            if (typingTimeout.current) clearTimeout(typingTimeout.current);
            typingTimeout.current = setTimeout(() => {
                chatClient.sendTyping(roomId, false);
                typingTimeout.current = null;
            }, 3000);
        } else if (roomId) {
            if (typingTimeout.current) clearTimeout(typingTimeout.current);
            typingTimeout.current = null;
            chatClient.sendTyping(roomId, false);
        }
    };

    // ─── Format Time ────────────────────────────────────────────

    const formatTime = (ts: number): string => {
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const renderMessage = useCallback(({ item }: any) => (
                        <View
                            style={[
                                styles.bubbleRow,
                                item.isOwn ? styles.bubbleRowOwn : styles.bubbleRowOther,
                            ]}
                            accessible={true}
                            accessibilityLabel={
                                `${item.isOwn ? 'You' : (item.senderName || 'Unknown')}: ${item.body}` +
                                (item.wasTranslated && item.translatedBody ? `. Translated: ${item.translatedBody}` : '') +
                                `. ${formatTime(item.timestamp)}` +
                                (item.pending ? '. Sending...' : '')
                            }
                            accessibilityRole="text"
                        >
                            <View style={[
                                styles.bubble,
                                item.isOwn ? styles.bubbleOwn : styles.bubbleOther,
                                item.pending && styles.bubblePending,
                            ]}>
                                {/* Sender name (for received messages) */}
                                {!item.isOwn && item.senderName && (
                                    <Text style={styles.senderName}>{stripHtml(item.senderName)}</Text>
                                )}

                                {/* Original message */}
                                <Text style={[
                                    styles.messageText,
                                    item.isOwn ? styles.messageTextOwn : styles.messageTextOther,
                                ]}>
                                    {item.body}
                                </Text>

                                {/* Translation */}
                                {item.wasTranslated && item.translatedBody && (
                                    <View style={styles.translationBlock}>
                                        <Text style={styles.translationBadge}>
                                            🌍 Translated from {item.langName}
                                        </Text>
                                        <Text style={styles.translationText}>
                                            {item.translatedBody}
                                        </Text>
                                    </View>
                                )}

                                {/* Pending indicator */}
                                {item.pending && (
                                    <Text style={styles.pendingText}>🕐 Sending...</Text>
                                )}

                                {/* L5: Pair purchase banner */}
                                {!item.wasTranslated && item.pairNeeded && item.detectedLang && (
                                    <View style={styles.pairBanner}>
                                        <Text style={styles.pairBannerText}>
                                            {TIER_1_LANGUAGES.find(l => l.code === item.detectedLang)?.flag || '🌐'}{' '}
                                            Get EN\u2194{translationService.getLangName(item.detectedLang ?? '')} to understand this message
                                        </Text>
                                        <View style={styles.pairBannerActions}>
                                            <TouchableOpacity
                                                style={styles.pairBannerBuy}
                                                onPress={async () => {
                                                    try {
                                                        const offerings = await subscriptionService.getOfferings();
                                                        const pkg = offerings[0]?.packages[0]?.rcPackage;
                                                        if (pkg) {
                                                            const result = await subscriptionService.purchasePackage(pkg);
                                                            if (result.success) {
                                                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                                                await pairManager.downloadPair(
                                                                    item.pairNeeded!,
                                                                    `${PAIR_CDN_BASE}/${item.pairNeeded}.bin`,
                                                                );
                                                                // Re-translate the message in place
                                                                const retranslated = await chatTranslateService.translateMessage(item);
                                                                setMessages(prev => prev.map(m =>
                                                                    m.eventId === item.eventId ? { ...retranslated, pending: undefined } : m
                                                                ));
                                                            }
                                                        }
                                                    } catch {
                                                        Alert.alert('Purchase Error', 'Could not complete purchase.');
                                                    }
                                                }}
                                                accessibilityLabel="Buy translation engine"
                                                accessibilityRole="button"
                                            >
                                                <Text style={styles.pairBannerBuyText}>Get for $6.99</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={styles.pairBannerCloud}
                                                onPress={async () => {
                                                    try {
                                                        const cloudResult = await translationService.translate(
                                                            item.body, item.detectedLang ?? 'en', chatTranslateService.getUserLanguage()
                                                        );
                                                        setMessages(prev => prev.map(m =>
                                                            m.eventId === item.eventId
                                                                ? { ...m, translatedBody: cloudResult.translated, wasTranslated: true, pairNeeded: undefined }
                                                                : m
                                                        ));
                                                    } catch {
                                                        Alert.alert('Cloud Error', 'Cloud translation unavailable.');
                                                    }
                                                }}
                                                accessibilityLabel="Translate once via cloud"
                                                accessibilityRole="button"
                                            >
                                                <Text style={styles.pairBannerCloudText}>Translate once via cloud</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}

                                {/* Time */}
                                <Text style={[
                                    styles.timeText,
                                    item.isOwn ? styles.timeTextOwn : styles.timeTextOther,
                                ]}>
                                    {formatTime(item.timestamp)}
                                </Text>
                            </View>
                        </View>
    ), [setMessages]);

    // ─── Loading ────────────────────────────────────────────────

    if (loading) {
        return (
            <ScreenErrorBoundary screenName="Conversation">
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}
                    accessibilityLabel="Loading conversation" accessibilityRole="none"
                >
                    <ActivityIndicator size="large" color={colors.accent} />
                </View>
            </SafeAreaView>
            </ScreenErrorBoundary>
        );
    }

    // ─── Render ─────────────────────────────────────────────────

    return (
        <ScreenErrorBoundary screenName="Conversation">
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}
                    accessibilityLabel="Go back" accessibilityRole="button"
                >
                    <Text style={styles.backText}>←</Text>
                </TouchableOpacity>
                <View style={styles.headerInfo}>
                    <Text style={styles.headerName} numberOfLines={1}
                        accessibilityRole="header"
                    >{roomName}</Text>
                    {typingUsers.length > 0 && (
                        <Text style={styles.typingText}
                            accessibilityLabel={`${typingUsers.length === 1 ? 'Someone is' : `${typingUsers.length} people are`} typing`}
                            accessibilityRole="text"
                        >typing...</Text>
                    )}
                </View>
            </View>

            {/* Offline Banner */}
            {isOffline && (
                <View style={styles.offlineBanner}
                    accessibilityLabel="You are offline. Messages will send when connected."
                    accessibilityRole="alert"
                >
                    <Text style={styles.offlineBannerText}>
                        {syncState === 'reconnecting' ? '⏳ Reconnecting...' : '📡 Offline — messages will send when connected'}
                    </Text>
                </View>
            )}

            {/* Load Error Banner */}
            {loadError && (
                <View style={styles.sendErrorBar}
                    accessibilityLabel={loadError}
                    accessibilityRole="alert"
                >
                    <Text style={styles.sendErrorText}>{loadError}</Text>
                </View>
            )}

            {/* Messages */}
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={0}
            >
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    keyExtractor={item => item.eventId}
                    contentContainerStyle={styles.messageList}
                    onContentSizeChange={() => {
                        flatListRef.current?.scrollToEnd({ animated: false });
                    }}
                    renderItem={renderMessage}
                />

                {/* Typing indicator */}
                {typingUsers.length > 0 && (
                    <View style={styles.typingBar}
                        accessibilityLabel={`${typingUsers.length === 1 ? 'Someone is' : `${typingUsers.length} people are`} typing`}
                        accessibilityRole="text"
                    >
                        <Text style={styles.typingBarText}>
                            {typingUsers.length === 1 ? 'Someone is' : `${typingUsers.length} people are`} typing...
                        </Text>
                    </View>
                )}

                {/* Send Error */}
                {sendError && (
                    <View style={styles.sendErrorBar}
                        accessibilityRole="alert"
                    >
                        <Text style={styles.sendErrorText}>⚠️ {sendError}</Text>
                        <TouchableOpacity onPress={handleRetrySend} style={styles.retryBtn}
                            accessibilityLabel="Retry sending message" accessibilityRole="button"
                        >
                            <Text style={styles.retryText}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Input */}
                <View style={styles.inputBar}>
                    <TextInput
                        style={styles.textInput}
                        value={inputText}
                        onChangeText={handleTextChange}
                        placeholder="Type a message..."
                        placeholderTextColor={colors.textTertiary}
                        multiline
                        maxLength={10000}
                        returnKeyType="default"
                        accessibilityLabel="Type a message"
                        accessibilityHint="Type and send a message in this conversation"
                    />
                    <TouchableOpacity
                        style={[
                            styles.sendButton,
                            (!inputText.trim() || sending) && styles.sendButtonDisabled,
                        ]}
                        onPress={handleSend}
                        disabled={!inputText.trim() || sending}
                        accessibilityLabel="Send message" accessibilityRole="button"
                    >
                        {sending ? (
                            <ActivityIndicator size="small" color={colors.background} />
                        ) : (
                            <Text style={styles.sendIcon}>↑</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
        </ScreenErrorBoundary>
    );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    backBtn: { padding: 8, minWidth: 44, minHeight: 44, justifyContent: 'center' },
    backText: { fontSize: 22, color: colors.accent, fontWeight: '600' },
    headerInfo: { flex: 1, marginLeft: 4 },
    headerName: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
    typingText: { fontSize: 12, color: colors.accent, marginTop: 1 },

    // Offline banner
    offlineBanner: {
        backgroundColor: '#fbbf24',
        paddingVertical: 6,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    offlineBannerText: { fontSize: 12, fontWeight: '600', color: '#1a1a1a' },

    // Messages
    messageList: { paddingHorizontal: 12, paddingVertical: 8 },
    bubbleRow: { marginBottom: 6 },
    bubbleRowOwn: { alignItems: 'flex-end' },
    bubbleRowOther: { alignItems: 'flex-start' },

    bubble: {
        maxWidth: '78%',
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    bubbleOwn: {
        backgroundColor: '#3b82f6',
        borderBottomRightRadius: 4,
    },
    bubbleOther: {
        backgroundColor: colors.surface,
        borderBottomLeftRadius: 4,
    },
    bubblePending: {
        opacity: 0.6,
    },

    senderName: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.accent,
        marginBottom: 2,
    },

    messageText: { fontSize: 15, lineHeight: 21 },
    messageTextOwn: { color: '#fff' },
    messageTextOther: { color: colors.textPrimary },

    translationBlock: {
        marginTop: 8,
        paddingTop: 6,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(255,255,255,0.35)', // VQ: improved contrast for dark/light bubbles
    },
    translationBadge: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.7)',
        marginBottom: 3,
    },
    translationText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.9)',
        fontStyle: 'italic',
    },

    pendingText: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.6)',
        marginTop: 4,
        fontStyle: 'italic',
    },

    timeText: { fontSize: 10, marginTop: 4 },
    timeTextOwn: { color: 'rgba(255,255,255,0.6)', textAlign: 'right' },
    timeTextOther: { color: colors.textTertiary },

    // Typing
    typingBar: { paddingHorizontal: 16, paddingVertical: 4 },
    typingBarText: { fontSize: 12, color: colors.textTertiary, fontStyle: 'italic' },

    // Send error
    sendErrorBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 6,
        backgroundColor: 'rgba(239,68,68,0.15)',
    },
    sendErrorText: { fontSize: 12, color: colors.stateError, flex: 1 },
    retryBtn: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 },
    retryText: { fontSize: 13, fontWeight: '600', color: colors.accent },

    // Input
    inputBar: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
    },
    textInput: {
        flex: 1,
        backgroundColor: colors.surface,
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        fontSize: 15,
        color: colors.textPrimary,
        maxHeight: 100,
        minHeight: 44, // VQ: iOS 44pt minimum
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    sendButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.accent,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
    },
    sendButtonDisabled: { opacity: 0.4 },
    sendIcon: { fontSize: 18, fontWeight: '700', color: colors.background },

    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // L5: Pair purchase banner
    pairBanner: {
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(255,255,255,0.2)',
    },
    pairBannerText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.85)',
        marginBottom: 6,
        lineHeight: 17,
    },
    pairBannerActions: {
        flexDirection: 'row',
        gap: 8,
    },
    pairBannerBuy: {
        backgroundColor: '#22c55e',
        borderRadius: 12,
        paddingVertical: 5,
        paddingHorizontal: 10,
    },
    pairBannerBuyText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#fff',
    },
    pairBannerCloud: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 12,
        paddingVertical: 5,
        paddingHorizontal: 10,
    },
    pairBannerCloudText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.8)',
    },
});
