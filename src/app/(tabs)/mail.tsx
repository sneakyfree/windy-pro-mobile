/**
 * Mail Tab — Embedded Windy Mail WebView
 * Loads the Windy Mail dashboard with native bridges for:
 * - Microphone access (voice compose STT)
 * - Push notifications (new email alerts)
 * - Share intent (receive shared content from other apps)
 * Auth token injected into WebView localStorage for auto-login.
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    Platform,
    Pressable,
    Share,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import { Audio } from 'expo-av';
import { colors, spacing } from '@/theme';
import { typography } from '@/theme/typography';
import { cloudApi } from '@/services/cloudApi';
import { WINDY_MAIL_WEBVIEW_URL } from '@/config/api';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

/** JavaScript injected before page load to set the auth token in localStorage */
function buildInjectedJS(): string {
    const token = cloudApi.getToken();
    if (!token) return '';
    return `
        (function() {
            try {
                localStorage.setItem('windy_auth_token', ${JSON.stringify(token)});
            } catch(e) {}
            true;
        })();
    `;
}

/**
 * Bridge message types the WebView can send via window.ReactNativeWebView.postMessage()
 */
type BridgeMessage =
    | { type: 'requestMicrophone' }
    | { type: 'scheduleNotification'; title: string; body: string; data?: Record<string, string> }
    | { type: 'share'; text?: string; url?: string; title?: string };

export default function MailTab() {
    const webViewRef = useRef<WebView>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const params = useLocalSearchParams<{ sharedText?: string; sharedUrl?: string }>();

    // Forward shared content from other apps into the WebView
    useEffect(() => {
        if (!params.sharedText && !params.sharedUrl) return;
        const payload = JSON.stringify({
            type: 'sharedContent',
            text: params.sharedText ?? '',
            url: params.sharedUrl ?? '',
        });
        webViewRef.current?.postMessage(payload);
    }, [params.sharedText, params.sharedUrl]);

    // Listen for incoming share intents while on this tab
    useEffect(() => {
        const handleUrl = ({ url }: { url: string }) => {
            const parsed = Linking.parse(url);
            if (parsed.queryParams?.sharedText || parsed.queryParams?.sharedUrl) {
                const payload = JSON.stringify({
                    type: 'sharedContent',
                    text: String(parsed.queryParams.sharedText ?? ''),
                    url: String(parsed.queryParams.sharedUrl ?? ''),
                });
                webViewRef.current?.postMessage(payload);
            }
        };
        const sub = Linking.addEventListener('url', handleUrl);
        return () => sub.remove();
    }, []);

    const handleMessage = useCallback(async (event: WebViewMessageEvent) => {
        let msg: BridgeMessage;
        try {
            msg = JSON.parse(event.nativeEvent.data) as BridgeMessage;
        } catch {
            return;
        }

        switch (msg.type) {
            case 'requestMicrophone': {
                const { status } = await Audio.requestPermissionsAsync();
                webViewRef.current?.postMessage(
                    JSON.stringify({ type: 'microphoneResult', granted: status === 'granted' }),
                );
                break;
            }

            case 'scheduleNotification': {
                await Notifications.scheduleNotificationAsync({
                    content: {
                        title: msg.title,
                        body: msg.body,
                        data: msg.data ?? {},
                        ...(Platform.OS === 'android' ? { channelId: 'mail' } : {}),
                    },
                    trigger: null as unknown as Notifications.NotificationTriggerInput,
                });
                break;
            }

            case 'share': {
                await Share.share({
                    message: msg.text ?? '',
                    url: msg.url,
                    title: msg.title,
                });
                break;
            }
        }
    }, []);

    const reload = useCallback(() => {
        setError(false);
        setLoading(true);
        webViewRef.current?.reload();
    }, []);

    if (error) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <View style={styles.center}>
                    <Text style={styles.emoji}>📧</Text>
                    <Text style={styles.title}>Couldn't load Mail</Text>
                    <Text style={styles.subtitle}>
                        {__DEV__
                            ? 'Is the dev server running on localhost:5173?'
                            : 'Check your internet connection and try again.'}
                    </Text>
                    <Pressable style={styles.retryBtn} onPress={reload} accessibilityRole="button">
                        <Text style={styles.retryText}>Retry</Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <ScreenErrorBoundary screenName="MailTab">
            <SafeAreaView style={styles.container} edges={['top']}>
                {loading && (
                    <View style={styles.loader}>
                        <ActivityIndicator color={colors.accent} size="large" />
                    </View>
                )}
                <WebView
                    ref={webViewRef}
                    source={{ uri: WINDY_MAIL_WEBVIEW_URL }}
                    injectedJavaScriptBeforeContentLoaded={buildInjectedJS()}
                    onMessage={handleMessage}
                    onLoadEnd={() => setLoading(false)}
                    onError={() => {
                        setLoading(false);
                        setError(true);
                    }}
                    onHttpError={() => {
                        setLoading(false);
                        setError(true);
                    }}
                    // Allow microphone for voice compose
                    mediaPlaybackRequiresUserAction={false}
                    allowsInlineMediaPlayback
                    mediaCapturePermissionGrantType="grant"
                    // Performance
                    startInLoadingState={false}
                    javaScriptEnabled
                    domStorageEnabled
                    sharedCookiesEnabled
                    // Style
                    style={styles.webview}
                    containerStyle={styles.webviewContainer}
                    // Allow navigation within the mail app
                    originWhitelist={['https://*', 'http://*']}
                />
            </SafeAreaView>
        </ScreenErrorBoundary>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    webview: { flex: 1, backgroundColor: colors.background },
    webviewContainer: { flex: 1 },
    loader: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
        zIndex: 10,
    },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
    emoji: { fontSize: 64, marginBottom: 16 },
    title: { ...typography.h1, color: colors.textPrimary, marginBottom: 8 },
    subtitle: { ...typography.body, color: colors.textTertiary, textAlign: 'center', marginTop: 4 },
    retryBtn: {
        backgroundColor: colors.accent,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
        marginTop: 32,
    },
    retryText: { ...typography.button, color: colors.background },
});
