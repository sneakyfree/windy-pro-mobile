/**
 * Mail Message Reader — WebView-backed view of a single message.
 *
 * Windy Mail's API has no JSON endpoint for a full message body; the canonical
 * read view is the server-rendered /webmail/message/{id} page. We embed it in
 * a WebView with the account-server JWT injected into localStorage for
 * auto-auth — same pattern as the legacy full-tab WebView.
 *
 * A future wave can add GET /api/v1/message/{id} on windy-mail and replace
 * this with a native renderer.
 */
import { useMemo, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, TouchableOpacity, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { colors, fontSizes } from '@/theme';
import { WINDY_MAIL_WEBVIEW_URL } from '@/config/api';
import { identityApi } from '@/services/identityApi';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { buildOriginWhitelist, buildNavigationGuard } from '@/lib/webviewOrigins';

const MAIL_ALLOWED_ORIGINS = buildOriginWhitelist(WINDY_MAIL_WEBVIEW_URL);
const mailNavigationGuard = buildNavigationGuard(MAIL_ALLOWED_ORIGINS);

const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export default function MessageReadScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();

    const safeId = typeof id === 'string' && SAFE_ID_RE.test(id) ? id : null;
    const uri = safeId ? `${WINDY_MAIL_WEBVIEW_URL}/webmail/message/${safeId}` : null;

    const webViewRef = useRef<WebView>(null);
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(true);

    const injectedJS = useMemo(() => {
        const token = identityApi.getToken();
        if (!token) return '';
        return `
            (function () {
                try {
                    localStorage.setItem('windy_auth_token', ${JSON.stringify(token)});
                } catch (e) {}
                true;
            })();
        `;
    }, []);

    const reload = useCallback(() => {
        setError(false);
        setLoading(true);
        webViewRef.current?.reload();
    }, []);

    return (
        <ScreenErrorBoundary screenName="MailMessage">
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/mail'))}
                        style={styles.backButton}
                        accessibilityRole="button"
                        accessibilityLabel="Back to inbox"
                    >
                        <Text style={styles.backText}>← Inbox</Text>
                    </TouchableOpacity>
                </View>
                {!uri ? (
                    <View style={styles.center}>
                        <Text style={styles.errorText}>Invalid message id.</Text>
                    </View>
                ) : error ? (
                    <View style={styles.center}>
                        <Text style={styles.errorEmoji}>📧</Text>
                        <Text style={styles.errorTitle}>Couldn't load this message</Text>
                        <Text style={styles.errorSubtitle}>
                            Check your connection and try again.
                        </Text>
                        <TouchableOpacity
                            style={styles.retryButton}
                            onPress={reload}
                            accessibilityRole="button"
                            accessibilityLabel="Retry loading message"
                        >
                            <Text style={styles.retryText}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        <WebView
                            ref={webViewRef}
                            source={{ uri }}
                            injectedJavaScriptBeforeContentLoaded={injectedJS}
                            onLoadEnd={() => setLoading(false)}
                            onError={() => { setLoading(false); setError(true); }}
                            onHttpError={() => { setLoading(false); setError(true); }}
                            style={styles.webview}
                            // Lock the reader to windymail.ai so the injected JWT
                            // can't follow a redirect off-domain and get stolen.
                            originWhitelist={MAIL_ALLOWED_ORIGINS}
                            onShouldStartLoadWithRequest={mailNavigationGuard}
                        />
                        {loading && (
                            <View style={styles.loader}>
                                <ActivityIndicator color={colors.accent} />
                            </View>
                        )}
                    </>
                )}
            </SafeAreaView>
        </ScreenErrorBoundary>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    backButton: { paddingVertical: 8, paddingHorizontal: 8, minHeight: 44, justifyContent: 'center' },
    backText: { color: colors.accent, fontSize: fontSizes.base, fontWeight: '600' },
    webview: { flex: 1, backgroundColor: colors.background },
    loader: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    errorEmoji: { fontSize: 48, marginBottom: 16 },
    errorTitle: {
        fontSize: fontSizes.base,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: 8,
        textAlign: 'center',
    },
    errorSubtitle: {
        fontSize: fontSizes.sm,
        color: colors.textSecondary,
        textAlign: 'center',
        marginBottom: 24,
    },
    errorText: { color: colors.stateError, fontSize: fontSizes.base },
    retryButton: {
        backgroundColor: colors.accent,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 24,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    retryText: {
        color: colors.background,
        fontWeight: '700',
        fontSize: fontSizes.base,
    },
});
