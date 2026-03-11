/**
 * 🧬 M1.1.1 — Root Layout
 * App-wide providers, font loading, splash screen, deep link handling
 *
 * RP-1.5: Inter font loaded via @expo-google-fonts/inter
 * RP-5.2: Deep link license handler
 */
import { useEffect, useState, useCallback } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, Alert, Platform, BackHandler } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import * as NavigationBar from 'expo-navigation-bar';
import * as Notifications from 'expo-notifications';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { colors } from '@/theme';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { localStorageService } from '@/services/storage-local';
import { licenseService } from '@/services/license';
import { pushNotificationService } from '@/services/push-notifications';
import { offlinePackService } from '@/services/offline-packs';
import { subscriptionService } from '@/services/subscription';
import { networkMonitor } from '@/services/network-monitor';
import { cloudApi } from '@/services/cloudApi';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NetworkBanner } from '@/components/NetworkBanner';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Keep splash screen visible until we're ready
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [appReady, setAppReady] = useState(false);
  const [splashDismissed, setSplashDismissed] = useState(false);
  const { setLicense } = useSettingsStore();

  // RP-1.5: Load Inter font family
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Log font loading status for debugging
  useEffect(() => {
    if (fontError) {
      console.warn('[Fonts] Font loading error:', fontError);
    }
    if (fontsLoaded) {
      // console.log('[Fonts] All fonts loaded successfully');
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    async function prepare() {
      try {
        // Initialize local database
        await localStorageService.initialize();
        // console.log('[App] Storage initialized successfully');
        // Initialize push notifications
        pushNotificationService.initialize().catch(() => { });
        // Initialize offline language packs
        offlinePackService.initialize().catch(() => { });
        // Initialize RevenueCat subscriptions
        subscriptionService.initialize().catch(() => { });

        // Auto-restore cloud API session
        cloudApi.restoreSession().catch(() => { });

        // Android-specific: theme navigation bar
        if (Platform.OS === 'android') {
          NavigationBar.setBackgroundColorAsync(colors.background).catch(() => { });
          NavigationBar.setButtonStyleAsync('light').catch(() => { });
        }
      } catch (e) {
        console.warn('[App] Storage initialization error:', e);
      } finally {
        setAppReady(true);
      }
    }
    prepare();
  }, []);

  // Safety timeout: force-dismiss splash after 5 seconds no matter what
  useEffect(() => {
    const timeout = setTimeout(async () => {
      if (!splashDismissed) {
        console.warn('[App] Splash screen timeout — force dismissing after 5s');
        try {
          await SplashScreen.hideAsync();
        } catch (e) {
          console.warn('[App] SplashScreen.hideAsync error:', e);
        }
        setSplashDismissed(true);
        if (!appReady) setAppReady(true);
      }
    }, 5000);
    return () => clearTimeout(timeout);
  }, [splashDismissed, appReady]);

  // Android back button handler — confirm exit on root screen
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      // Let the router handle back first; only intercept at root
      return false;
    });
    return () => handler.remove();
  }, []);

  // Push notification tap routing
  useEffect(() => {
    const handleNotificationTap = (response: any) => {
      const data = response?.notification?.request?.content?.data;
      if (!data?.type) return;

      setTimeout(() => {
        try {
          const { router } = require('expo-router');
          if (data.type === 'translation') {
            router.push('/translate');
          } else if (data.type === 'subscription') {
            router.push('/subscription');
          } else if (data.type === 'update') {
            Linking.openURL('market://details?id=uk.thewindstorm.windypro').catch(() => { });
          }
        } catch (err) { console.warn("[Layout] Navigation error:", err); }
      }, 300);
    };

    // Listen for notification taps while app is running
    const subscription = pushNotificationService.addResponseListener(handleNotificationTap);

    // Check if app was opened via notification tap (cold start)
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleNotificationTap(response);
    }).catch(() => { });

    return () => subscription.remove();
  }, []);

  // Network monitor lifecycle
  useEffect(() => {
    networkMonitor.start();
    return () => networkMonitor.stop();
  }, []);

  // RP-5.2: Deep link handler (windypro:// scheme)
  useEffect(() => {
    const handleDeepLink = async ({ url }: { url: string }) => {
      try {
        const parsed = Linking.parse(url);
        // console.log('[DeepLink] Received:', parsed.path, parsed.queryParams);

        // License activation: windypro://license?key=XXX
        if (parsed.path === 'license' && parsed.queryParams?.key) {
          const key = parsed.queryParams.key as string;
          const validation = await licenseService.validateLicense(key);
          setLicense(validation.tier, key);
          Alert.alert(
            '🎉 License Activated',
            `Welcome to Windy Pro ${formatTier(validation.tier)}!`
          );
          return;
        }

        // Session deep link: windypro://session/SESSION_ID
        if (parsed.path?.startsWith('session/')) {
          const sessionId = parsed.path.replace('session/', '');
          if (sessionId) {
            // Navigation happens after layout is ready
            setTimeout(() => {
              try {
                const { router } = require('expo-router');
                router.push(`/session/${sessionId}`);
              } catch (err) { console.warn("[Layout] Navigation error:", err); }
            }, 500);
          }
          return;
        }

        // Route deep links: windypro://translate, windypro://clone, etc.
        const routeMap: Record<string, string> = {
          'clone': '/clone',
          'subscribe': '/subscription',
          'subscription': '/subscription',
          'video': '/video',
          'settings': '/(tabs)/settings',
        };

        // Handle translate deep link specially — with params goes to quick-translate
        if (parsed.path === 'translate') {
          const { text, from, to } = parsed.queryParams || {};
          if (text) {
            // Has text param → route to quick-translate with params
            const params = new URLSearchParams();
            params.set('text', text as string);
            if (from) params.set('from', from as string);
            if (to) params.set('to', to as string);
            setTimeout(() => {
              try {
                const { router } = require('expo-router');
                router.push(`/quick-translate?${params.toString()}`);
              } catch (err) { console.warn("[Layout] Navigation error:", err); }
            }, 500);
          } else {
            // No text param → full translate screen
            setTimeout(() => {
              try {
                const { router } = require('expo-router');
                router.push('/translate');
              } catch (err) { console.warn("[Layout] Navigation error:", err); }
            }, 500);
          }
          return;
        }

        const route = routeMap[parsed.path || ''];
        if (route) {
          setTimeout(() => {
            try {
              const { router } = require('expo-router');
              router.push(route);
            } catch (err) { console.warn("[Layout] Navigation error:", err); }
          }, 500);
        }
      } catch (err) {
        console.warn('[DeepLink] Handler failed:', err);
      }
    };

    const sub = Linking.addEventListener('url', handleDeepLink);
    // Check if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => sub.remove();
  }, [setLicense]);

  // Hide splash when both fonts and app are ready (or font error occurred)
  const canRender = appReady && (fontsLoaded || fontError);
  const onLayoutReady = useCallback(async () => {
    if (canRender && !splashDismissed) {
      try {
        await SplashScreen.hideAsync();
      } catch (e) {
        console.warn('[App] SplashScreen.hideAsync error:', e);
      }
      setSplashDismissed(true);
    }
  }, [canRender, splashDismissed]);

  if (!canRender && !splashDismissed) {
    return (
      <View style={styles.loading}>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={styles.container} onLayout={onLayoutReady}>
        <StatusBar style="light" translucent backgroundColor="transparent" />
        <ErrorBoundary>
          <NetworkBanner />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="onboarding/index"
              options={{
                presentation: 'fullScreenModal',
                animation: 'fade',
              }}
            />
            <Stack.Screen
              name="session/[id]"
              options={{
                presentation: 'modal',
                animation: 'slide_from_bottom',
              }}
            />
            <Stack.Screen
              name="translate/index"
              options={{
                presentation: 'modal',
                animation: 'slide_from_bottom',
              }}
            />
            <Stack.Screen
              name="clone/index"
              options={{
                presentation: 'modal',
                animation: 'slide_from_bottom',
              }}
            />
            <Stack.Screen
              name="ocr/index"
              options={{
                presentation: 'modal',
                animation: 'slide_from_bottom',
              }}
            />
            <Stack.Screen
              name="subscription/index"
              options={{
                presentation: 'modal',
                animation: 'slide_from_bottom',
              }}
            />
            <Stack.Screen
              name="video/index"
              options={{
                presentation: 'modal',
                animation: 'slide_from_bottom',
              }}
            />
            <Stack.Screen
              name="appstore/index"
              options={{
                presentation: 'modal',
                animation: 'slide_from_bottom',
              }}
            />
            <Stack.Screen
              name="quick-translate"
              options={{
                presentation: 'modal',
                animation: 'slide_from_bottom',
              }}
            />
            <Stack.Screen
              name="legal/privacy"
              options={{ headerShown: true, headerTitle: 'Privacy Policy' }}
            />
            <Stack.Screen
              name="legal/terms"
              options={{ headerShown: true, headerTitle: 'Terms of Service' }}
            />
          </Stack>
        </ErrorBoundary>
      </View>
    </SafeAreaProvider>
  );
}

function formatTier(tier: string): string {
  const map: Record<string, string> = {
    free: 'Free', pro: 'Pro',
    translate: 'Translate', translate_pro: 'Translate Pro',
  };
  return map[tier] || tier;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
