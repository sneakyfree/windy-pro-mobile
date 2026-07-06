/**
 * 🧬 Push Notification Service
 * expo-notifications setup for Android
 * FCM token registration, translation alerts, subscription reminders
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { createLogger } from './logger';
import { API_BASE_URL, PUSH_TOKEN_ENDPOINT_URL, CHAT_PUSH_BASE_URL } from '@/config/api';
import { fetchWithTimeout } from '@/utils/fetch-timeout';

const log = createLogger('PushNotifications');

/** Canonical bundle id — informational for the gateway (APNs topic comes
 * from the server's APNS_BUNDLE_ID env) and the Matrix pusher app_id. */
const APP_BUNDLE_ID = 'uk.thewindstorm.windypro';

// Per ADR-006: register FCM/APNs token at the canonical chat-side
// push-gateway endpoint, not at Pro. Cross-service publishers (Mail,
// Cloud, Code, etc.) all publish to chat's push-gateway, so the token
// must live in chat's device-token store, not Pro's. The legacy
// account.windyword.ai/api/register-push-token endpoint stays as a
// 308 redirect shim; old mobile builds keep working until they update.
const REGISTER_TOKEN_URL = PUSH_TOKEN_ENDPOINT_URL;

/** Extract the push-registration user id from a JWT without pulling in
 * a dep. The push-gateway's ownership check (server.js callerOwnsUserId)
 * compares the body's userId against `windy_identity_id || sub`, so we
 * MUST send windy_identity_id when the claim exists — sending sub for a
 * JWT that carries a different windy_identity_id 403s the registration.
 * JWT payload is the middle segment, base64url-encoded JSON. Returns
 * null if malformed or no base64 decoder available. */
function extractPushUserIdFromJwt(jwt: string): string | null {
    try {
        const parts = jwt.split('.');
        if (parts.length < 2) return null;
        // base64url → base64 (atob doesn't grok the url-safe alphabet).
        let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const pad = payload.length % 4;
        if (pad) payload += '='.repeat(4 - pad);
        // Hermes / RN >=0.74 have atob globally.
        if (typeof globalThis.atob !== 'function') return null;
        const decoded = JSON.parse(globalThis.atob(payload));
        if (typeof decoded?.windy_identity_id === 'string') return decoded.windy_identity_id;
        return typeof decoded?.sub === 'string' ? decoded.sub : null;
    } catch {
        return null;
    }
}

// Configure notification behavior
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export interface PushNotificationConfig {
    translationComplete: boolean;
    subscriptionReminders: boolean;
    updatePrompts: boolean;
}

class PushNotificationService {
    private token: string | null = null;
    private config: PushNotificationConfig = {
        translationComplete: true,
        subscriptionReminders: true,
        updatePrompts: true,
    };

    /**
     * Initialize push notifications and register token
     */
    async initialize(): Promise<string | null> {
        // Only works on physical devices
        if (!Device.isDevice) {
            return null;
        }

        try {
            // Request permissions
            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;

            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync();
                finalStatus = status;
            }

            if (finalStatus !== 'granted') {
                log.warn('Permission_not_granted', 'Permission not granted');
                return null;
            }

            // Android-specific: set notification channel
            if (Platform.OS === 'android') {
                await this.setupAndroidChannels();
            }

            // Get native device push token (APNs hex on iOS, FCM token on Android).
            // The chat push-gateway dispatches directly via APNs/FCM, not via Expo
            // Push Service, so we need the underlying device token, not an
            // ExponentPushToken[...] (which the gateway would reject).
            const tokenData = await Notifications.getDevicePushTokenAsync();
            if (typeof tokenData.data !== 'string') {
                log.warn('Unexpected_token_shape', 'Web push token in native app context');
                return null;
            }
            this.token = tokenData.data;

            // Register with backend
            await this.registerTokenWithBackend(this.token);

            return this.token;
        } catch (err) {
            log.error('initialize', err);
            return null;
        }
    }

    /**
     * Setup Android notification channels
     */
    private async setupAndroidChannels(): Promise<void> {
        await Notifications.setNotificationChannelAsync('translation', {
            name: 'Translation Complete',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#a3e635',
            sound: 'default',
        });

        await Notifications.setNotificationChannelAsync('subscription', {
            name: 'Subscription',
            importance: Notifications.AndroidImportance.DEFAULT,
            lightColor: '#a3e635',
        });

        await Notifications.setNotificationChannelAsync('updates', {
            name: 'App Updates',
            importance: Notifications.AndroidImportance.LOW,
        });

        await Notifications.setNotificationChannelAsync('sync', {
            name: 'Sync Status',
            importance: Notifications.AndroidImportance.LOW,
            description: 'Background sync progress and Wi-Fi reminders',
        });

        await Notifications.setNotificationChannelAsync('agent', {
            name: 'AI Agent Messages',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 100, 100, 200, 100, 200],
            lightColor: '#a3e635',
            sound: 'default',
            description: 'Messages from your Windy Fly AI agent',
        });

        await Notifications.setNotificationChannelAsync('mail', {
            name: 'Windy Mail',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#a3e635',
            sound: 'default',
            description: 'New email alerts from Windy Mail',
        });

        await Notifications.setNotificationChannelAsync('chat', {
            name: 'Windy Chat',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 200, 100, 200],
            lightColor: '#a3e635',
            sound: 'default',
            description: 'New message alerts from Windy Chat',
        });
    }

    /**
     * Register push token with backend.
     *
     * Server contract (windy-chat/services/push-gateway/server.js:370,
     * route POST /api/v1/chat/push/register):
     *   body: { pushkey, userId, platform, appId?, deviceName? }
     *   - pushkey   = native device token (FCM/APNs)
     *   - userId    = MUST match authenticated user (cross-checked
     *                 against JWT-extracted user id; 403 if mismatch).
     *                 Extracted here from the JWT's `sub` claim.
     *   - platform  = "android" | "ios" | "web"
     *   - appId     = optional, informational (DB display only;
     *                 routing uses APNS_BUNDLE_ID env on the server)
     *   - deviceName = optional, human-readable
     */
    private async registerTokenWithBackend(token: string): Promise<boolean> {
        try {
            let authToken = '';
            try {
                const SecureStore = require('expo-secure-store');
                authToken = await SecureStore.getItemAsync('windy_jwt_token') || '';
            } catch { /* SecureStore unavailable */ }

            if (!authToken) {
                log.warn('Backend_registration', 'No JWT in SecureStore — skipping push-token registration');
                return false;
            }

            const userId = extractPushUserIdFromJwt(authToken);
            if (!userId) {
                log.warn('Backend_registration', 'Could not extract user id claim from JWT — skipping registration');
                return false;
            }

            const res = await fetchWithTimeout(REGISTER_TOKEN_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                },
                body: JSON.stringify({
                    pushkey: token,
                    userId,
                    platform: Platform.OS,
                    appId: APP_BUNDLE_ID,
                    deviceName: Device.modelName || 'unknown',
                }),
            });
            if (!res.ok) {
                log.warn('Backend_registration', `Push-gateway register HTTP ${res.status}`);
                return false;
            }
            return true;
        } catch (err: unknown) {
            log.warn('Backend_registration', 'Backend registration failed', err instanceof Error ? { message: err.message, stack: err.stack } : { error: String(err) });
            return false;
        }
    }

    /**
     * Set (or refresh) the Synapse HTTP pusher — the step that makes
     * MESSAGE events push. Synapse calls the push-gateway's
     * /_matrix/push/v1/notify with our pushkey on every notifiable event;
     * the gateway looks the pushkey up in its device store (populated by
     * registerTokenWithBackend — SAME pushkey string, that's the join key)
     * and dispatches via APNs/FCM. Mirrors the web client's enableWebPush()
     * step 4 (windy-chat/web/src/lib/push.ts).
     */
    private async registerMatrixPusher(token: string): Promise<boolean> {
        try {
            // Lazy require avoids a static import cycle (chatClient is heavy).
            const { chatClient } = require('./chatClient');
            const matrixToken = chatClient.getAccessToken?.();
            const homeserver: string = chatClient.getHomeserver?.() || CHAT_PUSH_BASE_URL;
            if (!matrixToken) {
                log.warn('Matrix_pusher', 'No Matrix session — pusher not set (will retry after chat connect)');
                return false;
            }

            const res = await fetchWithTimeout(`${homeserver}/_matrix/client/v3/pushers/set`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${matrixToken}`,
                },
                body: JSON.stringify({
                    app_id: APP_BUNDLE_ID,
                    pushkey: token,
                    kind: 'http',
                    app_display_name: 'WindyChat',
                    device_display_name: Device.modelName || 'Mobile device',
                    lang: 'en',
                    data: { url: `${CHAT_PUSH_BASE_URL}/_matrix/push/v1/notify` },
                    // append:false → replace any stale pusher with this pushkey
                    // across users instead of piling up duplicates.
                    append: false,
                }),
            });
            if (!res.ok) {
                log.warn('Matrix_pusher', `pushers/set HTTP ${res.status}`);
                return false;
            }
            log.info('Matrix_pusher_set', 'Synapse pusher registered');
            return true;
        } catch (err: unknown) {
            log.warn('Matrix_pusher', 'pushers/set failed', err instanceof Error ? { message: err.message } : { error: String(err) });
            return false;
        }
    }

    /**
     * Full chat-push pipeline; safe to call repeatedly (registration is an
     * upsert server-side, pushers/set replaces). Call after Windy login and
     * after the Matrix session connects — the boot-time initialize() runs
     * before either exists and can only set up channels + permissions.
     *
     * Returns which legs succeeded so callers/tests can assert delivery
     * preconditions honestly.
     */
    async registerForChatPush(): Promise<{ gateway: boolean; pusher: boolean }> {
        const result = { gateway: false, pusher: false };
        try {
            if (!Device.isDevice) return result; // simulators get no APNs/FCM token

            const { status } = await Notifications.getPermissionsAsync();
            if (status !== 'granted') return result;

            if (!this.token) {
                const tokenData = await Notifications.getDevicePushTokenAsync();
                if (typeof tokenData.data !== 'string') return result;
                this.token = tokenData.data;
            }

            result.gateway = await this.registerTokenWithBackend(this.token);
            result.pusher = await this.registerMatrixPusher(this.token);
        } catch (err) {
            log.warn('registerForChatPush', 'chat push pipeline failed', { error: String(err) });
        }
        return result;
    }

    /**
     * Send local notification: translation complete
     */
    async notifyTranslationComplete(fromLang: string, toLang: string, preview: string): Promise<void> {
        if (!this.config.translationComplete) return;

        await Notifications.scheduleNotificationAsync({
            content: {
                title: '🌐 Translation Complete',
                body: `${fromLang} → ${toLang}: "${preview.substring(0, 100)}"`,
                data: { type: 'translation' },
                ...(Platform.OS === 'android' ? { channelId: 'translation' } : {}),
            },
            trigger: null as unknown as Notifications.NotificationTriggerInput, // Immediate delivery
        });
    }

    /**
     * Send local notification: subscription reminder
     */
    async notifySubscriptionReminder(): Promise<void> {
        if (!this.config.subscriptionReminders) return;

        await Notifications.scheduleNotificationAsync({
            content: {
                title: '⚡ Upgrade to Pro',
                body: 'Unlock unlimited translations, offline mode, and voice clone. 50% off this week!',
                data: { type: 'subscription' },
                ...(Platform.OS === 'android' ? { channelId: 'subscription' } : {}),
            },
            trigger: null as unknown as Notifications.NotificationTriggerInput, // Immediate delivery
        });
    }

    /**
     * Send local notification: app update available
     */
    async notifyUpdateAvailable(version: string): Promise<void> {
        if (!this.config.updatePrompts) return;

        await Notifications.scheduleNotificationAsync({
            content: {
                title: '🌪️ Windy Word Update',
                body: `Version ${version} is available with new features and improvements.`,
                data: { type: 'update', version },
                ...(Platform.OS === 'android' ? { channelId: 'updates' } : {}),
            },
            trigger: null as unknown as Notifications.NotificationTriggerInput, // Immediate delivery
        });
    }

    /**
     * Update notification preferences
     */
    setConfig(config: Partial<PushNotificationConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Get current push token
     */
    getToken(): string | null {
        return this.token;
    }

    /**
     * Listen for notification events
     */
    addNotificationListener(
        handler: (notification: Notifications.Notification) => void
    ): Notifications.Subscription {
        return Notifications.addNotificationReceivedListener(handler);
    }

    /**
     * Listen for notification taps
     */
    addResponseListener(
        handler: (response: Notifications.NotificationResponse) => void
    ): Notifications.Subscription {
        return Notifications.addNotificationResponseReceivedListener(handler);
    }

    /**
     * Get badge count
     */
    async getBadgeCount(): Promise<number> {
        return Notifications.getBadgeCountAsync();
    }

    /**
     * Set badge count
     */
    async setBadgeCount(count: number): Promise<void> {
        await Notifications.setBadgeCountAsync(count);
    }
}

export const pushNotificationService = new PushNotificationService();

/**
 * Show a birth announcement notification when an AI agent hatches.
 * Called when the backend sends the hatch event via WebSocket or push.
 */
export async function showBirthAnnouncement(agentName: string): Promise<void> {
    await Notifications.scheduleNotificationAsync({
        content: {
            title: "🪰 IT'S ALIVE!",
            body: `Your AI agent ${agentName} has hatched! Tap to chat.`,
            data: { route: '/(tabs)/chat' },
            ...(Platform.OS === 'android' ? { channelId: 'agent' } : {}),
        },
        trigger: null as unknown as Notifications.NotificationTriggerInput,
    });
}

/**
 * Show a notification for an incoming agent message.
 * Uses the dedicated 'agent' channel with distinct vibration pattern.
 */
export async function showAgentMessage(agentName: string, message: string, roomId?: string): Promise<void> {
    await Notifications.scheduleNotificationAsync({
        content: {
            title: `🪰 ${agentName}`,
            body: message,
            data: { route: roomId ? `/chat/${roomId}` : '/(tabs)/chat' },
            ...(Platform.OS === 'android' ? { channelId: 'agent' } : {}),
        },
        trigger: null as unknown as Notifications.NotificationTriggerInput,
    });
}
