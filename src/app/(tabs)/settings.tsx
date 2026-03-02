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
import * as Linking from 'expo-linking';
import { colors, spacing, borderRadius } from '@/theme';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { localStorageService } from '@/services/storage-local';
import { cloneTracker } from '@/services/clone-tracker';
import { licenseService } from '@/services/license';
import { feedbackService } from '@/services/feedback';
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

  return (
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
        <SettingsRow label="Version" value="0.1.0 (Build 1)" />
        <Pressable style={styles.navRow} onPress={() => router.push('/legal/privacy')}>
          <Text style={styles.navRowLabel}>Privacy Policy</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Pressable style={styles.navRow} onPress={() => router.push('/legal/terms')}>
          <Text style={styles.navRowLabel}>Terms of Service</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </SettingsSection>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Made with 🌪️ by Windy Pro</Text>
      </View>

      <EnginePickerSheet visible={enginePickerVisible} onClose={() => setEnginePickerVisible(false)} />
      <LanguagePickerSheet visible={languagePickerVisible} onClose={() => setLanguagePickerVisible(false)} />
    </ScrollView>
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
  footer: { alignItems: 'center', paddingVertical: spacing.xl },
  footerText: { fontSize: 13, color: colors.textTertiary },
});
