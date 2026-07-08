/**
 * Register Screen — native account creation.
 *
 * Creates the Windy account in-app via POST /api/v1/auth/register and signs
 * the session straight in (the endpoint returns the session JWT). Replaces
 * the old stub that opened windyword.ai/signup — a marketing page with no
 * signup form, i.e. a dead end for a first-time user.
 */
import { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSizes } from '@/theme';
import { identityApi } from '@/services/identityApi';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

export default function RegisterScreen() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const canSubmit = name.trim().length > 0 && email.trim().length > 0 &&
        password.length > 0 && !submitting;

    async function handleSubmit(): Promise<void> {
        if (!canSubmit) return;
        setSubmitting(true);
        setErrorMessage(null);
        const outcome = await identityApi.register(name.trim(), email.trim(), password);
        if (outcome.success) {
            if (router.canGoBack()) router.back();
            router.replace('/(tabs)');
            return;
        }
        setErrorMessage(outcome.message);
        setSubmitting(false);
    }

    return (
        <ScreenErrorBoundary screenName="Register">
            <SafeAreaView style={styles.container}>
                <KeyboardAvoidingView
                    style={styles.flex}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <ScrollView
                        contentContainerStyle={styles.content}
                        keyboardShouldPersistTaps="handled"
                    >
                        <Text style={styles.icon}>🌬️</Text>
                        <Text style={styles.title}>Create your Windy account</Text>
                        <Text style={styles.subtitle}>
                            One account for Word, Chat, Mail, Clone, Cloud, and Fly.
                        </Text>

                        <TextInput
                            style={styles.input}
                            placeholder="Your name"
                            placeholderTextColor={colors.textSecondary}
                            value={name}
                            onChangeText={setName}
                            autoCapitalize="words"
                            autoComplete="name"
                            textContentType="name"
                            returnKeyType="next"
                            accessibilityLabel="Your name"
                        />
                        <TextInput
                            style={styles.input}
                            placeholder="Email"
                            placeholderTextColor={colors.textSecondary}
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="email-address"
                            autoComplete="email"
                            textContentType="emailAddress"
                            returnKeyType="next"
                            accessibilityLabel="Email"
                        />
                        <TextInput
                            style={styles.input}
                            placeholder="Password (8+ characters, a capital, a number)"
                            placeholderTextColor={colors.textSecondary}
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            autoCapitalize="none"
                            // Deliberately NOT newPassword/new-password: the iOS
                            // Automatic Strong Password cover view can wedge over
                            // the field (unremovable overlay) and grandma needs a
                            // password she can retype on desktop Word anyway.
                            autoComplete="off"
                            textContentType="none"
                            returnKeyType="done"
                            onSubmitEditing={handleSubmit}
                            accessibilityLabel="Password"
                        />

                        {errorMessage && (
                            <View style={styles.errorBanner}>
                                <Text style={styles.errorText}>{errorMessage}</Text>
                            </View>
                        )}

                        <TouchableOpacity
                            style={[styles.primaryButton, !canSubmit && styles.primaryButtonDisabled]}
                            onPress={handleSubmit}
                            disabled={!canSubmit}
                            accessibilityRole="button"
                            accessibilityLabel="Create account"
                        >
                            {submitting
                                ? <ActivityIndicator color={colors.background} />
                                : <Text style={styles.primaryButtonText}>Create account</Text>}
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
    icon: { fontSize: 52, textAlign: 'center', marginBottom: 12 },
    title: {
        fontSize: 28, fontWeight: '700', color: colors.textPrimary,
        textAlign: 'center', marginBottom: 12,
    },
    subtitle: {
        fontSize: 15, color: colors.textSecondary, textAlign: 'center',
        marginBottom: 32,
    },
    input: {
        backgroundColor: colors.surface,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: fontSizes.base,
        color: colors.textPrimary,
        marginBottom: 14,
        minHeight: 52,
    },
    errorBanner: {
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 14,
        marginBottom: 14,
        backgroundColor: 'rgba(239,68,68,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.45)',
    },
    errorText: {
        fontSize: fontSizes.sm,
        color: colors.stateError,
        textAlign: 'center',
    },
    primaryButton: {
        backgroundColor: colors.accent, borderRadius: 12,
        paddingVertical: 18, alignItems: 'center',
        minHeight: 52, justifyContent: 'center',
    },
    primaryButtonDisabled: { opacity: 0.5 },
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
