/**
 * VoiceChatButton — Mic button for chat input
 * Press-and-hold (WhatsApp style) OR tap-to-toggle for recording.
 * Records audio → transcribes via Windy Word → returns text.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, Animated, ActivityIndicator, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, fontSizes } from '@/theme';

// ─── Types ──────────────────────────────────────────────────────

type VoiceState = 'idle' | 'recording' | 'transcribing' | 'error';

interface VoiceChatButtonProps {
    onTranscription: (text: string) => void;
    onError?: (error: string) => void;
    disabled?: boolean;
}

// ─── Component ──────────────────────────────────────────────────

export default function VoiceChatButton({ onTranscription, onError, disabled }: VoiceChatButtonProps) {
    const [state, setState] = useState<VoiceState>('idle');
    const [duration, setDuration] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const holdModeRef = useRef(false);
    const sessionIdRef = useRef('');

    // Pulse animation during recording
    useEffect(() => {
        if (state === 'recording') {
            const loop = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.25, duration: 600, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
                ]),
            );
            loop.start();
            return () => loop.stop();
        } else {
            pulseAnim.setValue(1);
        }
    }, [state]);

    // Duration timer
    useEffect(() => {
        if (state === 'recording') {
            setDuration(0);
            timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
            return () => { if (timerRef.current) clearInterval(timerRef.current); };
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }
    }, [state]);

    const startRecording = useCallback(async () => {
        if (state !== 'idle' || disabled) return;
        try {
            const { audioCapture } = require('@/services/audio-capture');
            sessionIdRef.current = `voice-chat-${Date.now()}`;
            await audioCapture.startRecording(sessionIdRef.current, { maxDuration: 120 });
            setState('recording');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Could not start recording';
            onError?.(msg);
        }
    }, [state, disabled]);

    const stopAndTranscribe = useCallback(async () => {
        if (state !== 'recording') return;
        setState('transcribing');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

        try {
            const { audioCapture } = require('@/services/audio-capture');
            const result = await audioCapture.stopRecording();

            if (!result?.uri || result.duration < 0.5) {
                setState('idle');
                return;
            }

            // Transcribe using the transcription service (auto-routes local vs cloud)
            const { transcriptionService } = require('@/services/transcription');
            const segments = await transcriptionService.transcribeFile(result.uri);
            const text = segments.map((s: any) => s.text).join(' ').trim();

            if (text && !text.startsWith('[Queued')) {
                onTranscription(text);
                setState('idle');
            } else {
                setState('error');
                onError?.('Could not transcribe audio. Try again.');
                setTimeout(() => setState('idle'), 2000);
            }
        } catch (err) {
            setState('error');
            const msg = err instanceof Error ? err.message : 'Transcription failed';
            onError?.(msg);
            setTimeout(() => setState('idle'), 2000);
        }
    }, [state, onTranscription, onError]);

    const cancelRecording = useCallback(async () => {
        try {
            const { audioCapture } = require('@/services/audio-capture');
            await audioCapture.cancelRecording();
        } catch { /* ignore */ }
        setState('idle');
    }, []);

    // ─── Press Handlers ─────────────────────────────────────────

    const handlePressIn = useCallback(() => {
        holdModeRef.current = true;
        startRecording();
    }, [startRecording]);

    const handlePressOut = useCallback(() => {
        if (holdModeRef.current && state === 'recording') {
            if (duration < 1) {
                // Too short — cancel instead of sending
                cancelRecording();
                return;
            }
            stopAndTranscribe();
        }
        holdModeRef.current = false;
    }, [state, duration, stopAndTranscribe, cancelRecording]);

    // Tap-to-toggle: single tap starts, second tap stops
    const handleTap = useCallback(() => {
        if (state === 'idle') {
            holdModeRef.current = false;
            startRecording();
        } else if (state === 'recording') {
            stopAndTranscribe();
        }
    }, [state, startRecording, stopAndTranscribe]);

    const formatDuration = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    // ─── Render ─────────────────────────────────────────────────

    if (state === 'transcribing') {
        return (
            <View style={styles.container}>
                <View style={[styles.button, styles.buttonTranscribing]}>
                    <ActivityIndicator size="small" color={colors.background} />
                </View>
            </View>
        );
    }

    if (state === 'error') {
        return (
            <View style={styles.container}>
                <View style={[styles.button, styles.buttonError]}>
                    <Text style={styles.icon}>!</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {state === 'recording' && (
                <View style={styles.durationBadge}>
                    <View style={styles.redDot} />
                    <Text style={styles.durationText}>{formatDuration(duration)}</Text>
                </View>
            )}
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <TouchableOpacity
                    style={[
                        styles.button,
                        state === 'recording' && styles.buttonRecording,
                        disabled && styles.buttonDisabled,
                    ]}
                    onPress={handleTap}
                    onPressIn={handlePressIn}
                    onPressOut={handlePressOut}
                    delayPressIn={200}
                    disabled={disabled}
                    accessibilityLabel={state === 'recording' ? 'Stop voice recording' : 'Start voice recording'}
                    accessibilityRole="button"
                    accessibilityHint="Press and hold to record, or tap to toggle"
                >
                    <Text style={styles.icon}>{state === 'recording' ? '⏹' : '🎙️'}</Text>
                </TouchableOpacity>
            </Animated.View>
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
        backgroundColor: 'rgba(239,68,68,0.15)',
        borderColor: '#ef4444',
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
    durationBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(239,68,68,0.1)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
    },
    redDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#ef4444',
    },
    durationText: {
        fontSize: fontSizes.xs,
        fontWeight: '600',
        color: '#ef4444',
    },
});
