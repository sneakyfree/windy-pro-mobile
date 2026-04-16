/**
 * Register Screen — redirects to web sign-up.
 *
 * Account creation lives on windyword.ai. Once the account exists, the user
 * returns to the app and signs in via the device-code flow.
 */
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSizes } from '@/theme';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

const SIGN_UP_URL = 'https://windyword.ai/signup';

export default function RegisterScreen() {
    return (
        <ScreenErrorBoundary screenName="Register">
            <SafeAreaView style={styles.container}>
                <View style={styles.content}>
                    <Text style={styles.icon}>🌬️</Text>
                    <Text style={styles.title}>Create your Windy account</Text>
                    <Text style={styles.subtitle}>
                        Sign-up happens on the web — then come back and sign in here.
                    </Text>

                    <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={() => Linking.openURL(SIGN_UP_URL).catch(() => {})}
                        accessibilityRole="button"
                        accessibilityLabel="Open signup page"
                    >
                        <Text style={styles.primaryButtonText}>Open sign-up on windyword.ai</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => router.replace('/auth/login')}
                        style={styles.linkContainer}
                    >
                        <Text style={styles.linkText}>
                            Already have an account?{' '}
                            <Text style={styles.linkAccent}>Sign in</Text>
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
    icon: { fontSize: 52, textAlign: 'center', marginBottom: 12 },
    title: {
        fontSize: 28, fontWeight: '700', color: colors.textPrimary,
        textAlign: 'center', marginBottom: 12,
    },
    subtitle: {
        fontSize: 15, color: colors.textSecondary, textAlign: 'center',
        marginBottom: 32,
    },
    primaryButton: {
        backgroundColor: colors.accent, borderRadius: 12,
        paddingVertical: 18, alignItems: 'center',
        minHeight: 52, justifyContent: 'center',
    },
    primaryButtonText: {
        fontSize: fontSizes.base, fontWeight: '700', color: colors.background,
    },
    linkContainer: {
        alignItems: 'center', paddingVertical: 14,
        minHeight: 44, justifyContent: 'center',
    },
    linkText: { fontSize: fontSizes.sm, color: colors.textSecondary },
    linkAccent: { color: colors.accent, fontWeight: '600' },
});
