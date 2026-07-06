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

// ─── Sentry Crash Reporting (no-op if DSN not set) ──────────────
try {
    const Sentry = require('@sentry/react-native');
    const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
    if (dsn) {
        Sentry.init({
            dsn,
            environment: __DEV__ ? 'development' : 'production',
            tracesSampleRate: __DEV__ ? 1.0 : 0.2,
        });
    }
} catch { /* Sentry not installed or native module unavailable */ }
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
import { useSettingsStore, setLicense } from '@/stores/useSettingsStore';
import { localStorageService } from '@/services/storage-local';
import { licenseService } from '@/services/license';
import { pushNotificationService } from '@/services/push-notifications';
import { offlinePackService } from '@/services/offline-packs';
import { subscriptionService } from '@/services/subscription';
import { networkMonitor } from '@/services/network-monitor';
import { cloudApi } from '@/services/cloudApi';
import { identityApi } from '@/services/identityApi';
import { syncManager } from '@/services/sync-manager';
import { parseWindyUrl } from '@/lib/parseWindyUrl';
import { pendingDeepLink } from '@/state/pendingDeepLink';
import { sanitizeSharedUrl, sanitizeSharedText } from '@/lib/shareIntentSanitizer';
import { trustMonitor } from '@/services/trust-monitor';
import { heartbeatService } from '@/services/heartbeat';
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

/**
 * Sanitize a Matrix room identifier from a windychat://room/{id} deep link.
 * Matrix IDs are `!localpart:server` or `#alias:server`; we also accept
 * opaque router-friendly ids of `[a-zA-Z0-9_-]{1,128}` so internal deep
 * links that hand us a mapped id still route. Anything else (slashes,
 * path traversal, url-encoded escapes) is rejected.
 */
function sanitizeMatrixRoomId(raw: string): string | null {
  const id = raw.trim();
  if (!id || id.length > 256) return null;
  if (id.includes('..') || id.includes('/') || id.includes('\\') || id.includes('?')) return null;
  if (/^[!#@][a-zA-Z0-9._=-]+:[a-zA-Z0-9.-]+$/.test(id)) return id;
  if (SAFE_ID_RE.test(id) && id.length <= 128) return id;
  return null;
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
        identityApi.restoreSession(),
        // License re-verification heartbeat. Runs an immediate check on start
        // then every 15 min; rate-limited internally per the tier's
        // HEARTBEAT_INTERVAL. Endpoint outage is handled gracefully —
        // consecutiveFailures tick up and the tier-specific grace period
        // (24h free / 7d pro / 14d translate / 30d translate_pro) keeps
        // things working offline before any lock.
        heartbeatService.start(),
      ]).catch(() => { });
      trustMonitor.start();
    });
    return () => { handle.cancel(); trustMonitor.stop(); heartbeatService.stop(); };
  }, []);

  // Chat connect + push registration at sign-in. The "your agent replied"
  // notification must work even if the user never opens the Chat tab:
  // provision the Matrix session (unified-login), register the device with
  // the chat push-gateway, and set the Synapse pusher — then pause the
  // client sync if no chat screen is mounted (pushers are server-side; the
  // background /sync loop isn't needed for delivery).
  useEffect(() => {
    let lastAuthed = false;
    const connectChatPush = () => {
      const authed = identityApi.isAuthenticated();
      if (authed === lastAuthed) return;
      lastAuthed = authed;
      if (!authed) return;
      const { chatSso } = require('@/services/chatSso');
      const { chatClient } = require('@/services/chatClient');
      chatSso.ensureChatSession()
        .then(() => pushNotificationService.registerForChatPush())
        .then(() => chatClient.pauseSyncIfIdle())
        .catch(() => { });
    };
    // restoreSession may already have completed before this effect runs.
    connectChatPush();
    const unsub = identityApi.onChange(connectChatPush);
    return () => { unsub(); };
  }, []);

  // Track the user's own Eternitas passport + connected agent passports for
  // trust-monitor polling. Re-runs when ecosystem status changes.
  useEffect(() => {
    const sync = () => {
      try {
        const eco = useSettingsStore.getState().ecosystemStatus;
        const ownPassport = eco?.products?.eternitas?.passport_id;
        const agentPassport = eco?.products?.windy_fly?.passport_id;
        if (ownPassport) trustMonitor.track(ownPassport, 'Your passport');
        if (agentPassport) {
          const label = eco?.products?.windy_fly?.agent_name || 'Your agent';
          trustMonitor.track(agentPassport, label);
        }
      } catch { /* store may not be ready */ }
    };
    sync();
    const unsub = useSettingsStore.subscribe(sync);
    return () => { unsub(); };
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
      Alert.alert('Exit Windy?', undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Exit', style: 'destructive', onPress: () => BackHandler.exitApp() },
      ]);
      return true;
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
      if (!data) return;

      setTimeout(() => {
        try {
          const { router } = require('expo-router');

          // Chat message notification — route directly to the DM room
          if (data.route) {
            // data.route is like '/(tabs)/chat' or '/chat/!roomId:server'
            router.push(data.route);
            return;
          }

          if (data.type === 'translation') {
            router.push('/translate');
          } else if (data.type === 'subscription') {
            router.push('/subscription');
          } else if (data.type === 'update') {
            Linking.openURL('market://details?id=ai.windyword.app').catch(() => { });
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

  // Network monitor lifecycle + recovery
  useEffect(() => {
    networkMonitor.start();
    let wasOffline = false;

    const checkInterval = setInterval(() => {
      const isOnline = networkMonitor.isOnline;
      if (wasOffline && isOnline) {
        // Just came back online — auto-sync everything
        log.info('network', 'Back online — syncing');
        syncManager.processQueue().catch(() => {});
        // Refresh ecosystem status
        try {
          const { getEcosystemStatus } = require('@/services/ecosystem-status');
          const { useSettingsStore: store } = require('@/stores/useSettingsStore');
          getEcosystemStatus().then((eco: any) => {
            if (eco) store.getState().setEcosystemStatus(eco);
          }).catch(() => {});
        } catch { /* ignore */ }
      }
      wasOffline = !isOnline;
    }, 5000);

    return () => { networkMonitor.stop(); clearInterval(checkInterval); };
  }, []);

  // RP-5.2: Deep link handler (windypro:// scheme)
  useEffect(() => {
    const handleDeepLink = async ({ url }: { url: string }) => {
      try {
        // Wave 3 — unified deep links (windyword://recording/{id},
        // windyclone://clone/{id}, windycloud://file/{id}). If the user isn't
        // authenticated, stash the target and push to login so the
        // device-code flow can resume the user at the intended screen.
        const windyTarget = parseWindyUrl(url);
        if (windyTarget) {
          setTimeout(() => {
            try {
              const { router } = require('expo-router');
              if (!identityApi.isAuthenticated()) {
                pendingDeepLink.set(windyTarget);
                router.push('/auth/device-code');
              } else {
                router.push({
                  pathname: windyTarget.route as any,
                  params: windyTarget.params,
                });
              }
            } catch (err) { log.warn('deepLink', 'wave3 navigation error'); }
          }, 300);
          return;
        }

        const parsed = Linking.parse(url);

        /** Deep-link format: windypro://license?key=<LICENSE_KEY> */
        if (parsed.path === 'license' && parsed.queryParams?.key) {
          const rawKey = String(parsed.queryParams.key).trim().slice(0, INPUT_LIMITS.LICENSE_KEY);
          if (!rawKey || !SAFE_ID_RE.test(rawKey)) {
            log.warn('deepLink', 'Invalid license key format in deep link');
            return;
          }
          const validation = await licenseService.validateLicense(rawKey);
          await setLicense(validation.tier, rawKey);
          Alert.alert(
            '🎉 License Activated',
            `Welcome to Windy Word ${formatTier(validation.tier)}!`
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

        // Handle dashboard deep links (from birth announcement SMS/email)
        if (url.includes('/app/fly') || parsed.path === 'fly') {
          setTimeout(() => {
            try {
              const { router } = require('expo-router');
              router.push('/(tabs)/chat');
            } catch (err) { log.warn('deepLink', 'Navigation error'); }
          }, 500);
          return;
        }

        // Cross-product deep links: windychat://room/ROOM_ID, windyfly://hatch, etc.
        // Handle scheme-based routing (windychat://, windymail://, windyfly://)
        const scheme = url.split('://')[0];
        if (scheme === 'windychat') {
          setTimeout(() => {
            try {
              const { router } = require('expo-router');
              if (parsed.path?.startsWith('room/')) {
                const rawRoomId = parsed.path.replace('room/', '');
                const roomId = sanitizeMatrixRoomId(rawRoomId);
                if (!roomId) {
                  log.warn('deepLink', 'Rejected malicious windychat deep link', { rawLen: rawRoomId.length });
                  router.push('/(tabs)/chat');
                  return;
                }
                router.push(`/chat/${roomId}`);
              } else {
                router.push('/(tabs)/chat');
              }
            } catch (err) { log.warn('deepLink', 'Navigation error'); }
          }, 300);
          return;
        }
        if (scheme === 'windymail') {
          setTimeout(() => {
            try {
              const { router } = require('expo-router');
              router.push('/(tabs)/mail');
            } catch (err) { log.warn('deepLink', 'Navigation error'); }
          }, 300);
          return;
        }
        if (scheme === 'windyfly') {
          setTimeout(() => {
            try {
              const { router } = require('expo-router');
              if (parsed.path === 'hatch') router.push('/hatch');
              else if (parsed.path === 'status' || parsed.path === 'agent') router.push('/(tabs)/fly');
              else router.push('/agent');
            } catch (err) { log.warn('deepLink', 'Navigation error'); }
          }, 300);
          return;
        }

        // Wave 8 — Clone deep links that parseWindyUrl doesn't cover.
        // Supported:
        //   windyclone://discover       → marketplace browse
        //   windyclone://dashboard      → legacy clone-data tab
        //   windyclone://studio/{id}    → specific studio by id
        //   windyclone://order/{id}     → clone-data tab focused on an order
        // parseWindyUrl already handles the wave-3 windyclone://clone/{id}
        // contract, so we only land here for the new wave-8 routes.
        if (scheme === 'windyclone') {
          setTimeout(() => {
            try {
              const { router } = require('expo-router');
              if (parsed.path === 'discover' || parsed.path === 'dashboard') {
                router.push('/(tabs)/clone-data');
                return;
              }
              if (parsed.path?.startsWith('studio/')) {
                const rawId = parsed.path.replace('studio/', '');
                const id = sanitizeSessionId(rawId);
                if (!id) {
                  log.warn('deepLink', 'Rejected malicious windyclone studio deep link', { rawLen: rawId.length });
                  router.push('/(tabs)/clone-data');
                  return;
                }
                router.push({ pathname: '/clone-data', params: { studio: id } });
                return;
              }
              if (parsed.path?.startsWith('order/')) {
                const rawId = parsed.path.replace('order/', '');
                const id = sanitizeSessionId(rawId);
                if (!id) {
                  log.warn('deepLink', 'Rejected malicious windyclone order deep link', { rawLen: rawId.length });
                  router.push('/(tabs)/clone-data');
                  return;
                }
                router.push({ pathname: '/(tabs)/clone-data', params: { order: id } });
                return;
              }
              // Default: drop the user into the clone dashboard.
              router.push('/clone');
            } catch (err) { log.warn('deepLink', 'Navigation error'); }
          }, 300);
          return;
        }

        // Wave 8 — Cloud deep links (dashboard + manual backup trigger).
        //   windycloud://dashboard  → cloud sync + files
        //   windycloud://backup     → trigger sync queue and land on dashboard
        // parseWindyUrl already handles the wave-3 windycloud://file/{id}
        // contract, so we only land here for the new wave-8 routes.
        if (scheme === 'windycloud') {
          if (parsed.path === 'backup') {
            // Fire-and-forget — don't block navigation on the queue drain.
            syncManager.processQueue().catch(() => {});
          }
          setTimeout(() => {
            try {
              const { router } = require('expo-router');
              if (parsed.path === 'dashboard') {
                router.push('/(tabs)/cloud');
                return;
              }
              if (parsed.path === 'backup') {
                router.push({ pathname: '/(tabs)/cloud', params: { backup: '1' } });
                return;
              }
              // Unknown sub-path — land on the dashboard so the user isn't stuck.
              router.push('/(tabs)/cloud');
            } catch (err) { log.warn('deepLink', 'Navigation error'); }
          }, 300);
          return;
        }

        // Share intent: app opened via Android SEND intent or share deep link.
        // sharedText and sharedUrl are untrusted — Android SEND lets any app
        // on the device pass arbitrary strings. Validate before forwarding
        // into the mail tab so a future renderer can't hit
        // javascript://, data:, or overlong payloads.
        if (parsed.queryParams?.sharedText || parsed.queryParams?.sharedUrl) {
          const sharedText = sanitizeSharedText(parsed.queryParams.sharedText) ?? '';
          const sharedUrl = sanitizeSharedUrl(parsed.queryParams.sharedUrl) ?? '';
          if (!sharedText && !sharedUrl) {
            log.warn('deepLink', 'Rejected share intent — no valid params');
            return;
          }
          setTimeout(() => {
            try {
              const { router } = require('expo-router');
              router.push({
                pathname: '/(tabs)/mail',
                params: { sharedText, sharedUrl },
              });
            } catch (err) { log.warn('deepLink', 'Share intent navigation error'); }
          }, 300);
          return;
        }

        // App shortcuts: windypro://record, windypro://chat, windyword://record
        if (parsed.path === 'record') {
          setTimeout(() => {
            try {
              const { router } = require('expo-router');
              router.push('/(tabs)');
            } catch (err) { log.warn('deepLink', 'Navigation error'); }
          }, 300);
          return;
        }
        if (parsed.path === 'chat') {
          setTimeout(() => {
            try {
              const { router } = require('expo-router');
              router.push('/(tabs)/chat');
            } catch (err) { log.warn('deepLink', 'Navigation error'); }
          }, 300);
          return;
        }
        if (parsed.path === 'hatch') {
          setTimeout(() => {
            try {
              const { router } = require('expo-router');
              router.push('/hatch');
            } catch (err) { log.warn('deepLink', 'Navigation error'); }
          }, 300);
          return;
        }

        // Route deep links: windypro://translate, windypro://clone, etc.
        const routeMap: Record<string, string> = {
          'cloud': '/cloud',
          'files': '/cloud/files',
          'clone': '/clone',
          'subscribe': '/subscription',
          'subscription': '/subscription',
          'video': '/video',
          'settings': '/(tabs)/settings',
          'ecosystem': '/(tabs)/ecosystem',
          'agent': '/agent',
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
    }).catch(() => {});

    return () => sub.remove();
  }, []);

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
              name="hatch/index"
              options={{
                presentation: 'fullScreenModal',
                animation: 'slide_from_bottom',
              }}
            />
            <Stack.Screen
              name="agent/index"
              options={{
                presentation: 'modal',
                animation: 'slide_from_bottom',
              }}
            />
            <Stack.Screen
              name="cloud/files"
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
