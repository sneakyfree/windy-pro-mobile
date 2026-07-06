/**
 * 🔒 LockedFeature — the honest locked state for tier-gated surfaces (M4).
 *
 * Per the consolidation plan: locked surfaces say "Included with higher
 * Windy tiers" and NOTHING else — no prices, no purchase buttons, no
 * store links (IAP posture is Grant-gated). The feature's code path
 * stays fully wired behind this screen; flipping the tier unlocks it.
 */
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSizes } from '@/theme';
import { LOCKED_TIER_LABEL } from '@/services/tier-access';

interface Props {
    /** Feature name shown above the lock message, e.g. "Voice Translate" */
    featureName: string;
    emoji?: string;
}

export default function LockedFeature({ featureName, emoji = '🔒' }: Props) {
    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.content}>
                <Text style={styles.emoji}>{emoji}</Text>
                <Text style={styles.title}>{featureName}</Text>
                <Text style={styles.subtitle}>{LOCKED_TIER_LABEL}</Text>
                <TouchableOpacity
                    style={styles.backBtn}
                    onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
                    accessibilityLabel="Go back"
                    accessibilityRole="button"
                >
                    <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
    emoji: { fontSize: 56, marginBottom: 16 },
    title: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
    subtitle: { fontSize: fontSizes.base, color: colors.textSecondary, textAlign: 'center' },
    backBtn: { marginTop: 28, minHeight: 44, justifyContent: 'center', paddingHorizontal: 20 },
    backText: { fontSize: fontSizes.base, color: colors.accent, fontWeight: '600' },
});
