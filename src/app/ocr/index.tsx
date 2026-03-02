/**
 * 🧬 OCR Translate Screen
 * Point camera at text → extract → translate → overlay
 */
import { View, Text, StyleSheet, Pressable, Platform, Alert, ScrollView } from 'react-native';
import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, spacing, borderRadius } from '@/theme';
import { ocrService, OcrTranslation } from '@/services/ocr';
import { TIER_1_LANGUAGES } from '@/services/translation';
import { feedbackService } from '@/services/feedback';
import { useFeatureGate } from '@/hooks/useFeatureGate';

export default function OcrTranslateScreen() {
    const router = useRouter();
    const { requireFeature } = useFeatureGate();
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);

    const [targetLang, setTargetLang] = useState('es');
    const [capturing, setCapturing] = useState(false);
    const [results, setResults] = useState<OcrTranslation[]>([]);
    const [showLangPicker, setShowLangPicker] = useState(false);

    const getFlag = (code: string): string => {
        const lang = TIER_1_LANGUAGES.find((l) => l.code === code);
        return lang?.flag || '🌐';
    };

    const getName = (code: string): string => {
        const lang = TIER_1_LANGUAGES.find((l) => l.code === code);
        return lang?.name || code;
    };

    const handleCapture = useCallback(async () => {
        if (!cameraRef.current || capturing) return;
        if (!requireFeature('translate', 'OCR Translate')) return;

        setCapturing(true);
        await feedbackService.tap();

        try {
            const photo = await cameraRef.current.takePictureAsync({
                base64: true,
                quality: 0.7,
                skipProcessing: true,
            });

            if (!photo?.base64) {
                Alert.alert('Capture Failed', 'Could not capture image. Try again.');
                return;
            }

            const result = await ocrService.extractAndTranslate(photo.base64, targetLang);

            if (!result.original.text.trim()) {
                Alert.alert('No Text Found', 'Point the camera at text and try again.');
                await feedbackService.error();
                return;
            }

            setResults((prev) => [result, ...prev]);
            await feedbackService.success();
        } catch (err) {
            console.error('[OCR] Error:', err);
            Alert.alert('OCR Failed', 'Could not process image. Check your connection.');
            await feedbackService.error();
        } finally {
            setCapturing(false);
        }
    }, [capturing, targetLang]);

    // Permission not yet granted
    if (!permission?.granted) {
        return (
            <View style={styles.container}>
                <View style={styles.permissionCard}>
                    <Text style={styles.permissionEmoji}>📸</Text>
                    <Text style={styles.permissionTitle}>Camera Access Needed</Text>
                    <Text style={styles.permissionText}>
                        OCR Translate needs camera access to read text from signs, menus, documents, and more.
                    </Text>
                    <Pressable style={styles.permissionBtn} onPress={requestPermission}>
                        <Text style={styles.permissionBtnText}>Enable Camera</Text>
                    </Pressable>
                    <Pressable onPress={() => router.back()} style={styles.backLink}>
                        <Text style={styles.backLinkText}>← Go Back</Text>
                    </Pressable>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Camera Preview */}
            <View style={styles.cameraContainer}>
                <CameraView
                    ref={cameraRef}
                    style={styles.camera}
                    facing="back"
                >
                    {/* Overlay: crosshair + language badge */}
                    <View style={styles.overlay}>
                        <Pressable onPress={() => router.back()} style={styles.overlayBack}>
                            <Text style={styles.overlayBackText}>← Back</Text>
                        </Pressable>

                        <View style={styles.crosshair}>
                            <View style={[styles.crosshairCorner, styles.cornerTL]} />
                            <View style={[styles.crosshairCorner, styles.cornerTR]} />
                            <View style={[styles.crosshairCorner, styles.cornerBL]} />
                            <View style={[styles.crosshairCorner, styles.cornerBR]} />
                        </View>

                        <Text style={styles.hint}>Point at text and tap 📸</Text>
                    </View>
                </CameraView>
            </View>

            {/* Controls */}
            <View style={styles.controls}>
                {/* Language Selector */}
                <Pressable
                    style={styles.langSelector}
                    onPress={() => setShowLangPicker(!showLangPicker)}
                >
                    <Text style={styles.langSelectorText}>
                        Translate to: {getFlag(targetLang)} {getName(targetLang)}
                    </Text>
                    <Text style={styles.langSelectorArrow}>▾</Text>
                </Pressable>

                {showLangPicker && (
                    <ScrollView style={styles.langList} horizontal showsHorizontalScrollIndicator={false}>
                        {TIER_1_LANGUAGES.map((lang) => (
                            <Pressable
                                key={lang.code}
                                style={[styles.langChip, targetLang === lang.code && styles.langChipActive]}
                                onPress={() => { setTargetLang(lang.code); setShowLangPicker(false); feedbackService.tap(); }}
                            >
                                <Text style={styles.langChipFlag}>{lang.flag}</Text>
                                <Text style={[styles.langChipName, targetLang === lang.code && styles.langChipNameActive]}>
                                    {lang.name}
                                </Text>
                            </Pressable>
                        ))}
                    </ScrollView>
                )}

                {/* Capture Button */}
                <Pressable
                    style={[styles.captureBtn, capturing && styles.captureBtnActive]}
                    onPress={handleCapture}
                    disabled={capturing}
                >
                    <Text style={styles.captureBtnEmoji}>{capturing ? '⏳' : '📸'}</Text>
                    <Text style={styles.captureBtnText}>
                        {capturing ? 'Processing...' : 'Capture & Translate'}
                    </Text>
                </Pressable>
            </View>

            {/* Results */}
            {results.length > 0 && (
                <ScrollView style={styles.results} contentContainerStyle={styles.resultsContent}>
                    {results.map((r, i) => (
                        <View key={`ocr-${i}`} style={styles.resultCard}>
                            <View style={styles.resultRow}>
                                <Text style={styles.resultLabel}>Detected ({r.fromLang})</Text>
                                <Text style={styles.resultConfidence}>
                                    {Math.round(r.original.confidence * 100)}% conf
                                </Text>
                            </View>
                            <Text style={styles.resultOriginal}>{r.original.text}</Text>
                            <View style={styles.resultDivider} />
                            <Text style={styles.resultLabel}>
                                {getFlag(r.toLang)} Translation
                            </Text>
                            <Text style={styles.resultTranslated}>{r.translated}</Text>
                        </View>
                    ))}
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },

    // Permission
    permissionCard: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: spacing.screenPadding,
    },
    permissionEmoji: { fontSize: 64, marginBottom: spacing.md },
    permissionTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
    permissionText: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.xl },
    permissionBtn: {
        backgroundColor: colors.accent, paddingVertical: spacing.md,
        paddingHorizontal: spacing.xl, borderRadius: borderRadius.lg,
    },
    permissionBtnText: { fontSize: 16, fontWeight: '700', color: colors.background },
    backLink: { marginTop: spacing.lg },
    backLinkText: { fontSize: 14, color: colors.accent },

    // Camera
    cameraContainer: { height: '40%', overflow: 'hidden' },
    camera: { flex: 1 },
    overlay: {
        flex: 1, justifyContent: 'space-between',
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingBottom: spacing.md, paddingHorizontal: spacing.md,
    },
    overlayBack: { alignSelf: 'flex-start' },
    overlayBackText: { fontSize: 16, color: '#fff', fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4 },

    crosshair: {
        alignSelf: 'center', width: 200, height: 140,
        position: 'relative',
    },
    crosshairCorner: {
        position: 'absolute', width: 30, height: 30,
        borderColor: colors.accent, borderWidth: 3,
    },
    cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
    cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
    cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
    cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },

    hint: { color: '#fff', textAlign: 'center', fontSize: 14, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4 },

    // Controls
    controls: { paddingHorizontal: spacing.screenPadding, paddingVertical: spacing.md },
    langSelector: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: colors.surface, padding: spacing.md, borderRadius: borderRadius.md,
        marginBottom: spacing.sm,
    },
    langSelectorText: { fontSize: 15, color: colors.textPrimary },
    langSelectorArrow: { fontSize: 16, color: colors.textTertiary },

    langList: { maxHeight: 50, marginBottom: spacing.sm },
    langChip: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingVertical: spacing.xs, paddingHorizontal: spacing.sm,
        borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border,
        marginRight: spacing.xs,
    },
    langChipActive: { borderColor: colors.accent, backgroundColor: colors.accentTransparent },
    langChipFlag: { fontSize: 16 },
    langChipName: { fontSize: 12, color: colors.textSecondary },
    langChipNameActive: { color: colors.accent },

    captureBtn: {
        backgroundColor: colors.accent, borderRadius: borderRadius.lg,
        paddingVertical: spacing.md, flexDirection: 'row',
        alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    },
    captureBtnActive: { opacity: 0.6 },
    captureBtnEmoji: { fontSize: 22 },
    captureBtnText: { fontSize: 16, fontWeight: '700', color: colors.background },

    // Results
    results: { flex: 1, paddingHorizontal: spacing.screenPadding },
    resultsContent: { paddingBottom: spacing.xl },
    resultCard: {
        backgroundColor: colors.surface, borderRadius: borderRadius.lg,
        padding: spacing.md, marginBottom: spacing.sm,
    },
    resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    resultLabel: { fontSize: 11, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs },
    resultConfidence: { fontSize: 11, color: colors.textTertiary },
    resultOriginal: { fontSize: 15, color: colors.textPrimary, lineHeight: 22 },
    resultDivider: { height: 1, backgroundColor: colors.borderLight, marginVertical: spacing.sm },
    resultTranslated: { fontSize: 15, color: colors.accent, lineHeight: 22 },
});
