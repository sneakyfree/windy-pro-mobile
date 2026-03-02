/**
 * 🧬 M6 — Windy Translate Conversation Mode (Enhanced)
 * Three modes: Manual, Auto, Split-Screen
 * Features: TTS, language picker, export, history, favorites, confidence
 */
import {
    View, Text, StyleSheet, Pressable, ScrollView, Platform,
    Alert, Modal, FlatList, Dimensions, Animated,
} from 'react-native';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, borderRadius } from '@/theme';
import {
    translationService, TIER_1_LANGUAGES,
    type ConversationTurn, type ConversationMode,
} from '@/services/translation';
import { audioCaptureService } from '@/services/audio-capture';
import { transcriptionService } from '@/services/transcription';
import { feedbackService } from '@/services/feedback';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import type { TranscriptSegment } from '@/types';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const HISTORY_KEY = 'windy-translate-history';
const MAX_HISTORY = 50;

export default function TranslateScreen() {
    const router = useRouter();
    const { requireFeature } = useFeatureGate();

    // State
    const [sourceLang, setSourceLang] = useState('en');
    const [targetLang, setTargetLang] = useState('es');
    const [turns, setTurns] = useState<ConversationTurn[]>([]);
    const [isRecording, setIsRecording] = useState(false);
    const [activeSpeaker, setActiveSpeaker] = useState<'A' | 'B'>('A');
    const [processing, setProcessing] = useState(false);
    const [mode, setMode] = useState<ConversationMode>('manual');
    const [ttsEnabled, setTtsEnabled] = useState(true);
    const [showLangPicker, setShowLangPicker] = useState<'source' | 'target' | null>(null);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showModeMenu, setShowModeMenu] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [history, setHistory] = useState<ConversationTurn[]>([]);
    const [copyToast, setCopyToast] = useState(false);
    const [detectedLangInfo, setDetectedLangInfo] = useState<{ lang: string; confidence: number } | null>(null);
    const scrollRefA = useRef<ScrollView>(null);
    const scrollRefB = useRef<ScrollView>(null);
    const conversationStartTime = useRef(Date.now());
    const toastAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!requireFeature('translate', 'Windy Translate')) {
            router.back();
        }
        loadHistory();
    }, []);

    const loadHistory = async () => {
        try {
            const raw = await AsyncStorage.getItem(HISTORY_KEY);
            if (raw) setHistory(JSON.parse(raw));
        } catch { /* ignore */ }
    };

    const saveToHistory = async (turn: ConversationTurn) => {
        try {
            const newHistory = [turn, ...history].slice(0, MAX_HISTORY);
            setHistory(newHistory);
            await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
        } catch { /* ignore */ }
    };

    // Copy turn text to clipboard with toast
    const handleCopyTurn = async (turn: ConversationTurn) => {
        const text = `${turn.original}\n→ ${turn.translated}`;
        await Clipboard.setStringAsync(text);
        feedbackService.tap();
        setCopyToast(true);
        Animated.sequence([
            Animated.timing(toastAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
            Animated.delay(1500),
            Animated.timing(toastAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start(() => setCopyToast(false));
    };

    // Toggle favorite/pin on a turn
    const handleToggleFavorite = (turnId: string) => {
        setTurns(prev => prev.map(t =>
            t.id === turnId ? { ...t, favorite: !t.favorite } : t
        ));
        feedbackService.tap();
    };

    // Confidence color mapping
    const getConfidenceColor = (c: number): string => {
        if (c >= 0.85) return 'rgba(34, 197, 94, 0.3)';
        if (c >= 0.6) return 'rgba(234, 179, 8, 0.3)';
        return 'rgba(239, 68, 68, 0.3)';
    };

    // Helpers
    const getFlag = (code: string) => translationService.getFlag(code);
    const getName = (code: string) => translationService.getLangName(code);

    const swapLanguages = () => {
        setSourceLang((prev) => { setTargetLang(prev); return targetLang; });
        feedbackService.tap();
    };

    // ─── Recording + Translate Flow ────────────────────────────

    const handleRecord = useCallback(async () => {
        if (isRecording) {
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

                if (!transcribedText) {
                    setProcessing(false);
                    return;
                }

                // Determine speaker (auto mode: detect language)
                let speaker = activeSpeaker;
                if (mode === 'auto') {
                    speaker = await translationService.autoDetectSpeaker(transcribedText);
                    setActiveSpeaker(speaker);
                }

                const fromLang = speaker === 'A' ? sourceLang : targetLang;
                const toLang = speaker === 'A' ? targetLang : sourceLang;

                // Translate
                const translation = await translationService.translate(
                    transcribedText, fromLang, toLang,
                );

                // Auto-detect indicator
                if (mode === 'auto') {
                    const detection = await translationService.detectLanguage(transcribedText);
                    setDetectedLangInfo({ lang: detection.language, confidence: detection.confidence });
                }

                const elapsed = (Date.now() - conversationStartTime.current) / 1000;
                const turn: ConversationTurn = {
                    id: `turn-${Date.now()}`,
                    speaker,
                    original: transcribedText,
                    translated: translation.translated,
                    fromLang,
                    toLang,
                    timestamp: Date.now(),
                    startTime: elapsed,
                    endTime: elapsed + 5,
                    confidence: translation.confidence,
                    detectedLang: mode === 'auto' ? (await translationService.detectLanguage(transcribedText)).language : undefined,
                    favorite: false,
                };
                setTurns((prev) => [...prev, turn]);
                saveToHistory(turn);

                // TTS: speak the translation aloud
                if (ttsEnabled) {
                    await translationService.speak(translation.translated, toLang);
                }

                // Auto-scroll
                setTimeout(() => {
                    scrollRefA.current?.scrollToEnd({ animated: true });
                    scrollRefB.current?.scrollToEnd({ animated: true });
                }, 100);
            } catch (err) {
                console.error('[Translate] Error:', err);
                feedbackService.error();
                Alert.alert('Translation Error', 'Could not translate. Check your connection.');
            } finally {
                setProcessing(false);
            }
        } else {
            try {
                await audioCaptureService.startRecording(`translate-${Date.now()}`);
                setIsRecording(true);
                feedbackService.recordStart();
            } catch (err) {
                console.error('[Translate] Start failed:', err);
                feedbackService.error();
            }
        }
    }, [isRecording, activeSpeaker, sourceLang, targetLang, mode, ttsEnabled]);

    // ─── Export ─────────────────────────────────────────────────

    const handleExport = async (format: 'txt' | 'md' | 'srt') => {
        setShowExportMenu(false);
        let content: string;
        let filename: string;
        let mime: string;

        switch (format) {
            case 'txt':
                content = translationService.exportAsText(turns, sourceLang, targetLang);
                filename = `windy-translate-${Date.now()}.txt`;
                mime = 'text/plain';
                break;
            case 'md':
                content = translationService.exportAsMarkdown(turns, sourceLang, targetLang);
                filename = `windy-translate-${Date.now()}.md`;
                mime = 'text/markdown';
                break;
            case 'srt':
                content = translationService.exportAsSrt(turns);
                filename = `windy-translate-${Date.now()}.srt`;
                mime = 'text/plain';
                break;
        }

        try {
            await translationService.shareExport(content, filename, mime);
        } catch (err) {
            Alert.alert('Export Failed', 'Could not share the file.');
        }
    };

    // ─── Render ────────────────────────────────────────────────

    if (mode === 'split-screen') {
        return (
            <View style={styles.container}>
                {/* Speaker B (top, rotated 180°) */}
                <View style={[styles.splitHalf, styles.splitTop]}>
                    <View style={{ transform: [{ rotate: '180deg' }], flex: 1 }}>
                        <SplitSpeakerPanel
                            speaker="B"
                            lang={targetLang}
                            turns={turns}
                            isActive={activeSpeaker === 'B'}
                            isRecording={isRecording}
                            processing={processing}
                            onPress={() => { setActiveSpeaker('B'); handleRecord(); }}
                            scrollRef={scrollRefB}
                            getFlag={getFlag}
                            getName={getName}
                        />
                    </View>
                </View>

                {/* Divider */}
                <View style={styles.splitDivider}>
                    <Text style={styles.splitDividerText}>{getFlag(sourceLang)} ⇄ {getFlag(targetLang)}</Text>
                    <Pressable
                        onPress={() => setMode('manual')}
                        style={styles.splitExitBtn}
                    >
                        <Text style={styles.splitExitText}>✕ Exit Split</Text>
                    </Pressable>
                </View>

                {/* Speaker A (bottom) */}
                <View style={[styles.splitHalf, styles.splitBottom]}>
                    <SplitSpeakerPanel
                        speaker="A"
                        lang={sourceLang}
                        turns={turns}
                        isActive={activeSpeaker === 'A'}
                        isRecording={isRecording}
                        processing={processing}
                        onPress={() => { setActiveSpeaker('A'); handleRecord(); }}
                        scrollRef={scrollRefA}
                        getFlag={getFlag}
                        getName={getName}
                    />
                </View>
            </View>
        );
    }

    // ─── Normal Layout (Manual / Auto) ─────────────────────────

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backBtn}>
                    <Text style={styles.backText}>← Back</Text>
                </Pressable>
                <Text style={styles.title}>Windy Translate</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable style={styles.iconBtn} onPress={() => router.push('/ocr')}>
                        <Text style={styles.iconBtnText}>📷</Text>
                    </Pressable>
                    {turns.length > 0 && (
                        <Pressable style={styles.iconBtn} onPress={() => setShowExportMenu(true)}>
                            <Text style={styles.iconBtnText}>📤</Text>
                        </Pressable>
                    )}
                    <Pressable style={styles.iconBtn} onPress={() => setShowModeMenu(true)}>
                        <Text style={styles.iconBtnText}>⚙️</Text>
                    </Pressable>
                </View>
            </View>

            {/* Mode Indicator */}
            <View style={styles.modeRow}>
                {(['manual', 'auto', 'split-screen'] as ConversationMode[]).map((m) => (
                    <Pressable
                        key={m}
                        style={[styles.modeChip, mode === m && styles.modeChipActive]}
                        onPress={() => { setMode(m); feedbackService.tap(); }}
                    >
                        <Text style={[styles.modeChipText, mode === m && styles.modeChipTextActive]}>
                            {m === 'manual' ? '👆 Manual' : m === 'auto' ? '🤖 Auto' : '📱 Split'}
                        </Text>
                    </Pressable>
                ))}
            </View>

            {/* Language Selector */}
            <View style={styles.langRow}>
                <Pressable
                    style={styles.langButton}
                    onPress={() => setShowLangPicker('source')}
                >
                    <Text style={styles.langFlag}>{getFlag(sourceLang)}</Text>
                    <Text style={styles.langName}>{getName(sourceLang)}</Text>
                </Pressable>

                <Pressable style={styles.swapButton} onPress={swapLanguages}>
                    <Text style={styles.swapText}>⇄</Text>
                </Pressable>

                <Pressable
                    style={styles.langButton}
                    onPress={() => setShowLangPicker('target')}
                >
                    <Text style={styles.langFlag}>{getFlag(targetLang)}</Text>
                    <Text style={styles.langName}>{getName(targetLang)}</Text>
                </Pressable>
            </View>

            {/* Conversation */}
            <ScrollView
                ref={scrollRefA}
                style={styles.conversation}
                contentContainerStyle={styles.conversationContent}
                keyboardDismissMode="on-drag"
            >
                {turns.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyEmoji}>🌪️</Text>
                        <Text style={styles.emptyTitle}>
                            {mode === 'auto' ? 'Start speaking in any language'
                                : 'Select a speaker, then record'}
                        </Text>
                        <Text style={styles.emptySubtitle}>
                            Windy translates your speech in real-time
                        </Text>
                    </View>
                ) : (
                    turns.map((turn) => (
                        <Pressable
                            key={turn.id}
                            style={[
                                styles.bubble,
                                turn.speaker === 'A' ? styles.bubbleLeft : styles.bubbleRight,
                                turn.favorite && styles.bubbleFavorite,
                            ]}
                            onPress={() => {
                                translationService.speak(turn.translated, turn.toLang);
                            }}
                            onLongPress={() => handleCopyTurn(turn)}
                        >
                            <View style={styles.bubbleTopRow}>
                                <Text style={styles.bubbleSpeaker}>
                                    {getFlag(turn.fromLang)} Speaker {turn.speaker}
                                </Text>
                                <View style={styles.bubbleActions}>
                                    {turn.confidence !== undefined && (
                                        <View style={[styles.confidenceBadge, { backgroundColor: getConfidenceColor(turn.confidence) }]}>
                                            <Text style={styles.confidenceText}>{Math.round(turn.confidence * 100)}%</Text>
                                        </View>
                                    )}
                                    <Pressable onPress={() => handleToggleFavorite(turn.id)} hitSlop={8}>
                                        <Text style={styles.favoriteBtn}>{turn.favorite ? '⭐' : '☆'}</Text>
                                    </Pressable>
                                    <Pressable onPress={() => handleCopyTurn(turn)} hitSlop={8}>
                                        <Text style={styles.copyBtn}>📋</Text>
                                    </Pressable>
                                </View>
                            </View>
                            {turn.detectedLang && (
                                <Text style={styles.detectedLangHint}>
                                    🔍 Detected: {getName(turn.detectedLang)}
                                </Text>
                            )}
                            <Text style={styles.bubbleOriginal}>{turn.original}</Text>
                            <View style={styles.bubbleDivider} />
                            <View style={styles.bubbleTransRow}>
                                <Text style={styles.bubbleTranslated}>
                                    {getFlag(turn.toLang)} {turn.translated}
                                </Text>
                                <Text style={styles.bubbleTtsHint}>🔊</Text>
                            </View>
                        </Pressable>
                    ))
                )}
            </ScrollView>

            {/* Controls */}
            <View style={styles.controls}>
                {/* Speaker Toggle (hidden in auto mode) */}
                {mode === 'manual' && (
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
                )}

                {mode === 'auto' && (
                    <View style={styles.autoDetectRow}>
                        <Text style={styles.autoHint}>
                            🤖 Language auto-detected — just speak naturally
                        </Text>
                        {detectedLangInfo && (
                            <Text style={styles.detectedLangBadge}>
                                {getFlag(detectedLangInfo.lang)} {getName(detectedLangInfo.lang)} ({Math.round(detectedLangInfo.confidence * 100)}%)
                            </Text>
                        )}
                    </View>
                )}

                {/* Record + TTS Toggle */}
                <View style={styles.recordRow}>
                    <Pressable
                        style={[styles.ttsBtn, ttsEnabled && styles.ttsBtnActive]}
                        onPress={() => {
                            setTtsEnabled(!ttsEnabled);
                            translationService.setTtsEnabled(!ttsEnabled);
                            feedbackService.tap();
                        }}
                    >
                        <Text style={styles.ttsBtnText}>{ttsEnabled ? '🔊' : '🔇'}</Text>
                    </Pressable>

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

                    {turns.length > 0 && (
                        <Pressable
                            style={styles.clearMiniBtn}
                            onPress={() => Alert.alert('Clear?', 'Remove all messages?', [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Clear', style: 'destructive', onPress: () => setTurns([]) },
                            ])}
                        >
                            <Text style={styles.ttsBtnText}>🗑</Text>
                        </Pressable>
                    )}
                </View>
            </View>

            {/* Language Picker Modal */}
            <Modal visible={showLangPicker !== null} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>
                                {showLangPicker === 'source' ? 'Source Language' : 'Target Language'}
                            </Text>
                            <Pressable onPress={() => setShowLangPicker(null)}>
                                <Text style={styles.modalClose}>✕</Text>
                            </Pressable>
                        </View>
                        <FlatList
                            data={TIER_1_LANGUAGES}
                            keyExtractor={(item) => item.code}
                            renderItem={({ item }) => {
                                const isSelected = showLangPicker === 'source'
                                    ? item.code === sourceLang
                                    : item.code === targetLang;
                                return (
                                    <Pressable
                                        style={[styles.langPickerRow, isSelected && styles.langPickerSelected]}
                                        onPress={() => {
                                            if (showLangPicker === 'source') setSourceLang(item.code);
                                            else setTargetLang(item.code);
                                            setShowLangPicker(null);
                                            feedbackService.tap();
                                        }}
                                    >
                                        <Text style={styles.langPickerFlag}>{item.flag}</Text>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.langPickerName}>{item.name}</Text>
                                            <Text style={styles.langPickerNative}>{item.nativeName}</Text>
                                        </View>
                                        {isSelected && <Text style={styles.langPickerCheck}>✓</Text>}
                                    </Pressable>
                                );
                            }}
                        />
                    </View>
                </View>
            </Modal>

            {/* Export Modal */}
            <Modal visible={showExportMenu} transparent animationType="fade">
                <Pressable style={styles.modalOverlay} onPress={() => setShowExportMenu(false)}>
                    <View style={styles.exportSheet}>
                        <Text style={styles.exportTitle}>Export Conversation</Text>
                        <Pressable style={styles.exportOption} onPress={() => handleExport('txt')}>
                            <Text style={styles.exportOptionEmoji}>📄</Text>
                            <Text style={styles.exportOptionText}>Plain Text (.txt)</Text>
                        </Pressable>
                        <Pressable style={styles.exportOption} onPress={() => handleExport('md')}>
                            <Text style={styles.exportOptionEmoji}>📝</Text>
                            <Text style={styles.exportOptionText}>Markdown (.md)</Text>
                        </Pressable>
                        <Pressable style={styles.exportOption} onPress={() => handleExport('srt')}>
                            <Text style={styles.exportOptionEmoji}>🎬</Text>
                            <Text style={styles.exportOptionText}>Subtitles (.srt)</Text>
                        </Pressable>
                        <Pressable style={[styles.exportOption, { marginTop: 8 }]} onPress={() => setShowExportMenu(false)}>
                            <Text style={[styles.exportOptionText, { color: colors.textTertiary }]}>Cancel</Text>
                        </Pressable>
                    </View>
                </Pressable>
            </Modal>

            {/* Mode Menu Modal */}
            <Modal visible={showModeMenu} transparent animationType="fade">
                <Pressable style={styles.modalOverlay} onPress={() => setShowModeMenu(false)}>
                    <View style={styles.exportSheet}>
                        <Text style={styles.exportTitle}>Settings</Text>
                        <View style={styles.settingsRow}>
                            <Text style={styles.settingsLabel}>TTS Playback</Text>
                            <Pressable
                                style={[styles.settingsToggle, ttsEnabled && styles.settingsToggleOn]}
                                onPress={() => {
                                    setTtsEnabled(!ttsEnabled);
                                    translationService.setTtsEnabled(!ttsEnabled);
                                }}
                            >
                                <Text style={styles.settingsToggleText}>{ttsEnabled ? 'ON' : 'OFF'}</Text>
                            </Pressable>
                        </View>
                        <Pressable style={[styles.exportOption, { marginTop: 8 }]} onPress={() => setShowModeMenu(false)}>
                            <Text style={[styles.exportOptionText, { color: colors.textTertiary }]}>Done</Text>
                        </Pressable>
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
}

// ─── Split-Screen Speaker Panel ────────────────────────────────

function SplitSpeakerPanel({ speaker, lang, turns, isActive, isRecording, processing, onPress, scrollRef, getFlag, getName }: {
    speaker: 'A' | 'B'; lang: string; turns: ConversationTurn[];
    isActive: boolean; isRecording: boolean; processing: boolean;
    onPress: () => void; scrollRef: React.RefObject<ScrollView>;
    getFlag: (c: string) => string; getName: (c: string) => string;
}) {
    const speakerTurns = turns.filter((t) => t.speaker === speaker);
    const bgColor = speaker === 'A' ? colors.background : '#0d1f17';

    return (
        <View style={[styles.splitPanel, { backgroundColor: bgColor }]}>
            {/* Speaker label */}
            <Text style={styles.splitLabel}>
                {getFlag(lang)} {getName(lang)} — Speaker {speaker}
            </Text>

            {/* Messages */}
            <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
                {speakerTurns.map((t) => (
                    <View key={t.id} style={styles.splitBubble}>
                        <Text style={styles.splitOriginal}>{t.original}</Text>
                        <Text style={styles.splitTranslated}>{getFlag(t.toLang)} {t.translated}</Text>
                    </View>
                ))}
            </ScrollView>

            {/* Record button */}
            <Pressable
                style={[
                    styles.splitRecordBtn,
                    isActive && isRecording && styles.splitRecordBtnActive,
                    isActive && processing && styles.splitRecordBtnProcessing,
                ]}
                onPress={onPress}
            >
                <Text style={styles.splitRecordText}>
                    {isActive && processing ? '⏳ Translating...'
                        : isActive && isRecording ? '⏹ Stop'
                            : `🎤 Tap to Speak ${getName(lang)}`}
                </Text>
            </Pressable>
        </View>
    );
}

// ─── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingTop: Platform.OS === 'ios' ? 60 : 40 },

    // Header
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.screenPadding, marginBottom: 8 },
    backBtn: { marginRight: spacing.md },
    backText: { fontSize: 16, color: colors.accent },
    title: { fontSize: 20, fontWeight: '600', color: colors.textPrimary, flex: 1 },
    iconBtn: { padding: spacing.xs },
    iconBtnText: { fontSize: 18 },

    // Mode chips
    modeRow: { flexDirection: 'row', paddingHorizontal: spacing.screenPadding, gap: 8, marginBottom: 12 },
    modeChip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight },
    modeChipActive: { borderColor: colors.accent, backgroundColor: colors.accentTransparent },
    modeChipText: { fontSize: 13, color: colors.textSecondary },
    modeChipTextActive: { color: colors.accent, fontWeight: '600' },

    // Language selector
    langRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, marginBottom: 12 },
    langButton: { alignItems: 'center', backgroundColor: colors.surface, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.lg },
    langFlag: { fontSize: 28 },
    langName: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
    swapButton: { backgroundColor: colors.surface, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    swapText: { fontSize: 20, color: colors.accent },

    // Conversation
    conversation: { flex: 1, paddingHorizontal: spacing.screenPadding },
    conversationContent: { paddingBottom: spacing.lg },
    emptyState: { alignItems: 'center', marginTop: 60 },
    emptyEmoji: { fontSize: 48, marginBottom: 12 },
    emptyTitle: { fontSize: 16, color: colors.textSecondary, fontWeight: '500', textAlign: 'center' },
    emptySubtitle: { fontSize: 14, color: colors.textTertiary, marginTop: 4, textAlign: 'center' },

    // Bubbles
    bubble: { marginBottom: spacing.md, borderRadius: borderRadius.lg, padding: spacing.md, maxWidth: '85%' },
    bubbleLeft: { backgroundColor: colors.surface, alignSelf: 'flex-start' },
    bubbleRight: { backgroundColor: '#1a3a2e', alignSelf: 'flex-end' },
    bubbleSpeaker: { fontSize: 11, color: colors.textTertiary, marginBottom: 4 },
    bubbleOriginal: { fontSize: 15, color: colors.textPrimary, lineHeight: 22 },
    bubbleDivider: { height: 1, backgroundColor: colors.borderLight, marginVertical: 8 },
    bubbleTransRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    bubbleTranslated: { fontSize: 15, color: colors.accent, lineHeight: 22, flex: 1 },
    bubbleTtsHint: { fontSize: 14, color: colors.textTertiary, marginLeft: 8 },
    bubbleFavorite: { borderWidth: 1, borderColor: 'rgba(234, 179, 8, 0.4)' },
    bubbleTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    bubbleActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    confidenceBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
    confidenceText: { fontSize: 10, fontWeight: '700', color: colors.textPrimary },
    favoriteBtn: { fontSize: 16 },
    copyBtn: { fontSize: 14 },
    detectedLangHint: { fontSize: 11, color: colors.textTertiary, marginBottom: 4, fontStyle: 'italic' },

    // Controls
    controls: { paddingHorizontal: spacing.screenPadding, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
    speakerRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: 10 },
    speakerBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    speakerActive: { borderColor: colors.accent, backgroundColor: colors.accentTransparent },
    speakerText: { fontSize: 14, color: colors.textPrimary },
    autoDetectRow: { alignItems: 'center', marginBottom: 10 },
    autoHint: { fontSize: 13, color: colors.textTertiary, textAlign: 'center' },
    detectedLangBadge: { fontSize: 12, color: colors.accent, fontWeight: '600', marginTop: 2 },
    recordRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    ttsBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderLight },
    ttsBtnActive: { borderColor: colors.accent },
    ttsBtnText: { fontSize: 18 },
    clearMiniBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    recordBtn: { flex: 1, backgroundColor: colors.surface, borderRadius: borderRadius.lg, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 2, borderColor: colors.border },
    recordBtnActive: { borderColor: colors.stateRecording, backgroundColor: 'rgba(34,197,94,0.1)' },
    recordBtnProcessing: { borderColor: colors.stateProcessing, backgroundColor: 'rgba(234,179,8,0.1)' },
    recordBtnEmoji: { fontSize: 24 },
    recordBtnText: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },

    // Language Picker Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: SCREEN_HEIGHT * 0.6, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
    modalTitle: { fontSize: 18, fontWeight: '600', color: colors.textPrimary },
    modalClose: { fontSize: 20, color: colors.textTertiary, padding: 4 },
    langPickerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
    langPickerSelected: { backgroundColor: colors.accentTransparent },
    langPickerFlag: { fontSize: 28 },
    langPickerName: { fontSize: 16, color: colors.textPrimary, fontWeight: '500' },
    langPickerNative: { fontSize: 13, color: colors.textSecondary },
    langPickerCheck: { fontSize: 18, color: colors.accent, fontWeight: '700' },

    // Export Modal
    exportSheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 20 },
    exportTitle: { fontSize: 18, fontWeight: '600', color: colors.textPrimary, marginBottom: 16 },
    exportOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
    exportOptionEmoji: { fontSize: 22 },
    exportOptionText: { fontSize: 16, color: colors.textPrimary },

    // Settings
    settingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
    settingsLabel: { fontSize: 16, color: colors.textPrimary },
    settingsToggle: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.surface },
    settingsToggleOn: { backgroundColor: colors.accentTransparent },
    settingsToggleText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },

    // Split-Screen
    splitHalf: { flex: 1 },
    splitTop: {},
    splitBottom: {},
    splitDivider: { height: 40, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
    splitDividerText: { fontSize: 16, color: colors.textPrimary },
    splitExitBtn: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: colors.border },
    splitExitText: { fontSize: 12, color: colors.textSecondary },
    splitPanel: { flex: 1, paddingTop: 8 },
    splitLabel: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, textAlign: 'center', paddingVertical: 8 },
    splitBubble: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: 10, marginBottom: 8 },
    splitOriginal: { fontSize: 14, color: colors.textPrimary, marginBottom: 4 },
    splitTranslated: { fontSize: 14, color: colors.accent },
    splitRecordBtn: { padding: 16, alignItems: 'center', backgroundColor: colors.surface, marginHorizontal: 12, marginBottom: 8, borderRadius: borderRadius.lg, borderWidth: 2, borderColor: colors.border },
    splitRecordBtnActive: { borderColor: colors.stateRecording, backgroundColor: 'rgba(34,197,94,0.1)' },
    splitRecordBtnProcessing: { borderColor: colors.stateProcessing },
    splitRecordText: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
});
