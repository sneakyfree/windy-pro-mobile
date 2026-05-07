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
import { API_BASE_URL, PUSH_TOKEN_ENDPOINT_URL } from '@/config/api';
import { fetchWithTimeout } from '@/utils/fetch-timeout';

const log = createLogger('PushNotifications');

// Per ADR-006: register FCM/APNs token at the canonical chat-side
// push-gateway endpoint, not at Pro. Cross-service publishers (Mail,
// Cloud, Code, etc.) all publish to chat's push-gateway, so the token
// must live in chat's device-token store, not Pro's. The legacy
// account.windyword.ai/api/register-push-token endpoint stays as a
// 308 redirect shim; old mobile builds keep working until they update.
const REGISTER_TOKEN_URL = PUSH_TOKEN_ENDPOINT_URL;

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

            // Get push token
            const projectId = Constants.expoConfig?.extra?.eas?.projectId;
            const tokenData = await Notifications.getExpoPushTokenAsync({
                projectId: projectId || undefined,
            });
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
     * Register push token with backend
     */
    private async registerTokenWithBackend(token: string): Promise<void> {
        try {
            // Get auth token for backend registration
            let authToken = '';
            try {
                const SecureStore = require('expo-secure-store');
                authToken = await SecureStore.getItemAsync('windy_jwt_token') || '';
            } catch { /* SecureStore unavailable */ }

            await fetchWithTimeout(REGISTER_TOKEN_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
                },
                body: JSON.stringify({
                    token,
                    platform: Platform.OS,
                    device: Device.modelName || 'unknown',
                    version: Constants.expoConfig?.version || '1.0.0',
                }),
            });
        } catch (err: unknown) {
            log.warn('Backend_registration', 'Backend registration failed', err instanceof Error ? { message: err.message, stack: err.stack } : { error: String(err) });
        }
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
