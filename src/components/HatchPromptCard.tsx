/**
 * HatchPromptCard — the "🪰 Hatch Your Agent" grandma-ribbon prompt
 * that appears on the Home tab when the user is signed in and does
 * not yet have a hatched Windy Fly agent. Matches the desktop Electron
 * experience (prompt 1 of Wave 8).
 */
import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, spacing, borderRadius } from '@/theme';
import { typography } from '@/theme/typography';
import { identityApi } from '@/services/identityApi';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { getEcosystemStatus } from '@/services/ecosystem-status';
import { shouldShowHatchPrompt } from './HatchPromptCard.rules';

export { shouldShowHatchPrompt } from './HatchPromptCard.rules';

export default function HatchPromptCard() {
    const router = useRouter();
    const ecosystemStatus = useSettingsStore(s => s.ecosystemStatus);
    const [isAuthed, setIsAuthed] = useState(() => identityApi.isAuthenticated());
    const flyStatus = ecosystemStatus?.products?.windy_fly?.status;
    const glow = useRef(new Animated.Value(0.6)).current;

    // Track auth changes so the card appears/disappears reactively.
    useEffect(() => {
        const unsub = identityApi.onChange(() => setIsAuthed(identityApi.isAuthenticated()));
        return unsub;
    }, []);

    // If we're signed in but have no ecosystem snapshot yet, fetch one
    // quietly — keeps the card accurate on cold start.
    useEffect(() => {
        if (!isAuthed || ecosystemStatus) return;
        let cancelled = false;
        getEcosystemStatus().then(eco => {
            if (!cancelled && eco) useSettingsStore.getState().setEcosystemStatus(eco);
        }).catch(() => { /* non-fatal */ });
        return () => { cancelled = true; };
    }, [isAuthed, ecosystemStatus]);

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(glow, { toValue: 1, duration: 1200, useNativeDriver: true }),
                Animated.timing(glow, { toValue: 0.6, duration: 1200, useNativeDriver: true }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, []);

    if (!shouldShowHatchPrompt({ isAuthenticated: isAuthed, flyStatus })) return null;

    return (
        <Pressable
            testID="hatch-prompt-card"
            accessibilityRole="button"
            accessibilityLabel="Hatch your Windy Fly agent"
            accessibilityHint="Opens the agent creation wizard"
            onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                router.push('/hatch');
            }}
            style={styles.card}
        >
            <Animated.View style={[styles.glow, { opacity: glow }]} pointerEvents="none" />
            <Text style={styles.emoji}>{'\uD83E\uDEB0'}</Text>
            <View style={styles.body}>
                <Text style={styles.title}>Hatch Your Agent</Text>
                <Text style={styles.subtitle}>
                    Give your voice an AI assistant that lives on, even when the app is closed.
                </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginHorizontal: spacing.screenPadding,
        marginBottom: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        borderWidth: 1.5,
        borderColor: colors.accent,
        overflow: 'hidden',
    },
    glow: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(163,230,53,0.08)',
    },
    emoji: { fontSize: 32 },
    body: { flex: 1 },
    title: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
    subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
    chevron: { fontSize: 22, fontWeight: '300', color: colors.accent },
});
