/**
 * 🧬 M13 — App Store Metadata Screen
 * Screenshots carousel, What's New changelog, Rate This App, share deep link
 */
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert, Share, Animated, Dimensions } from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { colors, spacing, borderRadius, fontSizes } from '@/theme';
import { feedbackService } from '@/services/feedback';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - spacing.screenPadding * 2;

// ── Changelog data ──
const CHANGELOG = [
    {
        version: '1.0.0',
        date: '2026-03-02',
        title: '🚀 Launch Release',
        changes: [
            '🎤 One-tap voice recording with real-time waveform',
            '🧠 Multi-engine transcription (cloud + on-device)',
            '🌐 Live translation across 15 languages',
            '🧬 Voice clone data collection pipeline',
            '📹 Video recording mode with camera preview',
            '💳 Flexible pricing tiers (Free / Pro / Translate / Translate Pro)',
            '☁️ Cloud sync & cross-device session history',
            '🔒 Privacy-first: all processing on device by default',
        ],
    },
    {
        version: '0.9.0',
        date: '2026-02-28',
        title: '🔧 Beta Hardening',
        changes: [
            '✅ Full test suite (78 tests across 4 suites)',
            '🎵 Windy Tune auto-engine selection',
            '📊 Quality scoring with factor breakdown',
            '🏆 Clone milestone achievements',
        ],
    },
    {
        version: '0.8.0',
        date: '2026-02-20',
        title: '🎯 Core Features',
        changes: [
            '📝 Conversation mode for live translation',
            '🔊 Text-to-speech output',
            '📦 Export to TXT, JSON, and subtitle formats',
            '🗂️ Session history with search and filters',
        ],
    },
];

// ── Screenshots data ──
const SCREENSHOTS = [
    { id: '1', title: 'Record Screen', subtitle: 'Tap to record, real-time waveform', emoji: '🌪️', colors: ['#0f172a', '#a3e635'] },
    { id: '2', title: 'Transcript', subtitle: 'AI-powered voice to text', emoji: '📝', colors: ['#0f172a', '#2dd4bf'] },
    { id: '3', title: 'Clone Dashboard', subtitle: 'Track your voice clone progress', emoji: '🧬', colors: ['#0f172a', '#c084fc'] },
    { id: '4', title: 'Translation', subtitle: '15+ languages, live translate', emoji: '🌐', colors: ['#0f172a', '#eab308'] },
    { id: '5', title: 'Settings', subtitle: 'Engine selection, quality controls', emoji: '⚙️', colors: ['#0f172a', '#94a3b8'] },
];

// ── Rate app smart timing ──
const RATE_STORAGE_KEY = 'windy_rate_prompt';
const SESSIONS_BEFORE_PROMPT = 3;

export default function AppStoreScreen() {
    const router = useRouter();
    const scrollRef = useRef<ScrollView>(null);
    const [activeScreenshot, setActiveScreenshot] = useState(0);
    const [canReview, setCanReview] = useState(false);
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
        }).start();

        // Check if store review is available
        StoreReview.isAvailableAsync().then(setCanReview).catch(() => setCanReview(false));
    }, []);

    // Smart rate prompt — show after 3rd session
    const checkAndPromptRating = useCallback(async () => {
        try {
            const data = await AsyncStorage.getItem(RATE_STORAGE_KEY);
            const rateData = data ? JSON.parse(data) : { prompted: false, sessions: 0, dismissed: 0 };

            if (rateData.prompted && rateData.dismissed < 2) {
                // Already prompted, don't nag more than twice
                return false;
            }

            rateData.sessions += 1;
            await AsyncStorage.setItem(RATE_STORAGE_KEY, JSON.stringify(rateData));

            if (rateData.sessions >= SESSIONS_BEFORE_PROMPT && !rateData.prompted) {
                return true; // Should prompt
            }
            return false;
        } catch (err) { console.warn("[AppStore] Error:", err);
            return false;
        }
    }, []);

    const handleRateApp = async () => {
        feedbackService.success().catch(() => { });

        if (canReview) {
            try {
                await StoreReview.requestReview();
                // Mark as prompted
                const data = await AsyncStorage.getItem(RATE_STORAGE_KEY);
                const rateData = data ? JSON.parse(data) : { prompted: false, sessions: 0, dismissed: 0 };
                rateData.prompted = true;
                await AsyncStorage.setItem(RATE_STORAGE_KEY, JSON.stringify(rateData));
            } catch (err) { console.warn("[AppStore] Error:", err);
                // Fallback to store URL
                openStoreUrl();
            }
        } else {
            openStoreUrl();
        }
    };

    const openStoreUrl = () => {
        const storeUrl = Platform.select({
            ios: 'https://apps.apple.com/app/windy-pro/id6759985867',
            android: 'https://play.google.com/store/apps/details?id=uk.thewindstorm.windypro',
            default: 'https://windypro.thewindstorm.uk',
        });
        Linking.openURL(storeUrl);
    };

    const handleShareApp = async () => {
        feedbackService.tap().catch(() => { });
        const deepLink = Linking.createURL('/', { scheme: 'windypro' });
        await Share.share({
            message: `🌪️ Check out Windy Pro — the best voice-to-text app!\n\nDownload: https://windypro.thewindstorm.uk/download\n\n${deepLink}`,
            title: 'Share Windy Pro',
        });
    };

    const handleScreenshotScroll = (event: { nativeEvent: { contentOffset: { x: number } } }) => {
        const offset = event.nativeEvent.contentOffset.x;
        const index = Math.round(offset / (CARD_WIDTH + spacing.sm));
        setActiveScreenshot(Math.max(0, Math.min(SCREENSHOTS.length - 1, index)));
    };

    return (
        <ScreenErrorBoundary screenName="App Store">
            <ScrollView style={styles.container} contentContainerStyle={styles.content}>
                {/* Header */}
                <View style={styles.header}>
                    <Pressable onPress={() => router.back()} style={styles.backBtn}
                        accessibilityLabel="Go back" accessibilityRole="button"
                    >
                        <Text style={styles.backText}>← Back</Text>
                    </Pressable>
                    <Text style={styles.title}>About Windy Pro</Text>
                    <View style={{ width: 40 }} />
                </View>

                {/* App Identity */}
                <Animated.View style={[styles.appIdentity, { opacity: fadeAnim }]}>
                    <View style={styles.appIcon}>
                        <Text style={styles.appIconEmoji}>🌪️</Text>
                    </View>
                    <Text style={styles.appName}>Windy Pro</Text>
                    <Text style={styles.appTagline}>Voice to Text, Your Way</Text>
                    <Text style={styles.appVersion}>Version {CHANGELOG[0].version}</Text>
                </Animated.View>

                {/* Screenshots Carousel */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Screenshots</Text>
                    <ScrollView
                        ref={scrollRef}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        snapToInterval={CARD_WIDTH + spacing.sm}
                        decelerationRate="fast"
                        onMomentumScrollEnd={handleScreenshotScroll}
                        style={styles.carouselScroll}
                        contentContainerStyle={styles.carouselContent}
                    >
                        {SCREENSHOTS.map((shot) => (
                            <View key={shot.id} style={styles.screenshotCard}
                                accessible={true}
                                accessibilityLabel={`Screenshot: ${shot.title}. ${shot.subtitle}`}
                            >
                                <View style={[styles.screenshotPreview, {
                                    backgroundColor: shot.colors[0],
                                    borderColor: shot.colors[1] + '40',
                                }]}>
                                    <Text style={styles.screenshotEmoji}>{shot.emoji}</Text>
                                    <Text style={[styles.screenshotLabel, { color: shot.colors[1] }]}>
                                        {shot.title}
                                    </Text>
                                </View>
                                <Text style={styles.screenshotTitle}>{shot.title}</Text>
                                <Text style={styles.screenshotSubtitle}>{shot.subtitle}</Text>
                            </View>
                        ))}
                    </ScrollView>
                    {/* Dots indicator */}
                    <View style={styles.dotsRow}>
                        {SCREENSHOTS.map((_, i) => (
                            <View
                                key={`dot-${i}`}
                                style={[
                                    styles.dot,
                                    i === activeScreenshot && styles.dotActive,
                                ]}
                            />
                        ))}
                    </View>
                </View>

                {/* What's New */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>What's New</Text>
                    {CHANGELOG.map((release) => (
                        <View key={release.version} style={styles.changelogCard}>
                            <View style={styles.changelogHeader}>
                                <Text style={styles.changelogTitle}>{release.title}</Text>
                                <View style={styles.changelogMeta}>
                                    <Text style={styles.changelogVersion}>v{release.version}</Text>
                                    <Text style={styles.changelogDate}>{release.date}</Text>
                                </View>
                            </View>
                            <View style={styles.changelogList}>
                                {release.changes.map((change, i) => (
                                    <Text key={`${release.version}-${i}`} style={styles.changelogItem}>
                                        {change}
                                    </Text>
                                ))}
                            </View>
                        </View>
                    ))}
                </View>

                {/* Rate This App */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Rate & Share</Text>
                    <View style={styles.rateCard}>
                        <Text style={styles.rateEmoji}>⭐</Text>
                        <View style={styles.rateContent}>
                            <Text style={styles.rateTitle}>Enjoying Windy Pro?</Text>
                            <Text style={styles.rateSubtext}>
                                Rate us on the {Platform.OS === 'ios' ? 'App Store' : 'Play Store'} — it really helps!
                            </Text>
                        </View>
                    </View>
                    <Pressable style={styles.rateCta} onPress={handleRateApp}
                        accessibilityLabel="Rate this app" accessibilityRole="button"
                    >
                        <Text style={styles.rateCtaEmoji}>⭐</Text>
                        <Text style={styles.rateCtaText}>Rate This App</Text>
                    </Pressable>
                </View>

                {/* Share App */}
                <Pressable style={styles.shareButton} onPress={handleShareApp}
                    accessibilityLabel="Share Windy Pro" accessibilityRole="button"
                >
                    <Text style={styles.shareEmoji}>📤</Text>
                    <View style={styles.shareContent}>
                        <Text style={styles.shareTitle}>Share Windy Pro</Text>
                        <Text style={styles.shareSubtext}>Send a download link to friends</Text>
                    </View>
                </Pressable>

                {/* Footer links */}
                <View style={styles.footerLinks}>
                    <Pressable onPress={() => Linking.openURL('https://windypro.thewindstorm.uk')}
                        accessibilityLabel="Visit website" accessibilityRole="link"
                    >
                        <Text style={styles.footerLink}>🌐 Website</Text>
                    </Pressable>
                    <Pressable onPress={() => router.push('/legal/privacy')}>
                        <Text style={styles.footerLink}>🔒 Privacy</Text>
                    </Pressable>
                    <Pressable onPress={() => router.push('/legal/terms')}>
                        <Text style={styles.footerLink}>📋 Terms</Text>
                    </Pressable>
                    <Pressable onPress={() => Linking.openURL('mailto:support@thewindstorm.uk')}
                        accessibilityLabel="Contact support" accessibilityRole="link"
                    >
                        <Text style={styles.footerLink}>✉️ Support</Text>
                    </Pressable>
                </View>

                <View style={styles.footer}>
                    <Text style={styles.footerText}>Made with 🌪️ in England</Text>
                    <Text style={styles.footerCopyright}>© 2026 The Windstorm. All rights reserved.</Text>
                </View>
            </ScrollView>
        </ScreenErrorBoundary>
    );
}

// ── Exported helper for smart rate prompt from anywhere ──
export async function maybePromptRating(): Promise<void> {
    try {
        const data = await AsyncStorage.getItem(RATE_STORAGE_KEY);
        const rateData = data ? JSON.parse(data) : { prompted: false, sessions: 0, dismissed: 0 };

        rateData.sessions += 1;
        await AsyncStorage.setItem(RATE_STORAGE_KEY, JSON.stringify(rateData));

        if (rateData.sessions >= SESSIONS_BEFORE_PROMPT && !rateData.prompted) {
            const available = await StoreReview.isAvailableAsync();
            if (available) {
                await StoreReview.requestReview();
                rateData.prompted = true;
                await AsyncStorage.setItem(RATE_STORAGE_KEY, JSON.stringify(rateData));
            }
        }
    } catch (err) { console.warn("[AppStore] Error:", err);
        // Silent failure — never interrupt the user
    }
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: {
        padding: spacing.screenPadding,
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingBottom: 60,
    },

    // Header
    header: {
        flexDirection: 'row', alignItems: 'center',
        marginBottom: spacing.lg,
    },
    backBtn: { marginRight: spacing.md },
    backText: { fontSize: fontSizes.base, color: colors.accent },
    title: { fontSize: fontSizes.xl, fontWeight: '600', color: colors.textPrimary, flex: 1 },

    // App identity
    appIdentity: { alignItems: 'center', marginBottom: spacing.xl },
    appIcon: {
        width: 80, height: 80, borderRadius: 20,
        backgroundColor: colors.surface,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: colors.borderLight,
        marginBottom: spacing.sm,
        shadowColor: colors.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 5,
    },
    appIconEmoji: { fontSize: 40 },
    appName: { fontSize: fontSizes['2xl'], fontWeight: '700', color: colors.textPrimary },
    appTagline: { fontSize: fontSizes.sm, color: colors.textSecondary, marginTop: 2 },
    appVersion: { fontSize: fontSizes.xs, color: colors.textTertiary, marginTop: spacing.xs },

    // Sections
    section: { marginBottom: spacing.xl },
    sectionTitle: {
        fontSize: fontSizes.xs, fontWeight: '600', color: colors.textSecondary,
        textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm,
    },

    // Screenshots carousel
    carouselScroll: { marginHorizontal: -spacing.screenPadding },
    carouselContent: { paddingHorizontal: spacing.screenPadding, gap: spacing.sm },
    screenshotCard: { width: CARD_WIDTH, marginBottom: spacing.xs },
    screenshotPreview: {
        height: 200, borderRadius: borderRadius.lg,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, gap: spacing.sm,
    },
    screenshotEmoji: { fontSize: 56 },
    screenshotLabel: { fontSize: fontSizes.base, fontWeight: '600' },
    screenshotTitle: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.textPrimary, marginTop: spacing.xs },
    screenshotSubtitle: { fontSize: fontSizes.xs, color: colors.textTertiary },

    // Dots
    dotsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.sm },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surfaceLight },
    dotActive: { backgroundColor: colors.accent, width: 20 },

    // Changelog
    changelogCard: {
        backgroundColor: colors.surface, borderRadius: borderRadius.lg,
        padding: spacing.md, marginBottom: spacing.sm,
    },
    changelogHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
    changelogTitle: { fontSize: fontSizes.base, fontWeight: '600', color: colors.textPrimary, flex: 1 },
    changelogMeta: { alignItems: 'flex-end' },
    changelogVersion: { fontSize: fontSizes.xs, fontWeight: '600', color: colors.accent },
    changelogDate: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
    changelogList: { gap: 4 },
    changelogItem: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },

    // Rate
    rateCard: {
        flexDirection: 'row', gap: spacing.md, alignItems: 'center',
        backgroundColor: colors.surface, borderRadius: borderRadius.lg,
        padding: spacing.md, marginBottom: spacing.sm,
    },
    rateEmoji: { fontSize: 32 },
    rateContent: { flex: 1 },
    rateTitle: { fontSize: fontSizes.base, fontWeight: '600', color: colors.textPrimary },
    rateSubtext: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    rateCta: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: spacing.sm, backgroundColor: '#fbbf24',
        borderRadius: borderRadius.md, paddingVertical: spacing.md,
    },
    rateCtaEmoji: { fontSize: fontSizes.xl },
    rateCtaText: { fontSize: fontSizes.base, fontWeight: '700', color: colors.background },

    // Share
    shareButton: {
        flexDirection: 'row', gap: spacing.md, alignItems: 'center',
        backgroundColor: colors.surface, borderRadius: borderRadius.lg,
        padding: spacing.md, marginBottom: spacing.xl,
        borderWidth: 1, borderColor: colors.borderLight,
    },
    shareEmoji: { fontSize: fontSizes['2xl'] },
    shareContent: { flex: 1 },
    shareTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    shareSubtext: { fontSize: fontSizes.xs, color: colors.textTertiary },

    // Footer links
    footerLinks: {
        flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md,
        justifyContent: 'center', marginBottom: spacing.lg,
    },
    footerLink: { fontSize: 13, color: colors.accent },

    // Footer
    footer: { alignItems: 'center', paddingVertical: spacing.md },
    footerText: { fontSize: 13, color: colors.textTertiary },
    footerCopyright: { fontSize: 11, color: colors.textTertiary, marginTop: 4 },
});
