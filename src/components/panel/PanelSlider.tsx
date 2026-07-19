/**
 * PanelSlider — big-touch-target 0–10 stepped slider for the agent
 * control panel. Pure JS (PanResponder) — no native slider dependency,
 * so no new native module and no EAS config change.
 *
 * Tap anywhere on the track to jump, or drag the thumb. The value
 * commits on release; the parent owns persistence (optimistic PUT with
 * honest revert on failure).
 */
import { useMemo, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, PanResponder,
    type LayoutChangeEvent, type AccessibilityActionEvent,
} from 'react-native';
import { colors, spacing, borderRadius } from '@/theme';
import { typography } from '@/theme/typography';
import type { SliderInfo } from '@/services/panelContract';
import {
    SLIDER_MAX, clampSliderValue, positionToValue, valueToFraction,
} from './panelSlider.rules';

const THUMB_SIZE = 28;
const TRACK_HEIGHT = 8;
/** Full-height touchable band around the track — grandma-sized. */
const TOUCH_BAND_HEIGHT = 44;

interface Props {
    name: string;
    info: SliderInfo;
    value: number;
    disabled?: boolean;
    /** Called once per gesture with the final value. */
    onCommit: (name: string, value: number) => void;
}

export function PanelSlider({ name, info, value, disabled, onCommit }: Props) {
    const [trackWidth, setTrackWidth] = useState(0);
    // Value shown while a finger is down; null = follow the prop.
    const [previewValue, setPreviewValue] = useState<number | null>(null);

    // PanResponder callbacks fire outside the render cycle — keep the
    // moving parts in refs so a stale closure can't commit old values.
    const stateRef = useRef({ trackWidth: 0, value, disabled: !!disabled, onCommit });
    stateRef.current = { trackWidth, value, disabled: !!disabled, onCommit };
    const dragValueRef = useRef(value);
    // Value at the grant point — moves are computed as dx deltas from it
    // (locationX is unreliable mid-gesture once the finger leaves the view).
    const grantValueRef = useRef(value);

    const panResponder = useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => !stateRef.current.disabled,
        onMoveShouldSetPanResponder: () => !stateRef.current.disabled,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
            const next = positionToValue(evt.nativeEvent.locationX, stateRef.current.trackWidth);
            grantValueRef.current = next;
            dragValueRef.current = next;
            setPreviewValue(next);
        },
        onPanResponderMove: (_evt, gestureState) => {
            const { trackWidth: width } = stateRef.current;
            if (width <= 0) return;
            const next = clampSliderValue(grantValueRef.current + (gestureState.dx / width) * SLIDER_MAX);
            if (next !== dragValueRef.current) {
                dragValueRef.current = next;
                setPreviewValue(next);
            }
        },
        onPanResponderRelease: () => {
            setPreviewValue(null);
            if (dragValueRef.current !== stateRef.current.value) {
                stateRef.current.onCommit(name, dragValueRef.current);
            }
        },
        onPanResponderTerminate: () => setPreviewValue(null),
    }), [name]);

    const onAccessibilityAction = (event: AccessibilityActionEvent) => {
        if (disabled) return;
        const delta = event.nativeEvent.actionName === 'increment' ? 1 : -1;
        const next = clampSliderValue(value + delta);
        if (next !== value) onCommit(name, next);
    };

    const shown = previewValue ?? value;
    const fraction = valueToFraction(shown);
    const thumbLeft = trackWidth > 0 ? fraction * (trackWidth - THUMB_SIZE) : 0;

    return (
        <View style={[styles.card, disabled && styles.cardDisabled]}>
            <View style={styles.headerRow}>
                <Text style={styles.label}>{info.label}</Text>
                <View style={styles.valueBadge}>
                    <Text style={styles.valueText}>{shown}</Text>
                </View>
            </View>
            {!!info.description && <Text style={styles.description}>{info.description}</Text>}

            <View
                style={styles.touchBand}
                onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
                {...panResponder.panHandlers}
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel={`${info.label} slider`}
                accessibilityHint={info.description}
                accessibilityValue={{ min: 0, max: SLIDER_MAX, now: shown }}
                accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                onAccessibilityAction={onAccessibilityAction}
                testID={`panel-slider-${name}`}
            >
                <View style={styles.track}>
                    <View style={[styles.trackFill, { width: `${fraction * 100}%` }]} />
                </View>
                <View style={[styles.thumb, { left: thumbLeft }]} pointerEvents="none" />
            </View>

            <View style={styles.impactRow}>
                <Text style={[styles.impactText, { textAlign: 'left' }]} numberOfLines={2}>
                    {info.impact_low}
                </Text>
                <Text style={[styles.impactText, { textAlign: 'right' }]} numberOfLines={2}>
                    {info.impact_high}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.surface, borderRadius: borderRadius.lg,
        borderWidth: 1, borderColor: colors.borderLight,
        padding: spacing.md, marginBottom: spacing.sm,
    },
    cardDisabled: { opacity: 0.5 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    label: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
    valueBadge: {
        minWidth: 36, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 2,
        borderRadius: 10, backgroundColor: colors.accentTransparent,
    },
    valueText: { ...typography.body, fontWeight: '700', color: colors.accent },
    description: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },

    touchBand: { height: TOUCH_BAND_HEIGHT, justifyContent: 'center', marginTop: spacing.xs },
    track: {
        height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT / 2,
        backgroundColor: colors.surfaceLight, overflow: 'hidden',
    },
    trackFill: { height: '100%', backgroundColor: colors.accent },
    thumb: {
        position: 'absolute', width: THUMB_SIZE, height: THUMB_SIZE,
        borderRadius: THUMB_SIZE / 2, backgroundColor: colors.accent,
        top: (TOUCH_BAND_HEIGHT - THUMB_SIZE) / 2,
        shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
        elevation: 3,
    },

    impactRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
    impactText: { ...typography.caption, color: colors.textTertiary, flex: 1 },
});
