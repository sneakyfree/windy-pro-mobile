/**
 * 🧬 M11 — Settings Screen
 * RP-5.1: Upgrade button wired to Stripe URL
 * RP-8.4: Real storage usage
 * RP-8.5: Real clone progress
 * Navigation features, translation prefs, voice selection
 */
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Platform, Alert, TextInput, ActivityIndicator, RefreshControl } from 'react-native';
import { useState, useCallback, useEffect, memo } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import { colors, spacing, borderRadius } from '@/theme';
import { typography } from '@/theme/typography';
import { useSettingsStore, setLicense, getLicenseKey } from '@/stores/useSettingsStore';
import { localStorageService } from '@/services/storage-local';
import { cloneTracker } from '@/services/clone-tracker';
import { licenseService } from '@/services/license';
import { feedbackService } from '@/services/feedback';
import { offlinePackService, type LanguagePack } from '@/services/offline-packs';
import { translationService, TIER_1_LANGUAGES } from '@/services/translation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import EnginePickerSheet from '@/components/EnginePickerSheet';
import LanguagePickerSheet from '@/components/LanguagePickerSheet';
import { SyncStatusBanner } from '@/components/SyncStatusBanner';
import { getEcosystemStatus, PRODUCT_DISPLAY, getStatusLabel, getStatusColor, getStatusIcon, getProductSubtitle, type EcosystemStatus } from '@/services/ecosystem-status';
import { cloudApi } from '@/services/cloudApi';
import { identityApi } from '@/services/identityApi';
import type { StorageUsage } from '@/types';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { syncManager } from '@/services/sync-manager';
import { getTranscriptionServerUrl, setTranscriptionServerUrl } from '@/services/transcription';
import { INPUT_LIMITS, validateUrl } from '@/utils/validation';
import { createLogger } from '@/services/logger';

const settingsLog = createLogger('Settings');

const AUDIO_QUALITY_PRESETS = [
  { id: 'low' as const, label: '🟢 Low', desc: '16 kHz · small files', color: '#22c55e' },
  { id: 'medium' as const, label: '🟡 Medium', desc: '22 kHz · balanced', color: '#eab308' },
  { id: 'high' as const, label: '🔴 High', desc: '44.1 kHz · best quality', color: '#ef4444' },
];

const CLONE_VOICE_KEY = 'windy-clone-voice-id';

export default function SettingsScreen() {
  const settings = useSettingsStore();
  const router = useRouter();
  const [storage, setStorage] = useState<StorageUsage | null>(null);
  const [cloneHours, setCloneHours] = useState(0);
  const [cloneReadiness, setCloneReadiness] = useState(0);
  const [enginePickerVisible, setEnginePickerVisible] = useState(false);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const [cacheSize, setCacheSize] = useState<number>(0);
  const [clearingCache, setClearingCache] = useState(false);
  const [packs, setPacks] = useState<LanguagePack[]>([]);
  const [clonedVoiceId, setClonedVoiceId] = useState<string | null>(null);
  const [licenseKeyDisplay, setLicenseKeyDisplay] = useState<string | null>(null);
  const [targetLangPickerVisible, setTargetLangPickerVisible] = useState(false);
  const [serverUrl, setServerUrl] = useState(getTranscriptionServerUrl());
  const [chatHomeserver, setChatHomeserver] = useState(settings.chatHomeserver || 'https://chat.windychat.ai');
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [ecosystem, setEcosystem] = useState<EcosystemStatus | null>(settings.ecosystemStatus);
  const [cloudUsage, setCloudUsage] = useState<{ usedBytes: number; limitBytes: number; fileCount: number; tierLabel: string; percentUsed: number } | null>(null);
  const [authedEmail, setAuthedEmail] = useState<string | null>(identityApi.getEmail());
  const [authed, setAuthed] = useState<boolean>(identityApi.isAuthenticated());

  useEffect(() => {
    const unsub = identityApi.onChange(() => {
      setAuthedEmail(identityApi.getEmail());
      setAuthed(identityApi.isAuthenticated());
    });
    return unsub;
  }, []);

  const handleSignIn = useCallback(() => {
    feedbackService.tap().catch(() => {});
    router.push('/auth/device-code');
  }, [router]);

  const handleSignOut = useCallback(() => {
    Alert.alert(
      'Sign Out',
      authedEmail
        ? `Sign out of ${authedEmail}? Your local recordings stay on this device.`
        : 'Sign out? Your local recordings stay on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await identityApi.logout();
              feedbackService.success().catch(() => {});
            } catch (err) {
              settingsLog.warn('signOut', 'logout failed');
              Alert.alert('Error', 'Could not sign out cleanly. Try again.');
            }
          },
        },
      ],
    );
  }, [authedEmail]);

  const SERVER_URL_KEY = 'windy-server-url';

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    setSettingsLoading(true);
    const errors: string[] = [];

    try {
      const storageData = await localStorageService.getStorageUsage();
      setStorage(storageData);
    } catch (err) { settingsLog.warn('loadData', 'Error loading storage data'); errors.push('storage'); }

    const progress = cloneTracker.getProgress();
    setCloneHours(progress.totalHours);
    setCloneReadiness(progress.cloneReadiness);

    // Calculate cache size
    try {
      const cacheDir = FileSystem.cacheDirectory;
      if (cacheDir) {
        const info = await FileSystem.getInfoAsync(cacheDir);
        setCacheSize((info as any).size || 0);
      }
    } catch (err) { settingsLog.warn('loadData', 'Cache check failed'); setCacheSize(0); }

    // Load offline packs
    try {
      await offlinePackService.initialize();
      setPacks(offlinePackService.getPacks());
    } catch (err) { settingsLog.warn('loadData', 'Offline packs init failed'); errors.push('language packs'); }

    // Load cloned voice ID
    try {
      const voiceId = await AsyncStorage.getItem(CLONE_VOICE_KEY);
      setClonedVoiceId(voiceId);
    } catch (err) { settingsLog.warn('loadData', 'Clone voice load failed'); }

    // Load license key from SecureStore for display
    try {
      const key = await getLicenseKey();
      setLicenseKeyDisplay(key);
    } catch (err) { settingsLog.warn('loadData', 'License key load failed'); errors.push('license'); }

    // Fetch ecosystem status (non-blocking)
    try {
      const ecoStatus = await getEcosystemStatus();
      if (ecoStatus) {
        setEcosystem(ecoStatus);
        settings.setEcosystemStatus(ecoStatus);
      }
    } catch { /* Non-critical */ }

    // Fetch cloud storage usage (non-blocking)
    try {
      if (cloudApi.isAuthenticated()) {
        const usage = await cloudApi.getStorageUsage(settings.licenseTier);
        setCloudUsage(usage);
      }
    } catch { /* Non-critical */ }

    setLoadErrors(errors);
    setSettingsLoading(false);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // RP-5.1: Upgrade button → navigate to subscription paywall
  const handleUpgrade = async () => {
    feedbackService.tap().catch(() => { });
    router.push('/subscription');
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      `This will remove ${formatBytes(cacheSize)} of cached data. Your recordings and settings will not be affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setClearingCache(true);
            try {
              const cacheDir = FileSystem.cacheDirectory;
              if (cacheDir) {
                const files = await FileSystem.readDirectoryAsync(cacheDir);
                for (const file of files) {
                  await FileSystem.deleteAsync(`${cacheDir}${file}`, { idempotent: true });
                }
              }
              setCacheSize(0);
              feedbackService.success().catch(() => { });
              Alert.alert('Done', 'Cache cleared successfully.');
            } catch (err) { settingsLog.warn('clearCache', 'Clear cache failed');
              Alert.alert('Error', 'Could not clear cache.');
            } finally {
              setClearingCache(false);
            }
          },
        },
      ]
    );
  };

  const handleExportAllData = async () => {
    try {
      const sessions = await localStorageService.getSessions();
      const exportData = {
        exported: new Date().toISOString(),
        app: 'Windy Word',
        version: Constants.expoConfig?.version || '1.0.0',
        sessions: sessions.map(s => ({
          id: s.id,
          createdAt: s.createdAt,
          duration: s.duration,
          previewText: s.previewText,
          quality: s.quality,
          source: s.source,
          synced: s.synced,
        })),
      };
      const json = JSON.stringify(exportData, null, 2);
      const path = (FileSystem.cacheDirectory || '') + `windy-pro-export-${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(path, json);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(path, {
          mimeType: 'application/json',
          dialogTitle: 'Export All Data',
        });
      }
      feedbackService.success().catch(() => { });
    } catch (err) { settingsLog.warn('export', 'Export failed');
      Alert.alert('Export Failed', 'Could not export data.');
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      '⚠️ Delete Account',
      'This will permanently delete your account and all local data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'I Understand, Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final Confirmation',
              'Are you absolutely sure? All recordings, settings, and clone data will be erased.',
              [
                { text: 'Keep Account', style: 'cancel' },
                {
                  text: 'Delete Everything',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      // Reset settings
                      await setLicense('free', null);
                      settings.setOnboardingComplete(false);
                      settings.setCloneTrackingEnabled(false);
                      // Clear local storage
                      await localStorageService.initialize(); // re-init clears
                      feedbackService.success().catch(() => { });
                      Alert.alert('Account Deleted', 'Your data has been removed.');
                    } catch (err) { settingsLog.warn('deleteAccount', 'Delete failed');
                      Alert.alert('Error', 'Could not complete account deletion.');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const buildNumber = Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode || '1';
  const themeLabels: Record<string, string> = { dark: '🌙 Dark', light: '☀️ Light', system: '📱 System' };

  return (
    <ScreenErrorBoundary screenName="Settings">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
        >
          {settingsLoading && (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <ActivityIndicator color={colors.accent} size="small" />
              <Text style={{ ...typography.caption, color: colors.textTertiary, marginTop: 8 }}>Loading settings...</Text>
            </View>
          )}
          {loadErrors.length > 0 && (
            <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', padding: 12, marginHorizontal: 16, marginBottom: 8, borderRadius: 8 }}>
              <Text style={{ ...typography.caption, color: '#f87171' }}>
                Some settings could not be loaded: {loadErrors.join(', ')}
              </Text>
            </View>
          )}
          {/* Ecosystem Section */}
          {ecosystem && (
            <SettingsSection title={ecosystem.creator_name ? `${ecosystem.creator_name}'s Windy Ecosystem` : 'Your Windy Ecosystem'}>
              {/* Identity card */}
              <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight }}>
                <Text style={{ ...typography.bodySmall, color: colors.textTertiary }}>{ecosystem.email}</Text>
                <Text style={{ ...typography.caption, color: colors.accent, marginTop: 2 }}>
                  {formatTier(ecosystem.tier)} tier{ecosystem.windy_identity_id ? ` \u00B7 ${ecosystem.windy_identity_id.slice(0, 8)}...` : ''}
                </Text>
              </View>
              {PRODUCT_DISPLAY.map((product) => {
                const productStatus = ecosystem.products[product.key];
                if (!productStatus) return null;
                const statusLabel = getStatusLabel(productStatus.status, productStatus.detail);
                const statusColor = getStatusColor(productStatus.status);
                const statusIcon = getStatusIcon(productStatus.status);
                const subtitle = getProductSubtitle(product.key, productStatus);
                const needsSetup = productStatus.status === 'not_provisioned' || productStatus.status === 'available';
                const isOffline = productStatus.status === 'offline';

                return (
                  <Pressable
                    key={product.key}
                    style={[styles.navRow, { minHeight: subtitle ? 56 : 48, paddingVertical: subtitle ? 8 : spacing.md - 2 }]}
                    disabled={isOffline}
                    onPress={() => {
                      feedbackService.tap().catch(() => {});
                      if (product.route) {
                        router.push(product.route as any);
                      } else if (product.externalUrl) {
                        Linking.openURL(product.externalUrl).catch(() => {});
                      }
                    }}
                    accessibilityLabel={`${product.label}: ${statusLabel}${subtitle ? `, ${subtitle}` : ''}`}
                    accessibilityRole="button"
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.navRowLabel, isOffline && { color: colors.textTertiary }]}>{product.emoji} {product.label}</Text>
                      {subtitle && (
                        <Text style={{ ...typography.caption, color: colors.textTertiary, marginTop: 2, paddingLeft: 28 }} numberOfLines={1}>{subtitle}</Text>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {needsSetup ? (
                        <View style={{ backgroundColor: colors.accent, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                          <Text style={{ ...typography.caption, fontWeight: '600', color: colors.background }}>Set up</Text>
                        </View>
                      ) : isOffline ? (
                        <Text style={{ ...typography.caption, color: colors.textTertiary }}>Offline</Text>
                      ) : (
                        <>
                          <Text style={{ fontSize: 14 }}>{statusIcon}</Text>
                          <Text style={{ ...typography.caption, color: statusColor }}>{statusLabel}</Text>
                        </>
                      )}
                      {!isOffline && <Text style={styles.chevron} importantForAccessibility="no">›</Text>}
                    </View>
                  </Pressable>
                );
              })}
            </SettingsSection>
          )}
          {!ecosystem && cloudApi.isAuthenticated() && (
            <SettingsSection title="Your Windy Ecosystem">
              <View style={{ padding: 16, alignItems: 'center' }}>
                <ActivityIndicator color={colors.accent} size="small" />
                <Text style={{ ...typography.caption, color: colors.textTertiary, marginTop: 8 }}>Loading ecosystem...</Text>
              </View>
            </SettingsSection>
          )}

          {/* Account Section */}
          <SettingsSection title="Account">
            <SettingsRow
              label="Signed in as"
              value={authed ? (authedEmail || 'Signed in') : 'Not signed in'}
              valueColor={authed ? colors.textPrimary : colors.textTertiary}
            />
            {authed ? (
              <Pressable
                style={styles.signOutButton}
                onPress={handleSignOut}
                accessibilityLabel="Sign out of your Windy account"
                accessibilityRole="button"
              >
                <Text style={styles.signOutText}>Sign Out</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.signInButton}
                onPress={handleSignIn}
                accessibilityLabel="Sign in to your Windy account"
                accessibilityRole="button"
              >
                <Text style={styles.signInText}>Sign In</Text>
              </Pressable>
            )}
            <SettingsRow
              label="License"
              value={settings.licenseTier === 'free' ? 'Free' : formatTier(settings.licenseTier)}
              valueColor={settings.licenseTier === 'free' ? colors.textTertiary : colors.accent}
            />
            {settings.licenseTier === 'free' && (
              <Pressable style={styles.upgradeButton} onPress={handleUpgrade}
                accessibilityLabel="Upgrade to Pro"
                accessibilityRole="button"
                accessibilityHint="Opens subscription page"
              >
                <Text style={styles.upgradeText}>⚡ Upgrade to Pro — $19/mo</Text>
              </Pressable>
            )}
          </SettingsSection>

          {/* Voice Engine */}
          <SettingsSection title="Voice Engine">
            <Pressable style={styles.navRow} onPress={() => setEnginePickerVisible(true)}
              accessibilityLabel={`Current engine: ${settings.selectedEngine || 'Auto'}`}
              accessibilityRole="button"
              accessibilityHint="Opens engine selection"
            >
              <Text style={styles.navRowLabel}>Current Engine</Text>
              <Text style={styles.rowValue}>{settings.selectedEngine || 'Auto'}</Text>
              <Text style={styles.chevron} importantForAccessibility="no">›</Text>
            </Pressable>
            <SettingsToggle label="Auto-select best engine" value={settings.windyTuneAutoSelect} onToggle={settings.setWindyTuneAutoSelect} />
            <SettingsToggle label="Auto mode (cloud + local)" subtitle="OFF = device-only processing. ON = WindyTune picks cloud or local for best quality. All options are fully private." value={settings.cloudFallbackEnabled} onToggle={settings.setCloudFallbackEnabled} />
          </SettingsSection>

          {/* Recording */}
          <SettingsSection title="Recording">
            <Pressable style={styles.navRow} onPress={() => setLanguagePickerVisible(true)}
              accessibilityLabel={`Recording language: ${settings.defaultLanguage.toUpperCase()}`}
              accessibilityRole="button"
              accessibilityHint="Opens language picker"
            >
              <Text style={styles.navRowLabel}>Language</Text>
              <Text style={styles.rowValue}>{settings.defaultLanguage.toUpperCase()}</Text>
              <Text style={styles.chevron} importantForAccessibility="no">›</Text>
            </Pressable>
            <SettingsToggle label="High quality audio" subtitle="44.1 kHz (larger files)" value={settings.highQualityAudio} onToggle={settings.setHighQualityAudio} />
            <SettingsToggle label="Location tagging" value={settings.locationTagging} onToggle={settings.setLocationTagging} />
          </SettingsSection>

          {/* Translation Preferences */}
          <SettingsSection title="Translation">
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Default Source</Text>
              <Pressable onPress={() => setLanguagePickerVisible(true)}
                accessibilityLabel={`Translation source language: ${settings.defaultLanguage.toUpperCase()}`}
                accessibilityRole="button"
                style={{ minHeight: 48, justifyContent: 'center' }}
              >
                <Text style={styles.rowValue}>
                  {translationService.getFlag(settings.defaultLanguage)} {settings.defaultLanguage.toUpperCase()}
                </Text>
              </Pressable>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Default Target</Text>
              <Pressable onPress={() => setTargetLangPickerVisible(true)}
                accessibilityLabel={`Translation target language: ${settings.defaultTargetLanguage.toUpperCase()}`}
                accessibilityRole="button"
                style={{ minHeight: 48, justifyContent: 'center' }}
              >
                <Text style={styles.rowValue}>
                  {translationService.getFlag(settings.defaultTargetLanguage)} {settings.defaultTargetLanguage.toUpperCase()}
                </Text>
              </Pressable>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Audio Quality</Text>
              <View style={styles.qualityPresetRow}>
                {AUDIO_QUALITY_PRESETS.map((p) => (
                  <Pressable
                    key={p.id}
                    style={[
                      styles.qualityPresetBtn,
                      settings.audioQualityPreset === p.id && { borderColor: p.color, backgroundColor: `${p.color}15` },
                    ]}
                    onPress={() => settings.setAudioQualityPreset(p.id)}
                    accessibilityLabel={`${p.label} audio quality${settings.audioQualityPreset === p.id ? ', selected' : ''}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: settings.audioQualityPreset === p.id }}
                  >
                    <Text style={[
                      styles.qualityPresetText,
                      settings.audioQualityPreset === p.id && { color: p.color, fontWeight: '700' },
                    ]}>
                      {p.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </SettingsSection>

          {/* Voice Selection */}
          <SettingsSection title="Voice">
            <Pressable
              style={[styles.row, settings.selectedVoice === null && styles.voiceRowActive]}
              onPress={() => settings.setSelectedVoice(null)}
              accessibilityLabel={`System Default voice${settings.selectedVoice === null ? ', selected' : ''}`}
              accessibilityRole="button"
              accessibilityState={{ selected: settings.selectedVoice === null }}
            >
              <Text style={styles.rowLabel}>🔊 System Default</Text>
              {settings.selectedVoice === null && <Text style={styles.voiceCheck} importantForAccessibility="no">✓</Text>}
            </Pressable>
            {clonedVoiceId && (
              <Pressable
                style={[styles.row, settings.selectedVoice === clonedVoiceId && styles.voiceRowActive]}
                onPress={() => settings.setSelectedVoice(clonedVoiceId)}
                accessibilityLabel={`My Cloned Voice${settings.selectedVoice === clonedVoiceId ? ', selected' : ''}`}
                accessibilityRole="button"
                accessibilityState={{ selected: settings.selectedVoice === clonedVoiceId }}
              >
                <View style={styles.rowLabelContainer}>
                  <Text style={styles.rowLabel}>🧬 My Cloned Voice</Text>
                  <Text style={styles.rowSubtitle}>ID: {clonedVoiceId.slice(0, 8)}...</Text>
                </View>
                {settings.selectedVoice === clonedVoiceId && <Text style={styles.voiceCheck} importantForAccessibility="no">✓</Text>}
              </Pressable>
            )}
            <Pressable
              style={styles.row}
              onPress={() => {
                translationService.speak('This is a voice preview.', settings.defaultTargetLanguage);
                feedbackService.tap();
              }}
              accessibilityLabel="Preview voice"
              accessibilityRole="button"
              accessibilityHint="Plays a sample of the selected voice"
            >
              <Text style={[styles.rowLabel, { color: colors.accent }]}>▶️ Preview Voice</Text>
            </Pressable>
          </SettingsSection>

          {/* Features */}
          <SettingsSection title="Features">
            <Pressable style={styles.navRow} onPress={() => router.push('/settings/platforms')}
              accessibilityLabel="Connected Platforms" accessibilityRole="button" accessibilityHint="Link Telegram and other chat platforms to Windy Chat"
            >
              <Text style={styles.navRowLabel}>🔗 Connected Platforms</Text>
              <Text style={styles.chevron} importantForAccessibility="no">›</Text>
            </Pressable>
            <Pressable style={styles.navRow} onPress={() => router.push('/translate')}
              accessibilityLabel="Windy Translate" accessibilityRole="button" accessibilityHint="Opens translation screen"
            >
              <Text style={styles.navRowLabel}>🌐 Windy Translate</Text>
              <Text style={styles.chevron} importantForAccessibility="no">›</Text>
            </Pressable>
            <Pressable style={styles.navRow} onPress={() => router.push('/cloud')}
              accessibilityLabel="Cloud Storage" accessibilityRole="button" accessibilityHint="Opens cloud file manager"
            >
              <Text style={styles.navRowLabel}>☁️ Cloud Storage</Text>
              <Text style={styles.chevron} importantForAccessibility="no">›</Text>
            </Pressable>
            <Pressable style={styles.navRow} onPress={() => router.push('/clone')}
              accessibilityLabel="Voice Clone" accessibilityRole="button" accessibilityHint="Opens voice clone progress"
            >
              <Text style={styles.navRowLabel}>🧬 Voice Clone</Text>
              <Text style={styles.chevron} importantForAccessibility="no">›</Text>
            </Pressable>
            <Pressable style={styles.navRow} onPress={() => router.push('/video')}
              accessibilityLabel="Video Recorder" accessibilityRole="button" accessibilityHint="Opens video recording screen"
            >
              <Text style={styles.navRowLabel}>📹 Video Recorder</Text>
              <Text style={styles.chevron} importantForAccessibility="no">›</Text>
            </Pressable>
            <Pressable style={styles.navRow} onPress={() => router.push('/settings/trust')}
              accessibilityLabel="Trust and Clearance" accessibilityRole="button" accessibilityHint="Opens Eternitas trust profile"
            >
              <Text style={styles.navRowLabel}>🪪 Trust &amp; Clearance</Text>
              <Text style={styles.chevron} importantForAccessibility="no">›</Text>
            </Pressable>
          </SettingsSection>

          {/* UI */}
          <SettingsSection title={Platform.OS === 'android' ? 'Windy Button' : 'Keyboard'}>
            <SettingsToggle label="Haptic feedback" value={settings.hapticFeedback} onToggle={settings.setHapticFeedback} />
            <SettingsToggle label="Audio feedback" subtitle="Blip sounds on record start/stop" value={settings.audioFeedback} onToggle={settings.setAudioFeedback} />
          </SettingsSection>

          {/* Voice Chat */}
          <SettingsSection title="Voice Chat">
            <View style={styles.row}>
              <View style={styles.rowLabelContainer}>
                <Text style={styles.rowLabel}>Voice chat mode</Text>
                <Text style={styles.rowSubtitle}>
                  {settings.voiceChatMode === 'autosend' ? 'Speak → auto-send (power user)' : 'Speak → fill compose box (review first)'}
                </Text>
              </View>
              <Pressable
                style={[styles.themeBtn, settings.voiceChatMode === 'dictate' && styles.themeBtnActive, { flex: 0, paddingHorizontal: 12 }]}
                onPress={() => settings.setVoiceChatMode('dictate')}
                accessibilityLabel="Tap to dictate mode"
                accessibilityRole="button"
              >
                <Text style={[styles.themeBtnText, settings.voiceChatMode === 'dictate' && styles.themeBtnTextActive]}>Dictate</Text>
              </Pressable>
              <Pressable
                style={[styles.themeBtn, settings.voiceChatMode === 'autosend' && styles.themeBtnActive, { flex: 0, paddingHorizontal: 12, marginLeft: 6 }]}
                onPress={() => settings.setVoiceChatMode('autosend')}
                accessibilityLabel="Tap to auto-send mode"
                accessibilityRole="button"
              >
                <Text style={[styles.themeBtnText, settings.voiceChatMode === 'autosend' && styles.themeBtnTextActive]}>Auto-send</Text>
              </Pressable>
            </View>
          </SettingsSection>

          {/* Notifications */}
          <SettingsSection title="Notifications">
            <SettingsToggle label="Recording complete" subtitle="When a transcription finishes" value={settings.notifyRecordingComplete} onToggle={settings.setNotifyRecordingComplete} />
            <SettingsToggle label="Sync complete" subtitle="When cloud sync finishes" value={settings.notifySyncComplete} onToggle={settings.setNotifySyncComplete} />
            <SettingsToggle label="Clone milestone" subtitle="When you hit clone training goals" value={settings.notifyCloneMilestone} onToggle={settings.setNotifyCloneMilestone} />
          </SettingsSection>

          {/* Appearance */}
          <SettingsSection title="Appearance">
            <View style={styles.themeRow}>
              {(['dark', 'light', 'system'] as const).map((t) => (
                <Pressable
                  key={t}
                  style={[styles.themeBtn, settings.theme === t && styles.themeBtnActive]}
                  onPress={() => settings.setTheme(t)}
                  accessibilityLabel={`${themeLabels[t]} theme${settings.theme === t ? ', selected' : ''}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: settings.theme === t }}
                >
                  <Text style={[styles.themeBtnText, settings.theme === t && styles.themeBtnTextActive]}>
                    {themeLabels[t]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </SettingsSection>

          {/* Storage */}
          <SettingsSection title="Storage">
            {storage ? (
              <>
                <SettingsRow label="Sessions" value={`${storage.sessionCount} sessions`} />
                <SettingsRow label="Audio" value={formatBytes(storage.audioBytes)} />
                <SettingsRow label="Engines" value={formatBytes(storage.engineBytes)} />
                <SettingsRow label="Total" value={formatBytes(storage.totalBytes)} valueColor={colors.accent} />
              </>
            ) : (
              <SettingsRow label="Calculating..." value="" />
            )}
            <Pressable style={styles.storageAction} onPress={handleClearCache}
              accessibilityLabel={clearingCache ? 'Clearing cache' : `Clear cache, ${formatBytes(cacheSize)}`}
              accessibilityRole="button"
            >
              <Text style={styles.storageActionText}>
                {clearingCache ? '⏳ Clearing...' : `🗑 Clear Cache (${formatBytes(cacheSize)})`}
              </Text>
            </Pressable>
            <Pressable style={styles.storageAction} onPress={handleExportAllData}
              accessibilityLabel="Export all data" accessibilityRole="button"
            >
              <Text style={styles.storageActionText}>📦 Export All Data</Text>
            </Pressable>
          </SettingsSection>

          {/* Downloaded Languages */}
          <SettingsSection title="Downloaded Languages">
            <SettingsRow
              label="Total storage"
              value={formatBytes(offlinePackService.getTotalStorageUsed())}
              valueColor={colors.accent}
            />
            {packs.map((pack) => (
              <View key={pack.code} style={styles.row}>
                <View style={styles.rowLabelContainer}>
                  <Text style={styles.rowLabel}>{pack.flag} {pack.name}</Text>
                  <Text style={styles.rowSubtitle}>
                    {pack.status === 'downloaded'
                      ? formatBytes(pack.downloadedBytes)
                      : pack.status === 'downloading'
                        ? `${Math.round(pack.progress * 100)}%`
                        : formatBytes(pack.sizeBytes)}
                  </Text>
                  {pack.status === 'downloading' && (
                    <View style={styles.packProgress}>
                      <View style={[styles.packProgressFill, { width: `${pack.progress * 100}%` }]} />
                    </View>
                  )}
                </View>
                {pack.status === 'available' && (
                  <Pressable onPress={async () => {
                    await offlinePackService.downloadPack(pack.code);
                    setPacks(offlinePackService.getPacks());
                  }}
                    accessibilityLabel={`Download ${pack.name} language pack`}
                    accessibilityRole="button"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    style={{ minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center' }}
                  >
                    <Text style={styles.storageActionText}>⬇️</Text>
                  </Pressable>
                )}
                {pack.status === 'downloaded' && (
                  <Pressable onPress={async () => {
                    await offlinePackService.deletePack(pack.code);
                    setPacks(offlinePackService.getPacks());
                  }}
                    accessibilityLabel={`Delete ${pack.name} language pack`}
                    accessibilityRole="button"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    style={{ minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center' }}
                  >
                    <Text style={[styles.storageActionText, { color: colors.stateError }]}>🗑</Text>
                  </Pressable>
                )}
                {pack.status === 'downloading' && (
                  <Pressable onPress={async () => {
                    await offlinePackService.cancelDownload(pack.code);
                    setPacks(offlinePackService.getPacks());
                  }}
                    accessibilityLabel={`Cancel downloading ${pack.name}`}
                    accessibilityRole="button"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    style={{ minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center' }}
                  >
                    <Text style={styles.storageActionText}>✕</Text>
                  </Pressable>
                )}
                {pack.status === 'error' && (
                  <Pressable onPress={async () => {
                    await offlinePackService.downloadPack(pack.code);
                    setPacks(offlinePackService.getPacks());
                  }}
                    accessibilityLabel={`Retry downloading ${pack.name}`}
                    accessibilityRole="button"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    style={{ minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center' }}
                  >
                    <Text style={styles.storageActionText}>🔄</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </SettingsSection>

          {/* Clone */}
          <SettingsSection title="Voice Clone">
            <SettingsToggle label="Track clone progress" subtitle="Silently accumulate voice data" value={settings.cloneTrackingEnabled} onToggle={settings.setCloneTrackingEnabled} />
            <SettingsRow
              label="Progress"
              value={`${cloneHours.toFixed(1)} of 10 hours (${Math.round(cloneReadiness)}%)`}
              valueColor={cloneReadiness >= 100 ? colors.accent : colors.textSecondary}
            />
          </SettingsSection>

          {/* Cloud Sync */}
          <SettingsSection title="Cloud Sync">
            {/* Storage Breakdown: Local + Cloud */}
            {(storage || cloudUsage) && (
              <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight }}>
                {storage && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ ...typography.bodySmall, color: colors.textSecondary }}>Local (hot)</Text>
                    <Text style={{ ...typography.bodySmall, color: colors.textPrimary }}>
                      {formatBytes(storage.totalBytes || 0)} / {formatBytes(500 * 1024 * 1024)}
                    </Text>
                  </View>
                )}
                {cloudUsage && (
                  <>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ ...typography.bodySmall, color: colors.textSecondary }}>Cloud (cold)</Text>
                      <Text style={{ ...typography.bodySmall, color: colors.textPrimary }}>
                        {formatBytes(cloudUsage.usedBytes)} / {formatBytes(cloudUsage.limitBytes)}
                      </Text>
                    </View>
                    <View style={{ height: 4, backgroundColor: colors.surfaceLight, borderRadius: 2, overflow: 'hidden' }}>
                      <View style={{ height: '100%', width: `${Math.min(cloudUsage.percentUsed, 100)}%`, backgroundColor: cloudUsage.percentUsed > 90 ? '#ef4444' : colors.accent, borderRadius: 2 }} />
                    </View>
                    <Text style={{ ...typography.caption, color: colors.textTertiary }}>
                      {cloudUsage.tierLabel} tier · {cloudUsage.fileCount} file{cloudUsage.fileCount !== 1 ? 's' : ''} · {cloudUsage.percentUsed}% used
                    </Text>
                  </>
                )}
              </View>
            )}
            <SettingsToggle
              label="Auto-Sync"
              subtitle="Automatically sync recordings when on Wi-Fi"
              value={syncManager.getSettings().auto_sync}
              onToggle={(v) => syncManager.updateSettings({ auto_sync: v })}
            />
            <SettingsToggle
              label="Sync on Cellular"
              subtitle="Allow large file uploads on mobile data"
              value={syncManager.getSettings().sync_on_cellular}
              onToggle={(v) => syncManager.updateSettings({ sync_on_cellular: v })}
            />
            {/* Sync Status Indicator */}
            {(() => {
              const syncState = syncManager.getState();
              return (
                <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 4 }} accessibilityRole="summary" accessibilityLabel={`Sync status: ${syncState.pendingCount} items pending, network ${syncState.networkType}, last sync ${syncState.lastSyncTime ? new Date(syncState.lastSyncTime).toLocaleString() : 'never'}`}>
                  <Text style={[styles.rowSubtitle, { color: colors.textTertiary }]}>
                    {syncState.networkType === 'wifi' ? '📶 Wi-Fi' : syncState.networkType === 'cellular' ? '📱 Cellular' : '📵 Offline'}
                    {' · '}{syncState.pendingCount} pending
                    {syncState.isSyncing ? ` · Syncing ${syncState.overallProgress}%` : ''}
                  </Text>
                  <Text style={[styles.rowSubtitle, { color: colors.textTertiary }]}>
                    Last sync: {syncState.lastSyncTime ? new Date(syncState.lastSyncTime).toLocaleString() : 'Never'}
                  </Text>
                </View>
              );
            })()}
            <Pressable style={styles.navRow} onPress={async () => {
              await feedbackService.tap();
              await syncManager.manualSync();
              Alert.alert('Sync', 'Sync started — uploads will process in the background.');
            }}
              accessibilityLabel="Sync now"
              accessibilityRole="button"
              accessibilityHint="Starts syncing recordings to the cloud"
            >
              <Text style={styles.navRowLabel}>🔄 Sync Now</Text>
              <Text style={styles.chevron} importantForAccessibility="no">›</Text>
            </Pressable>
            <Pressable style={styles.navRow} onPress={() => {
              Alert.alert('Clear Synced Data', 'Remove completed uploads from the queue? This does not delete your recordings.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Clear', style: 'destructive', onPress: async () => {
                    await syncManager.clearCompleted();
                    feedbackService.success();
                    Alert.alert('Cleared', 'Synced data queue cleared.');
                  },
                },
              ]);
            }}
              accessibilityLabel="Clear synced data"
              accessibilityRole="button"
              accessibilityHint="Removes completed uploads from the queue"
            >
              <Text style={styles.navRowLabel}>🗑 Clear Synced Data</Text>
              <Text style={styles.chevron} importantForAccessibility="no">›</Text>
            </Pressable>
          </SettingsSection>

          {/* Server Config (Advanced) */}
          <SettingsSection title="Advanced">
            <View style={styles.serverUrlRow}>
              <Text style={styles.settingLabel}>Transcription Server</Text>
              <TextInput
                style={styles.serverUrlInput}
                value={serverUrl}
                onChangeText={setServerUrl}
                accessibilityLabel="Transcription server URL"
                onEndEditing={async () => {
                  const url = serverUrl.trim() || 'https://windyword.ai';
                  const urlCheck = validateUrl(url);
                  if (!urlCheck.valid) {
                    Alert.alert('Invalid URL', urlCheck.error);
                    return;
                  }
                  setServerUrl(url);
                  setTranscriptionServerUrl(url);
                  await AsyncStorage.setItem(SERVER_URL_KEY, url);
                  feedbackService.success();
                  Alert.alert('Server Updated', `Transcription server set to:\n${url}`);
                }}
                placeholder="https://windyword.ai"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                maxLength={INPUT_LIMITS.SERVER_URL}
              />
              <Pressable
                style={styles.serverResetBtn}
                onPress={async () => {
                  const def = 'https://windyword.ai';
                  setServerUrl(def);
                  setTranscriptionServerUrl(def);
                  await AsyncStorage.setItem(SERVER_URL_KEY, def);
                  feedbackService.tap();
                }}
                accessibilityLabel="Reset server URL to default"
                accessibilityRole="button"
              >
                <Text style={styles.serverResetText}>Reset</Text>
              </Pressable>
            </View>
            <View style={[styles.serverUrlRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight }]}>
              <Text style={styles.settingLabel}>Chat Homeserver</Text>
              <TextInput
                style={styles.serverUrlInput}
                value={chatHomeserver}
                onChangeText={setChatHomeserver}
                accessibilityLabel="Matrix chat homeserver URL"
                onEndEditing={() => {
                  const url = chatHomeserver.trim() || 'https://chat.windychat.ai';
                  const urlCheck = validateUrl(url);
                  if (!urlCheck.valid) {
                    Alert.alert('Invalid URL', urlCheck.error);
                    return;
                  }
                  setChatHomeserver(url);
                  settings.setChatHomeserver(url);
                  feedbackService.success();
                  Alert.alert('Chat Server Updated', `Chat homeserver set to:\n${url}`);
                }}
                placeholder="https://chat.windychat.ai"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                maxLength={INPUT_LIMITS.SERVER_URL}
              />
              <Pressable
                style={styles.serverResetBtn}
                onPress={() => {
                  const def = 'https://chat.windychat.ai';
                  setChatHomeserver(def);
                  settings.setChatHomeserver('');
                  feedbackService.tap();
                }}
                accessibilityLabel="Reset chat homeserver to default"
                accessibilityRole="button"
              >
                <Text style={styles.serverResetText}>Reset</Text>
              </Pressable>
            </View>
          </SettingsSection>

          {/* About */}
          <SettingsSection title="About">
            <Pressable style={styles.navRow} onPress={() => router.push('/appstore')}
              accessibilityLabel="About Windy Word" accessibilityRole="button"
            >
              <Text style={styles.navRowLabel}>🌪️ About Windy Word</Text>
              <Text style={styles.chevron} importantForAccessibility="no">›</Text>
            </Pressable>
            <SettingsRow label="Version" value={`${appVersion} (Build ${buildNumber})`} />
            <SettingsRow label="SDK" value={`Expo SDK ${Constants.expoConfig?.sdkVersion || '52'}`} />
            <Pressable style={styles.navRow} onPress={() => router.push('/legal/privacy')}
              accessibilityLabel="Privacy Policy" accessibilityRole="button"
            >
              <Text style={styles.navRowLabel}>Privacy Policy</Text>
              <Text style={styles.chevron} importantForAccessibility="no">›</Text>
            </Pressable>
            <Pressable style={styles.navRow} onPress={() => router.push('/legal/terms')}
              accessibilityLabel="Terms of Service" accessibilityRole="button"
            >
              <Text style={styles.navRowLabel}>Terms of Service</Text>
              <Text style={styles.chevron} importantForAccessibility="no">›</Text>
            </Pressable>
          </SettingsSection>

          {/* Account Management */}
          <SettingsSection title="Account">
            <SettingsRow
              label="Subscription"
              value={settings.licenseTier === 'free' ? 'Free' : formatTier(settings.licenseTier)}
              valueColor={settings.licenseTier === 'free' ? colors.textTertiary : colors.accent}
            />
            {licenseKeyDisplay && (
              <SettingsRow label="License Key" value={`${licenseKeyDisplay.slice(0, 8)}...`} />
            )}
            {settings.licenseTier !== 'free' && (
              <Pressable style={styles.navRow} onPress={() => router.push('/subscription')}
                accessibilityLabel="Manage Subscription" accessibilityRole="button"
              >
                <Text style={styles.navRowLabel}>💳 Manage Subscription</Text>
                <Text style={styles.chevron} importantForAccessibility="no">›</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.navRow}
              onPress={() => {
                Alert.alert('Log Out', 'Are you sure you want to log out?', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Log Out',
                    style: 'destructive',
                    onPress: () => {
                      setLicense('free', null).then(() => {
                        feedbackService.success();
                        Alert.alert('Logged Out', 'You have been logged out.');
                      });
                    },
                  },
                ]);
              }}
              accessibilityLabel="Log out"
              accessibilityRole="button"
              accessibilityHint="Signs you out of your account"
            >
              <Text style={[styles.navRowLabel, { color: colors.stateError }]}>🚪 Log Out</Text>
            </Pressable>
          </SettingsSection>

          {/* Danger Zone */}
          <SettingsSection title="Danger Zone">
            <Pressable style={styles.dangerRow} onPress={handleDeleteAccount}
              accessibilityLabel="Delete account and all data"
              accessibilityRole="button"
              accessibilityHint="Permanently removes your account, recordings, and settings"
            >
              <Text style={styles.dangerText}>🗑 Delete Account & Data</Text>
            </Pressable>
          </SettingsSection>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Made with 🌪️ by Windy Word</Text>
            <Text style={styles.footerVersion}>v{appVersion} · {Platform.OS}</Text>
          </View>

          <EnginePickerSheet visible={enginePickerVisible} onClose={() => setEnginePickerVisible(false)} />
          <LanguagePickerSheet visible={languagePickerVisible} onClose={() => setLanguagePickerVisible(false)} />
          {targetLangPickerVisible && (
            <LanguagePickerSheet
              visible={targetLangPickerVisible}
              onClose={() => setTargetLangPickerVisible(false)}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

// 🚀 Perf: memoized sub-components to prevent re-renders on parent state change
const SettingsSection = memo(function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section} accessibilityRole="none" accessible={true} accessibilityLabel={title}>
      <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
});
SettingsSection.displayName = 'SettingsSection';

const SettingsRow = memo(function SettingsRow({ label, value, valueColor, chevron }: {
  label: string; value?: string; valueColor?: string; chevron?: boolean;
}) {
  return (
    <View style={styles.row} accessibilityLabel={value ? `${label}: ${value}` : label}>
      <Text style={styles.rowLabel}>{label}</Text>
      {value !== undefined && <Text style={[styles.rowValue, valueColor ? { color: valueColor } : undefined]}>{value}</Text>}
      {chevron && <Text style={styles.chevron} importantForAccessibility="no">›</Text>}
    </View>
  );
});
SettingsRow.displayName = 'SettingsRow';

const SettingsToggle = memo(function SettingsToggle({ label, subtitle, value, onToggle }: {
  label: string; subtitle?: string; value: boolean; onToggle: (v: boolean) => void;
}) {
  return (
    <View style={styles.row} accessible={true} accessibilityRole="switch" accessibilityState={{ checked: value }}
      accessibilityLabel={subtitle ? `${label}, ${subtitle}` : label}
    >
      <View style={styles.rowLabelContainer}>
        <Text style={styles.rowLabel}>{label}</Text>
        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      <Switch value={value} onValueChange={onToggle} trackColor={{ false: colors.surfaceLight, true: colors.accent }} thumbColor={colors.textPrimary}
        accessibilityLabel={label}
      />
    </View>
  );
});
SettingsToggle.displayName = 'SettingsToggle';

function formatTier(tier: string): string {
  return { pro: 'Pro', translate: 'Windy Ultra', translate_pro: 'Windy Max' }[tier] || tier;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.screenPadding, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  section: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm, paddingLeft: spacing.xs },
  sectionContent: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md - 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight, minHeight: 48 },
  rowLabelContainer: { flex: 1 },
  rowLabel: { ...typography.body, color: colors.textPrimary },
  rowSubtitle: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  rowValue: { ...typography.body, color: colors.textSecondary },
  chevron: { ...typography.h2, fontWeight: '300', color: colors.textTertiary },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md - 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight, minHeight: 48 },
  navRowLabel: { ...typography.body, color: colors.textPrimary },
  upgradeButton: { backgroundColor: colors.accent, margin: spacing.sm, paddingVertical: spacing.sm + 2, borderRadius: borderRadius.md, alignItems: 'center' },
  upgradeText: { ...typography.button, color: colors.background },
  signOutButton: { margin: spacing.sm, paddingVertical: spacing.sm + 2, borderRadius: borderRadius.md, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderLight },
  signOutText: { ...typography.button, color: '#f87171' },
  signInButton: { backgroundColor: colors.accent, margin: spacing.sm, paddingVertical: spacing.sm + 2, borderRadius: borderRadius.md, alignItems: 'center' },
  signInText: { ...typography.button, color: colors.background },

  // Theme toggle
  themeRow: { flexDirection: 'row', gap: spacing.xs, padding: spacing.sm },
  themeBtn: {
    flex: 1.0, paddingVertical: spacing.sm, alignItems: 'center',
    borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.borderLight,
  },
  themeBtnActive: { borderColor: colors.accent, backgroundColor: 'rgba(163, 230, 53, 0.1)' },
  themeBtnText: { ...typography.bodySmall, color: colors.textTertiary },
  themeBtnTextActive: { color: colors.accent, fontWeight: '600' },

  // Storage actions
  storageAction: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight,
  },
  storageActionText: { ...typography.bodySmall, color: colors.accent, fontWeight: '500' },

  // Language pack progress
  packProgress: { height: 3, backgroundColor: colors.surfaceLight, borderRadius: 2, marginTop: 4, overflow: 'hidden' },
  packProgressFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 2 },

  // Danger zone
  dangerRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, alignItems: 'center' },
  dangerText: { ...typography.button, color: colors.stateError },

  footer: { alignItems: 'center', paddingVertical: spacing.xl },
  footerText: { ...typography.bodySmall, color: colors.textTertiary },
  footerVersion: { ...typography.tabLabel, color: colors.textTertiary, marginTop: 2 },

  // Translation prefs
  qualityPresetRow: { flexDirection: 'row', gap: 6 },
  qualityPresetBtn: {
    paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  qualityPresetText: { ...typography.tabLabel, color: colors.textTertiary },

  // Voice selection
  voiceRowActive: { backgroundColor: 'rgba(163, 230, 53, 0.06)' },
  // Server URL
  serverUrlRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  settingLabel: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  serverUrlInput: {
    backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    ...typography.bodySmall, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border,
  },
  serverResetBtn: {
    alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 12,
    backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border,
  },
  serverResetText: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  voiceCheck: { ...typography.body, fontWeight: '700', color: colors.accent },
});
