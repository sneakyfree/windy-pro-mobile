/**
 * 🧬 RP-4.4 — Translate Screen
 * Conversation-mode translation with recording + translate
 */
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, Alert } from 'react-native';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius } from '@/theme';
import { translationService, TIER_1_LANGUAGES } from '@/services/translation';
import { audioCaptureService } from '@/services/audio-capture';
import { transcriptionService } from '@/services/transcription';
import { feedbackService } from '@/services/feedback';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import type { TranscriptSegment } from '@/types';

interface ConversationBubble {
    id: string;
    speaker: 'A' | 'B';
    original: string;
    translated: string;
    fromLang: string;
    toLang: string;
    timestamp: number;
}

export default function TranslateScreen() {
    const router = useRouter();
    const { requireFeature } = useFeatureGate();
    const [sourceLang, setSourceLang] = useState('en');
    const [targetLang, setTargetLang] = useState('es');
    const [bubbles, setBubbles] = useState<ConversationBubble[]>([]);
    const [isRecording, setIsRecording] = useState(false);
    const [activeSpeaker, setActiveSpeaker] = useState<'A' | 'B'>('A');
    const [processing, setProcessing] = useState(false);
    const scrollRef = useRef<ScrollView>(null);

    // Gate behind Pro tier
    useEffect(() => {
        if (!requireFeature('translate', 'Windy Translate')) {
            router.back();
        }
    }, []);

    const getFlag = (code: string): string => {
        const lang = TIER_1_LANGUAGES.find((l) => l.code === code);
        return lang?.flag || '🌐';
    };

    const getName = (code: string): string => {
        const lang = TIER_1_LANGUAGES.find((l) => l.code === code);
        return lang?.name || code;
    };

    const swapLanguages = () => {
        const temp = sourceLang;
        setSourceLang(targetLang);
        setTargetLang(temp);
        feedbackService.tap();
    };

    const handleRecord = useCallback(async () => {
        if (isRecording) {
            // Stop recording
            setIsRecording(false);
            setProcessing(true);

            try {
                const result = await audioCaptureService.stopRecording();

                // Transcribe
                let transcribedText = '';
                transcriptionService.onSegment = (seg: TranscriptSegment) => {
                    transcribedText += seg.text + ' ';
                };

                await transcriptionService.transcribeFile(result.uri);
                transcribedText = transcribedText.trim();

                if (transcribedText) {
                    // Translate
                    const fromLang = activeSpeaker === 'A' ? sourceLang : targetLang;
                    const toLang = activeSpeaker === 'A' ? targetLang : sourceLang;

                    const translation = await translationService.translate(
                        transcribedText, fromLang, toLang
                    );

                    const bubble: ConversationBubble = {
                        id: `bubble-${Date.now()}`,
                        speaker: activeSpeaker,
                        original: transcribedText,
                        translated: translation.translated,
                        fromLang,
                        toLang,
                        timestamp: Date.now(),
                    };
                    setBubbles((prev) => [...prev, bubble]);
                    // Auto-scroll to newest bubble
                    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
                }
            } catch (err) {
                console.error('[Translate] Error:', err);
                await feedbackService.error();
                Alert.alert('Translation Failed', 'Could not translate. Check your internet connection and try again.');
            } finally {
                setProcessing(false);
            }
        } else {
            // Start recording
            try {
                const sessionId = `translate-${Date.now()}`;
                await audioCaptureService.startRecording(sessionId);
                setIsRecording(true);
                await feedbackService.recordStart();
            } catch (err) {
                console.error('[Translate] Start failed:', err);
                await feedbackService.error();
            }
        }
    }, [isRecording, activeSpeaker, sourceLang, targetLang]);

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backBtn}>
                    <Text style={styles.backText}>← Back</Text>
                </Pressable>
                <Text style={styles.title}>Windy Translate</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                        style={styles.clearBtn}
                        onPress={() => router.push('/ocr')}
                        accessibilityLabel="OCR Camera Translate"
                    >
                        <Text style={styles.clearBtnText}>📷</Text>
                    </Pressable>
                    {bubbles.length > 0 && (
                        <Pressable
                            style={styles.clearBtn}
                            onPress={() => Alert.alert('Clear Conversation', 'Remove all messages?', [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Clear', style: 'destructive', onPress: () => setBubbles([]) },
                            ])}
                        >
                            <Text style={styles.clearBtnText}>🗑</Text>
                        </Pressable>
                    )}
                </View>
            </View>

            {/* Language Selector Row */}
            <View style={styles.langRow}>
                <Pressable style={styles.langButton}>
                    <Text style={styles.langFlag}>{getFlag(sourceLang)}</Text>
                    <Text style={styles.langName}>{getName(sourceLang)}</Text>
                </Pressable>

                <Pressable style={styles.swapButton} onPress={swapLanguages}>
                    <Text style={styles.swapText}>⇄</Text>
                </Pressable>

                <Pressable style={styles.langButton}>
                    <Text style={styles.langFlag}>{getFlag(targetLang)}</Text>
                    <Text style={styles.langName}>{getName(targetLang)}</Text>
                </Pressable>
            </View>

            {/* Conversation Area */}
            <ScrollView ref={scrollRef} style={styles.conversation} contentContainerStyle={styles.conversationContent} keyboardDismissMode="on-drag">
                {bubbles.length === 0 ? (
                    <Text style={styles.placeholder}>
                        Tap a speaker button, then record to start translating
                    </Text>
                ) : (
                    bubbles.map((bubble) => (
                        <View
                            key={bubble.id}
                            style={[
                                styles.bubble,
                                bubble.speaker === 'A' ? styles.bubbleLeft : styles.bubbleRight,
                            ]}
                        >
                            <Text style={styles.bubbleSpeaker}>
                                {bubble.speaker === 'A' ? `${getFlag(bubble.fromLang)} Speaker A` : `${getFlag(bubble.fromLang)} Speaker B`}
                            </Text>
                            <Text style={styles.bubbleOriginal}>{bubble.original}</Text>
                            <View style={styles.bubbleDivider} />
                            <Text style={styles.bubbleTranslated}>
                                {getFlag(bubble.toLang)} {bubble.translated}
                            </Text>
                        </View>
                    ))
                )}
            </ScrollView>

            {/* Speaker Toggle + Record */}
            <View style={styles.controls}>
                <View style={styles.speakerRow}>
                    <Pressable
                        style={[styles.speakerBtn, activeSpeaker === 'A' && styles.speakerActive]}
                        onPress={() => { setActiveSpeaker('A'); feedbackService.tap(); }}
                    >
                        <Text style={styles.speakerText}>
                            {getFlag(sourceLang)} Speaker A
                        </Text>
                    </Pressable>
                    <Pressable
                        style={[styles.speakerBtn, activeSpeaker === 'B' && styles.speakerActive]}
                        onPress={() => { setActiveSpeaker('B'); feedbackService.tap(); }}
                    >
                        <Text style={styles.speakerText}>
                            {getFlag(targetLang)} Speaker B
                        </Text>
                    </Pressable>
                </View>

                <Pressable
                    style={[
                        styles.recordBtn,
                        isRecording && styles.recordBtnActive,
                        processing && styles.recordBtnProcessing,
                    ]}
                    onPress={handleRecord}
                    disabled={processing}
                >
                    <Text style={styles.recordBtnEmoji}>
                        {processing ? '⏳' : isRecording ? '⏹' : '🎤'}
                    </Text>
                    <Text style={styles.recordBtnText}>
                        {processing ? 'Translating...' : isRecording ? 'Stop' : 'Record'}
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.screenPadding, marginBottom: spacing.md },
    backBtn: { marginRight: spacing.md },
    backText: { fontSize: 16, color: colors.accent },
    title: { fontSize: 20, fontWeight: '600', color: colors.textPrimary, flex: 1 },
    clearBtn: { padding: spacing.xs },
    clearBtnText: { fontSize: 18 },

    langRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, marginBottom: spacing.md },
    langButton: { alignItems: 'center', backgroundColor: colors.surface, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.lg },
    langFlag: { fontSize: 28 },
    langName: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
    swapButton: { backgroundColor: colors.surface, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    swapText: { fontSize: 20, color: colors.accent },

    conversation: { flex: 1, paddingHorizontal: spacing.screenPadding },
    conversationContent: { paddingBottom: spacing.lg },
    placeholder: { color: colors.textTertiary, textAlign: 'center', marginTop: 60, fontSize: 15 },

    bubble: { marginBottom: spacing.md, borderRadius: borderRadius.lg, padding: spacing.md, maxWidth: '85%' },
    bubbleLeft: { backgroundColor: colors.surface, alignSelf: 'flex-start' },
    bubbleRight: { backgroundColor: '#1a3a2e', alignSelf: 'flex-end' },
    bubbleSpeaker: { fontSize: 11, color: colors.textTertiary, marginBottom: spacing.xs },
    bubbleOriginal: { fontSize: 15, color: colors.textPrimary, lineHeight: 22 },
    bubbleDivider: { height: 1, backgroundColor: colors.borderLight, marginVertical: spacing.sm },
    bubbleTranslated: { fontSize: 15, color: colors.accent, lineHeight: 22 },

    controls: { paddingHorizontal: spacing.screenPadding, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
    speakerRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
    speakerBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    speakerActive: { borderColor: colors.accent, backgroundColor: colors.accentTransparent },
    speakerText: { fontSize: 14, color: colors.textPrimary },

    recordBtn: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 2, borderColor: colors.border },
    recordBtnActive: { borderColor: colors.stateRecording, backgroundColor: 'rgba(34,197,94,0.1)' },
    recordBtnProcessing: { borderColor: colors.stateProcessing, backgroundColor: 'rgba(234,179,8,0.1)' },
    recordBtnEmoji: { fontSize: 24 },
    recordBtnText: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
});
