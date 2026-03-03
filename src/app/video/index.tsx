/**
 * 🧬 M12 — Video Recording Screen
 * Video mode toggle, camera preview, playback controls, thumbnails, file size
 */
import { View, Text, StyleSheet, Pressable, Platform, Alert, Animated, Image } from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { CameraView, Camera } from 'expo-camera';
import { Audio, Video, ResizeMode } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { colors, spacing, borderRadius } from '@/theme';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { videoCaptureService } from '@/services/video-capture';
import { audioCaptureService, scoreAudioQuality } from '@/services/audio-capture';
import { feedbackService } from '@/services/feedback';
import { localStorageService } from '@/services/storage-local';
import { useRecordingStore } from '@/stores/useRecordingStore';
import type { Session } from '@/types';

type RecordMode = 'audio-only' | 'video';

export default function VideoRecordScreen() {
    const router = useRouter();
    const {
        state, duration, audioLevel,
        startRecording: setRecordingStarted,
        stopRecording: setRecordingStopped,
        setError, reset, setDuration, setAudioLevel,
    } = useRecordingStore();

    const [mode, setMode] = useState<RecordMode>('video');
    const [hasCameraPermission, setHasCameraPermission] = useState(false);
    const [facing, setFacing] = useState<'front' | 'back'>('front');

    // Recording refs
    const durationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
    const avgLevelRef = useRef(0);
    const peakLevelRef = useRef(0);
    const levelSamples = useRef(0);

    // Playback state
    const [recordedVideoUri, setRecordedVideoUri] = useState<string | null>(null);
    const [recordedAudioUri, setRecordedAudioUri] = useState<string | null>(null);
    const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
    const [fileSize, setFileSize] = useState(0);
    const [videoDuration, setVideoDuration] = useState(0);
    const videoRef = useRef<Video>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackPosition, setPlaybackPosition] = useState(0);
    const [playbackDuration, setPlaybackDuration] = useState(0);

    // Pulsing dot
    const pulseAnim = useRef(new Animated.Value(0.4)).current;

    useEffect(() => {
        (async () => {
            const granted = await videoCaptureService.requestPermission();
            setHasCameraPermission(granted);
        })();
    }, []);

    useEffect(() => {
        if (state === 'recording') {
            const loop = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 0.4, duration: 600, useNativeDriver: true }),
                ])
            );
            loop.start();
            return () => loop.stop();
        } else {
            pulseAnim.setValue(0.4);
        }
    }, [state]);

    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1048576).toFixed(1)} MB`;
    };

    // Estimate video size (approx 2 Mbps for 720p)
    const estimateVideoSize = (secs: number): number => {
        const audioBps = 44100 * 2; // 16-bit mono WAV
        const videoBps = mode === 'video' ? 250000 : 0; // ~2 Mbps video
        return Math.round(secs * (audioBps + videoBps));
    };

    const handleStartRecording = async () => {
        try {
            const sessionId = `video-${Date.now()}`;
            feedbackService.recordStart().catch(() => { });

            // Reset state
            setRecordedVideoUri(null);
            setRecordedAudioUri(null);
            setThumbnailUri(null);
            setFileSize(0);
            setPlaybackPosition(0);
            setPlaybackDuration(0);
            avgLevelRef.current = 0;
            peakLevelRef.current = 0;
            levelSamples.current = 0;

            // Set up audio metering
            audioCaptureService.onMeterUpdate = (level: number) => {
                setAudioLevel(level);
                levelSamples.current += 1;
                avgLevelRef.current =
                    (avgLevelRef.current * (levelSamples.current - 1) + level) /
                    levelSamples.current;
                if (level > peakLevelRef.current) peakLevelRef.current = level;
            };

            // Start audio recording
            await audioCaptureService.startRecording(sessionId);

            // Start video capture if in video mode
            if (mode === 'video') {
                try {
                    await videoCaptureService.startVideoCapture(sessionId);
                } catch (err) {
                    console.warn('[Video] Camera capture start failed:', err);
                }
            }

            setRecordingStarted(sessionId);

            // Duration timer
            const startTime = Date.now();
            durationInterval.current = setInterval(() => {
                const elapsed = (Date.now() - startTime) / 1000;
                setDuration(elapsed);
                setFileSize(estimateVideoSize(elapsed));
            }, 100);
        } catch (err: any) {
            console.error('[Video] Start failed:', err);
            setError();
            feedbackService.error().catch(() => { });
            Alert.alert('Recording Error', err.message || 'Could not start recording.');
        }
    };

    const handleStopRecording = async () => {
        if (durationInterval.current) {
            clearInterval(durationInterval.current);
            durationInterval.current = null;
        }

        feedbackService.recordStop().catch(() => { });
        setRecordingStopped();

        try {
            // Stop audio
            const audioResult = await audioCaptureService.stopRecording();
            setRecordedAudioUri(audioResult.uri);

            let videoUri: string | null = null;
            let totalSize = audioResult.fileSize;

            // Stop video if recording
            if (mode === 'video' && videoCaptureService.getIsRecording()) {
                try {
                    const videoResult = await videoCaptureService.stopVideoCapture();
                    videoUri = videoResult.uri;
                    totalSize += videoResult.size;
                    setRecordedVideoUri(videoResult.uri);

                    // Generate thumbnail
                    await generateThumbnail(videoResult.uri);
                } catch (err) {
                    console.warn('[Video] Stop video failed:', err);
                }
            }

            setFileSize(totalSize);
            setVideoDuration(duration);

            // Score quality
            const quality = scoreAudioQuality(
                audioResult.duration,
                44100,
                avgLevelRef.current,
                peakLevelRef.current
            );

            // Save session
            const session: Session = {
                id: `video-${Date.now()}`,
                createdAt: new Date().toISOString(),
                duration: duration,
                transcript: '',
                segments: [],
                audioFilePath: audioResult.uri,
                videoFilePath: videoUri,
                quality,
                engineUsed: 'auto',
                source: 'record',
                languages: ['en'],
                mediaCapture: { audio: true, video: mode === 'video', text: false },
                fileSize: totalSize,
                synced: false,
                syncedAt: null,
                cloneUsable: quality.score >= 70,
                tags: ['video'],
                location: null,
                deviceModel: 'Unknown',
            };

            try {
                await localStorageService.saveSession(session);
            } catch (err) {
                console.warn('[Video] Save failed:', err);
            }
        } catch (err: any) {
            console.error('[Video] Stop failed:', err);
            feedbackService.error().catch(() => { });
        }

        reset();
    };

    const generateThumbnail = async (videoPath: string) => {
        // Use first frame as thumbnail (expo-video-thumbnails or fallback)
        try {
            // Try dynamic import for optional dependency
            const VideoThumbnails = require('expo-video-thumbnails');
            const { uri } = await VideoThumbnails.getThumbnailAsync(videoPath, {
                time: 500,
                quality: 0.6,
            });
            setThumbnailUri(uri);
        } catch {
            // Fallback: no thumbnail, use placeholder
            setThumbnailUri(null);
        }
    };

    const handleRecordPress = () => {
        if (state === 'idle' || state === 'error') {
            handleStartRecording();
        } else if (state === 'recording') {
            handleStopRecording();
        }
    };

    const handlePlayback = async () => {
        if (!videoRef.current) return;
        if (isPlaying) {
            await videoRef.current.pauseAsync();
            setIsPlaying(false);
        } else {
            await videoRef.current.playAsync();
            setIsPlaying(true);
        }
    };

    const toggleCamera = () => {
        setFacing(f => f === 'front' ? 'back' : 'front');
    };

    const playbackPct = playbackDuration > 0 ? (playbackPosition / playbackDuration) * 100 : 0;

    return (
        <ScreenErrorBoundary screenName="Video">
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <Pressable onPress={() => router.back()} style={styles.backBtn}>
                        <Text style={styles.backText}>← Back</Text>
                    </Pressable>
                    <Text style={styles.title}>Video Recorder</Text>
                    <View style={styles.headerRight} />
                </View>

                {/* Mode Toggle */}
                <View style={styles.modeToggle}>
                    <Pressable
                        style={[styles.modeBtn, mode === 'audio-only' && styles.modeBtnActive]}
                        onPress={() => { setMode('audio-only'); feedbackService.tap(); }}
                    >
                        <Text style={styles.modeBtnEmoji}>🎤</Text>
                        <Text style={[styles.modeBtnText, mode === 'audio-only' && styles.modeBtnTextActive]}>
                            Audio Only
                        </Text>
                    </Pressable>
                    <Pressable
                        style={[styles.modeBtn, mode === 'video' && styles.modeBtnActive]}
                        onPress={() => { setMode('video'); feedbackService.tap(); }}
                    >
                        <Text style={styles.modeBtnEmoji}>📹</Text>
                        <Text style={[styles.modeBtnText, mode === 'video' && styles.modeBtnTextActive]}>
                            Video
                        </Text>
                    </Pressable>
                </View>

                {/* Camera Preview / Video Playback */}
                <View style={styles.previewContainer}>
                    {recordedVideoUri && state === 'idle' ? (
                        // Playback of recorded video
                        <View style={styles.videoPlayback}>
                            <Video
                                ref={videoRef}
                                source={{ uri: recordedVideoUri }}
                                style={styles.videoPlayer}
                                resizeMode={ResizeMode.CONTAIN}
                                shouldPlay={false}
                                isLooping={false}
                                onPlaybackStatusUpdate={(status) => {
                                    if (status.isLoaded) {
                                        setPlaybackPosition(status.positionMillis || 0);
                                        setPlaybackDuration(status.durationMillis || 1);
                                        if (status.didJustFinish) {
                                            setIsPlaying(false);
                                        }
                                    }
                                }}
                            />
                            {/* Playback overlay */}
                            <Pressable style={styles.playOverlay} onPress={handlePlayback}>
                                {!isPlaying && (
                                    <View style={styles.playCircle}>
                                        <Text style={styles.playIcon}>▶</Text>
                                    </View>
                                )}
                            </Pressable>
                            {/* Progress bar */}
                            <View style={styles.progressBarContainer}>
                                <View style={styles.progressBarBg}>
                                    <View style={[styles.progressBarFill, { width: `${playbackPct}%` }]} />
                                </View>
                                <Text style={styles.progressTime}>
                                    {formatDuration(playbackPosition / 1000)} / {formatDuration(playbackDuration / 1000)}
                                </Text>
                            </View>
                        </View>
                    ) : mode === 'video' && hasCameraPermission ? (
                        // Live camera preview
                        <View style={styles.cameraPreview}>
                            <CameraView
                                ref={(ref: any) => videoCaptureService.setCameraRef(ref)}
                                style={styles.camera}
                                facing={facing}
                            />
                            {state === 'recording' && (
                                <View style={styles.recordingOverlay}>
                                    <Animated.View style={[styles.recordDot, { opacity: pulseAnim }]} />
                                    <Text style={styles.recordingLabel}>REC</Text>
                                </View>
                            )}
                            {state !== 'recording' && (
                                <Pressable style={styles.flipButton} onPress={toggleCamera}>
                                    <Text style={styles.flipEmoji}>🔄</Text>
                                </Pressable>
                            )}
                        </View>
                    ) : (
                        // Audio-only mode placeholder
                        <View style={styles.audioOnlyPreview}>
                            <Text style={styles.audioOnlyEmoji}>🎤</Text>
                            <Text style={styles.audioOnlyText}>Audio Only Mode</Text>
                            <Text style={styles.audioOnlySubtext}>No camera — just microphone</Text>
                            {state === 'recording' && (
                                <View style={styles.audioLevelContainer}>
                                    {Array.from({ length: 20 }).map((_, i) => (
                                        <View
                                            key={i}
                                            style={[
                                                styles.audioLevelBar,
                                                {
                                                    height: Math.max(4, audioLevel * 60 * Math.random()),
                                                    backgroundColor: audioLevel > 0.5
                                                        ? colors.stateRecording
                                                        : colors.accent,
                                                    opacity: 0.4 + audioLevel * 0.6,
                                                },
                                            ]}
                                        />
                                    ))}
                                </View>
                            )}
                        </View>
                    )}
                </View>

                {/* Thumbnail + File Info */}
                {(recordedVideoUri || recordedAudioUri) && state === 'idle' && (
                    <View style={styles.fileInfoRow}>
                        {thumbnailUri ? (
                            <Image source={{ uri: thumbnailUri }} style={styles.thumbnail} />
                        ) : (
                            <View style={styles.thumbnailPlaceholder}>
                                <Text style={styles.thumbnailEmoji}>
                                    {recordedVideoUri ? '🎬' : '🎵'}
                                </Text>
                            </View>
                        )}
                        <View style={styles.fileInfoText}>
                            <Text style={styles.fileInfoTitle}>
                                {recordedVideoUri ? 'Video Recording' : 'Audio Recording'}
                            </Text>
                            <Text style={styles.fileInfoMeta}>
                                📐 {formatDuration(videoDuration)} · 💾 {formatFileSize(fileSize)}
                            </Text>
                            <Text style={styles.fileInfoMeta}>
                                {recordedVideoUri ? '720p · MP4' : 'WAV · 44.1kHz'}
                            </Text>
                        </View>
                    </View>
                )}

                {/* Duration Display */}
                <View style={styles.durationRow}>
                    {state === 'recording' && (
                        <Animated.View style={[styles.pulseDot, { opacity: pulseAnim }]} />
                    )}
                    <Text style={styles.durationText}>
                        {state === 'recording' ? formatDuration(duration) : '00:00'}
                    </Text>
                </View>

                {/* File Size (during recording) */}
                {state === 'recording' && (
                    <Text style={styles.liveSizeText}>
                        💾 ~{formatFileSize(fileSize)} · {mode === 'video' ? '720p + Audio' : '44.1kHz Mono'}
                    </Text>
                )}

                {/* Record Button */}
                <View style={styles.buttonContainer}>
                    <Pressable
                        style={[
                            styles.recordButton,
                            state === 'recording' && styles.recordButtonActive,
                        ]}
                        onPress={handleRecordPress}
                    >
                        {state === 'recording' ? (
                            <View style={styles.stopSquare} />
                        ) : (
                            <Text style={styles.recordEmoji}>
                                {mode === 'video' ? '📹' : '🎤'}
                            </Text>
                        )}
                    </Pressable>
                </View>

                {/* Status */}
                <Text style={[styles.statusText, {
                    color: state === 'recording' ? colors.stateRecording
                        : state === 'processing' ? colors.stateProcessing
                            : colors.textTertiary,
                }]}>
                    {state === 'recording'
                        ? 'Tap to stop recording'
                        : state === 'processing'
                            ? 'Processing...'
                            : 'Tap to start recording'}
                </Text>
            </View>
        </ScreenErrorBoundary>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
        alignItems: 'center',
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        paddingHorizontal: spacing.screenPadding,
        marginBottom: spacing.md,
    },
    backBtn: { marginRight: spacing.md },
    backText: { fontSize: 16, color: colors.accent },
    title: { fontSize: 20, fontWeight: '600', color: colors.textPrimary, flex: 1 },
    headerRight: { width: 40 },

    // Mode toggle
    modeToggle: {
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderRadius: borderRadius.xl,
        padding: 4,
        gap: 4,
        marginBottom: spacing.md,
    },
    modeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
        borderRadius: borderRadius.xl - 2,
    },
    modeBtnActive: {
        backgroundColor: colors.accent,
    },
    modeBtnEmoji: { fontSize: 16 },
    modeBtnText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
    modeBtnTextActive: { color: colors.background },

    // Preview container
    previewContainer: {
        width: '100%',
        aspectRatio: 4 / 3,
        maxHeight: 320,
        marginHorizontal: spacing.screenPadding,
        borderRadius: borderRadius.lg,
        overflow: 'hidden',
        backgroundColor: colors.surface,
        marginBottom: spacing.md,
    },
    cameraPreview: { flex: 1 },
    camera: { flex: 1 },
    recordingOverlay: {
        position: 'absolute',
        top: spacing.md,
        left: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: borderRadius.sm,
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
    },
    recordDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: colors.stateError,
    },
    recordingLabel: { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: 1 },
    flipButton: {
        position: 'absolute',
        top: spacing.md,
        right: spacing.md,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    flipEmoji: { fontSize: 20 },

    // Video playback
    videoPlayback: { flex: 1 },
    videoPlayer: { flex: 1 },
    playOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    playCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    playIcon: { fontSize: 28, color: '#fff', marginLeft: 4 },
    progressBarContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: spacing.sm,
        paddingBottom: spacing.sm,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    progressBarBg: {
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderRadius: 2,
        marginBottom: 4,
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: colors.accent,
        borderRadius: 2,
    },
    progressTime: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.8)',
        textAlign: 'center',
        fontVariant: ['tabular-nums'],
    },

    // Audio-only preview
    audioOnlyPreview: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
    },
    audioOnlyEmoji: { fontSize: 48 },
    audioOnlyText: { fontSize: 18, fontWeight: '600', color: colors.textPrimary },
    audioOnlySubtext: { fontSize: 13, color: colors.textTertiary },
    audioLevelContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 48,
        gap: 3,
        marginTop: spacing.md,
    },
    audioLevelBar: {
        width: 3,
        borderRadius: 1.5,
        minHeight: 4,
    },

    // File info
    fileInfoRow: {
        flexDirection: 'row',
        gap: spacing.md,
        width: '100%',
        paddingHorizontal: spacing.screenPadding,
        marginBottom: spacing.md,
        backgroundColor: colors.surface,
        padding: spacing.md,
        borderRadius: borderRadius.lg,
        marginHorizontal: spacing.screenPadding,
    },
    thumbnail: { width: 60, height: 45, borderRadius: borderRadius.sm },
    thumbnailPlaceholder: {
        width: 60,
        height: 45,
        borderRadius: borderRadius.sm,
        backgroundColor: colors.surfaceLight,
        alignItems: 'center',
        justifyContent: 'center',
    },
    thumbnailEmoji: { fontSize: 20 },
    fileInfoText: { flex: 1, justifyContent: 'center' },
    fileInfoTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
    fileInfoMeta: { fontSize: 12, color: colors.textTertiary, fontVariant: ['tabular-nums'] },

    // Duration
    durationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: 2,
    },
    pulseDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: colors.stateRecording,
    },
    durationText: {
        fontSize: 36,
        fontWeight: '300',
        color: colors.textPrimary,
        fontVariant: ['tabular-nums'],
    },
    liveSizeText: {
        fontSize: 12,
        color: colors.textTertiary,
        marginBottom: spacing.md,
        fontVariant: ['tabular-nums'],
    },

    // Record button
    buttonContainer: { marginBottom: spacing.sm },
    recordButton: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 4,
        borderColor: colors.stateError,
    },
    recordButtonActive: {
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
    },
    stopSquare: {
        width: 28,
        height: 28,
        borderRadius: 4,
        backgroundColor: colors.stateError,
    },
    recordEmoji: { fontSize: 28 },

    // Status
    statusText: {
        fontSize: 14,
        fontWeight: '500',
        marginBottom: spacing.lg,
    },
});
