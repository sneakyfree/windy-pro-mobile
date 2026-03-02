/**
 * 🧬 Speech Waveform Visualizer
 * Animated bars that respond to audio level input.
 * Shows natural-looking oscillation when active, subtle idle pulse when not.
 */
import React, { useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { colors } from '@/theme';

interface SpeechWaveformProps {
    /** Whether the waveform is actively animating */
    isActive: boolean;
    /** Audio level 0–1 (from metering) */
    level?: number;
    /** Bar color */
    color?: string;
    /** Number of bars */
    barCount?: number;
    /** Component height */
    height?: number;
}

export function SpeechWaveform({
    isActive,
    level = 0,
    color = colors.accent,
    barCount = 30,
    height = 60,
}: SpeechWaveformProps) {
    // Create animated values for each bar
    const bars = useRef<Animated.Value[]>([]);
    if (bars.current.length !== barCount) {
        bars.current = Array.from({ length: barCount }, () => new Animated.Value(0.15));
    }

    // Phase offsets for natural-looking wave
    const phaseOffsets = useMemo(
        () => Array.from({ length: barCount }, (_, i) => {
            const center = barCount / 2;
            const dist = Math.abs(i - center) / center;
            return dist * 0.4 + Math.random() * 0.15;
        }),
        [barCount]
    );

    useEffect(() => {
        if (!isActive) {
            // Settle to idle
            bars.current.forEach((bar) => {
                Animated.timing(bar, {
                    toValue: 0.08,
                    duration: 300,
                    easing: Easing.out(Easing.quad),
                    useNativeDriver: false,
                }).start();
            });
            return;
        }

        // Animate each bar based on level + phase offset
        bars.current.forEach((bar, i) => {
            const offset = phaseOffsets[i];
            const targetHeight = Math.max(0.08, Math.min(1, level * (1 - offset) + Math.random() * 0.2));

            Animated.timing(bar, {
                toValue: targetHeight,
                duration: 80 + Math.random() * 40,
                easing: Easing.out(Easing.quad),
                useNativeDriver: false,
            }).start();
        });
    }, [isActive, level, phaseOffsets]);

    // Idle pulse animation
    useEffect(() => {
        if (isActive) return;

        let isMounted = true;
        const pulse = () => {
            if (!isMounted) return;
            const animations = bars.current.map((bar, i) => {
                const target = 0.06 + Math.random() * 0.08;
                return Animated.timing(bar, {
                    toValue: target,
                    duration: 800 + Math.random() * 400,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: false,
                });
            });
            Animated.stagger(30, animations).start(() => {
                if (isMounted) pulse();
            });
        };
        pulse();
        return () => { isMounted = false; };
    }, [isActive]);

    return (
        <View style={[styles.container, { height }]} accessibilityLabel="Audio waveform" accessibilityRole="image">
            {bars.current.map((bar, i) => (
                <Animated.View
                    key={i}
                    style={[
                        styles.bar,
                        {
                            backgroundColor: color,
                            height: bar.interpolate({
                                inputRange: [0, 1],
                                outputRange: [4, height],
                            }),
                            opacity: bar.interpolate({
                                inputRange: [0, 0.3, 1],
                                outputRange: [0.3, 0.6, 1],
                            }),
                        },
                    ]}
                />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        paddingHorizontal: 16,
    },
    bar: {
        width: 3,
        borderRadius: 2,
        minHeight: 4,
    },
});
