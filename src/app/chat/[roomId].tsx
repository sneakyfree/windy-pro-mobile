/**
 * 🧬 Conversation Screen — Message Bubbles with Translation
 * Shows message history with real-time updates, typing indicators,
 * and on-device translation of received messages.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, FlatList, TextInput, TouchableOpacity,
    StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme';
import { chatClient, type ChatMessage } from '@/services/chatClient';
import { chatTranslateService, type TranslatedMessage } from '@/services/chatTranslate';
import { useSettingsStore } from '@/stores/useSettingsStore';

// ─── Component ──────────────────────────────────────────────────

export default function ConversationScreen() {
    const { roomId } = useLocalSearchParams<{ roomId: string }>();
    const [messages, setMessages] = useState<TranslatedMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [typingUsers, setTypingUsers] = useState<string[]>([]);
    const [roomName, setRoomName] = useState('Chat');
    const flatListRef = useRef<FlatList>(null);

    const userLang = useSettingsStore(s => s.defaultLanguage);

    useEffect(() => {
        chatTranslateService.setUserLanguage(userLang);
    }, [userLang]);

    // ─── Load Messages ──────────────────────────────────────────

    const loadMessages = useCallback(async () => {
        if (!roomId) return;

        const name = chatClient.getRoomName(roomId);
        setRoomName(name);

        const rawMessages = chatClient.getMessages(roomId, 100);
        const translated = await chatTranslateService.translateMessages(rawMessages);
        setMessages(translated);
        setLoading(false);

        // Scroll to bottom
        setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: false });
        }, 100);
    }, [roomId]);

    useEffect(() => {
        loadMessages();
    }, [loadMessages]);

    // ─── Real-time Listeners ────────────────────────────────────

    useEffect(() => {
        if (!roomId) return;

        const unsubMsg = chatClient.onMessage(async (msg: ChatMessage) => {
            if (msg.roomId !== roomId) return;
            const translated = await chatTranslateService.translateMessage(msg);
            setMessages(prev => [...prev, translated]);
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 50);
        });

        const unsubTyping = chatClient.onTyping((typingRoomId: string, userIds: string[]) => {
            if (typingRoomId !== roomId) return;
            setTypingUsers(userIds);
        });

        // Set presence to online
        chatClient.setPresence('online');

        return () => {
            unsubMsg();
            unsubTyping();
        };
    }, [roomId]);

    // ─── Send ───────────────────────────────────────────────────

    const handleSend = async () => {
        const text = inputText.trim();
        if (!text || !roomId || sending) return;

        setSending(true);
        setInputText('');

        // Send with language metadata
        await chatClient.sendMessage(roomId, text, chatTranslateService.getSendLanguage());
        setSending(false);
    };

    // ─── Typing ─────────────────────────────────────────────────

    const handleTextChange = (text: string) => {
        setInputText(text);
        if (roomId) {
            chatClient.sendTyping(roomId, text.length > 0);
        }
    };

    // ─── Format Time ────────────────────────────────────────────

    const formatTime = (ts: number): string => {
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // ─── Loading ────────────────────────────────────────────────

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.accent} />
                </View>
            </SafeAreaView>
        );
    }

    // ─── Render ─────────────────────────────────────────────────

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}
                    accessibilityLabel="Go back" accessibilityRole="button"
                >
                    <Text style={styles.backText}>←</Text>
                </TouchableOpacity>
                <View style={styles.headerInfo}>
                    <Text style={styles.headerName} numberOfLines={1}>{roomName}</Text>
                    {typingUsers.length > 0 && (
                        <Text style={styles.typingText}>typing...</Text>
                    )}
                </View>
            </View>

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
                    renderItem={({ item }) => (
                        <View style={[
                            styles.bubbleRow,
                            item.isOwn ? styles.bubbleRowOwn : styles.bubbleRowOther,
                        ]}>
                            <View style={[
                                styles.bubble,
                                item.isOwn ? styles.bubbleOwn : styles.bubbleOther,
                            ]}>
                                {/* Sender name (for received messages) */}
                                {!item.isOwn && item.senderName && (
                                    <Text style={styles.senderName}>{item.senderName}</Text>
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

                                {/* Time */}
                                <Text style={[
                                    styles.timeText,
                                    item.isOwn ? styles.timeTextOwn : styles.timeTextOther,
                                ]}>
                                    {formatTime(item.timestamp)}
                                </Text>
                            </View>
                        </View>
                    )}
                />

                {/* Typing indicator */}
                {typingUsers.length > 0 && (
                    <View style={styles.typingBar}>
                        <Text style={styles.typingBarText}>
                            {typingUsers.length === 1 ? 'Someone is' : `${typingUsers.length} people are`} typing...
                        </Text>
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
                        maxLength={4000}
                        returnKeyType="default"
                        accessibilityLabel="Type a message"
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
    backBtn: { padding: 8 },
    backText: { fontSize: 22, color: colors.accent, fontWeight: '600' },
    headerInfo: { flex: 1, marginLeft: 4 },
    headerName: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
    typingText: { fontSize: 12, color: colors.accent, marginTop: 1 },

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
        borderTopColor: 'rgba(255,255,255,0.2)',
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

    timeText: { fontSize: 10, marginTop: 4 },
    timeTextOwn: { color: 'rgba(255,255,255,0.6)', textAlign: 'right' },
    timeTextOther: { color: colors.textTertiary },

    // Typing
    typingBar: { paddingHorizontal: 16, paddingVertical: 4 },
    typingBarText: { fontSize: 12, color: colors.textTertiary, fontStyle: 'italic' },

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
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    sendButton: {
        width: 36,
        height: 44,
        borderRadius: 18,
        backgroundColor: colors.accent,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
    },
    sendButtonDisabled: { opacity: 0.4 },
    sendIcon: { fontSize: 18, fontWeight: '700', color: colors.background },

    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
