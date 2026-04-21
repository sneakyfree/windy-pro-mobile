/**
 * 🧬 M1 — Enhanced Error Boundary with Crash Recovery
 * Catches render errors, logs them, offers recovery options
 */
import * as React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Platform, Animated } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { colors, spacing, borderRadius, fontSizes } from '@/theme';

interface Props {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: React.ErrorInfo | null;
    showDetails: boolean;
    crashCount: number;
}

export class ErrorBoundary extends React.Component<Props, State> {
    state: State = {
        hasError: false,
        error: null,
        errorInfo: null,
        showDetails: false,
        crashCount: 0,
    };

    private fadeAnim = new Animated.Value(0);

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        this.setState((prev) => ({
            errorInfo,
            crashCount: prev.crashCount + 1,
        }));

        // Log to console for debugging
        console.error('[ErrorBoundary] Crash caught:', error.message);
        console.error('[ErrorBoundary] Stack:', errorInfo.componentStack);

        // Animate in
        Animated.spring(this.fadeAnim, {
            toValue: 1,
            tension: 50,
            friction: 8,
            useNativeDriver: true,
        }).start();
    }

    handleReset = () => {
        this.fadeAnim.setValue(0);
        this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false });
    };

    handleCopyReport = async () => {
        const report = this.buildCrashReport();
        await Clipboard.setStringAsync(report);
    };

    buildCrashReport(): string {
        const { error, errorInfo, crashCount } = this.state;
        const version = Constants.expoConfig?.version || '0.0.0';
        const buildId = Constants.expoConfig?.extra?.buildId || 'dev';
        return [
            '=== Windy Word Crash Report ===',
            `Version: ${version} (${buildId})`,
            `Platform: ${Platform.OS} ${Platform.Version}`,
            `Timestamp: ${new Date().toISOString()}`,
            `Crash count (session): ${crashCount}`,
            '',
            '--- Error ---',
            `Name: ${error?.name || 'Unknown'}`,
            `Message: ${error?.message || 'No message'}`,
            '',
            '--- Stack Trace ---',
            error?.stack || 'No stack trace',
            '',
            '--- Component Stack ---',
            errorInfo?.componentStack || 'No component stack',
        ].join('\n');
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            const { error, showDetails, crashCount } = this.state;

            return (
                <Animated.View
                    style={[styles.container, {
                        opacity: this.fadeAnim,
                        transform: [{
                            scale: this.fadeAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.95, 1],
                            }),
                        }],
                    }]}
                >
                    <ScrollView
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Icon */}
                        <View style={styles.iconCircle}>
                            <Text style={styles.emoji}>🌪️</Text>
                        </View>

                        {/* Title */}
                        <Text style={styles.title}>
                            {crashCount > 2 ? 'Persistent Issue Detected' : 'Something Went Wrong'}
                        </Text>
                        <Text style={styles.subtitle}>
                            {crashCount > 2
                                ? 'The app keeps running into issues. Try clearing data or reinstalling.'
                                : `Don't worry — your recordings are safe. This is just a display error.`}
                        </Text>

                        {/* Error summary */}
                        <View style={styles.errorCard}>
                            <Text style={styles.errorLabel}>Error</Text>
                            <Text style={styles.errorMessage} numberOfLines={3}>
                                {error?.message || 'An unexpected error occurred'}
                            </Text>
                        </View>

                        {/* Recovery actions */}
                        <Pressable style={styles.primaryBtn} onPress={this.handleReset}>
                            <Text style={styles.primaryBtnEmoji}>🔄</Text>
                            <Text style={styles.primaryBtnText}>Try Again</Text>
                        </Pressable>

                        {/* Secondary actions */}
                        <View style={styles.secondaryRow}>
                            <Pressable
                                style={styles.secondaryBtn}
                                onPress={this.handleCopyReport}
                            >
                                <Text style={styles.secondaryBtnText}>📋 Copy Report</Text>
                            </Pressable>
                            <Pressable
                                style={styles.secondaryBtn}
                                onPress={() => this.setState({ showDetails: !showDetails })}
                            >
                                <Text style={styles.secondaryBtnText}>
                                    {showDetails ? '▼ Hide Details' : '▶ Show Details'}
                                </Text>
                            </Pressable>
                        </View>

                        {/* Crash details */}
                        {showDetails && (
                            <View style={styles.detailsCard}>
                                <Text style={styles.detailsTitle}>Stack Trace</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    <Text style={styles.detailsCode} selectable>
                                        {error?.stack || 'No stack trace available'}
                                    </Text>
                                </ScrollView>
                            </View>
                        )}

                        {/* Session info */}
                        <View style={styles.metaRow}>
                            <Text style={styles.metaText}>
                                v{Constants.expoConfig?.version || '1.0.0'} · {Platform.OS} · Crash #{crashCount}
                            </Text>
                        </View>
                    </ScrollView>
                </Animated.View>
            );
        }

        return this.props.children;
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    scrollContent: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
        paddingTop: Platform.OS === 'ios' ? 80 : 60,
    },

    iconCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.lg,
    },
    emoji: { fontSize: fontSizes['5xl'] },

    title: {
        fontSize: fontSizes['2xl'],
        fontWeight: '700',
        color: colors.textPrimary,
        textAlign: 'center',
        marginBottom: spacing.xs,
    },
    subtitle: {
        fontSize: 15,
        color: colors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: spacing.lg,
        maxWidth: 300,
    },

    errorCard: {
        width: '100%',
        backgroundColor: 'rgba(239, 68, 68, 0.08)',
        borderRadius: borderRadius.md,
        padding: spacing.md,
        marginBottom: spacing.lg,
        borderLeftWidth: 3,
        borderLeftColor: colors.stateError,
    },
    errorLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: colors.stateError,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 4,
    },
    errorMessage: {
        fontSize: 13,
        color: colors.textPrimary,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        lineHeight: 18,
    },

    primaryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors.accent,
        paddingHorizontal: spacing.xl + spacing.md,
        paddingVertical: spacing.md,
        borderRadius: borderRadius.lg,
        marginBottom: spacing.md,
    },
    primaryBtnEmoji: { fontSize: fontSizes.lg },
    primaryBtnText: { fontSize: 17, fontWeight: '700', color: colors.background },

    secondaryRow: {
        flexDirection: 'row',
        gap: spacing.sm,
        marginBottom: spacing.lg,
    },
    secondaryBtn: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    secondaryBtnText: { fontSize: 13, color: colors.textSecondary },

    detailsCard: {
        width: '100%',
        backgroundColor: colors.surface,
        borderRadius: borderRadius.md,
        padding: spacing.md,
        marginBottom: spacing.lg,
        maxHeight: 200,
    },
    detailsTitle: {
        fontSize: 11,
        fontWeight: '700',
        color: colors.textTertiary,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: spacing.sm,
    },
    detailsCode: {
        fontSize: 10,
        color: colors.textSecondary,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        lineHeight: 14,
    },

    metaRow: { marginTop: spacing.sm },
    metaText: { fontSize: 11, color: colors.textTertiary },
});
