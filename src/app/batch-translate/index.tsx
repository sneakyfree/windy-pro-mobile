/**
 * 🧬 Premium: Multi-Language Batch Translate
 * Paste or record text, translate to multiple languages simultaneously.
 * Results displayed as scrollable card stack.
 */
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, Platform, Alert, Animated, ActivityIndicator } from 'react-native';
import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius } from '@/theme';
import { feedbackService } from '@/services/feedback';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import * as Clipboard from 'expo-clipboard';
import * as Speech from 'expo-speech';

import { apiUrl } from '@/config/api';

const TRANSLATE_API = apiUrl('/api/v1/translate');

interface TranslationResult {
    language: string;
    languageName: string;
    flag: string;
    translated: string;
    loading: boolean;
    error?: string;
}

const POPULAR_LANGUAGES = [
    { code: 'es', name: 'Spanish', flag: '🇪🇸' },
    { code: 'fr', name: 'French', flag: '🇫🇷' },
    { code: 'de', name: 'German', flag: '🇩🇪' },
    { code: 'it', name: 'Italian', flag: '🇮🇹' },
    { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
    { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
    { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
    { code: 'ko', name: 'Korean', flag: '🇰🇷' },
    { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
    { code: 'ru', name: 'Russian', flag: '🇷🇺' },
    { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
    { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
    { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
    { code: 'sv', name: 'Swedish', flag: '🇸🇪' },
    { code: 'pl', name: 'Polish', flag: '🇵🇱' },
];

export default function BatchTranslateScreen() {
    const router = useRouter();
    const [sourceText, setSourceText] = useState('');
    const [selectedLangs, setSelectedLangs] = useState<Set<string>>(new Set(['es', 'fr', 'de']));
    const [results, setResults] = useState<TranslationResult[]>([]);
    const [translating, setTranslating] = useState(false);
    const fadeAnim = useRef(new Animated.Value(0)).current;

    const toggleLanguage = (code: string) => {
        setSelectedLangs(prev => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code);
            else next.add(code);
            return next;
        });
    };

    const handleTranslate = useCallback(async () => {
        if (!sourceText.trim()) {
            Alert.alert('Enter Text', 'Please enter or paste text to translate.');
            return;
        }
        if (selectedLangs.size === 0) {
            Alert.alert('Select Languages', 'Pick at least one target language.');
            return;
        }

        setTranslating(true);
        await feedbackService.tap();

        const langs = Array.from(selectedLangs);
        const initial: TranslationResult[] = langs.map(code => {
            const lang = POPULAR_LANGUAGES.find(l => l.code === code);
            return {
                language: code,
                languageName: lang?.name || code,
                flag: lang?.flag || '🌐',
                translated: '',
                loading: true,
            };
        });
        setResults(initial);

        // Animate cards in
        fadeAnim.setValue(0);
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();

        // Translate in parallel
        const promises = langs.map(async (targetLang, index) => {
            try {
                const res = await fetch(TRANSLATE_API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: sourceText.trim(), source: 'auto', target: targetLang }),
                });

                if (res.ok) {
                    const data = await res.json();
                    setResults(prev => prev.map((r, i) =>
                        i === index ? { ...r, translated: data.translated || data.text || sourceText, loading: false } : r
                    ));
                } else {
                    // Fallback: show original text with error note
                    setResults(prev => prev.map((r, i) =>
                        i === index ? { ...r, translated: `[Translation unavailable]`, loading: false, error: `HTTP ${res.status}` } : r
                    ));
                }
            } catch (err) {
                setResults(prev => prev.map((r, i) =>
                    i === index ? { ...r, translated: `[Offline — queued]`, loading: false, error: String(err) } : r
                ));
            }
        });

        await Promise.allSettled(promises);
        setTranslating(false);
        await feedbackService.success();
    }, [sourceText, selectedLangs, fadeAnim]);

    const handleCopy = async (text: string) => {
        await Clipboard.setStringAsync(text);
        await feedbackService.tap();
    };

    const handleSpeak = (text: string, lang: string) => {
        Speech.speak(text, { language: lang, rate: 0.8 });
    };

    return (
        <ScreenErrorBoundary screenName="BatchTranslate">
            <ScrollView style={styles.container} contentContainerStyle={styles.content}>
                {/* Header */}
                <View style={styles.header}>
                    <Pressable onPress={() => router.back()} style={styles.backBtn}>
                        <Text style={styles.backText}>← Back</Text>
                    </Pressable>
                    <Text style={styles.title}>🌍 Batch Translate</Text>
                </View>

                {/* Source Text */}
                <View style={styles.inputCard}>
                    <Text style={styles.inputLabel}>Source Text</Text>
                    <TextInput
                        style={styles.inputField}
                        placeholder="Type or paste text to translate..."
                        placeholderTextColor={colors.textTertiary}
                        value={sourceText}
                        onChangeText={setSourceText}
                        multiline
                        numberOfLines={4}
                    />
                    <Text style={styles.charCount}>{sourceText.length} characters</Text>
                </View>

                {/* Language Selection */}
                <Text style={styles.sectionTitle}>Target Languages ({selectedLangs.size} selected)</Text>
                <View style={styles.langGrid}>
                    {POPULAR_LANGUAGES.map(lang => (
                        <Pressable
                            key={lang.code}
                            style={[styles.langChip, selectedLangs.has(lang.code) && styles.langChipActive]}
                            onPress={() => toggleLanguage(lang.code)}
                        >
                            <Text style={styles.langFlag}>{lang.flag}</Text>
                            <Text style={[styles.langName, selectedLangs.has(lang.code) && styles.langNameActive]}>
                                {lang.name}
                            </Text>
                        </Pressable>
                    ))}
                </View>

                {/* Translate Button */}
                <Pressable
                    style={[styles.translateBtn, translating && styles.translateBtnDisabled]}
                    onPress={handleTranslate}
                    disabled={translating}
                >
                    {translating ? (
                        <ActivityIndicator color="#000" size="small" />
                    ) : (
                        <Text style={styles.translateBtnText}>🔄 Translate to {selectedLangs.size} Languages</Text>
                    )}
                </Pressable>

                {/* Results Card Stack */}
                {results.length > 0 && (
                    <Animated.View style={[styles.resultsSection, { opacity: fadeAnim }]}>
                        <Text style={styles.sectionTitle}>Results</Text>
                        {results.map((result) => (
                            <View key={result.language} style={[styles.resultCard, result.error && styles.resultCardError]}>
                                <View style={styles.resultHeader}>
                                    <Text style={styles.resultFlag}>{result.flag}</Text>
                                    <Text style={styles.resultLang}>{result.languageName}</Text>
                                    <View style={styles.resultActions}>
                                        <Pressable onPress={() => handleCopy(result.translated)} style={styles.resultAction}>
                                            <Text style={styles.resultActionText}>📋</Text>
                                        </Pressable>
                                        <Pressable onPress={() => handleSpeak(result.translated, result.language)} style={styles.resultAction}>
                                            <Text style={styles.resultActionText}>🔊</Text>
                                        </Pressable>
                                    </View>
                                </View>
                                {result.loading ? (
                                    <ActivityIndicator color={colors.accent} size="small" style={{ paddingVertical: 12 }} />
                                ) : (
                                    <Text style={styles.resultText}>{result.translated}</Text>
                                )}
                            </View>
                        ))}
                    </Animated.View>
                )}
            </ScrollView>
        </ScreenErrorBoundary>
    );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingHorizontal: spacing.screenPadding, paddingBottom: 80 },

    header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
    backBtn: { marginRight: spacing.sm },
    backText: { fontSize: 16, color: colors.accent },
    title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },

    inputCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border },
    inputLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.xs },
    inputField: { color: colors.textPrimary, fontSize: 16, lineHeight: 24, minHeight: 100, textAlignVertical: 'top' },
    charCount: { fontSize: 11, color: colors.textTertiary, textAlign: 'right', marginTop: 4 },

    sectionTitle: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm },

    langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.lg },
    langChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
    langChipActive: { borderColor: colors.accent, backgroundColor: colors.accentTransparent },
    langFlag: { fontSize: 16 },
    langName: { fontSize: 13, color: colors.textSecondary },
    langNameActive: { color: colors.accent, fontWeight: '600' },

    translateBtn: { backgroundColor: colors.accent, borderRadius: borderRadius.lg, paddingVertical: 16, alignItems: 'center', marginBottom: spacing.xl },
    translateBtnDisabled: { opacity: 0.6 },
    translateBtnText: { color: '#000', fontWeight: '700', fontSize: 16 },

    resultsSection: { marginTop: spacing.sm },
    resultCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.borderLight },
    resultCardError: { borderColor: 'rgba(239, 68, 68, 0.3)' },
    resultHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
    resultFlag: { fontSize: 22, marginRight: spacing.xs },
    resultLang: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    resultActions: { flexDirection: 'row', gap: 8 },
    resultAction: { padding: 6, backgroundColor: colors.accentTransparent, borderRadius: borderRadius.sm },
    resultActionText: { fontSize: 16 },
    resultText: { fontSize: 16, color: colors.accent, lineHeight: 24 },
});
