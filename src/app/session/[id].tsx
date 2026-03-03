/**
 * 🧬 RP-3.3 — Session Detail Screen
 * Modal screen showing full session data with audio playback
 */
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { Audio } from 'expo-av';
import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { colors, spacing, borderRadius } from '@/theme';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { localStorageService } from '@/services/storage-local';
import { feedbackService } from '@/services/feedback';
import TranscriptionViewer from '@/components/TranscriptionViewer';
import type { Session } from '@/types';

export default function SessionDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackPosition, setPlaybackPosition] = useState(0);

    useEffect(() => {
        loadSession();
        return () => {
            sound?.unloadAsync();
        };
    }, [id]);

    const loadSession = async () => {
        if (!id) return;
        setLoading(true);
        try {
            const data = await localStorageService.getSession(id);
            setSession(data);
        } catch (err) {
            console.error('[Session] Load failed:', err);
            Alert.alert('Load Error', 'Could not load this session.');
        } finally {
            setLoading(false);
        }
    };

    const handlePlayPause = async () => {
        if (!session?.audioFilePath) return;

        if (sound && isPlaying) {
            await sound.pauseAsync();
            setIsPlaying(false);
        } else if (sound) {
            await sound.playAsync();
            setIsPlaying(true);
        } else {
            const { sound: newSound } = await Audio.Sound.createAsync(
                { uri: session.audioFilePath },
                { shouldPlay: true },
                (status) => {
                    if (status.isLoaded) {
                        setPlaybackPosition((status.positionMillis ?? 0) / 1000);
                        if (status.didJustFinish) {
                            setIsPlaying(false);
                            setPlaybackPosition(0);
                        }
                    }
                }
            );
            setSound(newSound);
            setIsPlaying(true);
        }
    };

    const handleCopy = async () => {
        if (!session) return;
        try {
            await Clipboard.setStringAsync(session.transcript);
            feedbackService.success().catch(() => { });
            Alert.alert('Copied', 'Transcript copied to clipboard');
        } catch {
            Alert.alert('Error', 'Could not copy to clipboard.');
        }
    };

    const handleShare = async () => {
        if (!session) return;
        feedbackService.tap().catch(() => { });
        try {
            await Share.share({
                message: session.transcript,
                title: `Windy Pro — ${new Date(session.createdAt).toLocaleDateString()}`,
            });
        } catch {
            Alert.alert('Error', 'Could not open share sheet.');
        }
    };

    const handleExport = async () => {
        if (!session) return;
        feedbackService.tap().catch(() => { });
        const exportData = {
            id: session.id,
            date: session.createdAt,
            duration: session.duration,
            transcript: session.transcript,
            segments: session.segments.map(s => ({
                text: s.text,
                start: s.startTime,
                end: s.endTime,
            })),
            quality: session.quality?.score ?? 0,
            engine: session.engineUsed,
        };
        await Share.share({
            message: JSON.stringify(exportData, null, 2),
            title: `Windy Pro Export — ${session.id}`,
        });
    };

    const handleDelete = () => {
        if (!session) return;
        Alert.alert('Delete Session', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await localStorageService.deleteSession(session.id);
                        feedbackService.success().catch(() => { });
                        router.back();
                    } catch {
                        Alert.alert('Error', 'Could not delete session.');
                    }
                },
            },
        ]);
    };

    const formatDuration = (secs: number): string => {
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const getQualityColor = (score: number): string => {
        if (score >= 80) return colors.qualityExcellent;
        if (score >= 60) return colors.qualityGood;
        if (score >= 40) return colors.qualityFair;
        return colors.qualityPoor;
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <Text style={styles.loadingText}>Loading...</Text>
            </View>
        );
    }

    if (!session) {
        return (
            <View style={styles.container}>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                    <Text style={{ fontSize: 40 }}>🔍</Text>
                    <Text style={styles.loadingText}>Session not found</Text>
                    <Pressable onPress={() => router.back()} style={{ paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, backgroundColor: colors.surface }}>
                        <Text style={{ color: colors.accent, fontWeight: '600' }}>Go Back</Text>
                    </Pressable>
                </View>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.closeButton} accessibilityLabel="Close session" accessibilityRole="button">
                    <Text style={styles.closeText}>✕</Text>
                </Pressable>
                <Text style={styles.headerDate}>
                    {new Date(session.createdAt).toLocaleDateString('en-US', {
                        weekday: 'long', month: 'long', day: 'numeric',
                    })}
                </Text>
                <Text style={styles.headerTime}>
                    {new Date(session.createdAt).toLocaleTimeString('en-US', {
                        hour: 'numeric', minute: '2-digit',
                    })}
                </Text>
            </View>

            {/* Quick Stats */}
            <View style={styles.statsRow}>
                <View style={styles.stat}>
                    <Text style={styles.statValue}>{formatDuration(session.duration)}</Text>
                    <Text style={styles.statLabel}>Duration</Text>
                </View>
                <View style={styles.stat}>
                    <Text style={[styles.statValue, { color: getQualityColor(session.quality?.score ?? 0) }]}>
                        {session.quality?.score ?? '—'}
                    </Text>
                    <Text style={styles.statLabel}>Quality</Text>
                </View>
                <View style={styles.stat}>
                    <Text style={styles.statValue}>{session.engineUsed}</Text>
                    <Text style={styles.statLabel}>Engine</Text>
                </View>
                <View style={styles.stat}>
                    <Text style={styles.statValue}>{session.synced ? '☁️' : '📱'}</Text>
                    <Text style={styles.statLabel}>{session.synced ? 'Synced' : 'Local'}</Text>
                </View>
            </View>

            {/* Audio Player */}
            {session.audioFilePath && (
                <Pressable style={styles.playerButton} onPress={handlePlayPause}>
                    <Text style={styles.playerIcon}>{isPlaying ? '⏸' : '▶️'}</Text>
                    <Text style={styles.playerText}>
                        {isPlaying ? formatDuration(playbackPosition) : 'Play Recording'}
                    </Text>
                </Pressable>
            )}

            {/* Transcript — Enhanced TranscriptionViewer */}
            <View style={styles.transcriptSection}>
                <Text style={styles.sectionTitle}>Transcript</Text>
                <TranscriptionViewer
                    segments={session.segments.length > 0 ? session.segments : [{
                        id: 'full',
                        text: session.transcript || 'No transcript available',
                        startTime: 0,
                        endTime: session.duration,
                        confidence: 1,
                        isPartial: false,
                        speakerId: null,
                        language: session.languages?.[0] || 'en',
                    }]}
                    showProgress={isPlaying}
                    currentTime={playbackPosition}
                    totalDuration={session.duration}
                />
            </View>

            {/* Action Buttons */}
            <View style={styles.actionRow}>
                <Pressable style={styles.actionBtn} onPress={handleCopy} accessibilityLabel="Copy transcript" accessibilityRole="button">
                    <Text style={styles.actionBtnText}>📋 Copy</Text>
                </Pressable>
                <Pressable style={styles.actionBtn} onPress={handleShare} accessibilityLabel="Share transcript" accessibilityRole="button">
                    <Text style={styles.actionBtnText}>📤 Share</Text>
                </Pressable>
                <Pressable style={styles.actionBtn} onPress={handleExport} accessibilityLabel="Export session data" accessibilityRole="button">
                    <Text style={styles.actionBtnText}>📋 Export</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, styles.deleteBtn]} onPress={handleDelete} accessibilityLabel="Delete session" accessibilityRole="button">
                    <Text style={[styles.actionBtnText, styles.deleteBtnText]}>🗑 Delete</Text>
                </Pressable>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.screenPadding, paddingTop: spacing.lg },
    loadingText: { color: colors.textSecondary, textAlign: 'center', marginTop: 100 },

    header: { alignItems: 'center', marginBottom: spacing.lg },
    closeButton: { position: 'absolute', right: 0, top: -4, padding: spacing.sm },
    closeText: { fontSize: 20, color: colors.textSecondary },
    headerDate: { fontSize: 20, fontWeight: '600', color: colors.textPrimary },
    headerTime: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },

    statsRow: {
        flexDirection: 'row', justifyContent: 'space-around', marginBottom: spacing.lg,
        backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md
    },
    stat: { alignItems: 'center' },
    statValue: { fontSize: 18, fontWeight: '600', color: colors.textPrimary },
    statLabel: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },

    playerButton: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md,
        marginBottom: spacing.lg, gap: spacing.sm, borderWidth: 1, borderColor: colors.accent
    },
    playerIcon: { fontSize: 20 },
    playerText: { fontSize: 15, color: colors.accent, fontWeight: '500' },

    transcriptSection: { marginBottom: spacing.lg },
    sectionTitle: {
        fontSize: 13, fontWeight: '600', color: colors.textSecondary,
        textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm
    },
    transcriptBox: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md },
    transcriptText: { fontSize: 16, lineHeight: 24, color: colors.textPrimary },

    segmentsSection: { marginBottom: spacing.lg },
    segmentRow: {
        flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight
    },
    segmentTime: { fontSize: 12, color: colors.accent, fontVariant: ['tabular-nums'], width: 40 },
    segmentText: { fontSize: 14, color: colors.textPrimary, flex: 1 },

    actionRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xxl },
    actionBtn: {
        flex: 1, paddingVertical: spacing.sm + 2, borderRadius: borderRadius.md,
        borderWidth: 1, borderColor: colors.border, alignItems: 'center'
    },
    actionBtnText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
    deleteBtn: { borderColor: colors.stateError },
    deleteBtnText: { color: colors.stateError },
});
