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
import { View, StyleSheet, Alert } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { colors } from '@/theme';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { localStorageService } from '@/services/storage-local';
import { licenseService } from '@/services/license';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Keep splash screen visible until we're ready
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [appReady, setAppReady] = useState(false);
  const { setLicense } = useSettingsStore();

  // RP-1.5: Load Inter font family
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    async function prepare() {
      try {
        // Initialize local database
        await localStorageService.initialize();
      } catch (e) {
        console.warn('App initialization error:', e);
      } finally {
        setAppReady(true);
      }
    }
    prepare();
  }, []);

  // RP-5.2: Deep link license handler
  useEffect(() => {
    const handleDeepLink = async ({ url }: { url: string }) => {
      try {
        const parsed = Linking.parse(url);
        if (parsed.path === 'license' && parsed.queryParams?.key) {
          const key = parsed.queryParams.key as string;
          const validation = await licenseService.validateLicense(key, 'device-todo');
          setLicense(validation.tier, key);
          Alert.alert(
            '🎉 License Activated',
            `Welcome to Windy Pro ${formatTier(validation.tier)}!`
          );
        }
      } catch (err) {
        console.warn('[DeepLink] License validation failed:', err);
      }
    };

    const sub = Linking.addEventListener('url', handleDeepLink);
    // Check if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => sub.remove();
  }, [setLicense]);

  // Hide splash when both fonts and app are ready
  const onLayoutReady = useCallback(async () => {
    if (appReady && fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [appReady, fontsLoaded]);

  if (!appReady || !fontsLoaded) {
    return (
      <View style={styles.loading}>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <View style={styles.container} onLayout={onLayoutReady}>
      <StatusBar style="light" />
      <ErrorBoundary>
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
            name="subscription/index"
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
