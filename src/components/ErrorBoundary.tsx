/**
 * 🧬 RP2-5.3 — Error Boundary
 * Catches render errors and shows a recovery UI
 */
import * as React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius } from '@/theme';

interface Props {
    children: React.ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
    state: State = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('[ErrorBoundary]', error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <View style={styles.container}>
                    <Text style={styles.emoji}>💨</Text>
                    <Text style={styles.title}>Something went wrong</Text>
                    <Text style={styles.detail}>
                        {this.state.error?.message || 'An unexpected error occurred'}
                    </Text>
                    <Pressable onPress={this.handleReset} style={styles.btn}>
                        <Text style={styles.btnText}>Try Again</Text>
                    </Pressable>
                </View>
            );
        }
        return this.props.children;
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
    },
    emoji: {
        fontSize: 64,
        marginBottom: spacing.lg,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: spacing.sm,
    },
    detail: {
        fontSize: 14,
        color: colors.textSecondary,
        textAlign: 'center',
        marginBottom: spacing.lg,
        lineHeight: 20,
    },
    btn: {
        backgroundColor: colors.accent,
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.md,
        borderRadius: borderRadius.md,
    },
    btnText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '600',
    },
});
