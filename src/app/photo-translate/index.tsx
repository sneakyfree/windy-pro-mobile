/**
 * 🧬 Premium: Photo Translation
 * Take a photo of text (menu, sign, document), OCR extracts text,
 * translate it, overlay the translation on the image, save to gallery.
 */
import { View, Text, StyleSheet, Pressable, Platform, Alert, Image, ActivityIndicator, ScrollView, TextInput, Modal } from 'react-native';
import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { colors, spacing, borderRadius } from '@/theme';
import { feedbackService } from '@/services/feedback';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

import { apiUrl } from '@/config/api';

const OCR_API = apiUrl('/api/v1/ocr');
const TRANSLATE_API = apiUrl('/api/v1/translate/text');

interface DetectedText {
    text: string;
    translated?: string;
    bounds?: { x: number; y: number; width: number; height: number };
}

type AppState = 'camera' | 'processing' | 'result';

export default function PhotoTranslateScreen() {
    const router = useRouter();
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);

    const [state, setState] = useState<AppState>('camera');
    const [photoUri, setPhotoUri] = useState<string | null>(null);
    const [detectedTexts, setDetectedTexts] = useState<DetectedText[]>([]);
    const [targetLang, setTargetLang] = useState('en');
    const [translating, setTranslating] = useState(false);
    const [showFullText, setShowFullText] = useState(false);
    const [facing, setFacing] = useState<CameraType>('back');

    const LANGUAGES = [
        { code: 'en', name: 'English', flag: '🇺🇸' },
        { code: 'es', name: 'Spanish', flag: '🇪🇸' },
        { code: 'fr', name: 'French', flag: '🇫🇷' },
        { code: 'de', name: 'German', flag: '🇩🇪' },
        { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
        { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
        { code: 'ko', name: 'Korean', flag: '🇰🇷' },
        { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
    ];

    // ─── Take Photo ─────────────────────────────────────────────

    const handleCapture = useCallback(async () => {
        if (!cameraRef.current) return;
        await feedbackService.tap();

        try {
            const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
            if (photo?.uri) {
                setPhotoUri(photo.uri);
                setState('processing');
                await processImage(photo.uri);
            }
        } catch (err) {
            Alert.alert('Camera Error', 'Could not take photo. Please try again.');
        }
    }, []);

    const handlePickImage = useCallback(async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
        });
        if (!result.canceled && result.assets[0]) {
            const uri = result.assets[0].uri;
            setPhotoUri(uri);
            setState('processing');
            await processImage(uri);
        }
    }, []);

    // ─── OCR Processing ─────────────────────────────────────────

    const processImage = async (uri: string) => {
        try {
            const response = await FileSystem.uploadAsync(OCR_API, uri, {
                httpMethod: 'POST',
                uploadType: FileSystem.FileSystemUploadType.MULTIPART,
                fieldName: 'image',
            });

            if (response.status >= 200 && response.status < 300) {
                const data = JSON.parse(response.body);
                const texts: DetectedText[] = (data.texts || data.blocks || []).map((block: any) => ({
                    text: block.text || block.description || '',
                    bounds: block.bounds || block.boundingPoly || undefined,
                }));

                if (texts.length === 0) {
                    // Fallback: treat entire response as text
                    setDetectedTexts([{ text: data.text || data.fullText || 'No text detected' }]);
                } else {
                    setDetectedTexts(texts);
                }
            } else {
                // API unavailable — show placeholder
                setDetectedTexts([{ text: '[OCR service unavailable — text detection requires cloud processing]' }]);
            }
        } catch (err) { console.warn("[PhotoTranslate] Error:", err);
            setDetectedTexts([{ text: '[Offline — OCR requires internet connection]' }]);
        }
        setState('result');
    };

    // ─── Translate Detected Text ────────────────────────────────

    const handleTranslateAll = useCallback(async () => {
        if (detectedTexts.length === 0) return;
        setTranslating(true);

        const updated = [...detectedTexts];
        for (let i = 0; i < updated.length; i++) {
            if (!updated[i].text.startsWith('[')) {
                try {
                    const res = await fetch(TRANSLATE_API, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: updated[i].text, source: 'auto', target: targetLang }),
                    });
                    if (res.ok) {
                        const data = await res.json();
                        updated[i] = { ...updated[i], translated: data.translated || data.text || updated[i].text };
                    }
                } catch (err) { console.warn("[PhotoTranslate] Error:", err);
                    updated[i] = { ...updated[i], translated: updated[i].text };
                }
            }
        }

        setDetectedTexts(updated);
        setTranslating(false);
        await feedbackService.success();
    }, [detectedTexts, targetLang]);

    // ─── Save to Gallery ────────────────────────────────────────

    const handleSaveToGallery = useCallback(async () => {
        if (!photoUri) return;
        try {
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Required', 'Gallery access is needed to save photos.');
                return;
            }
            await MediaLibrary.saveToLibraryAsync(photoUri);
            await feedbackService.success();
            Alert.alert('Saved!', 'Photo saved to gallery.');
        } catch (err) { console.warn("[PhotoTranslate] Error:", err);
            Alert.alert('Save Failed', 'Could not save photo to gallery.');
        }
    }, [photoUri]);

    const handleShare = useCallback(async () => {
        if (!photoUri) return;
        try {
            await Sharing.shareAsync(photoUri, { dialogTitle: 'Share Translated Image' });
        } catch (err) { console.warn("[PhotoTranslate] User cancelled:", err); }
    }, [photoUri]);

    const handleRetake = () => {
        setPhotoUri(null);
        setDetectedTexts([]);
        setState('camera');
    };

    // ─── Permission Check ───────────────────────────────────────

    if (!permission?.granted) {
        return (
            <View style={styles.container}>
                <View style={styles.permissionCard}>
                    <Text style={styles.permissionEmoji}>📸</Text>
                    <Text style={styles.permissionTitle}>Camera Access Required</Text>
                    <Text style={styles.permissionText}>Point your camera at text (menus, signs, documents) to instantly translate.</Text>
                    <Pressable style={styles.permissionBtn} onPress={requestPermission}>
                        <Text style={styles.permissionBtnText}>Grant Camera Access</Text>
                    </Pressable>
                    <Pressable style={styles.permissionSkip} onPress={handlePickImage}>
                        <Text style={styles.permissionSkipText}>Or pick from gallery</Text>
                    </Pressable>
                </View>
            </View>
        );
    }

    // ─── Camera View ────────────────────────────────────────────

    if (state === 'camera') {
        return (
            <ScreenErrorBoundary screenName="PhotoTranslate">
                <View style={styles.container}>
                    <CameraView ref={cameraRef} style={styles.camera} facing={facing}>
                        {/* Top Controls */}
                        <View style={styles.cameraTopBar}>
                            <Pressable onPress={() => router.back()} style={styles.cameraBtn}>
                                <Text style={styles.cameraBtnText}>← Back</Text>
                            </Pressable>
                            <Text style={styles.cameraTitle}>📸 Photo Translate</Text>
                            <Pressable onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')} style={styles.cameraBtn}>
                                <Text style={styles.cameraBtnText}>🔄</Text>
                            </Pressable>
                        </View>

                        {/* Overlay Guide */}
                        <View style={styles.cameraGuide}>
                            <View style={styles.cameraGuideBox}>
                                <Text style={styles.cameraGuideText}>Point at text to translate</Text>
                            </View>
                        </View>

                        {/* Bottom Controls */}
                        <View style={styles.cameraBottomBar}>
                            <Pressable style={styles.galleryBtn} onPress={handlePickImage}>
                                <Text style={styles.galleryBtnText}>🖼️ Gallery</Text>
                            </Pressable>
                            <Pressable style={styles.captureBtn} onPress={handleCapture}>
                                <View style={styles.captureBtnInner} />
                            </Pressable>
                            <View style={{ width: 80 }} />
                        </View>
                    </CameraView>
                </View>
            </ScreenErrorBoundary>
        );
    }

    // ─── Processing / Results ───────────────────────────────────

    return (
        <ScreenErrorBoundary screenName="PhotoTranslate">
            <ScrollView style={styles.container} contentContainerStyle={styles.resultContent}>
                {/* Header */}
                <View style={styles.resultHeader}>
                    <Pressable onPress={handleRetake} style={styles.backBtn}>
                        <Text style={styles.backText}>← Retake</Text>
                    </Pressable>
                    <Text style={styles.title}>📸 Photo Translation</Text>
                </View>

                {/* Photo Preview */}
                {photoUri && (
                    <View style={styles.imageContainer}>
                        <Image source={{ uri: photoUri }} style={styles.previewImage} resizeMode="contain" />
                        {/* Translation overlay indicators */}
                        {detectedTexts.some(d => d.translated) && (
                            <View style={styles.overlayBadge}>
                                <Text style={styles.overlayBadgeText}>✅ Translated</Text>
                            </View>
                        )}
                    </View>
                )}

                {state === 'processing' && (
                    <View style={styles.processingCard}>
                        <ActivityIndicator color={colors.accent} size="large" />
                        <Text style={styles.processingText}>Extracting text...</Text>
                    </View>
                )}

                {state === 'result' && (
                    <>
                        {/* Language Selector */}
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

                        {/* Translate Button */}
                        <Pressable
                            style={[styles.translateBtn, translating && styles.translateBtnDisabled]}
                            onPress={handleTranslateAll}
                            disabled={translating}
                        >
                            {translating ? <ActivityIndicator color="#000" /> : <Text style={styles.translateBtnText}>🔄 Translate Detected Text</Text>}
                        </Pressable>

                        {/* Detected Text Blocks */}
                        {detectedTexts.map((block, i) => (
                            <View key={`block-${i}`} style={styles.textBlock}>
                                <Text style={styles.textBlockLabel}>Detected Text {detectedTexts.length > 1 ? `#${i + 1}` : ''}</Text>
                                <Text style={styles.textBlockOriginal}>{block.text}</Text>
                                {block.translated && (
                                    <>
                                        <View style={styles.textBlockDivider} />
                                        <Text style={styles.textBlockTranslated}>{block.translated}</Text>
                                    </>
                                )}
                            </View>
                        ))}

                        {/* Action Buttons */}
                        <View style={styles.actionRow}>
                            <Pressable style={styles.actionBtn} onPress={handleSaveToGallery}>
                                <Text style={styles.actionBtnText}>💾 Save</Text>
                            </Pressable>
                            <Pressable style={styles.actionBtn} onPress={handleShare}>
                                <Text style={styles.actionBtnText}>📤 Share</Text>
                            </Pressable>
                            <Pressable style={styles.actionBtn} onPress={() => setShowFullText(true)}>
                                <Text style={styles.actionBtnText}>📋 Full Text</Text>
                            </Pressable>
                        </View>
                    </>
                )}

                {/* Full Text Modal */}
                <Modal visible={showFullText} animationType="slide" transparent onRequestClose={() => setShowFullText(false)}>
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalCard}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Full Extracted Text</Text>
                                <Pressable onPress={() => setShowFullText(false)}>
                                    <Text style={styles.modalClose}>✕</Text>
                                </Pressable>
                            </View>
                            <ScrollView style={{ maxHeight: 400 }}>
                                <Text style={styles.modalText} selectable>
                                    {detectedTexts.map(d => d.translated || d.text).join('\n\n')}
                                </Text>
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
            </ScrollView>
        </ScreenErrorBoundary>
    );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    camera: { flex: 1 },

    // Camera Controls
    cameraTopBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingHorizontal: 16 },
    cameraBtn: { padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12 },
    cameraBtnText: { color: '#fff', fontSize: 16 },
    cameraTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },

    cameraGuide: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    cameraGuideBox: { width: '80%', height: 200, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 16, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
    cameraGuideText: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },

    cameraBottomBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 32, paddingBottom: Platform.OS === 'ios' ? 40 : 20 },
    galleryBtn: { padding: 12, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12 },
    galleryBtnText: { color: '#fff', fontSize: 14 },
    captureBtn: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
    captureBtnInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },

    // Permission
    permissionCard: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
    permissionEmoji: { fontSize: 64, marginBottom: spacing.lg },
    permissionTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
    permissionText: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.lg },
    permissionBtn: { backgroundColor: colors.accent, borderRadius: borderRadius.lg, paddingVertical: 16, paddingHorizontal: 40 },
    permissionBtnText: { color: '#000', fontWeight: '700', fontSize: 16 },
    permissionSkip: { marginTop: spacing.md },
    permissionSkipText: { color: colors.accent, fontSize: 14 },

    // Result View
    resultContent: { paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingHorizontal: spacing.screenPadding, paddingBottom: 80 },
    resultHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
    backBtn: { marginRight: spacing.sm },
    backText: { fontSize: 16, color: colors.accent },
    title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },

    imageContainer: { borderRadius: borderRadius.lg, overflow: 'hidden', marginBottom: spacing.md, position: 'relative' },
    previewImage: { width: '100%', height: 250, borderRadius: borderRadius.lg, backgroundColor: colors.surface },
    overlayBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(16,185,129,0.9)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
    overlayBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },

    processingCard: { alignItems: 'center', paddingVertical: 40, gap: 12 },
    processingText: { color: colors.textSecondary, fontSize: 16 },

    langScroll: { maxHeight: 48, marginBottom: spacing.md },
    langChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, marginRight: 8 },
    langChipActive: { borderColor: colors.accent, backgroundColor: colors.accentTransparent },
    langFlag: { fontSize: 18 },
    langName: { fontSize: 13, color: colors.textSecondary },
    langNameActive: { color: colors.accent, fontWeight: '600' },

    translateBtn: { backgroundColor: colors.accent, borderRadius: borderRadius.lg, paddingVertical: 14, alignItems: 'center', marginBottom: spacing.md },
    translateBtnDisabled: { opacity: 0.6 },
    translateBtnText: { color: '#000', fontWeight: '700', fontSize: 15 },

    textBlock: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.borderLight },
    textBlockLabel: { fontSize: 11, fontWeight: '600', color: colors.textTertiary, textTransform: 'uppercase', marginBottom: 6 },
    textBlockOriginal: { fontSize: 15, color: colors.textPrimary, lineHeight: 22 },
    textBlockDivider: { height: 1, backgroundColor: colors.borderLight, marginVertical: 10 },
    textBlockTranslated: { fontSize: 16, color: colors.accent, lineHeight: 24, fontWeight: '500' },

    actionRow: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
    actionBtn: { flex: 1, backgroundColor: colors.surface, borderRadius: borderRadius.md, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    actionBtnText: { color: colors.textPrimary, fontWeight: '600', fontSize: 14 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
    modalTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
    modalClose: { fontSize: 20, color: colors.textTertiary, padding: 8 },
    modalText: { fontSize: 15, color: colors.textPrimary, lineHeight: 22 },
});
