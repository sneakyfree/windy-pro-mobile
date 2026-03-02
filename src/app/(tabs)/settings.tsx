/**
 * 🧬 M11 — Settings Screen
 * RP-5.1: Upgrade button wired to Stripe URL
 * RP-8.4: Real storage usage
 * RP-8.5: Real clone progress
 * Navigation to Translate, Clone, Privacy, Terms
 */
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Platform, Alert } from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import { colors, spacing, borderRadius } from '@/theme';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { localStorageService } from '@/services/storage-local';
import { cloneTracker } from '@/services/clone-tracker';
import { licenseService } from '@/services/license';
import { feedbackService } from '@/services/feedback';
import { offlinePackService, type LanguagePack } from '@/services/offline-packs';
import EnginePickerSheet from '@/components/EnginePickerSheet';
import LanguagePickerSheet from '@/components/LanguagePickerSheet';
import { SyncStatusBanner } from '@/components/SyncStatusBanner';
import type { StorageUsage } from '@/types';

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

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const storageData = await localStorageService.getStorageUsage();
      setStorage(storageData);
    } catch { /* ignore */ }

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
    } catch { setCacheSize(0); }

    // Load offline packs
    try {
      await offlinePackService.initialize();
      setPacks(offlinePackService.getPacks());
    } catch { /* ignore */ }
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
    await feedbackService.tap();
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
              await feedbackService.success();
              Alert.alert('Done', 'Cache cleared successfully.');
            } catch {
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
        app: 'Windy Pro',
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
      await feedbackService.success();
    } catch {
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
                      settings.setLicense('free', null);
                      settings.setOnboardingComplete(false);
                      settings.setCloneTrackingEnabled(false);
                      // Clear local storage
                      await localStorageService.initialize(); // re-init clears
                      await feedbackService.success();
                      Alert.alert('Account Deleted', 'Your data has been removed.');
                    } catch {
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Account Section */}
        <SettingsSection title="Account">
          <SettingsRow
            label="License"
            value={settings.licenseTier === 'free' ? 'Free' : formatTier(settings.licenseTier)}
            valueColor={settings.licenseTier === 'free' ? colors.textTertiary : colors.accent}
          />
          {settings.licenseTier === 'free' && (
            <Pressable style={styles.upgradeButton} onPress={handleUpgrade}>
              <Text style={styles.upgradeText}>⚡ Upgrade to Pro — $49</Text>
            </Pressable>
          )}
        </SettingsSection>

        {/* Voice Engine */}
        <SettingsSection title="Voice Engine">
          <Pressable style={styles.navRow} onPress={() => setEnginePickerVisible(true)}>
            <Text style={styles.navRowLabel}>Current Engine</Text>
            <Text style={styles.rowValue}>{settings.selectedEngine || 'Auto'}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          <SettingsToggle label="Auto-select best engine" value={settings.windyTuneAutoSelect} onToggle={settings.setWindyTuneAutoSelect} />
          <SettingsToggle label="Cloud fallback" subtitle="Use cloud if device struggles" value={settings.cloudFallbackEnabled} onToggle={settings.setCloudFallbackEnabled} />
        </SettingsSection>

        {/* Recording */}
        <SettingsSection title="Recording">
          <Pressable style={styles.navRow} onPress={() => setLanguagePickerVisible(true)}>
            <Text style={styles.navRowLabel}>Language</Text>
            <Text style={styles.rowValue}>{settings.defaultLanguage.toUpperCase()}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          <SettingsToggle label="High quality audio" subtitle="44.1 kHz (larger files)" value={settings.highQualityAudio} onToggle={settings.setHighQualityAudio} />
          <SettingsToggle label="Location tagging" value={settings.locationTagging} onToggle={settings.setLocationTagging} />
        </SettingsSection>

        {/* Features */}
        <SettingsSection title="Features">
          <Pressable style={styles.navRow} onPress={() => router.push('/translate')}>
            <Text style={styles.navRowLabel}>🌐 Windy Translate</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          <Pressable style={styles.navRow} onPress={() => router.push('/clone')}>
            <Text style={styles.navRowLabel}>🧬 Voice Clone</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          <Pressable style={styles.navRow} onPress={() => router.push('/video')}>
            <Text style={styles.navRowLabel}>📹 Video Recorder</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </SettingsSection>

        {/* UI */}
        <SettingsSection title={Platform.OS === 'android' ? 'Windy Button' : 'Keyboard'}>
          <SettingsToggle label="Haptic feedback" value={settings.hapticFeedback} onToggle={settings.setHapticFeedback} />
          <SettingsToggle label="Audio feedback" subtitle="Blip sounds on record start/stop" value={settings.audioFeedback} onToggle={settings.setAudioFeedback} />
        </SettingsSection>

        {/* Cloud Sync */}
        <SettingsSection title="Cloud Sync">
          <SettingsToggle label="Enable sync" value={settings.syncEnabled} onToggle={settings.setSyncEnabled} />
          {settings.syncEnabled && (
            <>
              <SettingsToggle label="Wi-Fi only" value={settings.wifiOnlySync} onToggle={settings.setWifiOnlySync} />
              <SettingsToggle label="While plugged in only" value={settings.pluggedInOnlySync} onToggle={settings.setPluggedInOnlySync} />
              <SyncStatusBanner />
            </>
          )}
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
          <Pressable style={styles.storageAction} onPress={handleClearCache}>
            <Text style={styles.storageActionText}>
              {clearingCache ? '⏳ Clearing...' : `🗑 Clear Cache (${formatBytes(cacheSize)})`}
            </Text>
          </Pressable>
          <Pressable style={styles.storageAction} onPress={handleExportAllData}>
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
                }}>
                  <Text style={styles.storageActionText}>⬇️</Text>
                </Pressable>
              )}
              {pack.status === 'downloaded' && (
                <Pressable onPress={async () => {
                  await offlinePackService.deletePack(pack.code);
                  setPacks(offlinePackService.getPacks());
                }}>
                  <Text style={[styles.storageActionText, { color: colors.stateError }]}>🗑</Text>
                </Pressable>
              )}
              {pack.status === 'downloading' && (
                <Pressable onPress={async () => {
                  await offlinePackService.cancelDownload(pack.code);
                  setPacks(offlinePackService.getPacks());
                }}>
                  <Text style={styles.storageActionText}>✕</Text>
                </Pressable>
              )}
              {pack.status === 'error' && (
                <Pressable onPress={async () => {
                  await offlinePackService.downloadPack(pack.code);
                  setPacks(offlinePackService.getPacks());
                }}>
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

        {/* About */}
        <SettingsSection title="About">
          <Pressable style={styles.navRow} onPress={() => router.push('/appstore')}>
            <Text style={styles.navRowLabel}>🌪️ About Windy Pro</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          <SettingsRow label="Version" value={`${appVersion} (Build ${buildNumber})`} />
          <SettingsRow label="SDK" value={`Expo SDK ${Constants.expoConfig?.sdkVersion || '52'}`} />
          <Pressable style={styles.navRow} onPress={() => router.push('/legal/privacy')}>
            <Text style={styles.navRowLabel}>Privacy Policy</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          <Pressable style={styles.navRow} onPress={() => router.push('/legal/terms')}>
            <Text style={styles.navRowLabel}>Terms of Service</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </SettingsSection>

        {/* Danger Zone */}
        <SettingsSection title="Danger Zone">
          <Pressable style={styles.dangerRow} onPress={handleDeleteAccount}>
            <Text style={styles.dangerText}>🗑 Delete Account & Data</Text>
          </Pressable>
        </SettingsSection>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Made with 🌪️ by Windy Pro</Text>
          <Text style={styles.footerVersion}>v{appVersion} · {Platform.OS}</Text>
        </View>

        <EnginePickerSheet visible={enginePickerVisible} onClose={() => setEnginePickerVisible(false)} />
        <LanguagePickerSheet visible={languagePickerVisible} onClose={() => setLanguagePickerVisible(false)} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

function SettingsRow({ label, value, valueColor, chevron }: {
  label: string; value?: string; valueColor?: string; chevron?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {value !== undefined && <Text style={[styles.rowValue, valueColor ? { color: valueColor } : undefined]}>{value}</Text>}
      {chevron && <Text style={styles.chevron}>›</Text>}
    </View>
  );
}

function SettingsToggle({ label, subtitle, value, onToggle }: {
  label: string; subtitle?: string; value: boolean; onToggle: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLabelContainer}>
        <Text style={styles.rowLabel}>{label}</Text>
        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      <Switch value={value} onValueChange={onToggle} trackColor={{ false: colors.surfaceLight, true: colors.accent }} thumbColor={colors.textPrimary} />
    </View>
  );
}

function formatTier(tier: string): string {
  return { pro: 'Pro', translate: 'Translate', translate_pro: 'Translate Pro' }[tier] || tier;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.screenPadding, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm, paddingLeft: spacing.xs },
  sectionContent: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md - 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight, minHeight: 48 },
  rowLabelContainer: { flex: 1 },
  rowLabel: { fontSize: 15, color: colors.textPrimary },
  rowSubtitle: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  rowValue: { fontSize: 15, color: colors.textSecondary },
  chevron: { fontSize: 20, color: colors.textTertiary, fontWeight: '300' },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md - 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight, minHeight: 48 },
  navRowLabel: { fontSize: 15, color: colors.textPrimary },
  upgradeButton: { backgroundColor: colors.accent, margin: spacing.sm, paddingVertical: spacing.sm + 2, borderRadius: borderRadius.md, alignItems: 'center' },
  upgradeText: { fontSize: 15, fontWeight: '600', color: colors.background },

  // Theme toggle
  themeRow: { flexDirection: 'row', gap: spacing.xs, padding: spacing.sm },
  themeBtn: {
    flex: 1.0, paddingVertical: spacing.sm, alignItems: 'center',
    borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.borderLight,
  },
  themeBtnActive: { borderColor: colors.accent, backgroundColor: 'rgba(163, 230, 53, 0.1)' },
  themeBtnText: { fontSize: 13, color: colors.textTertiary },
  themeBtnTextActive: { color: colors.accent, fontWeight: '600' },

  // Storage actions
  storageAction: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight,
  },
  storageActionText: { fontSize: 14, color: colors.accent, fontWeight: '500' },

  // Language pack progress
  packProgress: { height: 3, backgroundColor: colors.surfaceLight, borderRadius: 2, marginTop: 4, overflow: 'hidden' },
  packProgressFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 2 },

  // Danger zone
  dangerRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, alignItems: 'center' },
  dangerText: { fontSize: 15, fontWeight: '600', color: colors.stateError },

  footer: { alignItems: 'center', paddingVertical: spacing.xl },
  footerText: { fontSize: 13, color: colors.textTertiary },
  footerVersion: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
});
