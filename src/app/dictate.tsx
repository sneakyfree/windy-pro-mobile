/**
 * 🎙️ Quick Dictate — Word-style one-tap dictation (Voice v1).
 *
 * Grandma test: open, tap the big mic, talk, words appear live. Copy the
 * text or hand it to Chat. Uses OS-native speech recognition
 * (dictationService) — no engine download, works on every device.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, ScrollView, Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSizes } from '@/theme';
import { dictationService } from '@/services/dictation';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

export default function QuickDictateScreen() {
    const [listening, setListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const committedRef = useRef('');
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const available = dictationService.isAvailable();

    useEffect(() => {
        if (listening) {
            const loop = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
                ]),
            );
            loop.start();
            return () => loop.stop();
        }
        pulseAnim.setValue(1);
    }, [listening, pulseAnim]);

    // Stop the session if the user leaves the screen mid-dictation.
    useEffect(() => () => { dictationService.abort(); }, []);

    const toggle = useCallback(async () => {
        setError(null);
        if (listening) {
            dictationService.stop();
            return; // onEnd flips the state
        }
        const started = await dictationService.start({
            onPartial: (text) => {
                const base = committedRef.current;
                setTranscript(base ? `${base} ${text}` : text);
            },
            onFinal: (text) => {
                const base = committedRef.current;
                committedRef.current = base ? `${base} ${text}` : text;
                setTranscript(committedRef.current);
            },
            onError: (message) => setError(message),
            onEnd: () => setListening(false),
        });
        if (started) {
            setListening(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        }
    }, [listening]);

    const copyAll = useCallback(async () => {
        if (!transcript) return;
        await Clipboard.setStringAsync(transcript).catch(() => {});
        setCopied(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setTimeout(() => setCopied(false), 1500);
    }, [transcript]);

    const clearAll = useCallback(() => {
        committedRef.current = '';
        setTranscript('');
    }, []);

    return (
        <ScreenErrorBoundary screenName="QuickDictate">
            <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}
                        accessibilityLabel="Go back" accessibilityRole="button">
                        <Text style={styles.backText}>←</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle} accessibilityRole="header">🎙️ Quick Dictate</Text>
                    <View style={styles.backBtn} />
                </View>

                {!available && (
                    <View style={styles.unavailableBox}>
                        <Text style={styles.unavailableText}>
                            Dictation isn't available on this device yet. It uses your
                            phone's built-in speech recognition — check that Siri &
                            Dictation (iOS) or Speech Services (Android) are enabled.
                        </Text>
                    </View>
                )}

                <ScrollView style={styles.transcriptBox} contentContainerStyle={styles.transcriptContent}>
                    <Text style={transcript ? styles.transcriptText : styles.placeholderText}>
                        {transcript || 'Tap the mic and start talking.\nYour words appear here as you speak.'}
                    </Text>
                </ScrollView>

                {error && (
                    <Text style={styles.errorText} accessibilityRole="alert">⚠️ {error}</Text>
                )}

                <View style={styles.controls}>
                    <TouchableOpacity
                        style={[styles.sideButton, !transcript && styles.sideButtonDisabled]}
                        onPress={clearAll}
                        disabled={!transcript}
                        accessibilityLabel="Clear transcript" accessibilityRole="button"
                    >
                        <Text style={styles.sideButtonText}>Clear</Text>
                    </TouchableOpacity>

                    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                        <TouchableOpacity
                            style={[styles.micButton, listening && styles.micButtonActive, !available && styles.micButtonDisabled]}
                            onPress={toggle}
                            disabled={!available}
                            accessibilityLabel={listening ? 'Stop dictation' : 'Start dictation'}
                            accessibilityRole="button"
                        >
                            <Text style={styles.micIcon}>{listening ? '⏹' : '🎙️'}</Text>
                        </TouchableOpacity>
                    </Animated.View>

                    <TouchableOpacity
                        style={[styles.sideButton, !transcript && styles.sideButtonDisabled]}
                        onPress={copyAll}
                        disabled={!transcript}
                        accessibilityLabel="Copy transcript" accessibilityRole="button"
                    >
                        <Text style={styles.sideButtonText}>{copied ? '✓ Copied' : 'Copy'}</Text>
                    </TouchableOpacity>
                </View>

                <Text style={styles.hint}>
                    {listening ? 'Listening… tap ⏹ when you\'re done.' : 'One tap. Talk. Words appear.'}
                </Text>
            </SafeAreaView>
        </ScreenErrorBoundary>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 12, paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    backBtn: { padding: 8, minWidth: 44, minHeight: 44, justifyContent: 'center' },
    backText: { fontSize: 22, color: colors.accent, fontWeight: '600' },
    headerTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },

    unavailableBox: {
        margin: 16, padding: 14, borderRadius: 12,
        backgroundColor: 'rgba(251,191,36,0.12)',
    },
    unavailableText: { fontSize: fontSizes.sm, color: colors.textSecondary, lineHeight: 20 },

    transcriptBox: {
        flex: 1, margin: 16, borderRadius: 16,
        backgroundColor: colors.surface,
    },
    transcriptContent: { padding: 16 },
    transcriptText: { fontSize: 17, lineHeight: 26, color: colors.textPrimary },
    placeholderText: { fontSize: 16, lineHeight: 24, color: colors.textTertiary, textAlign: 'center', marginTop: 40 },

    errorText: { fontSize: fontSizes.sm, color: colors.stateError, textAlign: 'center', paddingHorizontal: 24, paddingBottom: 6 },

    controls: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly',
        paddingVertical: 12,
    },
    micButton: {
        width: 84, height: 84, borderRadius: 42,
        backgroundColor: colors.accent,
        justifyContent: 'center', alignItems: 'center',
    },
    micButtonActive: { backgroundColor: '#ef4444' },
    micButtonDisabled: { opacity: 0.35 },
    micIcon: { fontSize: 36 },
    sideButton: {
        minWidth: 88, minHeight: 44, borderRadius: 22,
        borderWidth: 1, borderColor: colors.borderLight,
        justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16,
    },
    sideButtonDisabled: { opacity: 0.35 },
    sideButtonText: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.textPrimary },

    hint: { fontSize: fontSizes.xs, color: colors.textTertiary, textAlign: 'center', paddingBottom: 10 },
});
