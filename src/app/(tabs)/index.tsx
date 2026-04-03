/**
 * 🧬 M1 + M2 — Main Record Screen
 * The core of Windy Pro: TAP → TALK → TEXT
 * One screen, one button, one flow.
 *
 * RP-1.1: Real AudioCaptureService wired
 * RP-1.3: Copy/Share/Save buttons functional
 * RP-1.4: Haptic feedback on all interactions
 * RP-2.3: Transcription → TranscriptStore pipeline
 * RP-3.1: Rolling waveform, playback bar, file size
 */
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, Share, Alert, Animated, AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import { CameraView } from 'expo-camera';
import { colors, spacing, borderRadius, fontSizes } from '@/theme';
import { typography } from '@/theme/typography';
import { useRecordingStore } from '@/stores/useRecordingStore';
import { useTranscriptStore } from '@/stores/useTranscriptStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { audioCaptureService, scoreAudioQuality } from '@/services/audio-capture';
import { transcriptionService } from '@/services/transcription';
import { feedbackService } from '@/services/feedback';
import { localStorageService } from '@/services/storage-local';
import { videoCaptureService } from '@/services/video-capture';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { useHaptic } from '@/hooks/useHaptic';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAccessibility } from '@/hooks/useAccessibility';
import type { Session } from '@/types';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { analyticsService } from '@/services/analytics';
import { SyncStatusBanner } from '@/components/SyncStatusBanner';
import { syncManager } from '@/services/sync-manager';
import { cloneBundleService } from '@/services/clone-bundle';

const WAVEFORM_BARS = 40;

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

    const { fullText, clear: clearTranscript, addSegment, setSegments } = useTranscriptStore();
    const { licenseTier } = useSettingsStore();
    const { requireFeature, getRecordingLimit } = useFeatureGate();
    const { reduceMotion, animDuration } = useReducedMotion();
    const { announce } = useAccessibility();

    const durationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
    const avgLevelRef = useRef<number>(0);
    const peakLevelRef = useRef<number>(0);
    const levelSamples = useRef<number>(0);

    // Rolling waveform ring buffer
    const waveformLevels = useRef<number[]>(new Array(WAVEFORM_BARS).fill(0));
    const waveformIndex = useRef<number>(0);
    const [waveformSnapshot, setWaveformSnapshot] = useState<number[]>(new Array(WAVEFORM_BARS).fill(0));

    // Pulsing recording dot
    const pulseAnim = useRef(new Animated.Value(0.4)).current;
    const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

    // Playback state
    const [playbackSound, setPlaybackSound] = useState<Audio.Sound | null>(null);
    const [playbackUri, setPlaybackUri] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackPosition, setPlaybackPosition] = useState(0);
    const [playbackDuration, setPlaybackDuration] = useState(0);
    const playbackBarWidth = useRef(0);

    // File size tracking
    const [recordingFileSize, setRecordingFileSize] = useState(0);
    const [transcriptionError, setTranscriptionError] = useState<string | null>(null);

    // AppState ref to track recording state for background handler
    const recordingStateRef = useRef(state);
    useEffect(() => { recordingStateRef.current = state; }, [state]);

    // Recording limits by tier (from hook)
    const maxDuration = getRecordingLimit();

    // Format duration as MM:SS
    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Format file size
    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1048576).toFixed(1)} MB`;
    };

    // Estimate file size from duration (WAV: sampleRate × channels × bytesPerSample)
    const estimateFileSize = (secs: number): number => {
        return Math.round(secs * 44100 * 1 * 2); // 16-bit mono WAV
    };

    // Start pulsing animation
    useEffect(() => {
        if (state === 'recording') {
            pulseLoop.current = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: animDuration(600),
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 0.4,
                        duration: animDuration(600),
                        useNativeDriver: true,
                    }),
                ])
            );
            pulseLoop.current.start();
        } else {
            pulseLoop.current?.stop();
            pulseAnim.setValue(0.4);
        }
        return () => { pulseLoop.current?.stop(); };
    }, [state]);

    // 🛡️ Auto-stop recording when app goes to background
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextAppState) => {
            if (nextAppState === 'background' && recordingStateRef.current === 'recording') {
                if (__DEV__) console.warn('[AppState] App backgrounded during recording — auto-stopping');
                handleStopRecording().catch((err) => {
                    console.error('[AppState] Auto-stop failed:', err);
                });
            }
        });
        return () => subscription.remove();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * RP-1.1: REAL recording — wired to AudioCaptureService
     */
    const handleRecordPress = useCallback(async () => {
        if (state === 'idle' || state === 'error') {
            try {
                // Permission pre-check
                const { status } = await Audio.requestPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert(
                        'Microphone Access Required',
                        'Windy Pro needs microphone access to record. Please enable it in Settings.',
                        [
                            { text: 'Cancel', style: 'cancel' },
                            {
                                text: 'Open Settings', onPress: () => {
                                    if (Platform.OS === 'ios') {
                                        const { Linking } = require('react-native');
                                        Linking.openSettings();
                                    }
                                }
                            },
                        ]
                    );
                    return;
                }

                // Generate session ID
                const newSessionId = `session-${Date.now()}`;

                // Haptic feedback
                feedbackService.recordStart().catch(() => { });

                // Reset waveform
                waveformLevels.current = new Array(WAVEFORM_BARS).fill(0);
                waveformIndex.current = 0;
                setWaveformSnapshot(new Array(WAVEFORM_BARS).fill(0));
                setRecordingFileSize(0);

                // Cleanup any previous playback
                if (playbackSound) {
                    await playbackSound.unloadAsync();
                    setPlaybackSound(null);
                }
                setPlaybackUri(null);
                setPlaybackPosition(0);
                setPlaybackDuration(0);
                setIsPlaying(false);

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

                    // Push into ring buffer
                    waveformLevels.current[waveformIndex.current % WAVEFORM_BARS] = level;
                    waveformIndex.current += 1;

                    // 🚀 Perf: snapshot every 6th sample (~7.5×/sec) to reduce re-renders
                    if (waveformIndex.current % 6 === 0) {
                        setWaveformSnapshot(waveformLevels.current.slice());
                    }
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
                announce('Recording started');
                clearTranscript();

                // 🚀 Perf: 250ms timer (4×/sec) — still smooth for display, 60% fewer re-renders
                const startTime = Date.now();
                durationInterval.current = setInterval(() => {
                    const elapsed = (Date.now() - startTime) / 1000;
                    setDuration(elapsed);
                    setRecordingFileSize(estimateFileSize(elapsed));

                    // Auto-stop at tier limit
                    if (elapsed >= maxDuration) {
                        handleStopRecording();
                    }
                }, 250);
            } catch (err: unknown) {
                console.error('[Record] Start failed:', err);
                setError();
                feedbackService.error().catch(() => { });
                Alert.alert(
                    'Recording Error',
                    (err instanceof Error ? err.message : String(err)) || 'Could not start recording. Check microphone permissions.'
                );
            }
        } else if (state === 'recording') {
            await handleStopRecording();
        }
    }, [state, setRecordingStarted, setRecordingStopped, reset, setDuration, setAudioLevel, clearTranscript, maxDuration, playbackSound]);

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
        feedbackService.recordStop().catch(() => { });

        // Update state to processing
        setRecordingStopped();
        announce('Recording stopped, processing');

        try {
            // Stop real recording
            const result = await audioCaptureService.stopRecording();

            // Update file size with actual size
            setRecordingFileSize(result.fileSize);
            setPlaybackUri(result.uri);

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

            // RP-2.3: Transcribe the recording
            setTranscriptionError(null);
            transcriptionService.onSegment = (segment) => {
                addSegment(segment);
            };

            try {
                const segments = await transcriptionService.transcribeFile(result.uri);
                // If onSegment wasn't called (e.g. HTTP mode returned all at once)
                // make sure the store has the segments
                if (segments.length > 0 && useTranscriptStore.getState().segments.length === 0) {
                    setSegments(segments);
                }

                // 🎯 Auto-copy transcript to clipboard for instant paste
                const transcriptText = useTranscriptStore.getState().segments
                    .map(s => s.text)
                    .join(' ')
                    .trim();
                if (transcriptText && transcriptText.length > 0) {
                    await Clipboard.setStringAsync(transcriptText);
                    feedbackService.success().catch(() => { });
                    announce('Transcript ready, copied to clipboard');
                }
            } catch (transcribeErr: unknown) {
                console.warn('[Record] Transcription failed:', transcribeErr);
                setTranscriptionError((transcribeErr instanceof Error ? transcribeErr.message : String(transcribeErr)) || 'Transcription failed — check your connection');
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

                // Auto-queue for Wi-Fi sync
                const bundleId = session.id;
                await cloneBundleService.createBundle({
                    sessionId: bundleId,
                    duration: session.duration,
                    audioPath: result.uri,
                    videoPath: videoResult?.uri,
                    transcript: session.transcript,
                    segments: session.segments?.map(s => ({
                        start: s.startTime ?? 0,
                        end: s.endTime ?? 0,
                        text: s.text,
                        confidence: s.confidence ?? 0.9,
                    })),
                });

                await syncManager.addBundleToQueue(bundleId, {
                    audioPath: result.uri,
                    videoPath: videoResult?.uri,
                });

                // Toast notification — tell user about clipboard
                const storeText = useTranscriptStore.getState().segments.map(s => s.text).join(' ').trim();
                if (storeText) {
                    Alert.alert('✅ Ready to Paste', 'Transcript copied to clipboard — paste into any app!');
                } else {
                    Alert.alert('✅ Saved', 'Recording saved — will sync on Wi-Fi');
                }
            } catch (saveErr) {
                console.warn('[Record] Save failed:', saveErr);
                Alert.alert('Save Warning', 'Recording completed but could not be saved to history. Try exporting manually.');
            }

        } catch (err: unknown) {
            console.error('[Record] Stop failed:', err);
            feedbackService.error().catch(() => { });
            Alert.alert(
                'Recording Error',
                'Something went wrong while stopping the recording. Your audio file may still be saved.'
            );
        }

        // Return to idle
        reset();
    };

    /**
     * Retry transcription on the last recorded file
     */
    const handleRetryTranscription = useCallback(async () => {
        if (!playbackUri) return;
        setTranscriptionError(null);
        clearTranscript();
        transcriptionService.onSegment = (segment) => { addSegment(segment); };
        try {
            const segments = await transcriptionService.transcribeFile(playbackUri);
            if (segments.length > 0 && useTranscriptStore.getState().segments.length === 0) {
                setSegments(segments);
            }
            const transcriptText = useTranscriptStore.getState().segments.map(s => s.text).join(' ').trim();
            if (transcriptText.length > 0) {
                await Clipboard.setStringAsync(transcriptText);
                feedbackService.success().catch(() => {});
                announce('Transcript ready, copied to clipboard');
            }
        } catch (err: unknown) {
            setTranscriptionError((err instanceof Error ? err.message : String(err)) || 'Transcription failed');
        }
    }, [playbackUri, addSegment, setSegments, clearTranscript, announce]);

    /**
     * Playback controls
     */
    const handlePlayPause = async () => {
        if (!playbackUri) return;

        try {
            if (playbackSound && isPlaying) {
                await playbackSound.pauseAsync();
                setIsPlaying(false);
            } else if (playbackSound) {
                await playbackSound.playAsync();
                setIsPlaying(true);
            } else {
                // Load sound for first time
                const { sound } = await Audio.Sound.createAsync(
                    { uri: playbackUri },
                    { shouldPlay: true },
                    (status) => {
                        if (status.isLoaded) {
                            setPlaybackPosition(status.positionMillis || 0);
                            setPlaybackDuration(status.durationMillis || 1);
                            if (status.didJustFinish) {
                                setIsPlaying(false);
                                setPlaybackPosition(0);
                            }
                        }
                    }
                );
                setPlaybackSound(sound);
                setIsPlaying(true);
            }
        } catch (err) {
            console.warn('[Playback] Error:', err);
        }
    };

    const handleScrub = async (locationX: number) => {
        if (!playbackSound || playbackDuration === 0 || playbackBarWidth.current === 0) return;
        const pct = Math.max(0, Math.min(1, locationX / playbackBarWidth.current));
        const posMs = Math.round(pct * playbackDuration);
        await playbackSound.setPositionAsync(posMs);
        setPlaybackPosition(posMs);
    };

    /**
     * RP-1.3: Copy transcript to clipboard
     */
    const handleCopy = async () => {
        await Clipboard.setStringAsync(fullText);
        feedbackService.success().catch(() => { });
        Alert.alert('Copied', 'Transcript copied to clipboard');
    };

    /**
     * RP-1.3: Share transcript via system share sheet
     */
    const handleShare = async () => {
        feedbackService.tap().catch(() => { });
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
            feedbackService.success().catch(() => { });
            Alert.alert('Saved', 'Session saved to history');
        } catch (err) {
            feedbackService.error().catch(() => { });
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
            if (playbackSound) {
                playbackSound.unloadAsync();
            }
        };
    }, [playbackSound]);

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

    const playbackPct = playbackDuration > 0 ? (playbackPosition / playbackDuration) * 100 : 0;

    return (
        <ScreenErrorBoundary screenName="Record">
            <SafeAreaView style={styles.container} edges={['top']}>
                <StatusBar style="light" />

                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>Windy Pro</Text>
                    <Text style={styles.subtitle}>Voice to Text, Your Way</Text>
                </View>

                {/* Sync Status */}
                <View style={{ paddingHorizontal: spacing.screenPadding }}>
                    <SyncStatusBanner />
                </View>

                {/* Media Toggles */}
                <View style={styles.toggleRow}>
                    <Pressable
                        style={[styles.toggle, mediaCapture.audio && styles.toggleActive]}
                        onPress={async () => { feedbackService.tap().catch(() => { }); toggleMedia('audio'); }}
                        accessibilityLabel={`Audio capture ${mediaCapture.audio ? 'on' : 'off'}`}
                        accessibilityRole="switch"
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
                            feedbackService.tap().catch(() => { }); toggleMedia('video');
                        }}
                        accessibilityLabel={`Video capture ${mediaCapture.video ? 'on' : 'off'}`}
                        accessibilityRole="switch"
                    >
                        <Text style={styles.toggleEmoji}>📹</Text>
                        <Text style={[styles.toggleLabel, mediaCapture.video && styles.toggleLabelActive]}>
                            Video
                        </Text>
                    </Pressable>
                    <Pressable
                        style={[styles.toggle, mediaCapture.text && styles.toggleActive]}
                        onPress={async () => { feedbackService.tap().catch(() => { }); toggleMedia('text'); }}
                        accessibilityLabel={`Text transcription ${mediaCapture.text ? 'on' : 'off'}`}
                        accessibilityRole="switch"
                    >
                        <Text style={styles.toggleEmoji}>📝</Text>
                        <Text style={[styles.toggleLabel, mediaCapture.text && styles.toggleLabelActive]}>
                            Text
                        </Text>
                    </Pressable>
                </View>

                {/* Rolling Waveform Visualization */}
                {state === 'recording' && (
                    <View style={styles.waveformContainer} importantForAccessibility="no" accessibilityElementsHidden={true}>
                        {waveformSnapshot.map((level, i) => {
                            // Bars ordered: oldest first, newest at right
                            const idx = (waveformIndex.current + i) % WAVEFORM_BARS;
                            const l = waveformSnapshot[idx] || 0;
                            const age = 1 - (i / WAVEFORM_BARS) * 0.6; // Oldest dimmer
                            return (
                                <View
                                    key={i}
                                    style={[
                                        styles.waveformBar,
                                        {
                                            height: Math.max(4, l * 64),
                                            backgroundColor: colors.stateRecording,
                                            opacity: 0.3 + l * 0.5 * age,
                                        },
                                    ]}
                                />
                            );
                        })}
                    </View>
                )}

                {/* Camera Preview — shows when video toggle is ON and not recording */}
                {mediaCapture.video && state !== 'recording' && (
                    <View style={styles.cameraContainer} accessibilityLabel="Front camera preview" accessibilityRole="image">
                        <CameraView
                            ref={(ref: unknown) => videoCaptureService.setCameraRef(ref as never)}
                            style={styles.cameraPreview}
                            facing="front"
                        />
                        <Text style={styles.cameraLabel} importantForAccessibility="no">📹 Front Camera Ready</Text>
                    </View>
                )}

                {/* Processing indicator */}
                {state === 'processing' && (
                    <View style={styles.processingBanner} accessibilityRole="alert" accessibilityLabel="Transcribing audio">
                        <Text style={styles.processingText} importantForAccessibility="no">🔄 Transcribing audio...</Text>
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
                        accessibilityLabel={state === 'recording' ? 'Stop recording' : state === 'processing' ? 'Processing audio' : 'Start recording'}
                        accessibilityRole="button"
                        accessibilityHint="Double tap to start or stop recording your voice"
                        accessibilityState={{ busy: state === 'processing' }}
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

                {/* Duration + Recording Info Row */}
                <View style={styles.durationRow} accessible={true}
                    accessibilityLabel={state === 'recording' ? `Recording duration ${formatDuration(duration)}, ${formatDuration(maxDuration - duration)} remaining` : state === 'processing' ? `Duration ${formatDuration(duration)}` : 'Duration zero'}
                    accessibilityRole="text"
                >
                    {state === 'recording' && (
                        <Animated.View style={[styles.recordingDot, { opacity: pulseAnim }]} importantForAccessibility="no" />
                    )}
                    <Text style={styles.duration} importantForAccessibility="no">
                        {state === 'recording' || state === 'processing'
                            ? formatDuration(duration)
                            : '00:00'}
                    </Text>
                </View>

                {/* File Size Indicator */}
                {(state === 'recording' || recordingFileSize > 0) && (
                    <View style={styles.fileSizeRow}
                        accessible={true}
                        accessibilityLabel={`File size ${formatFileSize(recordingFileSize)}${state === 'recording' ? ', 44.1 kilohertz, 16-bit, Mono' : ''}`}
                        accessibilityRole="text"
                    >
                        <Text style={styles.fileSizeText} importantForAccessibility="no">
                            💾 {formatFileSize(recordingFileSize)}
                        </Text>
                        {state === 'recording' && (
                            <Text style={styles.fileSizeSeparator} importantForAccessibility="no">•</Text>
                        )}
                        {state === 'recording' && (
                            <Text style={styles.fileSizeText} importantForAccessibility="no">
                                44.1kHz · 16-bit · Mono
                            </Text>
                        )}
                    </View>
                )}

                {/* Status */}
                <Text style={[styles.statusText, { color: getStrobeColor() }]}>
                    {getStatusText()}
                </Text>

                {/* Playback Progress Bar */}
                {playbackUri && state === 'idle' && (
                    <View style={styles.playbackContainer}>
                        <Pressable style={styles.playPauseBtn} onPress={handlePlayPause}
                            accessibilityLabel={isPlaying ? 'Pause playback' : 'Play recording'}
                            accessibilityRole="button"
                        >
                            <Text style={styles.playPauseEmoji}>
                                {isPlaying ? '⏸️' : '▶️'}
                            </Text>
                        </Pressable>
                        <Pressable
                            style={styles.playbackBarOuter}
                            onLayout={(e) => { playbackBarWidth.current = e.nativeEvent.layout.width; }}
                            onPress={(e) => handleScrub(e.nativeEvent.locationX)}
                            accessibilityLabel={`Playback position ${formatDuration(playbackPosition / 1000)} of ${formatDuration(playbackDuration / 1000)}`}
                            accessibilityRole="adjustable"
                        >
                            <View style={styles.playbackBarBg}>
                                <View
                                    style={[
                                        styles.playbackBarFill,
                                        { width: `${Math.min(100, playbackPct)}%` },
                                    ]}
                                />
                                <View
                                    style={[
                                        styles.playbackThumb,
                                        { left: `${Math.min(100, playbackPct)}%` },
                                    ]}
                                />
                            </View>
                        </Pressable>
                        <Text style={styles.playbackTime}>
                            {formatDuration(playbackPosition / 1000)}
                        </Text>
                    </View>
                )}

                {/* Transcript Preview */}
                <ScrollView
                    style={styles.transcriptContainer}
                    contentContainerStyle={styles.transcriptContent}
                >
                    {transcriptionError ? (
                        <View style={styles.transcriptErrorBox}>
                            <Text style={styles.transcriptErrorEmoji}>⚠️</Text>
                            <Text style={styles.transcriptErrorText}>{transcriptionError}</Text>
                            <Text style={styles.transcriptErrorHint}>
                                {transcriptionError?.toLowerCase().includes('network') || transcriptionError?.toLowerCase().includes('offline')
                                    ? "You're offline — recording saved locally. Transcription will run when connected."
                                    : 'Check Settings → Server URL is reachable'}
                            </Text>
                            {playbackUri && (
                                <Pressable
                                    style={styles.retryButton}
                                    onPress={handleRetryTranscription}
                                    accessibilityRole="button"
                                    accessibilityLabel="Retry transcription"
                                >
                                    <Text style={styles.retryButtonText}>Retry Transcription</Text>
                                </Pressable>
                            )}
                        </View>
                    ) : fullText ? (
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
                        <Pressable style={styles.actionButton} onPress={handleCopy}
                            accessibilityLabel="Copy transcript to clipboard"
                            accessibilityRole="button"
                        >
                            <Text style={styles.actionButtonText}>📋 Copy</Text>
                        </Pressable>
                        <Pressable style={styles.actionButton} onPress={handleShare}
                            accessibilityLabel="Share transcript"
                            accessibilityRole="button"
                        >
                            <Text style={styles.actionButtonText}>📤 Share</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.actionButton, styles.actionButtonPrimary]}
                            onPress={handleSave}
                            accessibilityLabel="Save recording to history"
                            accessibilityRole="button"
                        >
                            <Text style={[styles.actionButtonText, styles.actionButtonTextPrimary]}>
                                📌 Save
                            </Text>
                        </Pressable>
                    </View>
                )}
            </SafeAreaView>
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
    header: {
        alignItems: 'center',
        marginBottom: spacing.lg,
    },
    title: {
        ...typography.h1,
        color: colors.textPrimary,
    },
    subtitle: {
        ...typography.bodySmall,
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
        fontSize: fontSizes.sm,
    },
    toggleLabel: {
        ...typography.bodySmall,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    toggleLabelActive: {
        color: colors.accent,
    },

    // Rolling Waveform
    waveformContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 72,
        gap: 2,
        marginBottom: spacing.md,
        paddingHorizontal: spacing.md,
    },
    waveformBar: {
        width: 3,
        borderRadius: 1.5,
        minHeight: 4,
    },

    // Record button
    buttonContainer: {
        width: 140,
        height: 140,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.sm,
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
        height: 44,
        borderRadius: 4,
        backgroundColor: colors.stateRecording,
    },
    buttonEmoji: {
        fontSize: fontSizes['5xl'],
    },

    // Duration row with pulsing dot
    durationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: 2,
    },
    recordingDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: colors.stateRecording,
    },
    duration: {
        fontSize: 32,
        fontWeight: '300',
        color: colors.textPrimary,
        fontVariant: ['tabular-nums'],
    },

    // File size row
    fileSizeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        marginBottom: spacing.xs,
    },
    fileSizeText: {
        ...typography.caption,
        color: colors.textTertiary,
        fontVariant: ['tabular-nums'],
    },
    fileSizeSeparator: {
        ...typography.caption,
        color: colors.textTertiary,
    },

    // Status
    statusText: {
        ...typography.bodySmall,
        fontWeight: '500',
        marginTop: spacing.xs,
        marginBottom: spacing.md,
    },

    // Playback bar
    playbackContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        width: '100%',
        paddingHorizontal: spacing.screenPadding,
        marginBottom: spacing.md,
    },
    playPauseBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    playPauseEmoji: {
        fontSize: fontSizes.lg,
    },
    playbackBarOuter: {
        flex: 1,
        height: 36,
        justifyContent: 'center',
    },
    playbackBarBg: {
        height: 6,
        backgroundColor: colors.surfaceLight,
        borderRadius: 3,
        overflow: 'visible',
    },
    playbackBarFill: {
        height: '100%',
        backgroundColor: colors.accent,
        borderRadius: 3,
    },
    playbackThumb: {
        position: 'absolute',
        top: -5,
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: colors.accent,
        marginLeft: -8,
        shadowColor: colors.accent,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
        elevation: 5,
    },
    playbackTime: {
        ...typography.caption,
        color: colors.textTertiary,
        fontVariant: ['tabular-nums'],
        width: 40,
        textAlign: 'right',
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
        ...typography.body,
        color: colors.textPrimary,
    },
    transcriptPlaceholder: {
        ...typography.body,
        color: colors.textTertiary,
        textAlign: 'center',
        paddingTop: spacing.xl,
    },
    transcriptErrorBox: {
        alignItems: 'center',
        paddingTop: spacing.lg,
        paddingHorizontal: spacing.md,
        gap: 8,
    },
    transcriptErrorEmoji: { fontSize: 32 },
    transcriptErrorText: {
        ...typography.bodySmall,
        color: '#ef4444',
        textAlign: 'center',
    },
    transcriptErrorHint: {
        ...typography.caption,
        color: colors.textTertiary,
        textAlign: 'center',
    },
    retryButton: {
        marginTop: spacing.sm,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.md,
        backgroundColor: colors.accent,
        borderRadius: borderRadius.md,
        alignSelf: 'center',
    },
    retryButtonText: {
        ...typography.caption,
        color: '#ffffff',
        fontWeight: '600',
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
        ...typography.bodySmall,
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
        ...typography.caption,
        color: colors.textSecondary,
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
        ...typography.bodySmall,
        fontWeight: '500' as const,
        color: colors.stateProcessing,
    },
});
