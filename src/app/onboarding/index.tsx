/**
 * 🧬 RP-4.1 — Onboarding Flow (Enhanced)
 * 3 swipeable screens: Welcome → Permissions → Engine Setup
 * Animated transitions, dot indicators, beautiful dark design
 */
import { View, Text, StyleSheet, Pressable, Platform, Alert, FlatList, Animated, Dimensions, NativeModules, type ListRenderItemInfo, type ViewToken } from 'react-native';
import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import { Camera } from 'expo-camera';
import { colors, spacing, borderRadius, fontSizes } from '@/theme';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { detectDeviceProfile, getWindyTuneRecommendation } from '@/services/windy-tune';
import { feedbackService } from '@/services/feedback';
import { analyticsService } from '@/services/analytics';
import type { WindyTuneResult } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OnboardingSlide {
    key: string;
    emoji: string;
    title: string;
    subtitle: string;
    description: string;
}

const SLIDES: OnboardingSlide[] = [
    {
        key: 'welcome',
        emoji: '🌪️',
        title: 'Windy Word',
        subtitle: 'Your voice, unlimited',
        description: 'Tap one button. Speak. Get polished text.\nIn any app, any language, anywhere.',
    },
    {
        key: 'permissions',
        emoji: '🎤',
        title: 'Microphone Access',
        subtitle: 'So we can hear you',
        description: 'Your voice is processed on-device by default.\nNothing leaves your phone without your permission.',
    },
    {
        key: 'voicetest',
        emoji: '🗣️',
        title: 'Quick Voice Test',
        subtitle: 'Say something — anything!',
        description: 'Let\'s make sure everything works.\nTap the button below and say "Hello".',
    },
    {
        key: 'account',
        emoji: '👤',
        title: 'Your Account',
        subtitle: 'Sign in to unlock everything',
        description: 'Cloud sync, chat, translation pairs,\nand your Windy Fly AI agent.',
    },
    {
        key: 'ready',
        emoji: '⚡',
        title: 'You\'re Ready!',
        subtitle: 'Start recording right now',
        description: 'Your voice engine is configured.\nYou can change settings anytime.',
    },
];

export default function OnboardingScreen() {
    const router = useRouter();
    const { setOnboardingComplete, setSelectedEngine } = useSettingsStore();
    const [currentIndex, setCurrentIndex] = useState(0);
    const [micGranted, setMicGranted] = useState(false);
    const [overlayGranted, setOverlayGranted] = useState(false);
    const [accessibilityEnabled, setAccessibilityEnabled] = useState(false);
    const [windyTune, setWindyTune] = useState<WindyTuneResult | null>(null);
    const [voiceTestResult, setVoiceTestResult] = useState<string | null>(null);
    const [voiceTestRecording, setVoiceTestRecording] = useState(false);
    const [voiceTestTranscribing, setVoiceTestTranscribing] = useState(false);
    const flatListRef = useRef<FlatList>(null);
    const scrollX = useRef(new Animated.Value(0)).current;

    const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
        if (viewableItems.length > 0 && viewableItems[0].index !== null) {
            setCurrentIndex(viewableItems[0].index);
        }
    }).current;

    const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

    const requestMicrophone = async () => {
        const { status } = await Audio.requestPermissionsAsync();
        setMicGranted(status === 'granted');
        if (status !== 'granted') {
            Alert.alert(
                'Microphone Required',
                'Windy Pro needs microphone access to convert your speech to text.'
            );
        }
        feedbackService.tap().catch(() => { });
    };

    const handleVoiceTest = async () => {
        if (voiceTestRecording) {
            // Stop recording and transcribe
            setVoiceTestRecording(false);
            setVoiceTestTranscribing(true);
            try {
                const { audioCapture } = require('@/services/audio-capture');
                const result = await audioCapture.stopRecording();
                if (result?.uri) {
                    const { transcriptionService } = require('@/services/transcription');
                    const segments = await transcriptionService.transcribeFile(result.uri);
                    const text = segments.map((s: any) => s.text).join(' ').trim();
                    setVoiceTestResult(text || 'No speech detected — try again');
                }
            } catch {
                setVoiceTestResult('Transcription unavailable — you can set it up later');
            }
            setVoiceTestTranscribing(false);
        } else {
            // Start recording
            try {
                const { audioCapture } = require('@/services/audio-capture');
                await audioCapture.startRecording(`voice-test-${Date.now()}`, { maxDuration: 10 });
                setVoiceTestRecording(true);
                setVoiceTestResult(null);
                feedbackService.tap().catch(() => { });
            } catch {
                setVoiceTestResult('Could not access microphone');
            }
        }
    };

    const handleSignIn = () => {
        const { router: r } = require('expo-router');
        r.push('/auth/login');
    };

    const handleNext = async () => {
        feedbackService.tap().catch(() => { });

        if (currentIndex < SLIDES.length - 1) {
            // On permissions page, run WindyTune before advancing
            if (currentIndex === 1) {
                try {
                    const profile = await detectDeviceProfile();
                    const result = getWindyTuneRecommendation(profile);
                    setWindyTune(result);
                } catch (err) { console.warn("[Onboarding] Fallback to cloud:", err); }
            }
            flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
        } else {
            // Final step — complete onboarding
            setOnboardingComplete(true);
            analyticsService.trackScreenView('onboarding_complete');
            feedbackService.success().catch(() => { });

            // Check if user has a Windy Fly agent
            try {
                const { useSettingsStore: store } = require('@/stores/useSettingsStore');
                const eco = store.getState().ecosystemStatus;
                const flyProduct = eco?.products?.windy_fly;
                if (flyProduct?.status === 'active' && flyProduct?.room_id) {
                    Alert.alert(
                        `${flyProduct.agent_name || 'Your agent'} is waiting!`,
                        'Your Windy Fly AI agent is ready in Chat. Say hello!',
                        [
                            { text: 'Later', style: 'cancel', onPress: () => router.replace('/(tabs)') },
                            { text: 'Say Hello', onPress: () => {
                                router.replace('/(tabs)');
                                setTimeout(() => router.push(`/chat/${flyProduct.room_id}`), 300);
                            }},
                        ]
                    );
                    return;
                }
            } catch { /* ignore — ecosystem not loaded yet */ }

            router.replace('/(tabs)');
        }
    };

    const getButtonText = () => {
        switch (SLIDES[currentIndex]?.key) {
            case 'welcome': return 'Get Started →';
            case 'permissions': return micGranted ? 'Continue →' : 'Grant Microphone';
            case 'voicetest': return voiceTestResult ? 'Continue →' : 'Skip Voice Test →';
            case 'account': return 'Continue →';
            case 'ready': return 'Start Recording →';
            default: return 'Continue →';
        }
    };

    const renderSlide = useCallback(({ item, index }: ListRenderItemInfo<OnboardingSlide>) => {
        return (
            <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
                <View style={styles.centerContent}>
                    {/* Animated emoji */}
                    <Text style={styles.emoji}>{item.emoji}</Text>
                    <Text style={styles.title}>{item.title}</Text>
                    <Text style={styles.subtitle}>{item.subtitle}</Text>
                    <Text style={styles.description}>{item.description}</Text>

                    {/* Permissions cards on slide 2 */}
                    {index === 1 && (
                        <View style={styles.permissionsContainer}>
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

                            <Pressable style={styles.permissionCard} onPress={async () => {
                                await Camera.requestCameraPermissionsAsync();
                                feedbackService.tap().catch(() => { });
                            }}>
                                <Text style={styles.permissionEmoji}>📷</Text>
                                <View style={styles.permissionTextCol}>
                                    <Text style={styles.permissionLabel}>Camera</Text>
                                    <Text style={styles.permissionDesc}>Optional — for OCR translation</Text>
                                </View>
                                <Text style={styles.permissionStatus}>Optional</Text>
                            </Pressable>

                            {/* Android: Floating Overlay Permission */}
                            {Platform.OS === 'android' && (
                                <Pressable
                                    style={[styles.permissionCard, overlayGranted && styles.permissionGranted]}
                                    onPress={async () => {
                                        try {
                                            const { WindyOverlay } = NativeModules;
                                            if (WindyOverlay) {
                                                const perms = await WindyOverlay.checkPermissions();
                                                if (perms?.canDrawOverlays) {
                                                    setOverlayGranted(true);
                                                } else {
                                                    await WindyOverlay.requestOverlayPermission();
                                                    // Re-check after user returns from settings
                                                    const updated = await WindyOverlay.checkPermissions();
                                                    if (updated?.canDrawOverlays) setOverlayGranted(true);
                                                }
                                            }
                                        } catch (err) { console.warn("[Onboarding] Module not available:", err); }
                                        feedbackService.tap().catch(() => { });
                                    }}
                                >
                                    <Text style={styles.permissionEmoji}>🌪️</Text>
                                    <View style={styles.permissionTextCol}>
                                        <Text style={styles.permissionLabel}>Floating Button</Text>
                                        <Text style={styles.permissionDesc}>Record from any app</Text>
                                    </View>
                                    <Text style={styles.permissionStatus}>
                                        {overlayGranted ? '✅' : 'Grant'}
                                    </Text>
                                </Pressable>
                            )}

                            {/* Android: Accessibility Service */}
                            {Platform.OS === 'android' && (
                                <Pressable
                                    style={[styles.permissionCard, accessibilityEnabled && styles.permissionGranted]}
                                    onPress={async () => {
                                        try {
                                            const { WindyOverlay } = NativeModules;
                                            if (WindyOverlay) {
                                                const perms = await WindyOverlay.checkPermissions();
                                                if (perms?.accessibilityEnabled) {
                                                    setAccessibilityEnabled(true);
                                                } else {
                                                    WindyOverlay.openAccessibilitySettings();
                                                    Alert.alert(
                                                        'Enable Windy Pro',
                                                        'Find "Windy Pro" in the list and enable it to paste text at your cursor.',
                                                    );
                                                }
                                            }
                                        } catch (err) { console.warn("[Onboarding] Module not available:", err); }
                                        feedbackService.tap().catch(() => { });
                                    }}
                                >
                                    <Text style={styles.permissionEmoji}>📋</Text>
                                    <View style={styles.permissionTextCol}>
                                        <Text style={styles.permissionLabel}>Paste at Cursor</Text>
                                        <Text style={styles.permissionDesc}>Optional — auto-paste transcripts</Text>
                                    </View>
                                    <Text style={styles.permissionStatus}>
                                        {accessibilityEnabled ? '✅' : 'Optional'}
                                    </Text>
                                </Pressable>
                            )}
                        </View>
                    )}

                    {/* Voice test on slide 3 */}
                    {item.key === 'voicetest' && (
                        <View style={styles.permissionsContainer}>
                            <Pressable
                                style={[
                                    styles.permissionCard,
                                    voiceTestRecording && { borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)' },
                                    voiceTestResult && styles.permissionGranted,
                                ]}
                                onPress={handleVoiceTest}
                                disabled={voiceTestTranscribing}
                            >
                                <Text style={styles.permissionEmoji}>
                                    {voiceTestTranscribing ? '⏳' : voiceTestRecording ? '⏹' : voiceTestResult ? '✅' : '🎤'}
                                </Text>
                                <View style={styles.permissionTextCol}>
                                    <Text style={styles.permissionLabel}>
                                        {voiceTestTranscribing ? 'Transcribing...' :
                                         voiceTestRecording ? 'Listening... tap to stop' :
                                         voiceTestResult ? 'Voice test complete!' : 'Tap to record'}
                                    </Text>
                                    {voiceTestResult && (
                                        <Text style={[styles.permissionDesc, { color: colors.accent }]}>
                                            "{voiceTestResult}"
                                        </Text>
                                    )}
                                    {!voiceTestResult && !voiceTestRecording && !voiceTestTranscribing && (
                                        <Text style={styles.permissionDesc}>Say "Hello" or anything you like</Text>
                                    )}
                                </View>
                            </Pressable>
                        </View>
                    )}

                    {/* Sign in on slide 4 */}
                    {item.key === 'account' && (
                        <View style={styles.permissionsContainer}>
                            <Pressable style={styles.permissionCard} onPress={handleSignIn}>
                                <Text style={styles.permissionEmoji}>🔑</Text>
                                <View style={styles.permissionTextCol}>
                                    <Text style={styles.permissionLabel}>Sign In</Text>
                                    <Text style={styles.permissionDesc}>Already have a Windy account</Text>
                                </View>
                                <Text style={styles.permissionStatus}>→</Text>
                            </Pressable>
                            <Pressable style={styles.permissionCard} onPress={() => {
                                const { router: r } = require('expo-router');
                                r.push('/auth/register');
                            }}>
                                <Text style={styles.permissionEmoji}>✨</Text>
                                <View style={styles.permissionTextCol}>
                                    <Text style={styles.permissionLabel}>Create Account</Text>
                                    <Text style={styles.permissionDesc}>Free — unlock cloud sync, chat, and more</Text>
                                </View>
                                <Text style={styles.permissionStatus}>→</Text>
                            </Pressable>
                            <Text style={[styles.description, { fontSize: 13, marginTop: 12 }]}>
                                You can also skip and create an account later.
                            </Text>
                        </View>
                    )}

                    {/* Engine info on final slide */}
                    {item.key === 'ready' && windyTune && (
                        <View style={styles.engineCard}>
                            <Text style={styles.engineName}>
                                WindyTune recommends: {windyTune.recommendedEngine}
                            </Text>
                            <Text style={styles.engineReason}>{windyTune.reason}</Text>
                        </View>
                    )}
                </View>
            </View>
        );
    }, [micGranted, windyTune, overlayGranted, accessibilityEnabled, voiceTestResult, voiceTestRecording, voiceTestTranscribing]);

    return (
        <ScreenErrorBoundary screenName="Onboarding">
            <View style={styles.container}>
                <FlatList
                    ref={flatListRef}
                    data={SLIDES}
                    renderItem={renderSlide}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onScroll={Animated.event(
                        [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                        { useNativeDriver: false }
                    )}
                    onViewableItemsChanged={onViewableItemsChanged}
                    viewabilityConfig={viewabilityConfig}
                    scrollEnabled={SLIDES[currentIndex]?.key !== 'permissions' || micGranted}
                    keyExtractor={(item) => item.key}
                />

                {/* Dot indicators */}
                <View style={styles.dotRow}>
                    {SLIDES.map((_, i) => {
                        const inputRange = [(i - 1) * SCREEN_WIDTH, i * SCREEN_WIDTH, (i + 1) * SCREEN_WIDTH];
                        const dotWidth = scrollX.interpolate({
                            inputRange,
                            outputRange: [8, 24, 8],
                            extrapolate: 'clamp',
                        });
                        const dotOpacity = scrollX.interpolate({
                            inputRange,
                            outputRange: [0.3, 1, 0.3],
                            extrapolate: 'clamp',
                        });
                        return (
                            <Animated.View
                                key={i}
                                style={[styles.dot, { width: dotWidth, opacity: dotOpacity }]}
                            />
                        );
                    })}
                </View>

                {/* Bottom button */}
                <View style={styles.bottomSection}>
                    <Pressable
                        style={[
                            styles.primaryButton,
                            SLIDES[currentIndex]?.key === 'permissions' && !micGranted && styles.buttonDisabled,
                        ]}
                        onPress={SLIDES[currentIndex]?.key === 'permissions' && !micGranted ? requestMicrophone : handleNext}
                        accessibilityLabel={getButtonText()}
                        accessibilityRole="button"
                    >
                        <Text style={styles.primaryButtonText}>{getButtonText()}</Text>
                    </Pressable>

                    {(SLIDES[currentIndex]?.key === 'permissions' || SLIDES[currentIndex]?.key === 'account' || SLIDES[currentIndex]?.key === 'voicetest') && (
                        <Pressable onPress={handleNext} style={styles.skipButton}
                            accessibilityLabel="Skip this step"
                            accessibilityRole="button"
                        >
                            <Text style={styles.skipText}>Skip for now</Text>
                        </Pressable>
                    )}
                </View>
            </View>
        </ScreenErrorBoundary>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    slide: {
        flex: 1,
        paddingHorizontal: spacing.screenPadding,
        paddingTop: Platform.OS === 'ios' ? 80 : 60,
    },
    centerContent: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },

    emoji: {
        fontSize: 80,
        marginBottom: spacing.lg,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: colors.textPrimary,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: fontSizes.lg,
        color: colors.accent,
        marginTop: spacing.sm,
        fontWeight: '500',
    },
    description: {
        fontSize: fontSizes.base,
        color: colors.textSecondary,
        textAlign: 'center',
        marginTop: spacing.lg,
        lineHeight: 24,
        paddingHorizontal: spacing.md,
    },

    // Permissions
    permissionsContainer: {
        width: '100%',
        marginTop: spacing.xl,
        gap: spacing.sm,
    },
    permissionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        gap: spacing.md,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    permissionGranted: {
        borderColor: colors.accent,
        backgroundColor: colors.accentTransparent,
    },
    permissionEmoji: { fontSize: 28 },
    permissionTextCol: { flex: 1 },
    permissionLabel: { fontSize: fontSizes.base, fontWeight: '600', color: colors.textPrimary },
    permissionDesc: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    permissionStatus: { fontSize: fontSizes.sm, color: colors.accent, fontWeight: '500' },

    // Engine
    engineCard: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.lg,
        alignItems: 'center',
        width: '100%',
        marginTop: spacing.xl,
        borderWidth: 1,
        borderColor: colors.accent,
    },
    engineName: {
        fontSize: fontSizes.base,
        fontWeight: '600',
        color: colors.textPrimary,
        textAlign: 'center',
    },
    engineReason: {
        fontSize: fontSizes.sm,
        color: colors.textSecondary,
        textAlign: 'center',
        marginTop: spacing.sm,
        lineHeight: 20,
    },

    // Dots
    dotRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
        paddingVertical: spacing.md,
    },
    dot: {
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.accent,
    },

    // Bottom
    bottomSection: {
        paddingHorizontal: spacing.screenPadding,
        paddingBottom: Platform.OS === 'ios' ? 50 : 30,
    },
    primaryButton: {
        backgroundColor: colors.accent,
        borderRadius: borderRadius.lg,
        paddingVertical: spacing.md,
        alignItems: 'center',
    },
    primaryButtonText: {
        fontSize: 17,
        fontWeight: '600',
        color: colors.background,
    },
    buttonDisabled: { opacity: 0.5 },
    skipButton: {
        alignItems: 'center',
        paddingVertical: spacing.sm,
        marginTop: spacing.sm,
    },
    skipText: {
        fontSize: fontSizes.sm,
        color: colors.textTertiary,
    },
});
