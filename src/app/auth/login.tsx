/**
 * Login Screen — entry point into OAuth2 device-code flow.
 *
 * Tapping "Sign in with Windy" pushes to /auth/device-code which talks to
 * the account-server at windy-pro and polls for approval.
 */
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSizes } from '@/theme';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

const SIGN_UP_URL = 'https://windyword.ai/signup';

export default function LoginScreen() {
    return (
        <ScreenErrorBoundary screenName="Login">
            <SafeAreaView style={styles.container}>
                <View style={styles.content}>
                    <View style={styles.header}>
                        <Text style={styles.icon}>🌬️</Text>
                        <Text style={styles.title}>Windy Word</Text>
                        <Text style={styles.subtitle}>
                            One sign-in for Word, Chat, Mail, Clone, Cloud, and Fly.
                        </Text>
                    </View>

                    <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={() => router.push('/auth/device-code')}
                        accessibilityRole="button"
                        accessibilityLabel="Sign in with Windy"
                    >
                        <Text style={styles.primaryButtonText}>Sign in with Windy</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => Linking.openURL(SIGN_UP_URL).catch(() => {})}
                        style={styles.linkContainer}
                        accessibilityRole="link"
                    >
                        <Text style={styles.linkText}>
                            New to Windy?{' '}
                            <Text style={styles.linkAccent}>Create an account</Text>
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
                        style={styles.linkContainer}
                    >
                        <Text style={styles.linkText}>← Back</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </ScreenErrorBoundary>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 28,
        paddingVertical: 40,
    },
    header: { alignItems: 'center', marginBottom: 40 },
    icon: { fontSize: 52, marginBottom: 12 },
    title: {
        fontSize: 32,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: 10,
    },
    subtitle: {
        fontSize: 15,
        color: colors.textSecondary,
        textAlign: 'center',
        paddingHorizontal: 8,
    },
    primaryButton: {
        backgroundColor: colors.accent,
        borderRadius: 12,
        paddingVertical: 18,
        alignItems: 'center',
        minHeight: 52,
        justifyContent: 'center',
    },
    primaryButtonText: {
        fontSize: fontSizes.base,
        fontWeight: '700',
        color: colors.background,
    },
    linkContainer: {
        alignItems: 'center',
        paddingVertical: 14,
        minHeight: 44,
        justifyContent: 'center',
    },
    linkText: { fontSize: fontSizes.sm, color: colors.textSecondary },
    linkAccent: { color: colors.accent, fontWeight: '600' },
});
