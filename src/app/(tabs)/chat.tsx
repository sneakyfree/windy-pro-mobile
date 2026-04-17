/**
 * Chat Tab — Embedded Windy Chat WebView
 * Loads the Windy Chat dashboard with native bridges for:
 * - Microphone access (voice messages)
 * - Camera access (photo/video messages)
 * - Push notifications (new message alerts)
 * - Contacts access (contact discovery)
 * Auth token injected into WebView localStorage for auto-login.
 * Unread badge count synced from WebView via bridge messages.
 */
import { useRef, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    Platform,
    Pressable,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as Contacts from 'expo-contacts';
import { Audio } from 'expo-av';
import { Camera } from 'expo-camera';
import { colors, spacing } from '@/theme';
import { typography } from '@/theme/typography';
import { cloudApi } from '@/services/cloudApi';
import { WINDY_CHAT_WEBVIEW_URL } from '@/config/api';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { useChatBadgeStore } from '@/stores/useChatBadgeStore';
import { buildOriginWhitelist, buildNavigationGuard } from '@/lib/webviewOrigins';

const CHAT_ALLOWED_ORIGINS = buildOriginWhitelist(WINDY_CHAT_WEBVIEW_URL);
const chatNavigationGuard = buildNavigationGuard(CHAT_ALLOWED_ORIGINS);

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
    | { type: 'requestCamera' }
    | { type: 'requestContacts' }
    | { type: 'scheduleNotification'; title: string; body: string; data?: Record<string, string> }
    | { type: 'unreadCount'; count: number };

export default function ChatTab() {
    const webViewRef = useRef<WebView>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const setUnreadCount = useChatBadgeStore(s => s.setUnreadCount);

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

            case 'requestCamera': {
                const { status } = await Camera.requestCameraPermissionsAsync();
                webViewRef.current?.postMessage(
                    JSON.stringify({ type: 'cameraResult', granted: status === 'granted' }),
                );
                break;
            }

            case 'requestContacts': {
                const { status } = await Contacts.requestPermissionsAsync();
                if (status === 'granted') {
                    const { data } = await Contacts.getContactsAsync({
                        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
                    });
                    webViewRef.current?.postMessage(
                        JSON.stringify({
                            type: 'contactsResult',
                            granted: true,
                            contacts: data.map(c => ({
                                name: c.name,
                                phones: (c.phoneNumbers ?? []).map(p => p.number),
                                emails: (c.emails ?? []).map(e => e.email),
                            })),
                        }),
                    );
                } else {
                    webViewRef.current?.postMessage(
                        JSON.stringify({ type: 'contactsResult', granted: false, contacts: [] }),
                    );
                }
                break;
            }

            case 'scheduleNotification': {
                await Notifications.scheduleNotificationAsync({
                    content: {
                        title: msg.title,
                        body: msg.body,
                        data: { ...msg.data, route: '/(tabs)/chat' },
                        ...(Platform.OS === 'android' ? { channelId: 'chat' } : {}),
                    },
                    trigger: null as unknown as Notifications.NotificationTriggerInput,
                });
                break;
            }

            case 'unreadCount': {
                setUnreadCount(msg.count);
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
                    <Text style={styles.emoji}>💬</Text>
                    <Text style={styles.title}>Couldn't load Chat</Text>
                    <Text style={styles.subtitle}>
                        {__DEV__
                            ? 'Is the dev server running on localhost:3000?'
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
        <ScreenErrorBoundary screenName="ChatTab">
            <SafeAreaView style={styles.container} edges={['top']}>
                {loading && (
                    <View style={styles.loader}>
                        <ActivityIndicator color={colors.accent} size="large" />
                    </View>
                )}
                <WebView
                    ref={webViewRef}
                    source={{ uri: WINDY_CHAT_WEBVIEW_URL }}
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
                    // Allow microphone + camera for voice/video messages
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
                    // Lock the WebView to chat.windyword.ai so the injected
                    // JWT can't follow a redirect off-domain and get stolen.
                    originWhitelist={CHAT_ALLOWED_ORIGINS}
                    onShouldStartLoadWithRequest={chatNavigationGuard}
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
