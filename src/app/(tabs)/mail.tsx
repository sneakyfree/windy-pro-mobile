/**
 * Mail Tab — native inbox list (Wave 3).
 *
 * Fetches {WINDY_MAIL_URL}/api/v1/inbox with the account-server JWT.
 * Tapping a row navigates to /mail/[id] which renders the message in a
 * WebView pointed at /webmail/message/{id}.
 *
 * Out of scope for v1: compose, reply, search, labels, archive.
 */
import { useCallback, useEffect, useState } from 'react';
import {
    View, Text, StyleSheet, FlatList,
    ActivityIndicator, RefreshControl, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors, fontSizes } from '@/theme';
import { identityApi } from '@/services/identityApi';
import { listInbox, type InboxMessage } from '@/services/mailApi';
import { MessageRow } from '@/components/mail/MessageRow';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

const PAGE_SIZE = 50;

export default function MailTab() {
    const [authed, setAuthed] = useState<boolean>(identityApi.isAuthenticated());
    const [messages, setMessages] = useState<InboxMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [total, setTotal] = useState(0);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const unsub = identityApi.onChange(() => {
            setAuthed(identityApi.isAuthenticated());
        });
        return unsub;
    }, []);

    const load = useCallback(async (offset: number, mode: 'initial' | 'refresh' | 'more') => {
        if (mode === 'initial') setLoading(true);
        if (mode === 'refresh') setRefreshing(true);
        if (mode === 'more') setLoadingMore(true);

        const result = await listInbox({ limit: PAGE_SIZE, offset });

        if (mode === 'initial') setLoading(false);
        if (mode === 'refresh') setRefreshing(false);
        if (mode === 'more') setLoadingMore(false);

        if (!result.ok || !result.page) {
            setError(result.error || 'Failed to load inbox');
            return;
        }
        setError(null);
        setTotal(result.page.total);
        setMessages(prev =>
            mode === 'more'
                ? dedupeById([...prev, ...result.page!.messages])
                : result.page!.messages
        );
    }, []);

    useEffect(() => {
        if (authed) void load(0, 'initial');
    }, [authed, load]);

    const onRefresh = useCallback(() => { void load(0, 'refresh'); }, [load]);
    const onEndReached = useCallback(() => {
        if (loadingMore || refreshing || loading) return;
        if (messages.length >= total) return;
        void load(messages.length, 'more');
    }, [loadingMore, refreshing, loading, messages.length, total, load]);

    const onPressMessage = useCallback((id: string) => {
        router.push({ pathname: '/mail/[id]', params: { id } });
    }, []);

    if (!authed) {
        return (
            <ScreenErrorBoundary screenName="Mail">
                <SafeAreaView style={styles.container}>
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>📧</Text>
                        <Text style={styles.emptyTitle}>Sign in to see your mail</Text>
                        <TouchableOpacity
                            style={styles.signInButton}
                            onPress={() => router.push('/auth/login')}
                        >
                            <Text style={styles.signInButtonText}>Sign in with Windy</Text>
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </ScreenErrorBoundary>
        );
    }

    return (
        <ScreenErrorBoundary screenName="Mail">
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Inbox</Text>
                    {total > 0 && (
                        <Text style={styles.headerSubtitle}>
                            {messages.length} of {total}
                        </Text>
                    )}
                </View>

                {loading && messages.length === 0 ? (
                    <View style={styles.center}>
                        <ActivityIndicator color={colors.accent} />
                    </View>
                ) : error ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.errorText}>{error}</Text>
                        <TouchableOpacity
                            style={styles.signInButton}
                            onPress={() => load(0, 'initial')}
                        >
                            <Text style={styles.signInButtonText}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                ) : messages.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>📭</Text>
                        <Text style={styles.emptyTitle}>No messages yet</Text>
                    </View>
                ) : (
                    <FlatList
                        data={messages}
                        keyExtractor={(m) => m.id}
                        renderItem={({ item }) => (
                            <MessageRow message={item} onPress={onPressMessage} />
                        )}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={onRefresh}
                                tintColor={colors.accent}
                            />
                        }
                        onEndReached={onEndReached}
                        onEndReachedThreshold={0.4}
                        ListFooterComponent={loadingMore ? (
                            <View style={styles.footer}>
                                <ActivityIndicator color={colors.textSecondary} />
                            </View>
                        ) : null}
                    />
                )}
            </SafeAreaView>
        </ScreenErrorBoundary>
    );
}

function dedupeById(list: InboxMessage[]): InboxMessage[] {
    const seen = new Set<string>();
    const out: InboxMessage[] = [];
    for (const m of list) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        out.push(m);
    }
    return out;
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    headerTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
    headerSubtitle: { fontSize: fontSizes.sm, color: colors.textSecondary },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    emptyIcon: { fontSize: 52, marginBottom: 16 },
    emptyTitle: {
        fontSize: fontSizes.base,
        color: colors.textSecondary,
        textAlign: 'center',
        marginBottom: 24,
    },
    errorText: {
        fontSize: fontSizes.base,
        color: colors.stateError,
        textAlign: 'center',
        marginBottom: 24,
    },
    signInButton: {
        backgroundColor: colors.accent,
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 24,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    signInButtonText: {
        color: colors.background,
        fontWeight: '700',
        fontSize: fontSizes.base,
    },
    footer: { paddingVertical: 16, alignItems: 'center' },
});
