/**
 * 🧬 Screen Error Boundary
 * Wraps individual screens to catch rendering crashes.
 * Shows a friendly retry UI instead of a white screen.
 */
import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { colors, spacing, borderRadius, fontSizes } from '@/theme';

interface Props {
    children: ReactNode;
    screenName?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ScreenErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.warn(`[ScreenError] ${this.props.screenName || 'Unknown'} crashed:`, error.message);

        // Intel hook (INTEL-CONTRACT-V2 §1.3) — surface = screen slug, code
        // is a stable slug; never the message text. Fire-and-forget.
        try {
            const { intelService } = require('@/services/intel');
            const surface = (this.props.screenName || 'unknown')
                .toLowerCase().replace(/[^a-z0-9]+/g, '_');
            intelService.emitError('react_error_boundary', surface, { recoverable: true });
        } catch { /* telemetry never breaks recovery */ }
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <View style={styles.container}>
                    <Text style={styles.emoji}>😵</Text>
                    <Text style={styles.title}>Something went wrong</Text>
                    <Text style={styles.subtitle}>
                        {this.props.screenName
                            ? `The ${this.props.screenName} screen encountered an error.`
                            : 'This screen encountered an error.'}
                    </Text>
                    {this.state.error && (
                        <Text style={styles.errorDetail} numberOfLines={3}>
                            {this.state.error.message}
                        </Text>
                    )}
                    <Pressable style={styles.retryBtn} onPress={this.handleRetry}>
                        <Text style={styles.retryText}>🔄 Try Again</Text>
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
        paddingHorizontal: spacing.screenPadding,
    },
    emoji: { fontSize: 56, marginBottom: spacing.md },
    title: {
        fontSize: fontSizes.xl, fontWeight: '700',
        color: colors.textPrimary, marginBottom: spacing.sm,
    },
    subtitle: {
        fontSize: 15, color: colors.textSecondary,
        textAlign: 'center', lineHeight: 22, marginBottom: spacing.md,
    },
    errorDetail: {
        fontSize: fontSizes.xs, color: colors.textTertiary,
        textAlign: 'center', marginBottom: spacing.lg,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    retryBtn: {
        backgroundColor: colors.accent,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xl,
        borderRadius: borderRadius.lg,
    },
    retryText: {
        fontSize: fontSizes.base, fontWeight: '700', color: colors.background,
    },
});
