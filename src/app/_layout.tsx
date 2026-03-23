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
import { View, StyleSheet, Alert, Platform, BackHandler, AppState, AppStateStatus, InteractionManager } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import * as NavigationBar from 'expo-navigation-bar';
import * as Notifications from 'expo-notifications';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { colors } from '@/theme';
import { createLogger } from '@/services/logger';
import { sanitizeText, INPUT_LIMITS } from '@/utils/validation';
import { TIER_1_LANGUAGES } from '@/services/translation';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { localStorageService } from '@/services/storage-local';
import { licenseService } from '@/services/license';
import { pushNotificationService } from '@/services/push-notifications';
import { offlinePackService } from '@/services/offline-packs';
import { subscriptionService } from '@/services/subscription';
import { networkMonitor } from '@/services/network-monitor';
import { cloudApi } from '@/services/cloudApi';
import { syncManager } from '@/services/sync-manager';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NetworkBanner } from '@/components/NetworkBanner';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Keep splash screen visible until we're ready
SplashScreen.preventAutoHideAsync();

const log = createLogger('Layout');

// ─── Deep Link Sanitization ─────────────────────────────────

/** Safe characters for session/route IDs: alphanumeric, hyphens, underscores */
const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;

/** Valid language codes from our supported list */
const VALID_LANG_CODES = new Set(TIER_1_LANGUAGES.map(l => l.code));

/** Sanitize a deep link session ID — reject path traversal */
function sanitizeSessionId(raw: string): string | null {
  const id = raw.trim();
  if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) return null;
  if (id.length > 128) return null;
  if (!SAFE_ID_RE.test(id)) return null;
  return id;
}

/** Sanitize a deep link language code */
function sanitizeLangCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toLowerCase().slice(0, 10);
  return VALID_LANG_CODES.has(code) ? code : null;
}

/** Sanitize deep link text param */
function sanitizeDeepLinkText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = sanitizeText(raw).slice(0, INPUT_LIMITS.TRANSLATE_TEXT);
  return cleaned || null;
}

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
      log.warn('fonts', 'Font loading error');
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    async function prepare() {
      try {
        // Initialize local database — required before UI renders
        await localStorageService.initialize();

        // Android-specific: theme navigation bar (lightweight, can run immediately)
        if (Platform.OS === 'android') {
          NavigationBar.setBackgroundColorAsync(colors.background).catch(() => { });
          NavigationBar.setButtonStyleAsync('light').catch(() => { });
        }
      } catch (e) {
        log.warn('prepare', 'Storage initialization error');
      } finally {
        setAppReady(true);
      }
    }
    prepare();

    // 🚀 Perf: defer non-critical services until after first frame renders
    const handle = InteractionManager.runAfterInteractions(() => {
      Promise.allSettled([
        pushNotificationService.initialize(),
        offlinePackService.initialize(),
        subscriptionService.initialize(),
        cloudApi.restoreSession(),
      ]).catch(() => { });
    });
    return () => handle.cancel();
  }, []);

  // Safety timeout: force-dismiss splash after 5 seconds no matter what
  useEffect(() => {
    const timeout = setTimeout(async () => {
      if (!splashDismissed) {
        log.warn('splash', 'Splash screen timeout — force dismissing after 5s');
        try {
          await SplashScreen.hideAsync();
        } catch (e) {
          log.warn('splash', 'SplashScreen.hideAsync error');
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

  // 🔄 Foreground sync: when app comes back from background + online → sync immediately
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active' && networkMonitor.isOnline) {
        syncManager.processQueue().catch(() => {});
      }
    });
    return () => subscription.remove();
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
        } catch (err) { log.warn('notificationTap', 'Navigation error'); }
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

        // License activation: windypro://license?key=XXX
        if (parsed.path === 'license' && parsed.queryParams?.key) {
          const rawKey = String(parsed.queryParams.key).trim().slice(0, INPUT_LIMITS.LICENSE_KEY);
          if (!rawKey || !SAFE_ID_RE.test(rawKey)) {
            log.warn('deepLink', 'Invalid license key format in deep link');
            return;
          }
          const validation = await licenseService.validateLicense(rawKey);
          setLicense(validation.tier, rawKey);
          Alert.alert(
            '🎉 License Activated',
            `Welcome to Windy Pro ${formatTier(validation.tier)}!`
          );
          return;
        }

        // Session deep link: windypro://session/SESSION_ID
        if (parsed.path?.startsWith('session/')) {
          const rawId = parsed.path.replace('session/', '');
          const sessionId = sanitizeSessionId(rawId);
          if (!sessionId) {
            log.warn('deepLink', 'Rejected malicious session deep link', { rawLen: rawId.length });
            return;
          }
          setTimeout(() => {
            try {
              const { router } = require('expo-router');
              router.push(`/session/${sessionId}`);
            } catch (err) { log.warn('deepLink', 'Navigation error'); }
          }, 500);
          return;
        }

        // Route deep links: windypro://translate, windypro://clone, etc.
        const routeMap: Record<string, string> = {
          'cloud': '/cloud',
          'clone': '/clone',
          'subscribe': '/subscription',
          'subscription': '/subscription',
          'video': '/video',
          'settings': '/(tabs)/settings',
        };

        // Handle translate deep link specially — with params goes to quick-translate
        if (parsed.path === 'translate') {
          const { text, from, to } = parsed.queryParams || {};
          const safeText = sanitizeDeepLinkText(text);
          if (safeText) {
            // Has valid text param → route to quick-translate with sanitized params
            const params = new URLSearchParams();
            params.set('text', safeText);
            const safeFrom = sanitizeLangCode(from);
            const safeTo = sanitizeLangCode(to);
            if (safeFrom) params.set('from', safeFrom);
            if (safeTo) params.set('to', safeTo);
            setTimeout(() => {
              try {
                const { router } = require('expo-router');
                router.push(`/quick-translate?${params.toString()}`);
              } catch (err) { log.warn('deepLink', 'Navigation error'); }
            }, 500);
          } else {
            // No valid text param → full translate screen
            setTimeout(() => {
              try {
                const { router } = require('expo-router');
                router.push('/translate');
              } catch (err) { log.warn('deepLink', 'Navigation error'); }
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
            } catch (err) { log.warn('deepLink', 'Navigation error'); }
          }, 500);
        }
      } catch (err) {
        log.warn('deepLink', 'Handler failed');
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
        log.warn('splash', 'SplashScreen.hideAsync error');
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
              name="cloud/index"
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
    translate: 'Windy Ultra', translate_pro: 'Windy Max',
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
