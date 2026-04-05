/**
 * 🧬 RP-4.2 — Engine Picker Sheet
 * Bottom sheet listing all compatible engines with download status
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, Pressable, ScrollView, StyleSheet, Modal,
    ActivityIndicator, Alert,
} from 'react-native';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { fontSizes } from '@/theme';
import { ENGINE_REGISTRY } from '@/services/windy-tune';
import { engineDownloadManager } from '@/services/engine-download';
import * as Haptics from 'expo-haptics';

interface Props {
    visible: boolean;
    onClose: () => void;
}

const ENGINE_SIZES: Record<string, string> = {
    'tiny': '75 MB',
    'base': '142 MB',
    'small': '466 MB',
    'medium': '1.5 GB',
    'large-v3-turbo': '3.1 GB',
    'cloud-standard': 'Cloud',
    'cloud-pro': 'Cloud',
    'cloud-realtime': 'Cloud',
};

export default function EnginePickerSheet({ visible, onClose }: Props) {
    const { selectedEngine, setSelectedEngine, licenseTier } = useSettingsStore();
    const [downloadedEngines, setDownloadedEngines] = useState<string[]>([]);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [downloadProgress, setDownloadProgress] = useState(0);

    useEffect(() => {
        if (visible) checkDownloaded();
    }, [visible]);

    const checkDownloaded = async () => {
        const engines = await engineDownloadManager.getDownloadedEngines();
        setDownloadedEngines(engines);
    };

    const handleSelect = useCallback(async (id: string) => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setSelectedEngine(id as any);
        onClose();
    }, []);

    const handleDownload = useCallback(async (id: string) => {
        setDownloadingId(id);
        setDownloadProgress(0);
        try {
            await engineDownloadManager.downloadEngine(id as any, (pct) => {
                setDownloadProgress(pct);
            });
            await checkDownloaded();
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            handleSelect(id);
        } catch (err: unknown) {
            Alert.alert('Download Failed', err instanceof Error ? err.message : 'Unknown error');
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setDownloadingId(null);
        }
    }, []);

    const engines = Object.entries(ENGINE_REGISTRY);

    // Tier gating
    const isLocked = (id: string): boolean => {
        if (id.includes('cloud-pro') || id.includes('large')) return licenseTier === 'free';
        if (id.includes('cloud-realtime')) return licenseTier === 'free' || licenseTier === 'pro';
        return false;
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={s.overlay}>
                <View style={s.sheet}>
                    <View style={s.handle} />
                    <Text style={s.title}>Select Engine</Text>
                    <ScrollView style={s.list}>
                        {engines.map(([id, config]) => {
                            const isSelected = id === selectedEngine;
                            const isDownloaded = downloadedEngines.includes(id) || id.startsWith('cloud');
                            const isDownloading = downloadingId === id;
                            const locked = isLocked(id);

                            return (
                                <Pressable
                                    key={id}
                                    style={[s.item, isSelected && s.itemSelected]}
                                    onPress={() => {
                                        if (locked) {
                                            Alert.alert('Upgrade Required', 'This engine requires a higher tier.');
                                            return;
                                        }
                                        if (isDownloaded) handleSelect(id);
                                        else if (!isDownloading) handleDownload(id);
                                    }}
                                >
                                    <View style={s.itemLeft}>
                                        <Text style={s.engineName}>
                                            {locked ? '🔒 ' : ''}{config.displayName}
                                        </Text>
                                        <Text style={s.engineMeta}>
                                            {ENGINE_SIZES[id] || '?'} · {config.isOnDevice ? 'On-Device' : 'Cloud'} ·{' '}
                                            {'⭐'.repeat(Math.min(5, Math.round((config.quality || 5) / 2)))}
                                        </Text>
                                    </View>
                                    <View style={s.itemRight}>
                                        {isSelected && <Text style={s.check}>✅</Text>}
                                        {isDownloading && (
                                            <View style={s.progressWrap}>
                                                <ActivityIndicator size="small" color="#a3e635" />
                                                <Text style={s.progressText}>{downloadProgress}%</Text>
                                            </View>
                                        )}
                                        {!isSelected && !isDownloaded && !isDownloading && !locked && (
                                            <Text style={s.downloadBtn}>⬇️</Text>
                                        )}
                                    </View>
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                    <Pressable style={s.closeBtn} onPress={onClose}>
                        <Text style={s.closeTxt}>Close</Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: { backgroundColor: '#1e293b', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40, maxHeight: '80%' },
    handle: { width: 40, height: 4, backgroundColor: '#475569', borderRadius: 2, alignSelf: 'center', marginTop: 12 },
    title: { color: '#f8fafc', fontSize: fontSizes.lg, fontWeight: '700', textAlign: 'center', marginVertical: 16 },
    list: { paddingHorizontal: 16 },
    item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, marginBottom: 8, backgroundColor: '#0f172a' },
    itemSelected: { borderWidth: 1, borderColor: '#a3e635' },
    itemLeft: { flex: 1 },
    engineName: { color: '#f8fafc', fontSize: fontSizes.base, fontWeight: '600' },
    engineMeta: { color: '#94a3b8', fontSize: fontSizes.xs, marginTop: 2 },
    itemRight: { marginLeft: 12, alignItems: 'center' },
    check: { fontSize: fontSizes.lg },
    downloadBtn: { fontSize: fontSizes.lg },
    progressWrap: { alignItems: 'center' },
    progressText: { color: '#a3e635', fontSize: 11, marginTop: 2 },
    closeBtn: { marginTop: 12, alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 32, backgroundColor: '#334155', borderRadius: 12 },
    closeTxt: { color: '#f8fafc', fontSize: 15, fontWeight: '600' },
});
