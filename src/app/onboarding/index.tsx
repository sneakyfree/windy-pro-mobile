/**
 * 🧬 RP-4.1 — Onboarding Flow (Enhanced)
 * 3 swipeable screens: Welcome → Permissions → Engine Setup
 * Animated transitions, dot indicators, beautiful dark design
 */
import { View, Text, StyleSheet, Pressable, Platform, Alert, FlatList, Animated, Dimensions, type ListRenderItemInfo, type ViewToken } from 'react-native';
import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import { Camera } from 'expo-camera';
import { colors, spacing, borderRadius } from '@/theme';
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
        title: 'Welcome to Windy Pro',
        subtitle: 'Voice to Text, Your Way',
        description: 'The world\'s most potent, simplified voice-to-text tool.\nTap one button. Talk. Get polished text.',
    },
    {
        key: 'permissions',
        emoji: '🎤',
        title: 'Quick Setup',
        subtitle: 'We need a few permissions',
        description: 'Windy Pro processes audio on your device.\nNothing is sent to the cloud without your permission.',
    },
    {
        key: 'engine',
        emoji: '⚡',
        title: 'Ready to Go',
        subtitle: 'Your voice engine is configured',
        description: 'Start recording right away.\nYou can change your settings anytime.',
    },
];

export default function OnboardingScreen() {
    const router = useRouter();
    const { setOnboardingComplete, setSelectedEngine } = useSettingsStore();
    const [currentIndex, setCurrentIndex] = useState(0);
    const [micGranted, setMicGranted] = useState(false);
    const [windyTune, setWindyTune] = useState<WindyTuneResult | null>(null);
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
        await feedbackService.tap();
    };

    const handleNext = async () => {
        await feedbackService.tap();

        if (currentIndex < SLIDES.length - 1) {
            // On permissions page, run WindyTune before advancing
            if (currentIndex === 1) {
                try {
                    const profile = await detectDeviceProfile();
                    const result = getWindyTuneRecommendation(profile);
                    setWindyTune(result);
                } catch { /* fallback to cloud */ }
            }
            flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
        } else {
            // Final step — complete onboarding
            setOnboardingComplete(true);
            analyticsService.trackScreenView('onboarding_complete');
            await feedbackService.success();
            router.replace('/(tabs)');
        }
    };

    const getButtonText = () => {
        if (currentIndex === 0) return 'Get Started →';
        if (currentIndex === 1) return micGranted ? 'Continue →' : 'Grant Microphone to Continue';
        return 'Start Recording →';
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
                                await feedbackService.tap();
                            }}>
                                <Text style={styles.permissionEmoji}>📷</Text>
                                <View style={styles.permissionTextCol}>
                                    <Text style={styles.permissionLabel}>Camera</Text>
                                    <Text style={styles.permissionDesc}>Optional — for OCR translation</Text>
                                </View>
                                <Text style={styles.permissionStatus}>Optional</Text>
                            </Pressable>
                        </View>
                    )}

                    {/* Engine info on slide 3 */}
                    {index === 2 && windyTune && (
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
    }, [micGranted, windyTune]);

    return (
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
                scrollEnabled={currentIndex !== 1 || micGranted}
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
                        currentIndex === 1 && !micGranted && styles.buttonDisabled,
                    ]}
                    onPress={currentIndex === 1 && !micGranted ? requestMicrophone : handleNext}
                >
                    <Text style={styles.primaryButtonText}>{getButtonText()}</Text>
                </Pressable>

                {currentIndex === 1 && (
                    <Pressable onPress={handleNext} style={styles.skipButton}>
                        <Text style={styles.skipText}>Skip for now</Text>
                    </Pressable>
                )}
            </View>
        </View>
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
        fontSize: 18,
        color: colors.accent,
        marginTop: spacing.sm,
        fontWeight: '500',
    },
    description: {
        fontSize: 16,
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
    permissionLabel: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
    permissionDesc: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    permissionStatus: { fontSize: 14, color: colors.accent, fontWeight: '500' },

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
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        textAlign: 'center',
    },
    engineReason: {
        fontSize: 14,
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
        fontSize: 14,
        color: colors.textTertiary,
    },
});
