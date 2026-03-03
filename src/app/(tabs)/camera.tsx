/**
 * 🧬 Camera Tab — OCR Translation
 * Point camera at text → extract → translate → overlay
 * Supports: English, Spanish, French, German, Mandarin
 */
import {
    View, Text, StyleSheet, Pressable, Platform,
    Alert, ScrollView, ActivityIndicator, Animated, Dimensions,
} from 'react-native';
import { useState, useRef, useCallback, useEffect } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, spacing, borderRadius } from '@/theme';
import { ocrService, type OcrTranslation } from '@/services/ocr';
import { translationService, TIER_1_LANGUAGES } from '@/services/translation';
import { feedbackService } from '@/services/feedback';
import { useFeatureGate } from '@/hooks/useFeatureGate';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/** Focused languages for camera translate */
const CAMERA_LANGUAGES = TIER_1_LANGUAGES.filter((l) =>
    ['en', 'es', 'fr', 'de', 'zh'].includes(l.code)
);

export default function CameraTab() {
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);

    const [targetLang, setTargetLang] = useState('es');
    const [capturing, setCapturing] = useState(false);
    const [result, setResult] = useState<OcrTranslation | null>(null);
    const [history, setHistory] = useState<OcrTranslation[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Live scan mode
    const [liveMode, setLiveMode] = useState(false);
    const [liveResult, setLiveResult] = useState<OcrTranslation | null>(null);
    const [frozen, setFrozen] = useState(false);
    const [detectedLang, setDetectedLang] = useState<string | null>(null);
    const liveScanRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const scanningRef = useRef(false);
    const isMountedRef = useRef(true);

    const overlayOpacity = useRef(new Animated.Value(0)).current;

    // Show overlay animation
    useEffect(() => {
        if (result) {
            Animated.timing(overlayOpacity, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }).start();
        } else {
            overlayOpacity.setValue(0);
        }
    }, [result]);

    // Clean up live scan on unmount
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (liveScanRef.current) clearInterval(liveScanRef.current);
        };
    }, []);

    const getFlag = (code: string) => translationService.getFlag(code);
    const getName = (code: string) => translationService.getLangName(code);

    const handleCapture = useCallback(async () => {
        if (!cameraRef.current || capturing) return;

        setCapturing(true);
        setError(null);
        setResult(null);
        feedbackService.tap();

        try {
            const photo = await cameraRef.current.takePictureAsync({
                base64: true,
                quality: 0.7,
                skipProcessing: true,
            });

            if (!photo?.base64) {
                setError('Could not capture image. Try again.');
                feedbackService.error();
                return;
            }

            const ocrResult = await ocrService.extractAndTranslate(photo.base64, targetLang);

            if (!ocrResult.original.text.trim()) {
                setError('No text detected. Point camera at readable text.');
                feedbackService.error();
                return;
            }

            setResult(ocrResult);
            setHistory((prev) => [ocrResult, ...prev.slice(0, 19)]); // Keep last 20
            feedbackService.success();

            // TTS: speak the translation
            translationService.speak(ocrResult.translated, targetLang);
        } catch (err: any) {
            console.error('[OCR Camera] Error:', err);
            setError(err?.message || 'Translation failed. Check your connection.');
            feedbackService.error();
        } finally {
            setCapturing(false);
        }
    }, [capturing, targetLang]);

    // ─── Live Scan Mode ────────────────────────────────────────

    const startLiveScan = useCallback(() => {
        setLiveMode(true);
        setFrozen(false);
        setResult(null);
        setLiveResult(null);

        liveScanRef.current = setInterval(async () => {
            if (!cameraRef.current || scanningRef.current || frozen) return;
            scanningRef.current = true;

            try {
                const photo = await cameraRef.current.takePictureAsync({
                    base64: true,
                    quality: 0.4,
                    skipProcessing: true,
                });
                if (photo?.base64 && isMountedRef.current) {
                    const ocrResult = await ocrService.translateFromCamera(photo.base64, targetLang);
                    if (ocrResult.original.text.trim() && isMountedRef.current) {
                        setLiveResult(ocrResult);
                        setDetectedLang(ocrResult.fromLang);
                    }
                }
            } catch {
                // Ignore transient errors in live mode
            } finally {
                scanningRef.current = false;
            }
        }, 2000);
    }, [targetLang, frozen]);

    const stopLiveScan = useCallback(() => {
        if (liveScanRef.current) {
            clearInterval(liveScanRef.current);
            liveScanRef.current = null;
        }
        setLiveMode(false);
        setLiveResult(null);
        setDetectedLang(null);
    }, []);

    const freezeFrame = useCallback(() => {
        if (liveScanRef.current) {
            clearInterval(liveScanRef.current);
            liveScanRef.current = null;
        }
        setFrozen(true);
        // Promote liveResult to full result
        if (liveResult) {
            setResult(liveResult);
            setHistory(prev => [liveResult, ...prev.slice(0, 19)]);
            feedbackService.success();
            translationService.speak(liveResult.translated, targetLang);
        }
    }, [liveResult, targetLang]);

    const dismissResult = () => {
        translationService.stopSpeaking();
        setResult(null);
        setFrozen(false);
        if (liveMode) startLiveScan();
    };

    // ─── Permission Screen ─────────────────────────────────────

    if (!permission?.granted) {
        return (
            <View style={styles.container}>
                <View style={styles.permissionCard}>
                    <Text style={styles.permissionEmoji}>📷</Text>
                    <Text style={styles.permissionTitle}>Camera Access</Text>
                    <Text style={styles.permissionText}>
                        Point your camera at text — signs, menus, labels, documents — and
                        Windy will translate it instantly.
                    </Text>
                    <Text style={styles.permissionLangs}>
                        🇺🇸 🇪🇸 🇫🇷 🇩🇪 🇨🇳
                    </Text>
                    <Pressable style={styles.permissionBtn} onPress={requestPermission} accessibilityLabel="Enable camera access" accessibilityRole="button" accessibilityHint="Grants camera permission for text translation">
                        <Text style={styles.permissionBtnText}>Enable Camera</Text>
                    </Pressable>
                </View>
            </View>
        );
    }

    // ─── History View ──────────────────────────────────────────

    if (showHistory) {
        return (
            <View style={styles.container}>
                <View style={styles.historyHeader}>
                    <Text style={styles.historyTitle}>Translation History</Text>
                    <Pressable onPress={() => setShowHistory(false)} accessibilityLabel="Close translation history" accessibilityRole="button">
                        <Text style={styles.historyClose}>✕ Close</Text>
                    </Pressable>
                </View>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.screenPadding }}>
                    {history.length === 0 ? (
                        <Text style={styles.emptyHistory}>No translations yet. Capture some text!</Text>
                    ) : (
                        history.map((h, i) => (
                            <View key={`h-${i}`} style={styles.historyCard}>
                                <Text style={styles.historyLang}>
                                    {getFlag(h.fromLang)} → {getFlag(h.toLang)}
                                </Text>
                                <Text style={styles.historyOriginal}>{h.original.text}</Text>
                                <View style={styles.historyDivider} />
                                <Text style={styles.historyTranslated}>{h.translated}</Text>
                            </View>
                        ))
                    )}
                </ScrollView>
            </View>
        );
    }

    // ─── Main Camera View ──────────────────────────────────────

    return (
        <View style={styles.container}>
            {/* Camera */}
            <CameraView ref={cameraRef} style={styles.camera} facing="back">
                {/* Camera Overlay */}
                <View style={styles.cameraOverlay}>
                    {/* Top bar */}
                    <View style={styles.topBar}>
                        <Pressable
                            style={styles.historyBtn}
                            onPress={() => setShowHistory(true)}
                            accessibilityLabel={`View translation history, ${history.length} items`}
                            accessibilityRole="button"
                        >
                            <Text style={styles.historyBtnText}>
                                📋 {history.length}
                            </Text>
                        </Pressable>
                        <Text style={styles.topTitle}>📷 Camera Translate</Text>
                        <View style={{ width: 44 }} />
                    </View>

                    {/* Crosshair targeting box */}
                    <View style={styles.crosshair}>
                        <View style={[styles.corner, styles.cornerTL]} />
                        <View style={[styles.corner, styles.cornerTR]} />
                        <View style={[styles.corner, styles.cornerBL]} />
                        <View style={[styles.corner, styles.cornerBR]} />
                        {capturing && (
                            <View style={styles.scanningOverlay}>
                                <ActivityIndicator size="large" color={colors.accent} />
                                <Text style={styles.scanningText}>Scanning...</Text>
                            </View>
                        )}
                    </View>

                    {/* Live scan bounding box overlays */}
                    {liveMode && liveResult && !frozen && liveResult.original.boundingBoxes.length > 0 && (
                        <View style={styles.boundingBoxContainer}>
                            {liveResult.original.boundingBoxes.slice(0, 10).map((box, i) => (
                                <View
                                    key={`bb-${i}`}
                                    style={[
                                        styles.boundingBox,
                                        {
                                            left: (box.x / 1000) * SCREEN_WIDTH,
                                            top: (box.y / 1000) * 200,
                                            width: Math.max(40, (box.width / 1000) * SCREEN_WIDTH),
                                        },
                                    ]}
                                >
                                    <Text style={styles.boundingBoxText} numberOfLines={1}>
                                        {box.text}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Detected language + live mode badge */}
                    {liveMode && (
                        <View style={styles.liveBadgeRow}>
                            <View style={styles.liveBadge}>
                                <Text style={styles.liveBadgeText}>🟢 LIVE</Text>
                            </View>
                            {detectedLang && (
                                <View style={styles.detectedLangBadge}>
                                    <Text style={styles.detectedLangText}>
                                        {getFlag(detectedLang)} {getName(detectedLang)}
                                    </Text>
                                </View>
                            )}
                        </View>
                    )}

                    {/* Instruction / error */}
                    {error ? (
                        <View style={styles.errorBanner}>
                            <Text style={styles.errorText}>⚠️ {error}</Text>
                            <Pressable onPress={() => setError(null)} accessibilityLabel="Dismiss error" accessibilityRole="button">
                                <Text style={styles.errorDismiss}>✕</Text>
                            </Pressable>
                        </View>
                    ) : !result && !liveMode ? (
                        <Text style={styles.hint}>Point at text and tap the button below</Text>
                    ) : null}
                </View>

                {/* Translation Overlay */}
                {result && (
                    <Animated.View style={[styles.translationOverlay, { opacity: overlayOpacity }]}>
                        <Pressable style={styles.overlayCard} onPress={dismissResult} accessibilityLabel="Translation result. Tap to dismiss" accessibilityRole="button">
                            {/* Original */}
                            <View style={styles.overlaySection}>
                                <Text style={styles.overlayLabel}>
                                    {getFlag(result.fromLang)} Detected • {Math.round(result.original.confidence * 100)}%
                                </Text>
                                <Text style={styles.overlayOriginal} numberOfLines={3}>
                                    {result.original.text}
                                </Text>
                            </View>

                            <View style={styles.overlayDivider} />

                            {/* Translation */}
                            <View style={styles.overlaySection}>
                                <Text style={styles.overlayLabel}>
                                    {getFlag(result.toLang)} Translation
                                </Text>
                                <Text style={styles.overlayTranslated}>
                                    {result.translated}
                                </Text>
                            </View>

                            {/* TTS + dismiss */}
                            <View style={styles.overlayActions}>
                                <Pressable
                                    style={styles.overlayActionBtn}
                                    onPress={() => translationService.speak(result.translated, result.toLang)}
                                    accessibilityLabel="Listen to translation"
                                    accessibilityRole="button"
                                >
                                    <Text style={styles.overlayActionText}>🔊 Listen</Text>
                                </Pressable>
                                <Pressable style={styles.overlayActionBtn} onPress={dismissResult} accessibilityLabel="Dismiss translation" accessibilityRole="button">
                                    <Text style={styles.overlayActionText}>✕ Dismiss</Text>
                                </Pressable>
                            </View>
                        </Pressable>
                    </Animated.View>
                )}
            </CameraView>

            {/* Bottom Controls */}
            <View style={styles.bottomBar}>
                {/* Language chips */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.langChipRow}
                >
                    {CAMERA_LANGUAGES.map((lang) => (
                        <Pressable
                            key={lang.code}
                            style={[styles.langChip, targetLang === lang.code && styles.langChipActive]}
                            onPress={() => {
                                setTargetLang(lang.code);
                                setResult(null);
                                feedbackService.tap();
                            }}
                            accessibilityLabel={`Translate to ${lang.name}`}
                            accessibilityRole="button"
                            accessibilityState={{ selected: targetLang === lang.code }}
                        >
                            <Text style={styles.langChipFlag}>{lang.flag}</Text>
                            <Text style={[
                                styles.langChipName,
                                targetLang === lang.code && styles.langChipNameActive,
                            ]}>
                                {lang.name}
                            </Text>
                        </Pressable>
                    ))}
                </ScrollView>

                {/* Capture button */}
                <View style={styles.captureRow}>
                    <Pressable
                        style={[styles.captureBtn, capturing && styles.captureBtnDisabled]}
                        onPress={handleCapture}
                        disabled={capturing || liveMode}
                        accessibilityLabel={capturing ? 'Processing photo' : 'Capture text for translation'}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: capturing || liveMode }}
                    >
                        {capturing ? (
                            <ActivityIndicator size="small" color={colors.background} />
                        ) : (
                            <Text style={styles.captureBtnEmoji}>📸</Text>
                        )}
                        <Text style={styles.captureBtnText}>
                            {capturing ? 'Processing...' : 'Capture'}
                        </Text>
                    </Pressable>

                    {/* Live scan toggle */}
                    <Pressable
                        style={[styles.liveBtn, liveMode && styles.liveBtnActive]}
                        onPress={() => liveMode ? stopLiveScan() : startLiveScan()}
                        accessibilityLabel={liveMode ? 'Stop live scanning' : 'Start live scanning'}
                        accessibilityRole="button"
                    >
                        <Text style={styles.liveBtnText}>
                            {liveMode ? '⏹ Stop Live' : '🟢 Live Scan'}
                        </Text>
                    </Pressable>

                    {/* Freeze button (visible in live mode) */}
                    {liveMode && liveResult && !frozen && (
                        <Pressable style={styles.freezeBtn} onPress={freezeFrame} accessibilityLabel="Freeze current translation" accessibilityRole="button">
                            <Text style={styles.freezeBtnText}>❄️ Freeze</Text>
                        </Pressable>
                    )}
                </View>
            </View>
        </View>
    );
}

// ─── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },

    // Permission
    permissionCard: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: spacing.screenPadding,
    },
    permissionEmoji: { fontSize: 64, marginBottom: 12 },
    permissionTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
    permissionText: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 16 },
    permissionLangs: { fontSize: 32, marginBottom: 24, letterSpacing: 8 },
    permissionBtn: {
        backgroundColor: colors.accent, paddingVertical: 14,
        paddingHorizontal: 32, borderRadius: borderRadius.lg,
    },
    permissionBtnText: { fontSize: 16, fontWeight: '700', color: colors.background },

    // Camera
    camera: { flex: 1 },
    cameraOverlay: {
        flex: 1, justifyContent: 'space-between',
        paddingTop: Platform.OS === 'ios' ? 8 : 8,
        paddingBottom: 12, paddingHorizontal: 16,
    },

    // Top bar
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    topTitle: { fontSize: 15, fontWeight: '600', color: '#fff', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4 },
    historyBtn: { backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
    historyBtnText: { fontSize: 13, color: '#fff' },

    // Crosshair
    crosshair: {
        alignSelf: 'center', width: SCREEN_WIDTH * 0.7, height: 160,
        justifyContent: 'center', alignItems: 'center',
    },
    corner: { position: 'absolute', width: 32, height: 32, borderColor: colors.accent, borderWidth: 3 },
    cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
    cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
    cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
    cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
    scanningOverlay: { alignItems: 'center', gap: 8 },
    scanningText: { fontSize: 14, color: '#fff', fontWeight: '500', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4 },

    // Hint / Error
    hint: {
        color: '#fff', textAlign: 'center', fontSize: 14, fontWeight: '500',
        textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4,
    },
    errorBanner: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: 'rgba(239,68,68,0.9)', padding: 12, borderRadius: borderRadius.md,
    },
    errorText: { fontSize: 13, color: '#fff', flex: 1 },
    errorDismiss: { fontSize: 16, color: '#fff', paddingLeft: 12 },

    // Translation overlay
    translationOverlay: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: 'rgba(15,23,42,0.95)', borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: 16, maxHeight: '50%',
    },
    overlayCard: {},
    overlaySection: { marginBottom: 8 },
    overlayLabel: { fontSize: 11, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    overlayOriginal: { fontSize: 15, color: colors.textPrimary, lineHeight: 22 },
    overlayDivider: { height: 1, backgroundColor: colors.borderLight, marginVertical: 8 },
    overlayTranslated: { fontSize: 18, color: colors.accent, lineHeight: 26, fontWeight: '600' },
    overlayActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
    overlayActionBtn: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: colors.surface, borderRadius: borderRadius.md },
    overlayActionText: { fontSize: 14, color: colors.textPrimary },

    // Bottom bar
    bottomBar: {
        backgroundColor: colors.background, paddingHorizontal: spacing.screenPadding,
        paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 0 : 12,
    },
    langChipRow: { gap: 8, marginBottom: 12 },
    langChip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingVertical: 8, paddingHorizontal: 14,
        borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    },
    langChipActive: { borderColor: colors.accent, backgroundColor: colors.accentTransparent },
    langChipFlag: { fontSize: 18 },
    langChipName: { fontSize: 13, color: colors.textSecondary },
    langChipNameActive: { color: colors.accent, fontWeight: '600' },
    captureBtn: {
        backgroundColor: colors.accent, borderRadius: borderRadius.lg,
        paddingVertical: 14, flexDirection: 'row', flex: 1,
        alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    captureBtnDisabled: { opacity: 0.6 },
    captureBtnEmoji: { fontSize: 22 },
    captureBtnText: { fontSize: 16, fontWeight: '700', color: colors.background },
    captureRow: { flexDirection: 'row', gap: 8 },
    liveBtn: {
        backgroundColor: colors.surface, borderRadius: borderRadius.lg,
        paddingVertical: 14, paddingHorizontal: 16,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: colors.borderLight,
    },
    liveBtnActive: { backgroundColor: 'rgba(34,197,94,0.15)', borderColor: '#22c55e' },
    liveBtnText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
    freezeBtn: {
        backgroundColor: 'rgba(59,130,246,0.15)', borderRadius: borderRadius.lg,
        paddingVertical: 14, paddingHorizontal: 16,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: '#3b82f6',
    },
    freezeBtnText: { fontSize: 13, fontWeight: '600', color: '#3b82f6' },

    // Live overlays
    boundingBoxContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    boundingBox: {
        position: 'absolute', backgroundColor: 'rgba(99,102,241,0.75)',
        paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3,
    },
    boundingBoxText: { fontSize: 10, color: '#fff', fontWeight: '600' },
    liveBadgeRow: { flexDirection: 'row', gap: 8, alignSelf: 'center' },
    liveBadge: { backgroundColor: 'rgba(34,197,94,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    liveBadgeText: { fontSize: 12, fontWeight: '700', color: '#22c55e' },
    detectedLangBadge: { backgroundColor: 'rgba(99,102,241,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    detectedLangText: { fontSize: 12, fontWeight: '600', color: '#6366f1' },

    // History
    historyHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        padding: spacing.screenPadding, paddingTop: Platform.OS === 'ios' ? 60 : 40,
        borderBottomWidth: 1, borderBottomColor: colors.borderLight,
    },
    historyTitle: { fontSize: 20, fontWeight: '600', color: colors.textPrimary },
    historyClose: { fontSize: 14, color: colors.accent },
    emptyHistory: { fontSize: 15, color: colors.textTertiary, textAlign: 'center', marginTop: 60 },
    historyCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: 10 },
    historyLang: { fontSize: 12, color: colors.textTertiary, marginBottom: 4 },
    historyOriginal: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
    historyDivider: { height: 1, backgroundColor: colors.borderLight, marginVertical: 8 },
    historyTranslated: { fontSize: 14, color: colors.accent, lineHeight: 20 },
});
