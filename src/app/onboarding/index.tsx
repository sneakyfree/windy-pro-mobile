/**
 * 🧬 RP-4.1 — Onboarding Flow
 * 3-screen onboarding: Welcome → Permissions → Engine Setup
 */
import { View, Text, StyleSheet, Pressable, Platform, Alert } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import { Camera } from 'expo-camera';
import { colors, spacing, borderRadius } from '@/theme';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { detectDeviceProfile, getWindyTuneRecommendation } from '@/services/windy-tune';
import { feedbackService } from '@/services/feedback';
import type { WindyTuneResult } from '@/types';

type Step = 'welcome' | 'permissions' | 'engine';

export default function OnboardingScreen() {
    const router = useRouter();
    const { setOnboardingComplete, setSelectedEngine } = useSettingsStore();
    const [step, setStep] = useState<Step>('welcome');
    const [micGranted, setMicGranted] = useState(false);
    const [windyTune, setWindyTune] = useState<WindyTuneResult | null>(null);

    const handleNext = async () => {
        await feedbackService.tap();

        if (step === 'welcome') {
            setStep('permissions');
        } else if (step === 'permissions') {
            // Run WindyTune
            try {
                const profile = await detectDeviceProfile();
                const result = getWindyTuneRecommendation(profile);
                setWindyTune(result);
            } catch (err) {
                console.warn('[Onboarding] WindyTune failed:', err);
            }
            setStep('engine');
        } else if (step === 'engine') {
            setOnboardingComplete(true);
            await feedbackService.success();
            router.replace('/(tabs)');
        }
    };

    const requestMicrophone = async () => {
        const { status } = await Audio.requestPermissionsAsync();
        setMicGranted(status === 'granted');
        if (status !== 'granted') {
            Alert.alert(
                'Microphone Required',
                'Windy Pro needs microphone access to convert your speech to text.'
            );
        }
        await feedbackService.tap();
    };

    const requestCamera = async () => {
        await Camera.requestCameraPermissionsAsync();
        await feedbackService.tap();
    };

    // --- STEP 1: Welcome ---
    if (step === 'welcome') {
        return (
            <View style={styles.container}>
                <View style={styles.centerContent}>
                    <Text style={styles.tornado}>🌪️</Text>
                    <Text style={styles.title}>Welcome to Windy Pro</Text>
                    <Text style={styles.subtitle}>Voice to Text, Your Way</Text>
                    <Text style={styles.description}>
                        The world's most potent, simplified voice-to-text tool.{'\n'}
                        Tap one button. Talk. Get polished text.
                    </Text>
                </View>
                <Pressable style={styles.primaryButton} onPress={handleNext}>
                    <Text style={styles.primaryButtonText}>Get Started →</Text>
                </Pressable>
            </View>
        );
    }

    // --- STEP 2: Permissions ---
    if (step === 'permissions') {
        return (
            <View style={styles.container}>
                <View style={styles.centerContent}>
                    <Text style={styles.stepTitle}>Permissions</Text>
                    <Text style={styles.stepSubtitle}>
                        Windy Pro processes audio on your device.{'\n'}Nothing is sent to the cloud without your permission.
                    </Text>

                    <Pressable
                        style={[styles.permissionCard, micGranted && styles.permissionGranted]}
                        onPress={requestMicrophone}
                    >
                        <Text style={styles.permissionEmoji}>🎤</Text>
                        <View style={styles.permissionTextCol}>
                            <Text style={styles.permissionLabel}>Microphone</Text>
                            <Text style={styles.permissionDesc}>Required for voice-to-text</Text>
                        </View>
                        <Text style={styles.permissionStatus}>
                            {micGranted ? '✅' : 'Grant'}
                        </Text>
                    </Pressable>

                    <Pressable style={styles.permissionCard} onPress={requestCamera}>
                        <Text style={styles.permissionEmoji}>📹</Text>
                        <View style={styles.permissionTextCol}>
                            <Text style={styles.permissionLabel}>Camera</Text>
                            <Text style={styles.permissionDesc}>Optional — for video + OCR</Text>
                        </View>
                        <Text style={styles.permissionStatus}>Optional</Text>
                    </Pressable>
                </View>

                <Pressable
                    style={[styles.primaryButton, !micGranted && styles.buttonDisabled]}
                    onPress={micGranted ? handleNext : requestMicrophone}
                >
                    <Text style={styles.primaryButtonText}>
                        {micGranted ? 'Continue →' : 'Grant Microphone to Continue'}
                    </Text>
                </Pressable>
            </View>
        );
    }

    // --- STEP 3: Engine ---
    return (
        <View style={styles.container}>
            <View style={styles.centerContent}>
                <Text style={styles.stepTitle}>Your Voice Engine</Text>

                {windyTune ? (
                    <>
                        <View style={styles.engineCard}>
                            <Text style={styles.engineEmoji}>⚡</Text>
                            <Text style={styles.engineName}>
                                WindyTune recommends: {windyTune.recommendedEngine}
                            </Text>
                            <Text style={styles.engineReason}>{windyTune.reason}</Text>
                        </View>

                        <View style={styles.deviceCard}>
                            <Text style={styles.deviceTitle}>Your Device</Text>
                            <Text style={styles.deviceInfo}>
                                {windyTune.deviceProfile.model} •{' '}
                                {windyTune.deviceProfile.platform === 'ios' ? 'iOS' : 'Android'}{' '}
                                {windyTune.deviceProfile.osVersion}
                            </Text>
                            <Text style={styles.deviceInfo}>
                                {windyTune.deviceProfile.totalRam} MB RAM
                                {windyTune.deviceProfile.hasNeuralEngine ? ' • Neural Engine' : ''}
                                {windyTune.deviceProfile.hasNPU ? ' • NPU' : ''}
                            </Text>
                        </View>
                    </>
                ) : (
                    <View style={styles.engineCard}>
                        <Text style={styles.engineEmoji}>☁️</Text>
                        <Text style={styles.engineName}>Cloud Processing</Text>
                        <Text style={styles.engineReason}>
                            Using cloud transcription — works great on any device
                        </Text>
                    </View>
                )}

                <Text style={styles.engineNote}>
                    You can change your engine anytime in Settings
                </Text>
            </View>

            <Pressable style={styles.primaryButton} onPress={handleNext}>
                <Text style={styles.primaryButtonText}>Start Recording →</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1, backgroundColor: colors.background,
        paddingHorizontal: spacing.screenPadding,
        paddingTop: Platform.OS === 'ios' ? 80 : 60,
        paddingBottom: Platform.OS === 'ios' ? 50 : 30,
    },
    centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    tornado: { fontSize: 80, marginBottom: spacing.lg },
    title: { fontSize: 28, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    subtitle: { fontSize: 18, color: colors.accent, marginTop: spacing.sm, fontWeight: '500' },
    description: {
        fontSize: 16, color: colors.textSecondary, textAlign: 'center',
        marginTop: spacing.lg, lineHeight: 24, paddingHorizontal: spacing.md,
    },

    stepTitle: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
    stepSubtitle: {
        fontSize: 15, color: colors.textSecondary, textAlign: 'center',
        marginBottom: spacing.xl, lineHeight: 22,
    },

    permissionCard: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
        borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.sm,
        width: '100%', gap: spacing.md, borderWidth: 1, borderColor: colors.borderLight,
    },
    permissionGranted: { borderColor: colors.accent, backgroundColor: colors.accentTransparent },
    permissionEmoji: { fontSize: 28 },
    permissionTextCol: { flex: 1 },
    permissionLabel: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
    permissionDesc: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    permissionStatus: { fontSize: 14, color: colors.accent, fontWeight: '500' },

    engineCard: {
        backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg,
        alignItems: 'center', width: '100%', marginBottom: spacing.md,
        borderWidth: 1, borderColor: colors.accent,
    },
    engineEmoji: { fontSize: 40, marginBottom: spacing.sm },
    engineName: { fontSize: 18, fontWeight: '600', color: colors.textPrimary, textAlign: 'center' },
    engineReason: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, lineHeight: 20 },

    deviceCard: {
        backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md,
        width: '100%', marginBottom: spacing.md,
    },
    deviceTitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
    deviceInfo: { fontSize: 14, color: colors.textPrimary, marginTop: spacing.xs },

    engineNote: { fontSize: 13, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.md },

    primaryButton: {
        backgroundColor: colors.accent, borderRadius: borderRadius.lg, paddingVertical: spacing.md,
        alignItems: 'center',
    },
    primaryButtonText: { fontSize: 17, fontWeight: '600', color: colors.background },
    buttonDisabled: { opacity: 0.5 },
});
