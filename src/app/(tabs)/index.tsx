/**
 * 🧬 M1 + M2 — Main Record Screen
 * The core of Windy Pro: TAP → TALK → TEXT
 * One screen, one button, one flow.
 *
 * RP-1.1: Real AudioCaptureService wired
 * RP-1.3: Copy/Share/Save buttons functional
 * RP-1.4: Haptic feedback on all interactions
 * RP-2.3: Transcription → TranscriptStore pipeline
 */
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, Share, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef } from 'react';
import * as Clipboard from 'expo-clipboard';
import { CameraView } from 'expo-camera';
import { colors, spacing, borderRadius } from '@/theme';
import { useRecordingStore } from '@/stores/useRecordingStore';
import { useTranscriptStore } from '@/stores/useTranscriptStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { audioCaptureService, scoreAudioQuality } from '@/services/audio-capture';
import { transcriptionService } from '@/services/transcription';
import { feedbackService } from '@/services/feedback';
import { localStorageService } from '@/services/storage-local';
import { videoCaptureService } from '@/services/video-capture';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import type { Session } from '@/types';

export default function RecordScreen() {
    const {
        state,
        sessionId,
        duration,
        audioLevel,
        mediaCapture,
        startRecording: setRecordingStarted,
        stopRecording: setRecordingStopped,
        setError,
        reset,
        setDuration,
        setAudioLevel,
        toggleMedia,
    } = useRecordingStore();

    const { fullText, clear: clearTranscript, addSegment } = useTranscriptStore();
    const { licenseTier } = useSettingsStore();
    const { requireFeature, getRecordingLimit } = useFeatureGate();

    const durationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
    const avgLevelRef = useRef<number>(0);
    const peakLevelRef = useRef<number>(0);
    const levelSamples = useRef<number>(0);

    // Recording limits by tier (from hook)
    const maxDuration = getRecordingLimit();

    // Format duration as MM:SS
    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    /**
     * RP-1.1: REAL recording — wired to AudioCaptureService
     */
    const handleRecordPress = useCallback(async () => {
        if (state === 'idle' || state === 'error') {
            try {
                // Generate session ID
                const newSessionId = `session-${Date.now()}`;

                // Haptic feedback
                await feedbackService.recordStart();

                // Wire metering callback for real audio levels
                avgLevelRef.current = 0;
                peakLevelRef.current = 0;
                levelSamples.current = 0;
                audioCaptureService.onMeterUpdate = (level: number) => {
                    setAudioLevel(level);
                    // Track for quality scoring
                    levelSamples.current += 1;
                    avgLevelRef.current =
                        (avgLevelRef.current * (levelSamples.current - 1) + level) /
                        levelSamples.current;
                    if (level > peakLevelRef.current) peakLevelRef.current = level;
                };

                // Start real recording
                await audioCaptureService.startRecording(newSessionId);

                // Start video capture if video toggle is ON
                if (mediaCapture.video) {
                    try {
                        await videoCaptureService.startVideoCapture(newSessionId);
                    } catch (videoErr) {
                        console.warn('[Record] Video capture start failed:', videoErr);
                    }
                }

                // Update state
                setRecordingStarted(newSessionId);
                clearTranscript();

                // Duration timer
                const startTime = Date.now();
                durationInterval.current = setInterval(() => {
                    const elapsed = (Date.now() - startTime) / 1000;
                    setDuration(elapsed);

                    // Auto-stop at tier limit
                    if (elapsed >= maxDuration) {
                        handleStopRecording();
                    }
                }, 100);
            } catch (err: any) {
                console.error('[Record] Start failed:', err);
                setError();
                await feedbackService.error();
                Alert.alert(
                    'Recording Error',
                    err.message || 'Could not start recording. Check microphone permissions.'
                );
            }
        } else if (state === 'recording') {
            await handleStopRecording();
        }
    }, [state, setRecordingStarted, setRecordingStopped, reset, setDuration, setAudioLevel, clearTranscript, maxDuration]);

    /**
     * Stop recording, transcribe, score quality
     */
    const handleStopRecording = async () => {
        // Stop duration timer
        if (durationInterval.current) {
            clearInterval(durationInterval.current);
            durationInterval.current = null;
        }

        // Haptic feedback
        await feedbackService.recordStop();

        // Update state to processing
        setRecordingStopped();

        try {
            // Stop real recording
            const result = await audioCaptureService.stopRecording();

            // Stop video capture if active
            let videoResult: { uri: string; size: number } | null = null;
            if (videoCaptureService.getIsRecording()) {
                try {
                    videoResult = await videoCaptureService.stopVideoCapture();
                } catch (videoErr) {
                    console.warn('[Record] Video capture stop failed:', videoErr);
                }
            }

            // Score audio quality
            const quality = scoreAudioQuality(
                result.duration,
                44100,
                avgLevelRef.current,
                peakLevelRef.current
            );
            console.log(`[Record] Quality: ${quality.score}/100 (${quality.label})`);

            // RP-2.3: Transcribe the recording
            transcriptionService.onSegment = (segment) => {
                addSegment(segment);
            };

            try {
                await transcriptionService.transcribeFile(result.uri);
            } catch (transcribeErr) {
                console.warn('[Record] Transcription failed:', transcribeErr);
                // Non-fatal — recording is still saved
            }

            // Save session to local database
            const session: Session = {
                id: sessionId || `session-${Date.now()}`,
                createdAt: new Date().toISOString(),
                duration: duration,
                transcript: fullText,
                segments: useTranscriptStore.getState().segments,
                audioFilePath: result.uri,
                videoFilePath: videoResult?.uri ?? null,
                quality: quality,
                engineUsed: 'auto',
                source: 'record',
                languages: ['en'],
                mediaCapture: mediaCapture,
                fileSize: result.fileSize + (videoResult?.size ?? 0),
                synced: false,
                syncedAt: null,
                cloneUsable: quality.score >= 70,
                tags: [],
                location: null,
                deviceModel: 'Unknown',
            };
            try {
                await localStorageService.saveSession(session);
            } catch (saveErr) {
                console.warn('[Record] Save failed:', saveErr);
            }

        } catch (err: any) {
            console.error('[Record] Stop failed:', err);
            await feedbackService.error();
        }

        // Return to idle
        reset();
    };

    /**
     * RP-1.3: Copy transcript to clipboard
     */
    const handleCopy = async () => {
        await Clipboard.setStringAsync(fullText);
        await feedbackService.success();
        Alert.alert('Copied', 'Transcript copied to clipboard');
    };

    /**
     * RP-1.3: Share transcript via system share sheet
     */
    const handleShare = async () => {
        await feedbackService.tap();
        await Share.share({
            message: fullText,
            title: 'Windy Pro Transcript',
        });
    };

    /**
     * RP-1.3: Save session to history
     */
    const handleSave = async () => {
        if (!fullText.trim()) {
            Alert.alert('Nothing to save', 'Record something first.');
            return;
        }
        const session: Session = {
            id: `manual-${Date.now()}`,
            createdAt: new Date().toISOString(),
            duration: duration,
            transcript: fullText,
            segments: [],
            audioFilePath: null,
            videoFilePath: null,
            quality: { score: 0, label: 'poor' as const, snrDb: 0, speechRatio: 0, hasClipping: false, sampleRate: 0 },
            engineUsed: 'manual',
            source: 'record',
            languages: ['en'],
            mediaCapture: { audio: false, video: false, text: true },
            fileSize: 0,
            synced: false,
            syncedAt: null,
            cloneUsable: false,
            tags: [],
            location: null,
            deviceModel: 'Unknown',
        };
        try {
            await localStorageService.saveSession(session);
            await feedbackService.success();
            Alert.alert('Saved', 'Session saved to history');
        } catch (err) {
            await feedbackService.error();
            Alert.alert('Save Failed', 'Could not save session.');
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (durationInterval.current) {
                clearInterval(durationInterval.current);
            }
            if (audioCaptureService.isRecording()) {
                audioCaptureService.cancelRecording();
            }
            if (videoCaptureService.getIsRecording()) {
                videoCaptureService.cancelVideoCapture();
            }
        };
    }, []);

    // Dynamic strobe color based on state
    const getStrobeColor = () => {
        switch (state) {
            case 'recording': return colors.stateRecording;
            case 'processing': return colors.stateProcessing;
            case 'error': return colors.stateError;
            default: return colors.stateIdle;
        }
    };

    const getStatusText = () => {
        switch (state) {
            case 'idle': return 'Tap to Record';
            case 'recording': return `Recording... (${formatDuration(maxDuration - duration)} left)`;
            case 'processing': return 'Processing...';
            case 'error': return 'Error — Tap to Retry';
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar style="light" />

            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>Windy Pro</Text>
                <Text style={styles.subtitle}>Voice to Text, Your Way</Text>
            </View>

            {/* Media Toggles */}
            <View style={styles.toggleRow}>
                <Pressable
                    style={[styles.toggle, mediaCapture.audio && styles.toggleActive]}
                    onPress={async () => { await feedbackService.tap(); toggleMedia('audio'); }}
                >
                    <Text style={styles.toggleEmoji}>🎤</Text>
                    <Text style={[styles.toggleLabel, mediaCapture.audio && styles.toggleLabelActive]}>
                        Audio
                    </Text>
                </Pressable>
                <Pressable
                    style={[styles.toggle, mediaCapture.video && styles.toggleActive]}
                    onPress={async () => {
                        if (!requireFeature('video-capture', 'Video Capture')) return;
                        await feedbackService.tap(); toggleMedia('video');
                    }}
                >
                    <Text style={styles.toggleEmoji}>📹</Text>
                    <Text style={[styles.toggleLabel, mediaCapture.video && styles.toggleLabelActive]}>
                        Video
                    </Text>
                </Pressable>
                <Pressable
                    style={[styles.toggle, mediaCapture.text && styles.toggleActive]}
                    onPress={async () => { await feedbackService.tap(); toggleMedia('text'); }}
                >
                    <Text style={styles.toggleEmoji}>📝</Text>
                    <Text style={[styles.toggleLabel, mediaCapture.text && styles.toggleLabelActive]}>
                        Text
                    </Text>
                </Pressable>
            </View>

            {/* Waveform / Level Indicator */}
            {state === 'recording' && (
                <View style={styles.waveformContainer}>
                    {Array.from({ length: 20 }).map((_, i) => {
                        const barLevel = Math.max(0.05, Math.sin(i * 0.5 + Date.now() / 200) * audioLevel);
                        return (
                            <View
                                key={i}
                                style={[
                                    styles.waveformBar,
                                    {
                                        height: barLevel * 60 + 4,
                                        backgroundColor: colors.stateRecording,
                                        opacity: 0.5 + barLevel * 0.5,
                                    },
                                ]}
                            />
                        );
                    })}
                </View>
            )}

            {/* Camera Preview — shows when video toggle is ON and not recording */}
            {mediaCapture.video && state !== 'recording' && (
                <View style={styles.cameraContainer}>
                    <CameraView
                        ref={(ref: any) => videoCaptureService.setCameraRef(ref)}
                        style={styles.cameraPreview}
                        facing="front"
                    />
                    <Text style={styles.cameraLabel}>📹 Front Camera Ready</Text>
                </View>
            )}

            {/* Processing indicator */}
            {state === 'processing' && (
                <View style={styles.processingBanner}>
                    <Text style={styles.processingText}>🔄 Transcribing audio...</Text>
                </View>
            )}

            {/* The Big Record Button */}
            <View style={styles.buttonContainer}>
                {/* Strobe glow ring */}
                {state !== 'idle' && (
                    <View
                        style={[
                            styles.strobeRing,
                            { borderColor: getStrobeColor(), shadowColor: getStrobeColor() },
                        ]}
                    />
                )}
                <Pressable
                    style={[
                        styles.recordButton,
                        state === 'recording' && styles.recordButtonActive,
                        state === 'processing' && styles.recordButtonProcessing,
                    ]}
                    onPress={handleRecordPress}
                >
                    {state === 'recording' ? (
                        <View style={styles.stopSquare} />
                    ) : state === 'processing' ? (
                        <Text style={styles.buttonEmoji}>⏳</Text>
                    ) : (
                        <Text style={styles.buttonEmoji}>🌪️</Text>
                    )}
                </Pressable>
            </View>

            {/* Duration */}
            <Text style={styles.duration}>
                {state === 'recording' || state === 'processing'
                    ? formatDuration(duration)
                    : '00:00'}
            </Text>

            {/* Status */}
            <Text style={[styles.statusText, { color: getStrobeColor() }]}>
                {getStatusText()}
            </Text>

            {/* Transcript Preview */}
            <ScrollView
                style={styles.transcriptContainer}
                contentContainerStyle={styles.transcriptContent}
            >
                {fullText ? (
                    <Text style={styles.transcriptText} selectable>{fullText}</Text>
                ) : (
                    <Text style={styles.transcriptPlaceholder}>
                        {state === 'idle'
                            ? 'Your transcript will appear here...'
                            : state === 'recording'
                                ? 'Listening...'
                                : 'Processing your speech...'}
                    </Text>
                )}
            </ScrollView>

            {/* Action Buttons (visible when transcript exists) */}
            {fullText.length > 0 && state === 'idle' && (
                <View style={styles.actionRow}>
                    <Pressable style={styles.actionButton} onPress={handleCopy}>
                        <Text style={styles.actionButtonText}>📋 Copy</Text>
                    </Pressable>
                    <Pressable style={styles.actionButton} onPress={handleShare}>
                        <Text style={styles.actionButtonText}>📤 Share</Text>
                    </Pressable>
                    <Pressable
                        style={[styles.actionButton, styles.actionButtonPrimary]}
                        onPress={handleSave}
                    >
                        <Text style={[styles.actionButtonText, styles.actionButtonTextPrimary]}>
                            📌 Save
                        </Text>
                    </Pressable>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
        alignItems: 'center',
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
    },
    header: {
        alignItems: 'center',
        marginBottom: spacing.lg,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    subtitle: {
        fontSize: 14,
        color: colors.textSecondary,
        marginTop: spacing.xs,
    },

    // Media toggles
    toggleRow: {
        flexDirection: 'row',
        gap: spacing.sm,
        marginBottom: spacing.lg,
    },
    toggle: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.xl,
        borderWidth: 1,
        borderColor: colors.border,
        gap: spacing.xs,
    },
    toggleActive: {
        borderColor: colors.accent,
        backgroundColor: colors.accentTransparent,
    },
    toggleEmoji: {
        fontSize: 14,
    },
    toggleLabel: {
        fontSize: 13,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    toggleLabelActive: {
        color: colors.accent,
    },

    // Waveform
    waveformContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 64,
        gap: 3,
        marginBottom: spacing.md,
        paddingHorizontal: spacing.xl,
    },
    waveformBar: {
        width: 4,
        borderRadius: 2,
        minHeight: 4,
    },

    // Record button
    buttonContainer: {
        width: 140,
        height: 140,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.md,
    },
    strobeRing: {
        position: 'absolute',
        width: 140,
        height: 140,
        borderRadius: 70,
        borderWidth: 3,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 20,
        elevation: 10,
    },
    recordButton: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
        borderColor: colors.stateIdle,
    },
    recordButtonActive: {
        borderColor: colors.stateRecording,
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
    },
    recordButtonProcessing: {
        borderColor: colors.stateProcessing,
        backgroundColor: 'rgba(234, 179, 8, 0.1)',
    },
    stopSquare: {
        width: 32,
        height: 32,
        borderRadius: 4,
        backgroundColor: colors.stateRecording,
    },
    buttonEmoji: {
        fontSize: 48,
    },

    // Duration & status
    duration: {
        fontSize: 32,
        fontWeight: '300',
        color: colors.textPrimary,
        fontVariant: ['tabular-nums'],
    },
    statusText: {
        fontSize: 14,
        fontWeight: '500',
        marginTop: spacing.xs,
        marginBottom: spacing.lg,
    },

    // Transcript
    transcriptContainer: {
        flex: 1,
        width: '100%',
        paddingHorizontal: spacing.screenPadding,
    },
    transcriptContent: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        minHeight: 100,
    },
    transcriptText: {
        fontSize: 16,
        lineHeight: 24,
        color: colors.textPrimary,
    },
    transcriptPlaceholder: {
        fontSize: 15,
        color: colors.textTertiary,
        textAlign: 'center',
        paddingTop: spacing.xl,
    },

    // Action buttons
    actionRow: {
        flexDirection: 'row',
        gap: spacing.sm,
        paddingHorizontal: spacing.screenPadding,
        paddingVertical: spacing.md,
        width: '100%',
    },
    actionButton: {
        flex: 1,
        paddingVertical: spacing.sm + 2,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
    },
    actionButtonPrimary: {
        backgroundColor: colors.accent,
        borderColor: colors.accent,
    },
    actionButtonText: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    actionButtonTextPrimary: {
        color: colors.background,
    },

    // Video camera preview
    cameraContainer: {
        height: 160,
        marginHorizontal: spacing.screenPadding,
        marginBottom: spacing.md,
        borderRadius: borderRadius.lg,
        overflow: 'hidden' as const,
        borderWidth: 1,
        borderColor: colors.border,
    },
    cameraPreview: {
        flex: 1,
    },
    cameraLabel: {
        position: 'absolute' as const,
        bottom: 8,
        alignSelf: 'center' as const,
        color: colors.textSecondary,
        fontSize: 12,
    },

    // Processing banner
    processingBanner: {
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
        backgroundColor: colors.stateProcessing + '20',
        borderRadius: borderRadius.md,
        marginHorizontal: spacing.screenPadding,
        marginTop: spacing.sm,
        alignItems: 'center' as const,
    },
    processingText: {
        color: colors.stateProcessing,
        fontSize: 14,
        fontWeight: '500' as const,
    },
});
