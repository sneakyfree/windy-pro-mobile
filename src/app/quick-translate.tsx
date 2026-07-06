/**
 * 🧬 Quick Translate — Deep Link / App Clip Entry Point
 * Minimal single-screen translate UI for deep links and future App Clip.
 *
 * Deep link: windypro://translate?text=hello&from=en&to=es
 *
 * This screen can serve as the App Clip entry point when the
 * native Xcode App Clip target is configured.
 */
import { View, Text, StyleSheet, TextInput, Pressable, Platform, ActivityIndicator, KeyboardAvoidingView, Alert } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { colors, spacing, borderRadius, fontSizes } from '@/theme';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { translationService, TIER_1_LANGUAGES } from '@/services/translation';
import { useHaptic } from '@/hooks/useHaptic';
import { tierAccess } from '@/services/tier-access';
import LockedFeature from '@/components/LockedFeature';

const VALID_LANG_CODES = new Set(TIER_1_LANGUAGES.map(l => l.code));
const safeLangCode = (code: string | undefined, fallback: string): string =>
    code && VALID_LANG_CODES.has(code) ? code : fallback;

// M4 tier gate — honest locked state as a WRAPPER component (an inline
// early-return before hooks would change the hook count if the tier
// flips mid-mount — the exact 'Rendered fewer hooks' crash M1 hit).
// The locked/unlocked branches are separate components, so each mounts
// with a consistent hook order.
export default function QuickTranslateScreenGate() {
    if (!tierAccess.canUseTranslate()) {
        return <LockedFeature featureName="Voice Translate" emoji="🌐" />;
    }
    return <QuickTranslateScreen />;
}

function QuickTranslateScreen() {

    const router = useRouter();
    const params = useLocalSearchParams<{ text?: string; from?: string; to?: string }>();
    const haptic = useHaptic();

    const [inputText, setInputText] = useState(params.text || '');
    const [sourceLang, setSourceLang] = useState(safeLangCode(params.from, 'en'));
    const [targetLang, setTargetLang] = useState(safeLangCode(params.to, 'es'));
    const [errorMsg, setErrorMsg] = useState('');
    const [translatedText, setTranslatedText] = useState('');
    const [processing, setProcessing] = useState(false);
    const [confidence, setConfidence] = useState(0);

    // Auto-translate if text was provided via deep link
    useEffect(() => {
        if (params.text) {
            handleTranslate(params.text);
        }
    }, [params.text]);

    const handleTranslate = useCallback(async (text?: string) => {
        const toTranslate = text || inputText;
        if (!toTranslate.trim()) return;

        setProcessing(true);
        setErrorMsg('');
        haptic.light();

        try {
            const result = await translationService.translate(toTranslate, sourceLang, targetLang);
            setTranslatedText(result.translated);
            setConfidence(result.confidence);
            haptic.success();
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : '';
            const isOffline = errMsg.includes('Network') || errMsg.includes('fetch');
            const msg = isOffline
                ? 'You appear to be offline. Please check your connection and try again.'
                : 'Translation failed. Please try again.';
            setTranslatedText('');
            setErrorMsg(msg);
            setConfidence(0);
            haptic.error();
            Alert.alert('Translation Error', msg);
        } finally {
            setProcessing(false);
        }
    }, [inputText, sourceLang, targetLang, haptic]);

    const handleSpeak = useCallback(() => {
        if (translatedText) {
            haptic.light();
            Speech.speak(translatedText, {
                language: targetLang,
                rate: 0.9,
            });
        }
    }, [translatedText, targetLang, haptic]);

    const swapLanguages = () => {
        setSourceLang(targetLang);
        setTargetLang(sourceLang);
        setTranslatedText('');
        haptic.selection();
    };

    const getFlag = (code: string) => {
        return TIER_1_LANGUAGES.find(l => l.code === code)?.flag || '🌐';
    };

    const getName = (code: string) => {
        return TIER_1_LANGUAGES.find(l => l.code === code)?.name || code;
    };

    return (
        <ScreenErrorBoundary screenName="Quick Translate">
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                {/* Header */}
                <View style={styles.header}>
                    <Pressable
                        onPress={() => router.back()}
                        style={styles.backBtn}
                        accessibilityLabel="Go back"
                        accessibilityRole="button"
                    >
                        <Text style={styles.backText}>← Back</Text>
                    </Pressable>
                    <Text style={styles.title}>Quick Translate</Text>
                    <View style={{ width: 60 }} />
                </View>

                {/* Language Bar */}
                <View style={styles.langBar}>
                    <Pressable
                        style={styles.langPill}
                        accessibilityLabel={`Source language: ${getName(sourceLang)}`}
                        accessibilityRole="button"
                    >
                        <Text style={styles.langPillText}>
                            {getFlag(sourceLang)} {getName(sourceLang)}
                        </Text>
                    </Pressable>

                    <Pressable
                        style={styles.swapBtn}
                        onPress={swapLanguages}
                        accessibilityLabel="Swap languages"
                        accessibilityRole="button"
                    >
                        <Text style={styles.swapText}>⇄</Text>
                    </Pressable>

                    <Pressable
                        style={styles.langPill}
                        accessibilityLabel={`Target language: ${getName(targetLang)}`}
                        accessibilityRole="button"
                    >
                        <Text style={styles.langPillText}>
                            {getFlag(targetLang)} {getName(targetLang)}
                        </Text>
                    </Pressable>
                </View>

                {/* Input */}
                <View style={styles.inputCard}>
                    <TextInput
                        style={styles.input}
                        placeholder="Type text to translate..."
                        placeholderTextColor={colors.textTertiary}
                        value={inputText}
                        onChangeText={setInputText}
                        multiline
                        maxLength={2000}
                        returnKeyType="done"
                        accessibilityLabel="Text to translate"
                        accessibilityHint="Enter text you want to translate"
                    />
                    <Pressable
                        style={[styles.translateBtn, !inputText.trim() && { opacity: 0.5 }]}
                        onPress={() => handleTranslate()}
                        disabled={processing || !inputText.trim()}
                        accessibilityLabel="Translate"
                        accessibilityRole="button"
                    >
                        {processing ? (
                            <ActivityIndicator color={colors.background} size="small" />
                        ) : (
                            <Text style={styles.translateBtnText}>Translate →</Text>
                        )}
                    </Pressable>
                </View>

                {/* Result */}
                {translatedText ? (
                    <View style={styles.resultCard}>
                        <View style={styles.resultHeader}>
                            <Text style={styles.resultLang}>
                                {getFlag(targetLang)} {getName(targetLang)}
                            </Text>
                            {confidence > 0 && (
                                <Text style={[
                                    styles.confidenceBadge,
                                    { backgroundColor: confidence >= 0.85 ? 'rgba(34,197,94,0.2)' : 'rgba(234,179,8,0.2)' },
                                ]}>
                                    {Math.round(confidence * 100)}%
                                </Text>
                            )}
                        </View>
                        <Text style={styles.resultText} selectable>
                            {translatedText}
                        </Text>
                        <Pressable
                            style={styles.speakBtn}
                            onPress={handleSpeak}
                            accessibilityLabel="Speak translation aloud"
                            accessibilityRole="button"
                        >
                            <Text style={styles.speakBtnText}>🔊 Speak</Text>
                        </Pressable>
                    </View>
                ) : null}

                {/* Footer */}
                <View style={styles.footer}>
                    <Text style={styles.footerText}>
                        🌪️ Powered by Windy Word Translation Engine
                    </Text>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
        </ScreenErrorBoundary>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.screenPadding,
        paddingVertical: spacing.md,
    },
    backBtn: { minWidth: 48, minHeight: 48, justifyContent: 'center' },
    backText: { fontSize: fontSizes.base, color: colors.accent },
    title: {
        fontSize: fontSizes.lg,
        fontWeight: '700',
        color: colors.textPrimary,
    },

    langBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.screenPadding,
        marginBottom: spacing.md,
    },
    langPill: {
        flex: 1,
        backgroundColor: colors.surface,
        paddingVertical: spacing.sm + 2,
        borderRadius: borderRadius.md,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    langPillText: {
        fontSize: fontSizes.sm,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    swapBtn: {
        width: 36,
        height: 44,
        borderRadius: 18,
        backgroundColor: colors.surfaceLight,
        alignItems: 'center',
        justifyContent: 'center',
    },
    swapText: {
        fontSize: fontSizes.lg,
        color: colors.accent,
    },

    inputCard: {
        backgroundColor: colors.surface,
        marginHorizontal: spacing.screenPadding,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginBottom: spacing.md,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    input: {
        fontSize: fontSizes.base,
        color: colors.textPrimary,
        minHeight: 80,
        maxHeight: 160,
        textAlignVertical: 'top',
        marginBottom: spacing.sm,
    },
    translateBtn: {
        backgroundColor: colors.accent,
        paddingVertical: spacing.sm + 2,
        borderRadius: borderRadius.md,
        alignItems: 'center',
    },
    translateBtnText: {
        fontSize: fontSizes.base,
        fontWeight: '700',
        color: colors.background,
    },

    resultCard: {
        backgroundColor: colors.surface,
        marginHorizontal: spacing.screenPadding,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.accent,
        shadowColor: colors.accent,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
    },
    resultHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    resultLang: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    confidenceBadge: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: borderRadius.sm,
        fontSize: 11,
        fontWeight: '700',
        color: colors.textSecondary,
        overflow: 'hidden',
    },
    resultText: {
        fontSize: fontSizes.lg,
        color: colors.textPrimary,
        lineHeight: 26,
        marginBottom: spacing.md,
    },
    speakBtn: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(163, 230, 53, 0.1)',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs + 2,
        borderRadius: borderRadius.md,
    },
    speakBtnText: {
        fontSize: fontSizes.sm,
        fontWeight: '600',
        color: colors.accent,
    },

    footer: {
        flex: 1,
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: spacing.lg,
    },
    footerText: {
        fontSize: fontSizes.xs,
        color: colors.textTertiary,
    },
});
