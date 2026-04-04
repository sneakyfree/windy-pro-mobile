/**
 * VoiceChatButton — Mic button for chat voice input
 *
 * Gestures:
 *   Tap        → start/stop voice dictation (text fills compose box)
 *   Long-press → record voice note (sends as m.audio attachment on release)
 *
 * Modes (from settings):
 *   "dictate"  → transcription fills compose box for review (default)
 *   "autosend" → transcription auto-sends as message
 *
 * Visual States:
 *   idle        → outline mic, gray border
 *   recording   → filled green mic, pulse animation, duration badge
 *   transcribing → accent spinner
 *   error       → red mic, shake animation
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, Animated, ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, fontSizes } from '@/theme';

// ─── Types ──────────────────────────────────────────────────────

type VoiceState = 'idle' | 'recording' | 'transcribing' | 'error';

export type VoiceChatMode = 'dictate' | 'autosend';

interface VoiceChatButtonProps {
    /** Called with transcribed text */
    onTranscription: (text: string) => void;
    /** Called when voice note recorded (long-press). Receives audio URI + duration. */
    onVoiceNote?: (uri: string, durationSec: number) => void;
    onError?: (error: string) => void;
    disabled?: boolean;
    /** 'dictate' = fill compose box, 'autosend' = auto-send */
    mode?: VoiceChatMode;
}

// ─── Constants ──────────────────────────────────────────────────

const LONG_PRESS_THRESHOLD_MS = 500;
const MIN_RECORDING_SEC = 0.5;

// ─── Component ──────────────────────────────────────────────────

export default function VoiceChatButton({
    onTranscription,
    onVoiceNote,
    onError,
    disabled,
    mode = 'dictate',
}: VoiceChatButtonProps) {
    const [state, setState] = useState<VoiceState>('idle');
    const [duration, setDuration] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const shakeAnim = useRef(new Animated.Value(0)).current;
    const isLongPressRef = useRef(false);
    const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ─── Pulse animation (green glow during recording) ──────────

    useEffect(() => {
        if (state === 'recording') {
            const loop = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.2, duration: 500, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
                ]),
            );
            loop.start();
            return () => loop.stop();
        }
        pulseAnim.setValue(1);
    }, [state]);

    // ─── Shake animation (error) ────────────────────────────────

    const triggerShake = useCallback(() => {
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
        ]).start();
    }, [shakeAnim]);

    // ─── Duration timer ─────────────────────────────────────────

    useEffect(() => {
        if (state === 'recording') {
            setDuration(0);
            timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
            return () => { if (timerRef.current) clearInterval(timerRef.current); };
        }
        if (timerRef.current) clearInterval(timerRef.current);
    }, [state]);

    // ─── Recording ──────────────────────────────────────────────

    const startRecording = useCallback(async () => {
        if (state !== 'idle' || disabled) return;
        try {
            const { audioCapture } = require('@/services/audio-capture');
            await audioCapture.startRecording(`voice-chat-${Date.now()}`, { maxDuration: 120 });
            setState('recording');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        } catch (err) {
            onError?.(err instanceof Error ? err.message : 'Could not start recording');
        }
    }, [state, disabled, onError]);

    const stopAndTranscribe = useCallback(async () => {
        if (state !== 'recording') return;
        setState('transcribing');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

        try {
            const { audioCapture } = require('@/services/audio-capture');
            const result = await audioCapture.stopRecording();

            if (!result?.uri || result.duration < MIN_RECORDING_SEC) {
                setState('idle');
                return;
            }

            const { transcriptionService } = require('@/services/transcription');
            const segments = await transcriptionService.transcribeFile(result.uri);
            const text = segments.map((s: any) => s.text).join(' ').trim();

            if (text && !text.startsWith('[Queued')) {
                onTranscription(text);
                setState('idle');
            } else {
                setState('error');
                triggerShake();
                onError?.('Could not transcribe audio. Try again.');
                setTimeout(() => setState('idle'), 2000);
            }
        } catch (err) {
            setState('error');
            triggerShake();
            onError?.(err instanceof Error ? err.message : 'Transcription failed');
            setTimeout(() => setState('idle'), 2000);
        }
    }, [state, onTranscription, onError, triggerShake]);

    const stopAndSendVoiceNote = useCallback(async () => {
        if (state !== 'recording') return;
        try {
            const { audioCapture } = require('@/services/audio-capture');
            const result = await audioCapture.stopRecording();
            if (result?.uri && result.duration >= MIN_RECORDING_SEC) {
                onVoiceNote?.(result.uri, result.duration);
            }
        } catch { /* ignore */ }
        setState('idle');
    }, [state, onVoiceNote]);

    const cancelRecording = useCallback(async () => {
        try {
            const { audioCapture } = require('@/services/audio-capture');
            await audioCapture.cancelRecording();
        } catch { /* ignore */ }
        setState('idle');
    }, []);

    // ─── Gesture Handlers ───────────────────────────────────────

    const handlePressIn = useCallback(() => {
        isLongPressRef.current = false;
        // Start long-press timer
        pressTimerRef.current = setTimeout(() => {
            isLongPressRef.current = true;
            // Long press detected — start voice note recording
            startRecording();
        }, LONG_PRESS_THRESHOLD_MS);
    }, [startRecording]);

    const handlePressOut = useCallback(() => {
        // Cancel long-press timer if finger lifted early
        if (pressTimerRef.current) {
            clearTimeout(pressTimerRef.current);
            pressTimerRef.current = null;
        }

        if (isLongPressRef.current && state === 'recording') {
            // Long press release → send as voice note
            if (duration < 1) {
                cancelRecording();
            } else if (onVoiceNote) {
                stopAndSendVoiceNote();
            } else {
                stopAndTranscribe();
            }
            isLongPressRef.current = false;
        }
    }, [state, duration, cancelRecording, stopAndSendVoiceNote, stopAndTranscribe, onVoiceNote]);

    // Tap-to-toggle for dictation mode
    const handleTap = useCallback(() => {
        // If long-press was triggered, ignore the tap
        if (isLongPressRef.current) return;

        if (state === 'idle') {
            startRecording();
        } else if (state === 'recording') {
            stopAndTranscribe();
        }
    }, [state, startRecording, stopAndTranscribe]);

    // ─── Helpers ────────────────────────────────────────────────

    const formatDuration = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    // ─── Render ─────────────────────────────────────────────────

    const renderButton = () => {
        switch (state) {
            case 'transcribing':
                return (
                    <View style={[styles.button, styles.buttonTranscribing]}>
                        <ActivityIndicator size="small" color={colors.background} />
                    </View>
                );
            case 'error':
                return (
                    <Animated.View style={[styles.button, styles.buttonError, { transform: [{ translateX: shakeAnim }] }]}>
                        <Text style={styles.iconError}>!</Text>
                    </Animated.View>
                );
            case 'recording':
                return (
                    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                        <TouchableOpacity
                            style={[styles.button, styles.buttonRecording]}
                            onPress={handleTap}
                            accessibilityLabel="Stop recording"
                            accessibilityRole="button"
                        >
                            <Text style={styles.icon}>{isLongPressRef.current ? '🎵' : '⏹'}</Text>
                        </TouchableOpacity>
                    </Animated.View>
                );
            default: // idle
                return (
                    <TouchableOpacity
                        style={[styles.button, disabled && styles.buttonDisabled]}
                        onPress={handleTap}
                        onPressIn={handlePressIn}
                        onPressOut={handlePressOut}
                        disabled={disabled}
                        accessibilityLabel="Voice input"
                        accessibilityRole="button"
                        accessibilityHint={onVoiceNote
                            ? 'Tap to dictate, hold for voice note'
                            : 'Tap to start voice dictation'}
                    >
                        <Text style={styles.icon}>🎙️</Text>
                    </TouchableOpacity>
                );
        }
    };

    return (
        <View style={styles.container}>
            {state === 'recording' && (
                <View style={styles.durationBadge}>
                    <View style={styles.recordDot} />
                    <Text style={styles.durationText}>{formatDuration(duration)}</Text>
                </View>
            )}
            {renderButton()}
        </View>
    );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    button: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: colors.borderLight,
    },
    buttonRecording: {
        backgroundColor: 'rgba(34,197,94,0.15)',
        borderColor: '#22c55e',
    },
    buttonTranscribing: {
        backgroundColor: colors.accent,
        borderColor: colors.accent,
    },
    buttonError: {
        backgroundColor: 'rgba(239,68,68,0.15)',
        borderColor: '#ef4444',
    },
    buttonDisabled: {
        opacity: 0.4,
    },
    icon: {
        fontSize: 20,
    },
    iconError: {
        fontSize: 18,
        fontWeight: '700',
        color: '#ef4444',
    },
    durationBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(34,197,94,0.1)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
    },
    recordDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#22c55e',
    },
    durationText: {
        fontSize: fontSizes.xs,
        fontWeight: '600',
        color: '#22c55e',
    },
});
