/**
 * 🧬 UX — Empty State
 * Friendly empty-state placeholder with icon, title, and optional CTA.
 */
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, borderRadius } from '@/theme';

interface Props {
    /** Large emoji or icon */
    icon: string;
    /** Main heading */
    title: string;
    /** Descriptive subtitle */
    subtitle?: string;
    /** Optional action button */
    actionLabel?: string;
    onAction?: () => void;
}

export function EmptyState({ icon, title, subtitle, actionLabel, onAction }: Props) {
    return (
        <View style={styles.container}>
            <Text style={styles.icon}>{icon}</Text>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            {actionLabel && onAction && (
                <Pressable style={styles.action} onPress={onAction}>
                    <Text style={styles.actionText}>{actionLabel}</Text>
                </Pressable>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.xxl,
        gap: spacing.sm,
    },
    icon: {
        fontSize: 56,
        marginBottom: spacing.sm,
    },
    title: {
        fontSize: 20,
        fontFamily: 'Inter_600SemiBold',
        color: colors.textPrimary,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 14,
        fontFamily: 'Inter_400Regular',
        color: colors.textSecondary,
        textAlign: 'center',
        lineHeight: 20,
        maxWidth: 280,
    },
    action: {
        marginTop: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm + 4,
        backgroundColor: colors.accent,
        borderRadius: borderRadius.md,
    },
    actionText: {
        fontSize: 14,
        fontFamily: 'Inter_600SemiBold',
        color: colors.background,
    },
});
