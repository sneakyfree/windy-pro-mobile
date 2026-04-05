/**
 * 🧬 Login Screen
 * Email + password authentication for cloud storage.
 */
import { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    StyleSheet, ActivityIndicator, KeyboardAvoidingView,
    Platform, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme';
import { cloudApi } from '@/services/cloudApi';
import { INPUT_LIMITS, validateEmail } from '@/utils/validation';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async () => {
        if (!email.trim() || !password.trim()) {
            setError('Please enter both email and password');
            return;
        }
        const emailCheck = validateEmail(email);
        if (!emailCheck.valid) {
            setError(emailCheck.error!);
            return;
        }

        setLoading(true);
        setError('');

        const result = await cloudApi.login(email.trim(), password);

        setLoading(false);

        if (result.success) {
            // Navigate back to cloud screen or main app
            if (router.canGoBack()) {
                router.back();
            } else {
                router.replace('/(tabs)');
            }
        } else {
            setError(result.error || 'Login failed');
        }
    };

    return (
        <ScreenErrorBoundary screenName="Login">
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.flex}
            >
                <ScrollView
                    contentContainerStyle={styles.content}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.icon}>☁️</Text>
                        <Text style={styles.title}>WindyCloud</Text>
                        <Text style={styles.subtitle}>
                            Sign in to sync your recordings
                        </Text>
                    </View>

                    {/* Error */}
                    {error ? (
                        <View style={styles.errorBox}>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    ) : null}

                    {/* Form */}
                    <View style={styles.form}>
                        <Text style={styles.label}>Email</Text>
                        <TextInput
                            style={styles.input}
                            value={email}
                            onChangeText={setEmail}
                            placeholder="you@example.com"
                            placeholderTextColor={colors.textTertiary}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                            editable={!loading}
                            maxLength={INPUT_LIMITS.EMAIL}
                            accessibilityLabel="Email input"
                        />

                        <Text style={styles.label}>Password</Text>
                        <TextInput
                            style={styles.input}
                            value={password}
                            onChangeText={setPassword}
                            placeholder="••••••••"
                            placeholderTextColor={colors.textTertiary}
                            secureTextEntry
                            editable={!loading}
                            maxLength={INPUT_LIMITS.PASSWORD}
                            accessibilityLabel="Password input"
                        />

                        <TouchableOpacity
                            style={[styles.button, loading && styles.buttonDisabled]}
                            onPress={handleLogin}
                            disabled={loading}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel="Sign in"
                        >
                            {loading ? (
                                <ActivityIndicator color={colors.background} />
                            ) : (
                                <Text style={styles.buttonText}>Sign In</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* Register Link */}
                    <TouchableOpacity
                        onPress={() => router.push('/auth/register')}
                        style={styles.linkContainer}
                        accessibilityRole="link"
                    >
                        <Text style={styles.linkText}>
                            Don't have an account?{' '}
                            <Text style={styles.linkAccent}>Create one</Text>
                        </Text>
                    </TouchableOpacity>

                    {/* Back */}
                    <TouchableOpacity
                        onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
                        style={styles.linkContainer}
                    >
                        <Text style={styles.linkText}>← Back</Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
        </ScreenErrorBoundary>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    content: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: 28,
        paddingVertical: 40,
    },
    header: { alignItems: 'center', marginBottom: 36 },
    icon: { fontSize: 48, marginBottom: 12 },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 15,
        color: colors.textSecondary,
        textAlign: 'center',
    },
    form: { marginBottom: 24 },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textSecondary,
        marginBottom: 6,
        marginTop: 16,
    },
    input: {
        backgroundColor: colors.surface,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        color: colors.textPrimary,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    button: {
        backgroundColor: colors.accent,
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 24,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.background,
    },
    errorBox: {
        backgroundColor: 'rgba(239,68,68,0.15)',
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
    },
    errorText: { color: colors.stateError, fontSize: 14, textAlign: 'center' },
    linkContainer: { alignItems: 'center', paddingVertical: 12 },
    linkText: { fontSize: 14, color: colors.textSecondary },
    linkAccent: { color: colors.accent, fontWeight: '600' },
});
