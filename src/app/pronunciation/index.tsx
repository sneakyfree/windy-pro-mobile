/**
 * 🧬 Premium: Pronunciation Guide
 * After translation, show phonetic transcription (IPA) and
 * offer slow-speed audio playback for learning pronunciation.
 */
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, Platform, Alert, ActivityIndicator } from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { colors, spacing, borderRadius } from '@/theme';
import { feedbackService } from '@/services/feedback';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

const TRANSLATE_API = 'https://windypro.thewindstorm.uk/api/v1/translate';

// Basic IPA approximation tables for common languages
const IPA_RULES: Record<string, Record<string, string>> = {
    es: { a: 'a', e: 'e', i: 'i', o: 'o', u: 'u', ñ: 'ɲ', ll: 'ʎ', rr: 'r', j: 'x', h: '', v: 'b', z: 'θ', c: 'k', qu: 'k' },
    fr: { ou: 'u', u: 'y', eu: 'ø', oi: 'wa', an: 'ɑ̃', en: 'ɑ̃', on: 'ɔ̃', in: 'ɛ̃', ch: 'ʃ', j: 'ʒ', gn: 'ɲ', r: 'ʁ' },
    de: { ei: 'aɪ', ie: 'iː', eu: 'ɔʏ', ch: 'x', sch: 'ʃ', sp: 'ʃp', st: 'ʃt', z: 'ts', w: 'v', v: 'f', ü: 'yː', ö: 'øː', ä: 'ɛː' },
    ja: { shi: 'ɕi', chi: 'tɕi', tsu: 'tsɯ', fu: 'ɸɯ', r: 'ɾ' },
    zh: { zh: 'ʈʂ', ch: 'ʈʂʰ', sh: 'ʂ', r: 'ʐ', x: 'ɕ', q: 'tɕʰ', j: 'tɕ' },
};

interface PronunciationData {
    original: string;
    translated: string;
    ipa: string;
    syllables: string[];
    targetLang: string;
}

/** Generate approximate IPA from text + language */
function approximateIPA(text: string, lang: string): string {
    const rules = IPA_RULES[lang];
    if (!rules) return `/${text.toLowerCase()}/`;

    let result = text.toLowerCase();
    // Apply multi-char rules first (longer matches first)
    const sorted = Object.entries(rules).sort((a, b) => b[0].length - a[0].length);
    for (const [from, to] of sorted) {
        result = result.split(from).join(to);
    }
    return `/${result}/`;
}

/** Break text into syllables (simple approach) */
function breakSyllables(text: string): string[] {
    return text.split(/\s+/).filter(Boolean);
}

const SPEED_OPTIONS = [
    { label: '0.3×', rate: 0.3, icon: '🐢' },
    { label: '0.5×', rate: 0.5, icon: '🐌' },
    { label: '0.7×', rate: 0.7, icon: '🚶' },
    { label: '1.0×', rate: 1.0, icon: '🏃' },
];

export default function PronunciationScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ text?: string; lang?: string }>();

    const [sourceText, setSourceText] = useState(params.text || '');
    const [targetLang, setTargetLang] = useState(params.lang || 'es');
    const [pronunciation, setPronunciation] = useState<PronunciationData | null>(null);
    const [loading, setLoading] = useState(false);
    const [speaking, setSpeaking] = useState(false);
    const [activeSpeed, setActiveSpeed] = useState(0.5);
    const [activeWord, setActiveWord] = useState<number | null>(null);

    const LANGUAGES = [
        { code: 'es', name: 'Spanish', flag: '🇪🇸' },
        { code: 'fr', name: 'French', flag: '🇫🇷' },
        { code: 'de', name: 'German', flag: '🇩🇪' },
        { code: 'it', name: 'Italian', flag: '🇮🇹' },
        { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
        { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
        { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
        { code: 'ko', name: 'Korean', flag: '🇰🇷' },
    ];

    const handleGenerate = useCallback(async () => {
        if (!sourceText.trim()) {
            Alert.alert('Enter Text', 'Please type text to get pronunciation guide.');
            return;
        }

        setLoading(true);
        await feedbackService.tap();

        try {
            // Translate first
            const res = await fetch(TRANSLATE_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: sourceText.trim(), source: 'en', target: targetLang }),
            });

            let translated = sourceText.trim();
            if (res.ok) {
                const data = await res.json();
                translated = data.translated || data.text || translated;
            }

            const ipa = approximateIPA(translated, targetLang);
            const syllables = breakSyllables(translated);

            setPronunciation({
                original: sourceText.trim(),
                translated,
                ipa,
                syllables,
                targetLang,
            });
        } catch (err) { console.warn("[Pronunciation] Error:", err);
            // Use source text as fallback
            setPronunciation({
                original: sourceText.trim(),
                translated: sourceText.trim(),
                ipa: approximateIPA(sourceText.trim(), targetLang),
                syllables: breakSyllables(sourceText.trim()),
                targetLang,
            });
        }

        setLoading(false);
    }, [sourceText, targetLang]);

    const speakText = useCallback((text: string, rate: number) => {
        Speech.stop();
        setSpeaking(true);
        setActiveSpeed(rate);
        Speech.speak(text, {
            language: targetLang,
            rate,
            onDone: () => setSpeaking(false),
            onStopped: () => setSpeaking(false),
        });
    }, [targetLang]);

    const speakWord = useCallback((word: string, index: number) => {
        setActiveWord(index);
        Speech.speak(word, {
            language: targetLang,
            rate: 0.4,
            onDone: () => setActiveWord(null),
            onStopped: () => setActiveWord(null),
        });
        feedbackService.tap();
    }, [targetLang]);

    return (
        <ScreenErrorBoundary screenName="Pronunciation">
            <ScrollView style={styles.container} contentContainerStyle={styles.content}>
                {/* Header */}
                <View style={styles.header}>
                    <Pressable onPress={() => router.back()} style={styles.backBtn}>
                        <Text style={styles.backText}>← Back</Text>
                    </Pressable>
                    <Text style={styles.title}>🗣️ Pronunciation</Text>
                </View>

                {/* Source Input */}
                <View style={styles.inputCard}>
                    <Text style={styles.label}>English Text</Text>
                    <TextInput
                        style={styles.inputField}
                        placeholder="Type a phrase to learn pronunciation..."
                        placeholderTextColor={colors.textTertiary}
                        value={sourceText}
                        onChangeText={setSourceText}
                        multiline
                    />
                </View>

                {/* Language Selector */}
                <Text style={styles.label}>Target Language</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.langScroll}>
                    {LANGUAGES.map(lang => (
                        <Pressable
                            key={lang.code}
                            style={[styles.langChip, targetLang === lang.code && styles.langChipActive]}
                            onPress={() => setTargetLang(lang.code)}
                        >
                            <Text style={styles.langFlag}>{lang.flag}</Text>
                            <Text style={[styles.langName, targetLang === lang.code && styles.langNameActive]}>
                                {lang.name}
                            </Text>
                        </Pressable>
                    ))}
                </ScrollView>

                {/* Generate Button */}
                <Pressable style={[styles.generateBtn, loading && styles.generateBtnDisabled]} onPress={handleGenerate} disabled={loading}>
                    {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.generateBtnText}>🗣️ Get Pronunciation</Text>}
                </Pressable>

                {/* Results */}
                {pronunciation && (
                    <View style={styles.resultSection}>
                        {/* Translation */}
                        <View style={styles.translationCard}>
                            <Text style={styles.translationLabel}>Translation</Text>
                            <Text style={styles.translationText}>{pronunciation.translated}</Text>
                        </View>

                        {/* IPA Transcription */}
                        <View style={styles.ipaCard}>
                            <Text style={styles.ipaLabel}>Phonetic (IPA)</Text>
                            <Text style={styles.ipaText}>{pronunciation.ipa}</Text>
                        </View>

                        {/* Word-by-Word */}
                        <View style={styles.wordsCard}>
                            <Text style={styles.wordsLabel}>Tap each word to hear it</Text>
                            <View style={styles.wordsGrid}>
                                {pronunciation.syllables.map((word, i) => (
                                    <Pressable
                                        key={`word-${i}`}
                                        style={[styles.wordChip, activeWord === i && styles.wordChipActive]}
                                        onPress={() => speakWord(word, i)}
                                    >
                                        <Text style={[styles.wordText, activeWord === i && styles.wordTextActive]}>
                                            {word}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        </View>

                        {/* Speed Controls */}
                        <View style={styles.speedCard}>
                            <Text style={styles.speedLabel}>Playback Speed</Text>
                            <View style={styles.speedRow}>
                                {SPEED_OPTIONS.map(opt => (
                                    <Pressable
                                        key={opt.label}
                                        style={[styles.speedBtn, activeSpeed === opt.rate && speaking && styles.speedBtnActive]}
                                        onPress={() => speakText(pronunciation.translated, opt.rate)}
                                    >
                                        <Text style={styles.speedIcon}>{opt.icon}</Text>
                                        <Text style={[styles.speedLabel2, activeSpeed === opt.rate && speaking && styles.speedLabel2Active]}>
                                            {opt.label}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        </View>

                        {/* Full Sentence Play */}
                        <Pressable
                            style={[styles.playFullBtn, speaking && styles.playFullBtnActive]}
                            onPress={() => speaking ? Speech.stop() : speakText(pronunciation.translated, activeSpeed)}
                        >
                            <Text style={styles.playFullText}>
                                {speaking ? '⏹ Stop' : '▶️ Play Full Sentence'}
                            </Text>
                        </Pressable>
                    </View>
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

    inputCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
    label: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.xs },
    inputField: { color: colors.textPrimary, fontSize: 16, lineHeight: 24, minHeight: 60, textAlignVertical: 'top' },

    langScroll: { maxHeight: 48, marginBottom: spacing.lg },
    langChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, marginRight: 8 },
    langChipActive: { borderColor: colors.accent, backgroundColor: colors.accentTransparent },
    langFlag: { fontSize: 18 },
    langName: { fontSize: 13, color: colors.textSecondary },
    langNameActive: { color: colors.accent, fontWeight: '600' },

    generateBtn: { backgroundColor: colors.accent, borderRadius: borderRadius.lg, paddingVertical: 16, alignItems: 'center', marginBottom: spacing.xl },
    generateBtnDisabled: { opacity: 0.6 },
    generateBtnText: { color: '#000', fontWeight: '700', fontSize: 16 },

    resultSection: { gap: spacing.md },

    translationCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight },
    translationLabel: { fontSize: 11, fontWeight: '600', color: colors.textTertiary, textTransform: 'uppercase', marginBottom: 6 },
    translationText: { fontSize: 20, fontWeight: '600', color: colors.accent, lineHeight: 28 },

    ipaCard: { backgroundColor: '#1a2a3a', borderRadius: borderRadius.lg, padding: spacing.md, borderWidth: 1, borderColor: 'rgba(69, 163, 255, 0.2)' },
    ipaLabel: { fontSize: 11, fontWeight: '600', color: '#7aafff', textTransform: 'uppercase', marginBottom: 6 },
    ipaText: { fontSize: 22, color: '#a3d4ff', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', letterSpacing: 1 },

    wordsCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight },
    wordsLabel: { fontSize: 11, fontWeight: '600', color: colors.textTertiary, textTransform: 'uppercase', marginBottom: spacing.sm },
    wordsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    wordChip: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.background, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border },
    wordChipActive: { borderColor: colors.accent, backgroundColor: colors.accentTransparent },
    wordText: { fontSize: 16, color: colors.textPrimary, fontWeight: '500' },
    wordTextActive: { color: colors.accent },

    speedCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight },
    speedLabel: { fontSize: 11, fontWeight: '600', color: colors.textTertiary, textTransform: 'uppercase', marginBottom: spacing.sm },
    speedRow: { flexDirection: 'row', gap: 8 },
    speedBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, backgroundColor: colors.background, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border },
    speedBtnActive: { borderColor: colors.accent, backgroundColor: colors.accentTransparent },
    speedIcon: { fontSize: 22, marginBottom: 4 },
    speedLabel2: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
    speedLabel2Active: { color: colors.accent },

    playFullBtn: { backgroundColor: colors.accent, borderRadius: borderRadius.lg, paddingVertical: 16, alignItems: 'center' },
    playFullBtnActive: { backgroundColor: '#ef4444' },
    playFullText: { color: '#000', fontWeight: '700', fontSize: 16 },
});
