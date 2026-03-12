/**
 * 🧬 M3 — Transcription Viewer
 * Real-time progress indicator, word-level confidence highlighting,
 * speaker diarization labels, SRT/VTT export, transcript analytics
 */
import { View, Text, StyleSheet, FlatList, ScrollView, Pressable, Alert, Share, Animated } from 'react-native';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { colors, spacing, borderRadius } from '@/theme';
import { feedbackService } from '@/services/feedback';
import type { TranscriptSegment } from '@/types';

// ── Confidence colors ──
function confidenceColor(c: number): string {
    if (c >= 0.85) return colors.qualityExcellent;   // green
    if (c >= 0.60) return '#eab308';                   // yellow
    return colors.qualityPoor;                         // red
}

function confidenceLabel(c: number): string {
    if (c >= 0.85) return 'High';
    if (c >= 0.60) return 'Medium';
    return 'Low';
}

// ── Speaker colors (up to 8 speakers) ──
const SPEAKER_COLORS = [
    '#a3e635', '#2dd4bf', '#c084fc', '#f472b6',
    '#fb923c', '#38bdf8', '#fbbf24', '#f87171',
];

function speakerColor(speakerId: string | null): string {
    if (!speakerId) return colors.textTertiary;
    const idx = parseInt(speakerId.replace(/\D/g, ''), 10) || 0;
    return SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
}

function speakerLabel(speakerId: string | null): string {
    if (!speakerId) return '';
    const idx = parseInt(speakerId.replace(/\D/g, ''), 10);
    return isNaN(idx) ? speakerId : `Speaker ${idx + 1}`;
}

// ── Time formatting ──
function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    if (h > 0) {
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

function formatTimeSRT(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

function formatTimeVTT(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

// ── SRT/VTT generators ──
export function generateSRT(segments: TranscriptSegment[]): string {
    const finalSegments = segments.filter(s => !s.isPartial);
    return finalSegments.map((seg, i) => {
        const prefix = seg.speakerId ? `[${speakerLabel(seg.speakerId)}] ` : '';
        return `${i + 1}\n${formatTimeSRT(seg.startTime)} --> ${formatTimeSRT(seg.endTime)}\n${prefix}${seg.text}\n`;
    }).join('\n');
}

export function generateVTT(segments: TranscriptSegment[]): string {
    const finalSegments = segments.filter(s => !s.isPartial);
    const cues = finalSegments.map((seg) => {
        const prefix = seg.speakerId ? `<v ${speakerLabel(seg.speakerId)}>` : '';
        return `${formatTimeVTT(seg.startTime)} --> ${formatTimeVTT(seg.endTime)}\n${prefix}${seg.text}`;
    }).join('\n\n');
    return `WEBVTT\n\n${cues}\n`;
}

// ── Props ──
interface TranscriptionViewerProps {
    segments: TranscriptSegment[];
    isStreaming?: boolean;
    showProgress?: boolean;
    currentTime?: number;  // playback position in seconds
    totalDuration?: number;
}

// 🚀 Perf: stable key extractor for FlatList
const segmentKeyExtractor = (seg: TranscriptSegment) => seg.id;

export default function TranscriptionViewer({
    segments,
    isStreaming = false,
    showProgress = false,
    currentTime = 0,
    totalDuration = 0,
}: TranscriptionViewerProps) {
    const scrollRef = useRef<ScrollView>(null);
    const [showConfidence, setShowConfidence] = useState(true);
    const [showSpeakers, setShowSpeakers] = useState(true);
    const progressAnim = useRef(new Animated.Value(0)).current;

    // Auto-scroll during streaming
    useEffect(() => {
        if (isStreaming) {
            scrollRef.current?.scrollToEnd({ animated: true });
        }
    }, [segments.length, isStreaming]);

    // Progress animation
    useEffect(() => {
        if (showProgress && totalDuration > 0) {
            Animated.timing(progressAnim, {
                toValue: Math.min(1, currentTime / totalDuration),
                duration: 200,
                useNativeDriver: false,
            }).start();
        }
    }, [currentTime, totalDuration]);

    // Analytics
    const analytics = useMemo(() => {
        const final = segments.filter(s => !s.isPartial);
        if (final.length === 0) return null;

        const totalWords = final.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
        const avgConfidence = final.reduce((sum, s) => sum + s.confidence, 0) / final.length;
        const speakers = new Set(final.map(s => s.speakerId).filter(Boolean));
        const highConf = final.filter(s => s.confidence >= 0.85).length;
        const lowConf = final.filter(s => s.confidence < 0.60).length;

        return {
            segmentCount: final.length,
            totalWords,
            avgConfidence,
            speakerCount: speakers.size,
            highConfPct: (highConf / final.length) * 100,
            lowConfPct: (lowConf / final.length) * 100,
        };
    }, [segments]);

    // Export handlers
    const handleExportSRT = async () => {
        try {
            const srt = generateSRT(segments);
            const path = (FileSystem.cacheDirectory || '') + `transcript-${Date.now()}.srt`;
            await FileSystem.writeAsStringAsync(path, srt);

            const canShare = await Sharing.isAvailableAsync();
            if (canShare) {
                await Sharing.shareAsync(path, { mimeType: 'text/srt', dialogTitle: 'Export SRT' });
            } else {
                await Clipboard.setStringAsync(srt);
                Alert.alert('Exported', 'SRT content copied to clipboard');
            }
            await feedbackService.success();
        } catch (err) { console.warn("[TranscriptionViewer] Error:", err);
            Alert.alert('Export Failed', 'Could not export SRT file.');
        }
    };

    const handleExportVTT = async () => {
        try {
            const vtt = generateVTT(segments);
            const path = (FileSystem.cacheDirectory || '') + `transcript-${Date.now()}.vtt`;
            await FileSystem.writeAsStringAsync(path, vtt);

            const canShare = await Sharing.isAvailableAsync();
            if (canShare) {
                await Sharing.shareAsync(path, { mimeType: 'text/vtt', dialogTitle: 'Export VTT' });
            } else {
                await Clipboard.setStringAsync(vtt);
                Alert.alert('Exported', 'VTT content copied to clipboard');
            }
            await feedbackService.success();
        } catch (err) { console.warn("[TranscriptionViewer] Error:", err);
            Alert.alert('Export Failed', 'Could not export VTT file.');
        }
    };

    const handleCopyAll = async () => {
        const text = segments.filter(s => !s.isPartial).map(s => s.text).join(' ');
        await Clipboard.setStringAsync(text);
        await feedbackService.success();
        Alert.alert('Copied', 'Transcript copied to clipboard');
    };

    if (segments.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>📝</Text>
                <Text style={styles.emptyText}>
                    {isStreaming ? 'Listening...' : 'No transcript data'}
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Progress indicator */}
            {showProgress && totalDuration > 0 && (
                <View style={styles.progressRow}>
                    <View style={styles.progressBar}>
                        <Animated.View
                            style={[styles.progressFill, {
                                width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                            }]}
                        />
                    </View>
                    <Text style={styles.progressText}>
                        {formatTime(currentTime).slice(0, 5)} / {formatTime(totalDuration).slice(0, 5)}
                    </Text>
                </View>
            )}

            {/* Streaming indicator */}
            {isStreaming && (
                <View style={styles.streamingBanner}>
                    <View style={styles.streamingDot} />
                    <Text style={styles.streamingText}>Transcribing...</Text>
                    <Text style={styles.streamingCount}>{segments.length} segments</Text>
                </View>
            )}

            {/* Toggles */}
            <View style={styles.toggleRow}>
                <Pressable
                    style={[styles.toggleBtn, showConfidence && styles.toggleBtnActive]}
                    onPress={() => setShowConfidence(!showConfidence)}
                >
                    <Text style={[styles.toggleText, showConfidence && styles.toggleTextActive]}>
                        🎯 Confidence
                    </Text>
                </Pressable>
                <Pressable
                    style={[styles.toggleBtn, showSpeakers && styles.toggleBtnActive]}
                    onPress={() => setShowSpeakers(!showSpeakers)}
                >
                    <Text style={[styles.toggleText, showSpeakers && styles.toggleTextActive]}>
                        👤 Speakers
                    </Text>
                </Pressable>
            </View>

            {/* Transcript segments — 🚀 Perf: FlatList for windowed rendering */}
            <FlatList
                ref={scrollRef as any}
                style={styles.segmentsList}
                contentContainerStyle={styles.segmentsContent}
                data={segments}
                keyExtractor={segmentKeyExtractor}
                renderItem={({ item: seg }) => {
                    const isActive = currentTime >= seg.startTime && currentTime <= seg.endTime;
                    return (
                        <View
                            style={[
                                styles.segmentRow,
                                seg.isPartial && styles.segmentPartial,
                                isActive && styles.segmentActive,
                            ]}
                        >
                            {/* Speaker label */}
                            {showSpeakers && seg.speakerId && (
                                <View style={[styles.speakerBadge, { backgroundColor: speakerColor(seg.speakerId) + '20', borderColor: speakerColor(seg.speakerId) + '40' }]}>
                                    <Text style={[styles.speakerText, { color: speakerColor(seg.speakerId) }]}>
                                        {speakerLabel(seg.speakerId)}
                                    </Text>
                                </View>
                            )}

                            {/* Timestamp */}
                            <Text style={styles.segmentTime}>
                                {formatTime(seg.startTime).slice(0, 5)}
                            </Text>

                            {/* Text with confidence highlighting */}
                            <View style={styles.segmentTextContainer}>
                                <Text
                                    style={[
                                        styles.segmentText,
                                        seg.isPartial && styles.segmentTextPartial,
                                        showConfidence && {
                                            color: confidenceColor(seg.confidence),
                                        },
                                    ]}
                                    selectable
                                >
                                    {seg.text}
                                </Text>

                                {/* Confidence indicator */}
                                {showConfidence && (
                                    <View style={styles.confidenceRow}>
                                        <View style={[styles.confidenceDot, { backgroundColor: confidenceColor(seg.confidence) }]} />
                                        <Text style={styles.confidenceText}>
                                            {Math.round(seg.confidence * 100)}% {confidenceLabel(seg.confidence)}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    );
                }}
                maxToRenderPerBatch={15}
                windowSize={7}
                initialNumToRender={20}
            />

            {/* Analytics bar */}
            {analytics && !isStreaming && (
                <View style={styles.analyticsBar}>
                    <View style={styles.analyticsStat}>
                        <Text style={styles.analyticsValue}>{analytics.totalWords}</Text>
                        <Text style={styles.analyticsLabel}>words</Text>
                    </View>
                    <View style={styles.analyticsDivider} />
                    <View style={styles.analyticsStat}>
                        <Text style={styles.analyticsValue}>{analytics.segmentCount}</Text>
                        <Text style={styles.analyticsLabel}>segments</Text>
                    </View>
                    <View style={styles.analyticsDivider} />
                    <View style={styles.analyticsStat}>
                        <Text style={styles.analyticsValue}>{Math.round(analytics.avgConfidence * 100)}%</Text>
                        <Text style={styles.analyticsLabel}>avg conf</Text>
                    </View>
                    {analytics.speakerCount > 0 && (
                        <>
                            <View style={styles.analyticsDivider} />
                            <View style={styles.analyticsStat}>
                                <Text style={styles.analyticsValue}>{analytics.speakerCount}</Text>
                                <Text style={styles.analyticsLabel}>speakers</Text>
                            </View>
                        </>
                    )}
                </View>
            )}

            {/* Export buttons */}
            {!isStreaming && segments.length > 0 && (
                <View style={styles.exportRow}>
                    <Pressable style={styles.exportBtn} onPress={handleCopyAll}>
                        <Text style={styles.exportBtnText}>📋 Copy</Text>
                    </Pressable>
                    <Pressable style={styles.exportBtn} onPress={handleExportSRT}>
                        <Text style={styles.exportBtnText}>📄 SRT</Text>
                    </Pressable>
                    <Pressable style={styles.exportBtn} onPress={handleExportVTT}>
                        <Text style={styles.exportBtnText}>📄 VTT</Text>
                    </Pressable>
                    <Pressable
                        style={[styles.exportBtn, styles.exportBtnPrimary]}
                        onPress={async () => {
                            const text = segments.filter(s => !s.isPartial).map(s => s.text).join(' ');
                            await Share.share({ message: text, title: 'Windy Pro Transcript' });
                        }}
                    >
                        <Text style={[styles.exportBtnText, styles.exportBtnTextPrimary]}>📤 Share</Text>
                    </Pressable>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    emptyContainer: { alignItems: 'center', paddingVertical: spacing.xl },
    emptyEmoji: { fontSize: 36, marginBottom: spacing.sm },
    emptyText: { fontSize: 14, color: colors.textTertiary },

    // Progress
    progressRow: {
        flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
        paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    },
    progressBar: {
        flex: 1, height: 4, backgroundColor: colors.surfaceLight,
        borderRadius: 2, overflow: 'hidden',
    },
    progressFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 2 },
    progressText: {
        fontSize: 11, color: colors.textTertiary,
        fontVariant: ['tabular-nums'], width: 75, textAlign: 'right',
    },

    // Streaming
    streamingBanner: {
        flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
        paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
    },
    streamingDot: {
        width: 8, height: 8, borderRadius: 4,
        backgroundColor: colors.stateRecording,
    },
    streamingText: { fontSize: 12, fontWeight: '600', color: colors.stateRecording },
    streamingCount: { fontSize: 11, color: colors.textTertiary, marginLeft: 'auto' },

    // Toggles
    toggleRow: {
        flexDirection: 'row', gap: spacing.xs,
        paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    },
    toggleBtn: {
        paddingVertical: 4, paddingHorizontal: spacing.sm,
        borderRadius: borderRadius.sm, borderWidth: 1,
        borderColor: colors.borderLight,
    },
    toggleBtnActive: { borderColor: colors.accent, backgroundColor: colors.accentTransparent },
    toggleText: { fontSize: 12, color: colors.textTertiary },
    toggleTextActive: { color: colors.accent },

    // Segments
    segmentsList: { flex: 1 },
    segmentsContent: { padding: spacing.md, gap: spacing.xs },
    segmentRow: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.md,
        padding: spacing.sm + 2,
        borderLeftWidth: 3,
        borderLeftColor: 'transparent',
    },
    segmentPartial: { opacity: 0.6 },
    segmentActive: {
        borderLeftColor: colors.accent,
        backgroundColor: colors.accentTransparent,
    },

    // Speaker
    speakerBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: spacing.xs + 2,
        paddingVertical: 2,
        borderRadius: borderRadius.sm,
        borderWidth: 1,
        marginBottom: 4,
    },
    speakerText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

    // Content
    segmentTime: {
        fontSize: 10, color: colors.textTertiary,
        fontVariant: ['tabular-nums'], marginBottom: 2,
    },
    segmentTextContainer: { flex: 1 },
    segmentText: {
        fontSize: 15, lineHeight: 22, color: colors.textPrimary,
    },
    segmentTextPartial: { fontStyle: 'italic' },

    // Confidence
    confidenceRow: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        marginTop: 4,
    },
    confidenceDot: { width: 6, height: 6, borderRadius: 3 },
    confidenceText: { fontSize: 10, color: colors.textTertiary },

    // Analytics
    analyticsBar: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: spacing.md, paddingVertical: spacing.sm,
        borderTopWidth: 1, borderTopColor: colors.borderLight,
        backgroundColor: colors.surface,
    },
    analyticsStat: { alignItems: 'center' },
    analyticsValue: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
    analyticsLabel: { fontSize: 10, color: colors.textTertiary, marginTop: 1 },
    analyticsDivider: { width: 1, height: 20, backgroundColor: colors.borderLight },

    // Export
    exportRow: {
        flexDirection: 'row', gap: spacing.xs,
        padding: spacing.sm,
        borderTopWidth: 1, borderTopColor: colors.borderLight,
    },
    exportBtn: {
        flex: 1, paddingVertical: spacing.sm,
        borderRadius: borderRadius.md, borderWidth: 1,
        borderColor: colors.borderLight, alignItems: 'center',
    },
    exportBtnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
    exportBtnText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    exportBtnTextPrimary: { color: colors.background },
});
