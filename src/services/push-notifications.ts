/**
 * 🧬 Push Notification Service
 * expo-notifications setup for Android
 * FCM token registration, translation alerts, subscription reminders
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

const API_BASE = 'https://windypro.thewindstorm.uk';
const REGISTER_TOKEN_URL = `${API_BASE}/api/register-push-token`;

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
            // console.log('[Push] Not a physical device, skipping');
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
                console.warn('[Push] Permission not granted');
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

            // console.log('[Push] Token registered:', this.token.substring(0, 20) + '...');
            return this.token;
        } catch (err) {
            console.error('[Push] Init failed:', err);
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
    }

    /**
     * Register push token with backend
     */
    private async registerTokenWithBackend(token: string): Promise<void> {
        try {
            await fetch(REGISTER_TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token,
                    platform: Platform.OS,
                    device: Device.modelName || 'unknown',
                    version: Constants.expoConfig?.version || '1.0.0',
                }),
            });
        } catch (err) {
            console.warn('[Push] Backend registration failed:', err);
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
            trigger: null, // Immediate
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
            trigger: null,
        });
    }

    /**
     * Send local notification: app update available
     */
    async notifyUpdateAvailable(version: string): Promise<void> {
        if (!this.config.updatePrompts) return;

        await Notifications.scheduleNotificationAsync({
            content: {
                title: '🌪️ Windy Pro Update',
                body: `Version ${version} is available with new features and improvements.`,
                data: { type: 'update', version },
                ...(Platform.OS === 'android' ? { channelId: 'updates' } : {}),
            },
            trigger: null,
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
