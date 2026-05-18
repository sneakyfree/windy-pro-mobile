/**
 * 🧬 M6 — Windy Translate Conversation Mode (Enhanced)
 * Three modes: Manual, Auto, Split-Screen
 * Features: Speech-to-speech, press-and-hold mic, animated waveform,
 * TTS, language picker, export, history, favorites, confidence
 */
import {
    View, Text, StyleSheet, Pressable, ScrollView, Platform,
    Alert, Modal, FlatList, Dimensions, Animated, KeyboardAvoidingView, Share, Linking,
    RefreshControl,
} from 'react-native';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, borderRadius, fontSizes } from '@/theme';
import { PAIR_DOWNLOAD_URL } from '@/config/api';
import {
    translationService, TIER_1_LANGUAGES,
    type ConversationTurn, type ConversationMode,
} from '@/services/translation';
import { feedbackService } from '@/services/feedback';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { useUsageLimits } from '@/hooks/useUsageLimits';
import { useHaptic } from '@/hooks/useHaptic';
import { useAccessibility } from '@/hooks/useAccessibility';
import { SpeechWaveform } from '@/components/SpeechWaveform';
import { SpeechTranslationError, SPEECH_ERROR_MESSAGES } from '@/services/speech-translation';
import { networkMonitor, type NetworkStatus } from '@/services/network-monitor';
import { analyticsService } from '@/services/analytics';
import { ratingPromptService } from '@/services/rating-prompt';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { EmptyState } from '@/components/EmptyState';
import { subscriptionService } from '@/services/subscription';
import { pairManager, type PairLimitResult, PAIR_LIMITS } from '@/services/pairManager';
import type { TranscriptSegment } from '@/types';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const HISTORY_KEY = 'windy-translate-history';
const MAX_HISTORY = 50;

export default function TranslateScreen() {
    const router = useRouter();
    const { requireFeature, tier } = useFeatureGate();
    const { requireUsage, recordUsage, checkLimit, isPaid } = useUsageLimits();
    const haptic = useHaptic();
    const { announce } = useAccessibility();
    const [remainingTranslations, setRemainingTranslations] = useState<number | null>(null);

    // Load remaining count on mount and when tier changes
    useEffect(() => {
        checkLimit('translation').then(({ remaining }) => setRemainingTranslations(remaining));
    }, [tier]);

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
    const [refreshingHistory, setRefreshingHistory] = useState(false);
    const [copyToast, setCopyToast] = useState(false);
    const [detectedLangInfo, setDetectedLangInfo] = useState<{ lang: string; confidence: number } | null>(null);
    const [audioLevel, setAudioLevel] = useState(0);
    const [networkStatus, setNetworkStatus] = useState<NetworkStatus>('online');
    const [queueSize, setQueueSize] = useState(0);
    const scrollRefA = useRef<ScrollView>(null);
    const scrollRefB = useRef<ScrollView>(null);
    const conversationStartTime = useRef(Date.now());
    const toastAnim = useRef(new Animated.Value(0)).current;
    const recordingRef = useRef<Audio.Recording | null>(null);

    useEffect(() => {
        if (!requireFeature('translate', 'Windy Translate')) {
            router.back();
        }
        loadHistory();

        // Subscribe to network status (monitor started in _layout.tsx)
        const unsubStatus = networkMonitor.onStatusChange((status) => {
            setNetworkStatus(status);
            setQueueSize(networkMonitor.getQueueSize());
        });

        return () => {
            unsubStatus();
            // Clean up any active recording on unmount
            if (recordingRef.current) {
                recordingRef.current.stopAndUnloadAsync()
                    .then(() => Audio.setAudioModeAsync({ allowsRecordingIOS: false }))
                    .catch(() => { });
                recordingRef.current = null;
            }
        };
    }, []);

    const loadHistory = async () => {
        try {
            const raw = await AsyncStorage.getItem(HISTORY_KEY);
            if (raw) setHistory(JSON.parse(raw));
        } catch (err) { console.warn("[Translate] Error:", err); }
    };

    const handleRefreshHistory = useCallback(async () => {
        setRefreshingHistory(true);
        await loadHistory();
        setRefreshingHistory(false);
    }, []);

    const saveToHistory = async (turn: ConversationTurn) => {
        try {
            const newHistory = [turn, ...history].slice(0, MAX_HISTORY);
            setHistory(newHistory);
            await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
        } catch (err) { console.warn("[Translate] Error:", err); }
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

    // iOS share sheet for translations
    const handleShareTurn = async (turn: ConversationTurn) => {
        try {
            const shareText = `"${turn.original}"\n→ "${turn.translated}"\n\nTranslated with Windy Word 🌪️`;
            await Share.share({
                message: shareText,
                title: 'Windy Word Translation',
            });
            feedbackService.tap();
        } catch (err) { console.warn("[Translate] User action:", err); }
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

    // ─── L5: Contextual Pair Purchase Alert ────────────────────

    const showPairPurchaseAlert = (from: string, to: string) => {
        const pairId = `windy-pair-${from}-${to}`;
        const targetFlag = TIER_1_LANGUAGES.find(l => l.code === to)?.flag || '🌐';
        const fromName = translationService.getLangName(from).toUpperCase();
        const toName = translationService.getLangName(to);

        Alert.alert(
            `${targetFlag} ${fromName}\u2194${toName} Engine Needed`,
            `Download once, translate offline forever. \u2b50\u2b50\u2b50 Good \u00b7 590 MB \u00b7 $6.99`,
            [
                {
                    text: 'Buy $6.99',
                    onPress: async () => {
                        try {
                            const offerings = await subscriptionService.getOfferings();
                            const pkg = offerings[0]?.packages[0]?.rcPackage;
                            if (pkg) {
                                const result = await subscriptionService.purchasePackage(pkg);
                                if (result.success) {
                                    haptic.success();
                                    await pairManager.downloadPair(pairId, PAIR_DOWNLOAD_URL(pairId));
                                }
                            } else {
                                Alert.alert('Store Unavailable', 'Could not load offerings. Try again later.');
                            }
                        } catch (err) {
                            Alert.alert('Purchase Error', 'Could not complete purchase.');
                        }
                    },
                },
                { text: 'Use Cloud', style: 'default' },
                { text: 'Cancel', style: 'cancel' },
            ],
        );
    };

    const showPairLimitAlert = (result: PairLimitResult) => {
        const tierName = result.tier.charAt(0).toUpperCase() + result.tier.slice(1);
        Alert.alert(
            'Engine Limit Reached',
            `Your ${tierName} plan includes ${result.limit} engines. Upgrade to Ultra for 25, or buy individually.`,
            [
                {
                    text: 'Upgrade Plan',
                    onPress: async () => {
                        try {
                            const offerings = await subscriptionService.getOfferings();
                            const pkg = offerings[0]?.packages[0]?.rcPackage;
                            if (pkg) await subscriptionService.purchasePackage(pkg);
                        } catch { /* ignore */ }
                    },
                },
                { text: 'Buy This Engine $6.99', style: 'default' },
                { text: 'Cancel', style: 'cancel' },
            ],
        );
    };

    // ─── Press-and-Hold Recording + Speech Translation ─────────

    /** Start recording on press-in */
    const handlePressIn = useCallback(async () => {
        if (processing) return;
        try {
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });
            const { recording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY,
                (status) => {
                    if (status.isRecording && status.metering != null) {
                        // Normalize metering from dB (-160..0) to 0..1
                        const normalized = Math.max(0, Math.min(1, (status.metering + 60) / 60));
                        setAudioLevel(normalized);
                    }
                },
                100 // metering interval ms
            );
            recordingRef.current = recording;
            setIsRecording(true);
            setAudioLevel(0);
            haptic.medium();
            feedbackService.recordStart();
            announce('Recording started. Speak now.');
        } catch (err: unknown) {
            console.error('[Translate] Start recording failed:', err);
            haptic.error();
            const errMsg = err instanceof Error ? err.message : '';
            const isPermission = errMsg.includes('permission') || errMsg.includes('not granted');
            if (isPermission) {
                Alert.alert(
                    'Microphone Access Required',
                    'Windy Word needs microphone access to translate speech. Please enable it in Settings.',
                    [
                        { text: 'Cancel', style: 'cancel' },
                        {
                            text: 'Open Settings', onPress: () => {
                                if (Platform.OS === 'ios') {
                                    Linking.openSettings();
                                }
                            }
                        },
                    ]
                );
            } else {
                Alert.alert('Recording Error', 'Could not start recording. Please try again.');
            }
        }
    }, [processing, haptic]);

    /** Stop recording on press-out, send to speech API */
    const handlePressOut = useCallback(async () => {
        if (!recordingRef.current || !isRecording) return;
        setIsRecording(false);
        setProcessing(true);
        setAudioLevel(0);
        haptic.light();

        try {
            await recordingRef.current.stopAndUnloadAsync();
            const uri = recordingRef.current.getURI();
            recordingRef.current = null;

            await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

            if (!uri) {
                setProcessing(false);
                return;
            }

            // Check daily usage limit for free tier
            const allowed = await requireUsage('translation', 'translations');
            if (!allowed) {
                setProcessing(false);
                return;
            }

            // Determine speaker direction
            let speaker = activeSpeaker;
            let fromLang = speaker === 'A' ? sourceLang : targetLang;
            let toLang = speaker === 'A' ? targetLang : sourceLang;

            // In auto mode, send with 'auto' source to detect language
            if (mode === 'auto') {
                fromLang = 'auto';
                toLang = targetLang; // default target
            }

            // Send audio to speech translation API
            const result = await translationService.translateSpeech(uri, fromLang, toLang);

            if (!result.originalText && !result.translated) {
                setProcessing(false);
                haptic.warning();
                return;
            }

            // Auto-detect: update speaker and language direction based on detection
            if (mode === 'auto' && result.detectedLanguage) {
                setDetectedLangInfo({ lang: result.detectedLanguage, confidence: result.confidence });
                // If detected lang matches target, swap direction
                if (result.detectedLanguage === targetLang) {
                    speaker = 'B';
                    fromLang = targetLang;
                    toLang = sourceLang;
                } else {
                    speaker = 'A';
                    fromLang = result.detectedLanguage;
                    // Auto-select source if different from current
                    if (result.detectedLanguage !== sourceLang) {
                        setSourceLang(result.detectedLanguage);
                    }
                }
            }

            const elapsed = (Date.now() - conversationStartTime.current) / 1000;
            const turn: ConversationTurn = {
                id: `turn-${Date.now()}`,
                speaker,
                original: result.originalText,
                translated: result.translated,
                fromLang,
                toLang,
                timestamp: Date.now(),
                startTime: elapsed,
                endTime: elapsed + 5,
                confidence: result.confidence,
                detectedLang: result.detectedLanguage,
                favorite: false,
            };
            setTurns((prev) => [...prev, turn]);
            saveToHistory(turn);
            haptic.success();
            announce(`Translation complete. ${result.translated}`);

            // Record usage + track analytics + rating prompt
            const newRemaining = await recordUsage('translation');
            setRemainingTranslations(newRemaining);
            analyticsService.trackTranslation(fromLang, toLang);
            ratingPromptService.recordTranslation();

            // TTS: speak the translation aloud
            if (ttsEnabled) {
                await translationService.speak(result.translated, toLang);
            }

            // Auto-alternate speaker in split-screen mode
            if (mode === 'split-screen') {
                setActiveSpeaker(speaker === 'A' ? 'B' : 'A');
            }

            // Auto-scroll
            setTimeout(() => {
                scrollRefA.current?.scrollToEnd({ animated: true });
                scrollRefB.current?.scrollToEnd({ animated: true });
            }, 100);
        } catch (err) {
            console.error('[Translate] Speech translation error:', err);
            haptic.error();

            // If network error, queue for later
            if (err instanceof SpeechTranslationError && err.type === 'network') {
                // Note: audio file was already cleaned up, so we can't queue it.
                // Show the offline message.
                Alert.alert('Offline', SPEECH_ERROR_MESSAGES.network);
                setQueueSize(networkMonitor.getQueueSize());
            } else {
                // L5: Check if this is a pair-not-found scenario
                const errFromLang = activeSpeaker === 'A' ? sourceLang : targetLang;
                const errToLang = activeSpeaker === 'A' ? targetLang : sourceLang;
                const pairId = `windy-pair-${errFromLang}-${errToLang}`;
                let hasPair = true;
                try { hasPair = await pairManager.isDownloaded(pairId); } catch { /* ignore */ }

                if (!hasPair) {
                    showPairPurchaseAlert(errFromLang, errToLang);
                } else {
                    const message = err instanceof SpeechTranslationError
                        ? SPEECH_ERROR_MESSAGES[err.type]
                        : 'Could not translate speech. Check your connection.';
                    Alert.alert('Translation Error', message);
                }
            }
        } finally {
            setProcessing(false);
        }
    }, [isRecording, activeSpeaker, sourceLang, targetLang, mode, ttsEnabled, haptic]);

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
            <ScreenErrorBoundary screenName="Translate">
                <View style={styles.container}>
                    {/* Speaker B (top, rotated 180°) */}
                    <View style={[styles.splitHalf, styles.splitTop]}>
                        <View style={{ transform: [{ rotate: '180deg' }], flex: 1 }}>
                            <SplitSpeakerPanel
                                speaker="B"
                                lang={targetLang}
                                otherLang={sourceLang}
                                turns={turns}
                                isActive={activeSpeaker === 'B'}
                                isRecording={isRecording}
                                processing={processing}
                                onPressIn={() => { setActiveSpeaker('B'); handlePressIn(); }}
                                onPressOut={handlePressOut}
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
                            otherLang={targetLang}
                            turns={turns}
                            isActive={activeSpeaker === 'A'}
                            isRecording={isRecording}
                            processing={processing}
                            onPressIn={() => { setActiveSpeaker('A'); handlePressIn(); }}
                            onPressOut={handlePressOut}
                            scrollRef={scrollRefA}
                            getFlag={getFlag}
                            getName={getName}
                        />
                    </View>
                </View>
            </ScreenErrorBoundary>
        );
    }

    const renderLangPickerItem = useCallback(({ item }: any) => {
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
    }, [showLangPicker, sourceLang, targetLang]);

    // ─── Normal Layout (Manual / Auto) ─────────────────────────

    return (
        <ScreenErrorBoundary screenName="Translate">
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Go back" accessibilityRole="button">
                        <Text style={styles.backText}>← Back</Text>
                    </Pressable>
                    <Text style={styles.title}>Windy Translate</Text>
                    {networkStatus === 'offline' && (
                        <View style={styles.offlineBadge} accessibilityLabel="Currently offline" accessibilityRole="text">
                            <Text style={styles.offlineBadgeText}>📡 Offline</Text>
                        </View>
                    )}
                    {queueSize > 0 && (
                        <View style={styles.queueBadge} accessibilityLabel={`${queueSize} translations queued`} accessibilityRole="text">
                            <Text style={styles.queueBadgeText}>⏳ {queueSize}</Text>
                        </View>
                    )}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Pressable style={styles.iconBtn} onPress={() => router.push('/ocr')} accessibilityLabel="Open camera OCR" accessibilityRole="button">
                            <Text style={styles.iconBtnText}>📷</Text>
                        </Pressable>
                        {turns.length > 0 && (
                            <Pressable style={styles.iconBtn} onPress={() => setShowExportMenu(true)} accessibilityLabel="Export conversation" accessibilityRole="button">
                                <Text style={styles.iconBtnText}>📤</Text>
                            </Pressable>
                        )}
                        <Pressable style={styles.iconBtn} onPress={() => setShowModeMenu(true)} accessibilityLabel="Translation settings" accessibilityRole="button">
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
                            accessibilityLabel={`${m === 'manual' ? 'Manual' : m === 'auto' ? 'Auto detect' : 'Split screen'} mode`}
                            accessibilityRole="button"
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
                        accessibilityLabel={`Source language: ${getName(sourceLang)}`}
                        accessibilityRole="button"
                    >
                        <Text style={styles.langFlag}>{getFlag(sourceLang)}</Text>
                        <Text style={styles.langName}>{getName(sourceLang)}</Text>
                    </Pressable>

                    <Pressable style={styles.swapButton} onPress={swapLanguages} accessibilityLabel="Swap languages" accessibilityRole="button">
                        <Text style={styles.swapText}>⇄</Text>
                    </Pressable>

                    <Pressable
                        style={styles.langButton}
                        onPress={() => setShowLangPicker('target')}
                        accessibilityLabel={`Target language: ${getName(targetLang)}`}
                        accessibilityRole="button"
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
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshingHistory}
                            onRefresh={handleRefreshHistory}
                            tintColor={colors.accent}
                        />
                    }
                >
                    {turns.length === 0 ? (
                        <EmptyState
                            icon="🌪️"
                            title={mode === 'auto' ? 'Start speaking in any language' : 'Select a speaker, then record'}
                            subtitle="Windy translates your speech in real-time"
                        />
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
                                        <Pressable onPress={() => handleToggleFavorite(turn.id)} hitSlop={8} accessibilityLabel={turn.favorite ? 'Remove from favorites' : 'Add to favorites'} accessibilityRole="button">
                                            <Text style={styles.favoriteBtn}>{turn.favorite ? '⭐' : '☆'}</Text>
                                        </Pressable>
                                        <Pressable onPress={() => handleCopyTurn(turn)} hitSlop={8} accessibilityLabel="Copy translation" accessibilityRole="button">
                                            <Text style={styles.copyBtn}>📋</Text>
                                        </Pressable>
                                        <Pressable onPress={() => handleShareTurn(turn)} hitSlop={8} accessibilityLabel="Share translation" accessibilityRole="button">
                                            <Text style={styles.copyBtn}>📤</Text>
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
                                <View style={[
                                    styles.confidencePill,
                                    { backgroundColor: getConfidenceColor(detectedLangInfo.confidence) },
                                ]}>
                                    <Text style={styles.confidencePillText}>
                                        {getFlag(detectedLangInfo.lang)} {getName(detectedLangInfo.lang)} · {Math.round(detectedLangInfo.confidence * 100)}% confidence
                                    </Text>
                                </View>
                            )}
                        </View>
                    )}

                    {/* Waveform Visualizer */}
                    {(isRecording || processing) && (
                        <SpeechWaveform
                            isActive={isRecording}
                            level={audioLevel}
                            color={isRecording ? colors.accent : colors.stateProcessing}
                            height={48}
                        />
                    )}

                    {/* Record + TTS Toggle */}
                    <View style={styles.recordRow}>
                        <Pressable
                            style={[styles.ttsBtn, ttsEnabled && styles.ttsBtnActive]}
                            onPress={() => {
                                setTtsEnabled(!ttsEnabled);
                                translationService.setTtsEnabled(!ttsEnabled);
                                haptic.selection();
                            }}
                            accessibilityLabel={ttsEnabled ? 'Disable text-to-speech' : 'Enable text-to-speech'}
                            accessibilityRole="button"
                        >
                            <Text style={styles.ttsBtnText}>{ttsEnabled ? '🔊' : '🔇'}</Text>
                        </Pressable>

                        <Pressable
                            style={[
                                styles.recordBtn,
                                isRecording && styles.recordBtnActive,
                                processing && styles.recordBtnProcessing,
                            ]}
                            onPressIn={handlePressIn}
                            onPressOut={handlePressOut}
                            disabled={processing}
                            accessibilityLabel={processing ? 'Translating speech' : isRecording ? 'Release to translate' : 'Hold to record'}
                            accessibilityRole="button"
                            accessibilityHint="Press and hold to record your voice, release to translate"
                        >
                            <Text style={styles.recordBtnEmoji}>
                                {processing ? '⏳' : isRecording ? '🔴' : '🎤'}
                            </Text>
                            <Text style={styles.recordBtnText}>
                                {processing ? 'Translating...' : isRecording ? 'Release to Translate' : 'Hold to Speak'}
                            </Text>
                        </Pressable>

                        {turns.length > 0 && (
                            <Pressable
                                style={styles.clearMiniBtn}
                                onPress={() => Alert.alert('Clear?', 'Remove all messages?', [
                                    { text: 'Cancel', style: 'cancel' },
                                    { text: 'Clear', style: 'destructive', onPress: () => setTurns([]) },
                                ])}
                                accessibilityLabel="Clear conversation"
                                accessibilityRole="button"
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
                                renderItem={renderLangPickerItem}
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
        </ScreenErrorBoundary>
    );
}

// ─── Split-Screen Speaker Panel ────────────────────────────────

function SplitSpeakerPanel({ speaker, lang, otherLang, turns, isActive, isRecording, processing, onPressIn, onPressOut, scrollRef, getFlag, getName }: {
    speaker: 'A' | 'B'; lang: string; otherLang: string; turns: ConversationTurn[];
    isActive: boolean; isRecording: boolean; processing: boolean;
    onPressIn: () => void; onPressOut: () => void; scrollRef: React.RefObject<ScrollView | null>;
    getFlag: (c: string) => string; getName: (c: string) => string;
}) {
    const bgColor = speaker === 'A' ? colors.background : '#0d1f17';
    const pulseAnim = useRef(new Animated.Value(1)).current;

    // Pulse animation when this panel is the active speaker
    useEffect(() => {
        if (isActive && !isRecording && !processing) {
            const pulse = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.06, duration: 800, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
                ]),
            );
            pulse.start();
            return () => pulse.stop();
        } else {
            pulseAnim.setValue(1);
        }
    }, [isActive, isRecording, processing]);

    return (
        <View style={[styles.splitPanel, { backgroundColor: bgColor }]}>
            {/* Speaker label with active indicator */}
            <Text style={[styles.splitLabel, isActive && styles.splitLabelActive]}>
                {isActive ? '● ' : ''}{getFlag(lang)} {getName(lang)} — Speaker {speaker}
            </Text>

            {/* Dual transcript — all turns, styled per speaker */}
            <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
                {turns.map((t) => {
                    const isOwnTurn = t.speaker === speaker;
                    return (
                        <View key={t.id} style={[
                            styles.splitBubble,
                            !isOwnTurn && styles.splitBubbleOther,
                        ]}>
                            <Text style={[styles.splitSpeakerLabel, !isOwnTurn && { color: colors.textTertiary }]}>
                                {getFlag(t.fromLang)} Speaker {t.speaker}
                            </Text>
                            <Text style={[styles.splitOriginal, !isOwnTurn && { opacity: 0.6 }]}>
                                {isOwnTurn ? t.original : t.translated}
                            </Text>
                            <Text style={[styles.splitTranslated, !isOwnTurn && { opacity: 0.6 }]}>
                                {getFlag(isOwnTurn ? t.toLang : t.fromLang)} {isOwnTurn ? t.translated : t.original}
                            </Text>
                        </View>
                    );
                })}
            </ScrollView>

            {/* Record button — press-and-hold with pulse */}
            <Animated.View style={{ transform: [{ scale: isActive ? pulseAnim : 1 }] }}>
                <Pressable
                    style={[
                        styles.splitRecordBtn,
                        isActive && styles.splitRecordBtnReady,
                        isActive && isRecording && styles.splitRecordBtnActive,
                        isActive && processing && styles.splitRecordBtnProcessing,
                    ]}
                    onPressIn={onPressIn}
                    onPressOut={onPressOut}
                    accessibilityLabel={`Hold to speak ${getName(lang)}`}
                    accessibilityRole="button"
                >
                    <Text style={styles.splitRecordText}>
                        {isActive && processing ? '⏳ Translating...'
                            : isActive && isRecording ? '🔴 Release to Translate'
                                : isActive ? `🎤 Your turn — Hold to Speak ${getName(lang)}`
                                    : `⏸ Waiting for Speaker ${speaker === 'A' ? 'B' : 'A'}...`}
                    </Text>
                </Pressable>
            </Animated.View>
        </View>
    );
}

// ─── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingTop: Platform.OS === 'ios' ? 60 : 40 },

    // Header
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.screenPadding, marginBottom: 8 },
    backBtn: { marginRight: spacing.md },
    backText: { fontSize: fontSizes.base, color: colors.accent },
    title: { fontSize: fontSizes.xl, fontWeight: '600', color: colors.textPrimary, flex: 1 },
    iconBtn: { padding: spacing.xs },
    iconBtnText: { fontSize: fontSizes.lg },
    offlineBadge: { backgroundColor: 'rgba(239, 68, 68, 0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    offlineBadgeText: { fontSize: 11, fontWeight: '700', color: '#ef4444' },
    queueBadge: { backgroundColor: 'rgba(234, 179, 8, 0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    queueBadgeText: { fontSize: 11, fontWeight: '700', color: '#eab308' },

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
    swapText: { fontSize: fontSizes.xl, color: colors.accent },

    // Conversation
    conversation: { flex: 1, paddingHorizontal: spacing.screenPadding },
    conversationContent: { paddingBottom: spacing.lg },
    emptyState: { alignItems: 'center', marginTop: 60 },
    emptyEmoji: { fontSize: fontSizes['5xl'], marginBottom: 12 },
    emptyTitle: { fontSize: fontSizes.base, color: colors.textSecondary, fontWeight: '500', textAlign: 'center' },
    emptySubtitle: { fontSize: fontSizes.sm, color: colors.textTertiary, marginTop: 4, textAlign: 'center' },

    // Bubbles
    bubble: { marginBottom: spacing.md, borderRadius: borderRadius.lg, padding: spacing.md, maxWidth: '85%' },
    bubbleLeft: { backgroundColor: colors.surface, alignSelf: 'flex-start' },
    bubbleRight: { backgroundColor: '#1a3a2e', alignSelf: 'flex-end' },
    bubbleSpeaker: { fontSize: 11, color: colors.textTertiary, marginBottom: 4 },
    bubbleOriginal: { fontSize: 15, color: colors.textPrimary, lineHeight: 22 },
    bubbleDivider: { height: 1, backgroundColor: colors.borderLight, marginVertical: 8 },
    bubbleTransRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    bubbleTranslated: { fontSize: 15, color: colors.accent, lineHeight: 22, flex: 1 },
    bubbleTtsHint: { fontSize: fontSizes.sm, color: colors.textTertiary, marginLeft: 8 },
    bubbleFavorite: { borderWidth: 1, borderColor: 'rgba(234, 179, 8, 0.4)' },
    bubbleTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    bubbleActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    confidenceBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
    confidenceText: { fontSize: 10, fontWeight: '700', color: colors.textPrimary },
    favoriteBtn: { fontSize: fontSizes.base },
    copyBtn: { fontSize: fontSizes.sm },
    detectedLangHint: { fontSize: 11, color: colors.textTertiary, marginBottom: 4, fontStyle: 'italic' },
    confidencePill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginTop: 6, alignSelf: 'center' },
    confidencePillText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },

    // Controls
    controls: { paddingHorizontal: spacing.screenPadding, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
    speakerRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: 10 },
    speakerBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    speakerActive: { borderColor: colors.accent, backgroundColor: colors.accentTransparent },
    speakerText: { fontSize: fontSizes.sm, color: colors.textPrimary },
    autoDetectRow: { alignItems: 'center', marginBottom: 10 },
    autoHint: { fontSize: 13, color: colors.textTertiary, textAlign: 'center' },
    detectedLangBadge: { fontSize: fontSizes.xs, color: colors.accent, fontWeight: '600', marginTop: 2 },
    recordRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    ttsBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderLight },
    ttsBtnActive: { borderColor: colors.accent },
    ttsBtnText: { fontSize: fontSizes.lg },
    clearMiniBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    recordBtn: { flex: 1, backgroundColor: colors.surface, borderRadius: borderRadius.lg, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 2, borderColor: colors.border },
    recordBtnActive: { borderColor: colors.stateRecording, backgroundColor: 'rgba(34,197,94,0.1)' },
    recordBtnProcessing: { borderColor: colors.stateProcessing, backgroundColor: 'rgba(234,179,8,0.1)' },
    recordBtnEmoji: { fontSize: fontSizes['2xl'] },
    recordBtnText: { fontSize: fontSizes.base, fontWeight: '600', color: colors.textPrimary },

    // Language Picker Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: SCREEN_HEIGHT * 0.6, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
    modalTitle: { fontSize: fontSizes.lg, fontWeight: '600', color: colors.textPrimary },
    modalClose: { fontSize: fontSizes.xl, color: colors.textTertiary, padding: 4 },
    langPickerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
    langPickerSelected: { backgroundColor: colors.accentTransparent },
    langPickerFlag: { fontSize: 28 },
    langPickerName: { fontSize: fontSizes.base, color: colors.textPrimary, fontWeight: '500' },
    langPickerNative: { fontSize: 13, color: colors.textSecondary },
    langPickerCheck: { fontSize: fontSizes.lg, color: colors.accent, fontWeight: '700' },

    // Export Modal
    exportSheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 20 },
    exportTitle: { fontSize: fontSizes.lg, fontWeight: '600', color: colors.textPrimary, marginBottom: 16 },
    exportOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
    exportOptionEmoji: { fontSize: 22 },
    exportOptionText: { fontSize: fontSizes.base, color: colors.textPrimary },

    // Settings
    settingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
    settingsLabel: { fontSize: fontSizes.base, color: colors.textPrimary },
    settingsToggle: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.surface },
    settingsToggleOn: { backgroundColor: colors.accentTransparent },
    settingsToggleText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },

    // Split-Screen
    splitHalf: { flex: 1 },
    splitTop: {},
    splitBottom: {},
    splitDivider: { height: 40, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
    splitDividerText: { fontSize: fontSizes.base, color: colors.textPrimary },
    splitExitBtn: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: colors.border },
    splitExitText: { fontSize: fontSizes.xs, color: colors.textSecondary },
    splitPanel: { flex: 1, paddingTop: 8 },
    splitLabel: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.textSecondary, textAlign: 'center', paddingVertical: 8 },
    splitLabelActive: { color: colors.accent },
    splitBubble: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: 10, marginBottom: 8 },
    splitBubbleOther: { backgroundColor: 'rgba(255,255,255,0.03)' },
    splitSpeakerLabel: { fontSize: 11, fontWeight: '600', color: colors.textTertiary, marginBottom: 4 },
    splitOriginal: { fontSize: fontSizes.sm, color: colors.textPrimary, marginBottom: 4 },
    splitTranslated: { fontSize: fontSizes.sm, color: colors.accent },
    splitRecordBtn: { padding: 16, alignItems: 'center', backgroundColor: colors.surface, marginHorizontal: 12, marginBottom: 8, borderRadius: borderRadius.lg, borderWidth: 2, borderColor: colors.border },
    splitRecordBtnReady: { borderColor: colors.accent, backgroundColor: 'rgba(56,189,248,0.08)' },
    splitRecordBtnActive: { borderColor: colors.stateRecording, backgroundColor: 'rgba(34,197,94,0.1)' },
    splitRecordBtnProcessing: { borderColor: colors.stateProcessing },
    splitRecordText: { fontSize: fontSizes.base, fontWeight: '600', color: colors.textPrimary },
});
