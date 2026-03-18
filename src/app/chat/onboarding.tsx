/**
 * 🧬 K2 — Chat Onboarding Screen
 * WhatsApp-style multi-step flow:
 *   Step 1: Phone or email entry
 *   Step 2: 6-digit OTP verification
 *   Step 3: Display name + avatar
 *   Step 4: Contact import permission
 *   Step 5: Completion
 *
 * Matrix is completely hidden — users only see Windy Chat branding.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    KeyboardAvoidingView, Platform, ScrollView, Alert,
    ActivityIndicator, Animated, Keyboard,
} from 'react-native';
import { INPUT_LIMITS, validatePhone, validateEmail } from '@/utils/validation';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors } from '@/theme';
import {
    chatOnboarding,
    type IdentifierType,
} from '@/services/chatOnboarding';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

// Safe import: expo-contacts may not be installed yet
let Contacts: { requestPermissionsAsync?: () => Promise<{ status: string }> } | null = null;
try { Contacts = require('expo-contacts'); } catch { /* not installed */ }

// ─── Types ──────────────────────────────────────────────────────

type OnboardingStep = 1 | 2 | 3 | 4 | 5;

interface Credentials {
    accessToken: string;
    userId: string;
    deviceId: string;
    homeserverUrl: string;
}

// ─── Component ──────────────────────────────────────────────────

export default function ChatOnboardingScreen() {
    const [step, setStep] = useState<OnboardingStep>(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Step 1 —  identifier
    const [identifierType, setIdentifierType] = useState<IdentifierType>('phone');
    const [identifier, setIdentifier] = useState('');

    // Step 2 — OTP
    const [sessionId, setSessionId] = useState('');
    const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
    const otpRefs = useRef<(TextInput | null)[]>([]);

    // Step 3 — Profile
    const [displayName, setDisplayName] = useState('');

    // Credentials from server
    const [credentials, setCredentials] = useState<Credentials | null>(null);

    // Animation
    const fadeAnim = useRef(new Animated.Value(1)).current;
    const slideAnim = useRef(new Animated.Value(0)).current;

    // ML-3: Unmount guard for async callbacks
    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    // ─── Step Transition ────────────────────────────────────────

    const animateToStep = useCallback((nextStep: OnboardingStep) => {
        Keyboard.dismiss();
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: -30, duration: 150, useNativeDriver: true }),
        ]).start(() => {
            setStep(nextStep);
            setError('');
            slideAnim.setValue(30);
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
                Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
            ]).start();
        });
    }, [fadeAnim, slideAnim]);

    // ERR-AUDIT: Allow users to go back / cancel if server is unreachable
    const handleBack = () => {
        if (step === 1) {
            router.back();
        } else if (step <= 3) {
            // Go back one step (only before onboarding completes)
            animateToStep((step - 1) as OnboardingStep);
        }
    };

    // ─── Step 1: Request Verification ───────────────────────────

    const handleRequestVerification = async () => {
        if (!identifier.trim()) {
            setError(identifierType === 'phone' ? 'Enter your phone number' : 'Enter your email');
            return;
        }
        setLoading(true);
        setError('');

        const result = await chatOnboarding.requestVerification({
            identifier: identifier.trim(),
            type: identifierType,
        });

        if (!isMounted.current) return;
        setLoading(false);
        if (result.success && result.sessionId) {
            setSessionId(result.sessionId);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            animateToStep(2);
        } else {
            setError(result.error || 'Failed to send code');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    };

    // ─── Step 2: Verify OTP ─────────────────────────────────────

    const handleOtpChange = (index: number, value: string) => {
        if (value.length > 1) {
            // Handle paste — fill all boxes
            const digits = value.replace(/\D/g, '').slice(0, 6).split('');
            const newOtp = [...otpDigits];
            digits.forEach((d, i) => { newOtp[i] = d; });
            setOtpDigits(newOtp);
            const nextIdx = Math.min(digits.length, 5);
            otpRefs.current[nextIdx]?.focus();
            // Auto-submit if all 6 digits filled
            if (digits.length === 6) {
                setTimeout(() => submitOtp(newOtp.join('')), 100);
            }
            return;
        }

        const newOtp = [...otpDigits];
        newOtp[index] = value.replace(/\D/g, '');
        setOtpDigits(newOtp);
        setError('');

        if (value && index < 5) {
            otpRefs.current[index + 1]?.focus();
        }

        // Auto-submit when all 6 filled
        const code = newOtp.join('');
        if (code.length === 6 && /^\d{6}$/.test(code)) {
            setTimeout(() => submitOtp(code), 100);
        }
    };

    const handleOtpKeyPress = (index: number, key: string) => {
        if (key === 'Backspace' && !otpDigits[index] && index > 0) {
            otpRefs.current[index - 1]?.focus();
            const newOtp = [...otpDigits];
            newOtp[index - 1] = '';
            setOtpDigits(newOtp);
        }
    };

    const submitOtp = async (code: string) => {
        setLoading(true);
        setError('');

        const result = await chatOnboarding.verifyOtp(sessionId, code);

        if (!isMounted.current) return;
        setLoading(false);
        if (result.success && result.credentials) {
            setCredentials(result.credentials);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            animateToStep(3);
        } else {
            setError(result.error || 'Verification failed');
            setOtpDigits(['', '', '', '', '', '']);
            otpRefs.current[0]?.focus();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    };

    // ─── Step 3: Set Profile ────────────────────────────────────

    const handleSetProfile = async () => {
        if (!displayName.trim()) {
            setError('Enter your name');
            return;
        }
        if (!credentials) {
            setError('Session error — please restart');
            return;
        }

        setLoading(true);
        setError('');

        await chatOnboarding.setProfile(
            credentials.accessToken,
            displayName.trim(),
        );

        if (!isMounted.current) return;
        setLoading(false);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        animateToStep(4);
    };

    // ─── Step 4: Contact Import ─────────────────────────────────

    const handleContactPermission = async (allow: boolean) => {
        if (allow && Contacts?.requestPermissionsAsync) {
            try {
                const { status } = await Contacts.requestPermissionsAsync();
                if (status !== 'granted') {
                    // User denied at OS level — that's fine, proceed
                }
            } catch (err) {
                console.warn('[ChatOnboarding] contacts permission error:', err);
            }
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        animateToStep(5);
    };

    // ─── Step 5: Complete ───────────────────────────────────────

    const handleComplete = async () => {
        if (!credentials) return;

        setLoading(true);
        const result = await chatOnboarding.completeOnboarding(credentials);
        if (!isMounted.current) return;
        setLoading(false);

        if (result.success) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.replace('/(tabs)/chat');
        } else {
            Alert.alert('Setup Error', result.error || 'Failed to complete setup. Please try again.');
        }
    };

    // Auto-focus OTP first box
    useEffect(() => {
        if (step === 2) {
            setTimeout(() => otpRefs.current[0]?.focus(), 300);
        }
    }, [step]);

    // ─── Step Indicator ─────────────────────────────────────────

    const renderStepIndicator = () => (
        <View style={styles.stepIndicator}>
            {[1, 2, 3, 4, 5].map((s) => (
                <View
                    key={s}
                    style={[
                        styles.stepDot,
                        s === step && styles.stepDotActive,
                        s < step && styles.stepDotCompleted,
                    ]}
                />
            ))}
        </View>
    );

    // ─── Render Steps ───────────────────────────────────────────

    const renderStep1 = () => (
        <View style={styles.stepContent}>
            <Text style={styles.emoji}>💬</Text>
            <Text style={styles.title}>Welcome to Windy Chat</Text>
            <Text style={styles.subtitle}>
                Encrypted messaging that translates in real-time.{'\n'}
                Enter your {identifierType === 'phone' ? 'phone number' : 'email'} to get started.
            </Text>

            {/* Identifier type toggle */}
            <View style={styles.toggleRow}>
                <TouchableOpacity
                    style={[styles.toggleButton, identifierType === 'phone' && styles.toggleActive]}
                    onPress={() => { setIdentifierType('phone'); setError(''); }}
                    accessibilityLabel="Use phone number"
                    accessibilityRole="button"
                >
                    <Text style={[styles.toggleText, identifierType === 'phone' && styles.toggleTextActive]}>
                        📱 Phone
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.toggleButton, identifierType === 'email' && styles.toggleActive]}
                    onPress={() => { setIdentifierType('email'); setError(''); }}
                    accessibilityLabel="Use email"
                    accessibilityRole="button"
                >
                    <Text style={[styles.toggleText, identifierType === 'email' && styles.toggleTextActive]}>
                        ✉️ Email
                    </Text>
                </TouchableOpacity>
            </View>

            <TextInput
                style={styles.input}
                value={identifier}
                onChangeText={(text) => { setIdentifier(text); setError(''); }}
                placeholder={identifierType === 'phone' ? '+1 (555) 123-4567' : 'you@example.com'}
                placeholderTextColor={colors.textTertiary}
                keyboardType={identifierType === 'phone' ? 'phone-pad' : 'email-address'}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                autoFocus
                maxLength={identifierType === 'phone' ? INPUT_LIMITS.PHONE : INPUT_LIMITS.EMAIL}
                accessibilityLabel={identifierType === 'phone' ? 'Phone number' : 'Email address'}
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
                style={[styles.primaryButton, loading && styles.buttonDisabled]}
                onPress={handleRequestVerification}
                disabled={loading}
                accessibilityLabel="Continue"
                accessibilityRole="button"
            >
                {loading ? (
                    <ActivityIndicator color={colors.background} />
                ) : (
                    <Text style={styles.primaryButtonText}>Continue</Text>
                )}
            </TouchableOpacity>

            <Text style={styles.disclaimer}>
                We'll send a verification code.{'\n'}
                Standard message rates may apply.
            </Text>
        </View>
    );

    const renderStep2 = () => (
        <View style={styles.stepContent}>
            <Text style={styles.emoji}>🔐</Text>
            <Text style={styles.title}>Enter Verification Code</Text>
            <Text style={styles.subtitle}>
                We sent a 6-digit code to{'\n'}
                <Text style={styles.identifierHighlight}>{identifier}</Text>
            </Text>

            <View style={styles.otpRow}>
                {otpDigits.map((digit, index) => (
                    <TextInput
                        key={index}
                        ref={(ref) => { otpRefs.current[index] = ref; }}
                        style={[
                            styles.otpBox,
                            digit ? styles.otpBoxFilled : null,
                        ]}
                        value={digit}
                        onChangeText={(text) => handleOtpChange(index, text)}
                        onKeyPress={({ nativeEvent }) => handleOtpKeyPress(index, nativeEvent.key)}
                        keyboardType="number-pad"
                        maxLength={index === 0 ? 6 : 1}  /* Allow paste in first box */
                        selectTextOnFocus
                        editable={!loading}
                        accessibilityLabel={`Digit ${index + 1} of 6`}
                    />
                ))}
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {loading && (
                <View style={styles.verifyingRow}>
                    <ActivityIndicator color={colors.accent} size="small" />
                    <Text style={styles.verifyingText}>Verifying…</Text>
                </View>
            )}

            <TouchableOpacity
                style={styles.resendButton}
                onPress={() => {
                    setOtpDigits(['', '', '', '', '', '']);
                    setError('');
                    handleRequestVerification();
                }}
                disabled={loading}
                accessibilityLabel="Resend code"
                accessibilityRole="button"
            >
                <Text style={styles.resendText}>Didn't receive it? Resend code</Text>
            </TouchableOpacity>
        </View>
    );

    const renderStep3 = () => (
        <View style={styles.stepContent}>
            <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarPlaceholderText}>
                    {displayName.trim() ? displayName.trim()[0].toUpperCase() : '?'}
                </Text>
            </View>
            <Text style={styles.title}>Set Up Your Profile</Text>
            <Text style={styles.subtitle}>
                Choose a name that your contacts will see.
            </Text>

            <Text style={styles.label}>Display Name</Text>
            <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={(text) => { setDisplayName(text); setError(''); }}
                placeholder="Your name"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="words"
                maxLength={50}
                editable={!loading}
                autoFocus
                accessibilityLabel="Display name"
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
                style={[styles.primaryButton, loading && styles.buttonDisabled]}
                onPress={handleSetProfile}
                disabled={loading}
                accessibilityLabel="Continue"
                accessibilityRole="button"
            >
                {loading ? (
                    <ActivityIndicator color={colors.background} />
                ) : (
                    <Text style={styles.primaryButtonText}>Continue</Text>
                )}
            </TouchableOpacity>
        </View>
    );

    const renderStep4 = () => (
        <View style={styles.stepContent}>
            <Text style={styles.emoji}>📖</Text>
            <Text style={styles.title}>Find Your Contacts</Text>
            <Text style={styles.subtitle}>
                Allow access to your contacts to find friends{'\n'}
                who are already on Windy Chat.
            </Text>

            <View style={styles.privacyNote}>
                <Text style={styles.privacyIcon}>🔒</Text>
                <Text style={styles.privacyText}>
                    Your contacts are hashed and never stored on our servers.
                    We only check for matches — your address book stays private.
                </Text>
            </View>

            <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => handleContactPermission(true)}
                accessibilityLabel="Allow contact access"
                accessibilityRole="button"
            >
                <Text style={styles.primaryButtonText}>Allow Access</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => handleContactPermission(false)}
                accessibilityLabel="Skip contact import"
                accessibilityRole="button"
            >
                <Text style={styles.secondaryButtonText}>Not Now</Text>
            </TouchableOpacity>
        </View>
    );

    const renderStep5 = () => (
        <View style={styles.stepContent}>
            <Text style={styles.emojiLarge}>🎉</Text>
            <Text style={styles.title}>You're All Set!</Text>
            <Text style={styles.subtitle}>
                Windy Chat is ready. Send encrypted messages{'\n'}
                that translate automatically.
            </Text>

            <View style={styles.featureList}>
                <View style={styles.featureRow}>
                    <Text style={styles.featureIcon}>🔐</Text>
                    <Text style={styles.featureText}>End-to-end encrypted</Text>
                </View>
                <View style={styles.featureRow}>
                    <Text style={styles.featureIcon}>🌍</Text>
                    <Text style={styles.featureText}>Auto-translates messages</Text>
                </View>
                <View style={styles.featureRow}>
                    <Text style={styles.featureIcon}>⚡</Text>
                    <Text style={styles.featureText}>Syncs with desktop</Text>
                </View>
            </View>

            <TouchableOpacity
                style={[styles.primaryButton, loading && styles.buttonDisabled]}
                onPress={handleComplete}
                disabled={loading}
                accessibilityLabel="Start chatting"
                accessibilityRole="button"
            >
                {loading ? (
                    <ActivityIndicator color={colors.background} />
                ) : (
                    <Text style={styles.primaryButtonText}>Start Chatting</Text>
                )}
            </TouchableOpacity>
        </View>
    );

    const stepRenderers: Record<OnboardingStep, () => JSX.Element> = {
        1: renderStep1,
        2: renderStep2,
        3: renderStep3,
        4: renderStep4,
        5: renderStep5,
    };

    // ─── Main Render ────────────────────────────────────────────

    return (
        <ScreenErrorBoundary screenName="Chat Onboarding">
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* Step indicator */}
                    {renderStepIndicator()}

                    {/* ERR-AUDIT: Back/cancel button */}
                    {step <= 3 && (
                        <TouchableOpacity
                            onPress={handleBack}
                            style={{ paddingVertical: 8, paddingHorizontal: 4, minHeight: 44, justifyContent: 'center' }}
                            accessibilityLabel={step === 1 ? 'Cancel' : 'Go back'}
                            accessibilityRole="button"
                        >
                            <Text style={{ fontSize: 15, color: colors.accent, fontWeight: '600' }}>
                                {step === 1 ? '← Cancel' : '← Back'}
                            </Text>
                        </TouchableOpacity>
                    )}
                    {/* Animated step content */}
                    <Animated.View
                        style={{
                            opacity: fadeAnim,
                            transform: [{ translateY: slideAnim }],
                        }}
                    >
                        {stepRenderers[step]()}
                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
        </ScreenErrorBoundary>
    );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 28,
        paddingTop: 16,
        paddingBottom: 40,
    },

    // Step indicator
    stepIndicator: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 32,
    },
    stepDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.surfaceLight,
    },
    stepDotActive: {
        width: 24,
        backgroundColor: colors.accent,
        borderRadius: 4,
    },
    stepDotCompleted: {
        backgroundColor: colors.accentTransparent,
    },

    // Step content
    stepContent: {
        flex: 1,
        alignItems: 'center',
        paddingTop: 24,
    },

    // Typography
    emoji: { fontSize: 56, marginBottom: 20 },
    emojiLarge: { fontSize: 72, marginBottom: 20 },
    title: {
        fontSize: 26,
        fontWeight: '700',
        color: colors.textPrimary,
        textAlign: 'center',
        marginBottom: 12,
    },
    subtitle: {
        fontSize: 15,
        color: colors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 32,
    },
    identifierHighlight: {
        color: colors.accent,
        fontWeight: '600',
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textSecondary,
        alignSelf: 'flex-start',
        marginBottom: 8,
    },

    // Toggle buttons (phone / email)
    toggleRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 20,
    },
    toggleButton: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: colors.surface,
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: 'transparent',
        minHeight: 44, // VQ: iOS 44pt minimum tap target
    },
    toggleActive: {
        borderColor: colors.accent,
        backgroundColor: colors.accentTransparent,
    },
    toggleText: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    toggleTextActive: {
        color: colors.accent,
    },

    // Input
    input: {
        width: '100%',
        backgroundColor: colors.surface,
        borderRadius: 14,
        paddingHorizontal: 18,
        paddingVertical: 16,
        fontSize: 17,
        color: colors.textPrimary,
        borderWidth: 1,
        borderColor: colors.borderLight,
        marginBottom: 16,
    },

    // OTP
    otpRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 24,
    },
    otpBox: {
        flex: 1, // VQ: Use flex instead of fixed width for small-screen compat
        maxWidth: 52,
        height: 56,
        borderRadius: 12,
        backgroundColor: colors.surface,
        borderWidth: 1.5,
        borderColor: colors.borderLight,
        textAlign: 'center',
        fontSize: 24,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    otpBoxFilled: {
        borderColor: colors.accent,
        backgroundColor: colors.accentTransparent,
    },
    verifyingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    verifyingText: {
        fontSize: 14,
        color: colors.textSecondary,
    },
    resendButton: {
        paddingVertical: 12,
        minHeight: 44,
        justifyContent: 'center',
    },
    resendText: {
        fontSize: 14,
        color: colors.accent,
        fontWeight: '600',
    },

    // Buttons
    primaryButton: {
        width: '100%',
        backgroundColor: colors.accent,
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 8,
        minHeight: 54,
        justifyContent: 'center',
    },
    buttonDisabled: { opacity: 0.6 },
    primaryButtonText: {
        fontSize: 17,
        fontWeight: '700',
        color: colors.background,
    },
    secondaryButton: {
        width: '100%',
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 8,
        minHeight: 48,
        justifyContent: 'center',
    },
    secondaryButtonText: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.textSecondary,
    },

    // Error
    errorText: {
        color: colors.stateError,
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 12,
    },

    // Disclaimer
    disclaimer: {
        fontSize: 12,
        color: colors.textTertiary,
        textAlign: 'center',
        marginTop: 20,
        lineHeight: 18,
    },

    // Avatar placeholder (step 3)
    avatarPlaceholder: {
        width: 88,
        height: 88,
        borderRadius: 44,
        backgroundColor: colors.accentTransparent,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
        borderWidth: 2,
        borderColor: colors.accent,
    },
    avatarPlaceholderText: {
        fontSize: 36,
        fontWeight: '700',
        color: colors.accent,
    },

    // Privacy note (step 4)
    privacyNote: {
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderRadius: 14,
        padding: 16,
        gap: 12,
        marginBottom: 24,
        alignItems: 'flex-start',
    },
    privacyIcon: { fontSize: 20, marginTop: 2 },
    privacyText: {
        flex: 1,
        fontSize: 13,
        color: colors.textSecondary,
        lineHeight: 19,
    },

    // Feature list (step 5)
    featureList: {
        width: '100%',
        backgroundColor: colors.surface,
        borderRadius: 14,
        padding: 16,
        gap: 14,
        marginBottom: 28,
    },
    featureRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    featureIcon: { fontSize: 20 },
    featureText: {
        fontSize: 15,
        color: colors.textPrimary,
        fontWeight: '500',
    },
});
