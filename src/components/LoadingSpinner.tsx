/**
 * 🧬 UX — Loading Spinner
 * Animated branded spinner for async operations.
 */
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { colors, spacing, fontSizes } from '@/theme';

interface Props {
    /** Optional label below the spinner */
    label?: string;
    /** Size: 'small' | 'large' */
    size?: 'small' | 'large';
    /** Full-screen centered layout */
    fullScreen?: boolean;
}

export function LoadingSpinner({ label, size = 'large', fullScreen = false }: Props) {
    const content = (
        <View style={[styles.wrapper, fullScreen && styles.fullScreen]}
            accessibilityLabel={label || 'Loading'}
            accessibilityRole="none"
        >
            <ActivityIndicator size={size} color={colors.accent} />
            {label && <Text style={styles.label} importantForAccessibility="no">{label}</Text>}
        </View>
    );
    return content;
}

const styles = StyleSheet.create({
    wrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.lg,
        gap: spacing.sm,
    },
    fullScreen: {
        flex: 1,
        backgroundColor: colors.background,
    },
    label: {
        color: colors.textSecondary,
        fontSize: fontSizes.sm,
        fontFamily: 'Inter_400Regular',
        marginTop: spacing.xs,
    },
});
