/**
 * 🧬 Chat Profile — K2 WhatsApp-style account setup
 * Default: Simple "Get Started with Windy Chat" card → navigates to onboarding.
 * Hidden: Triple-tap subtitle reveals raw Matrix login for developers.
 * Logged-in: Shows display name (not Matrix userId), settings, encryption info.
 */
import { useState, useEffect, useRef } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    KeyboardAvoidingView, Platform, ScrollView, Alert,
    ActivityIndicator, Image, Switch,
} from 'react-native';
import { INPUT_LIMITS } from '@/utils/validation';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme';
import { chatClient, validateHomeserverUrl } from '@/services/chatClient';
import { chatOnboarding } from '@/services/chatOnboarding';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { TIER_1_LANGUAGES } from '@/services/translation';

// ─── Component ──────────────────────────────────────────────────

export default function ChatProfileScreen() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [loading, setLoading] = useState(true);

    // Display name (user-facing, not Matrix @user:server)
    const [displayName, setDisplayNameState] = useState('');

    // Advanced (hidden) Matrix login form
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [homeserver, setHomeserver] = useState('https://matrix.org');
    const [isRegister, setIsRegister] = useState(false);
    const [authLoading, setAuthLoading] = useState(false);
    const [authError, setAuthError] = useState('');

    // Triple-tap to reveal Advanced
    const tapCountRef = useRef(0);
    const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Profile
    const [userId, setUserId] = useState('');
    const [availableForChat, setAvailableForChat] = useState(true);

    const defaultLang = useSettingsStore(s => s.defaultLanguage);
    const langInfo = TIER_1_LANGUAGES.find(l => l.code === defaultLang);

    // ─── Init ───────────────────────────────────────────────────

    useEffect(() => {
        const checkLogin = async () => {
            try {
                const restored = await chatClient.restoreSession();
                setIsLoggedIn(restored);
                if (restored) {
                    setUserId(chatClient.getUserId() || '');
                    chatClient.setPresence('online');
                    // Get user-facing display name
                    const name = await chatOnboarding.getDisplayName();
                    setDisplayNameState(name || chatClient.getUserId()?.replace(/^@/, '').split(':')[0] || '');
                }
            } catch (err) {
                console.warn('[ChatProfile] restoreSession error:', err);
            }
            setLoading(false);
        };
        checkLogin();
        // ML-AUDIT: Clean up triple-tap timer on unmount
        return () => {
            if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
        };
    }, []);

    // ─── Triple-tap handler ─────────────────────────────────────

    const handleSubtitleTap = () => {
        tapCountRef.current++;
        if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
        if (tapCountRef.current >= 3) {
            setShowAdvanced(true);
            tapCountRef.current = 0;
            return;
        }
        tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0; }, 600);
    };

    // ─── Advanced Auth ──────────────────────────────────────────

    const handleAuth = async () => {
        if (!username.trim() || !password.trim()) {
            setAuthError('Please fill in all fields');
            return;
        }

        const urlError = validateHomeserverUrl(homeserver.trim());
        if (urlError) {
            setAuthError(urlError);
            return;
        }

        setAuthLoading(true);
        setAuthError('');

        try {
            const result = isRegister
                ? await chatClient.register(username.trim(), password, homeserver.trim())
                : await chatClient.login(username.trim(), password, homeserver.trim());

            setAuthLoading(false);

            if (result.success) {
                setIsLoggedIn(true);
                setUserId(result.userId || '');
                setDisplayNameState(result.userId?.replace(/^@/, '').split(':')[0] || '');
                chatClient.setPresence('online');
            } else {
                setAuthError(result.error || 'Authentication failed');
            }
        } catch (err) {
            setAuthLoading(false);
            setAuthError('An unexpected error occurred. Please try again.');
            console.warn('[ChatProfile] handleAuth error:', err);
        }
    };

    const handleLogout = () => {
        Alert.alert(
            'Logout',
            'Disconnect from chat? You can sign back in anytime.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Logout',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await chatClient.logout();
                            await chatOnboarding.resetOnboarding();
                        } catch (err) {
                            console.warn('[ChatProfile] logout error:', err);
                        }
                        setIsLoggedIn(false);
                        setUserId('');
                        setDisplayNameState('');
                    },
                },
            ]
        );
    };

    const toggleAvailability = (value: boolean) => {
        setAvailableForChat(value);
        chatClient.setPresence(value ? 'online' : 'unavailable');
    };

    // ─── Loading ────────────────────────────────────────────────

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}
                    accessibilityLabel="Loading chat profile" accessibilityRole="none"
                >
                    <ActivityIndicator size="large" color={colors.accent} />
                </View>
            </SafeAreaView>
        );
    }

    // ─── Not Logged In — WhatsApp-style CTA ─────────────────────

    if (!isLoggedIn) {
        return (
            <SafeAreaView style={styles.container}>
                <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                    {/* Header */}
                    <TouchableOpacity onPress={() => router.back()} style={styles.backLink}
                        accessibilityLabel="Go back" accessibilityRole="button"
                    >
                        <Text style={styles.backText}>← Back</Text>
                    </TouchableOpacity>

                    {/* Welcome CTA */}
                    <View style={styles.welcomeSection}>
                        <Text style={styles.welcomeEmoji}>💬</Text>
                        <Text style={styles.welcomeTitle}>Windy Chat</Text>
                        <TouchableOpacity onPress={handleSubtitleTap} activeOpacity={1}>
                            <Text style={styles.welcomeSubtitle}>
                                Encrypted messaging with auto-translation.{'\n'}
                                Set up in 30 seconds.
                            </Text>
                        </TouchableOpacity>

                        <View style={styles.featureChips}>
                            <View style={styles.chip}>
                                <Text style={styles.chipText}>🔐 End-to-end encrypted</Text>
                            </View>
                            <View style={styles.chip}>
                                <Text style={styles.chipText}>🌍 Auto-translates</Text>
                            </View>
                            <View style={styles.chip}>
                                <Text style={styles.chipText}>⚡ Syncs with desktop</Text>
                            </View>
                        </View>

                        <TouchableOpacity
                            style={styles.getStartedButton}
                            onPress={() => router.push('/chat/onboarding')}
                            accessibilityLabel="Get started with Windy Chat"
                            accessibilityRole="button"
                        >
                            <Text style={styles.getStartedText}>Get Started</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Hidden Advanced Option — revealed by triple-tap or long-press */}
                    {!showAdvanced ? (
                        <TouchableOpacity
                            style={styles.advancedLink}
                            onLongPress={() => setShowAdvanced(true)}
                            delayLongPress={800}
                            accessibilityLabel="Advanced login options"
                            accessibilityRole="button"
                        >
                            <Text style={styles.advancedLinkText}>Advanced</Text>
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.advancedSection}>
                            <View style={styles.advancedHeader}>
                                <Text style={styles.advancedTitle}>⚙️ Advanced — Matrix Login</Text>
                                <Text style={styles.advancedHint}>
                                    For developers: Connect directly to any Matrix homeserver.
                                </Text>
                            </View>

                            {authError ? (
                                <View style={styles.errorBox} accessibilityRole="alert">
                                    <Text style={styles.errorText}>{authError}</Text>
                                </View>
                            ) : null}

                            <View style={styles.form}>
                                <Text style={styles.label}>Homeserver</Text>
                                <TextInput
                                    style={styles.input}
                                    value={homeserver}
                                    onChangeText={(text) => { setHomeserver(text); setAuthError(''); }}
                                    placeholder="https://matrix.org"
                                    placeholderTextColor={colors.textTertiary}
                                    autoCapitalize="none"
                                    editable={!authLoading}
                                    maxLength={INPUT_LIMITS.SERVER_URL}
                                    accessibilityLabel="Homeserver URL"
                                    accessibilityHint="Enter your Matrix homeserver URL, must start with https"
                                />

                                <Text style={styles.label}>Username</Text>
                                <TextInput
                                    style={styles.input}
                                    value={username}
                                    onChangeText={(text) => { setUsername(text); setAuthError(''); }}
                                    placeholder="your_username"
                                    placeholderTextColor={colors.textTertiary}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    editable={!authLoading}
                                    maxLength={INPUT_LIMITS.USERNAME}
                                    accessibilityLabel="Username"
                                />

                                <Text style={styles.label}>Password</Text>
                                <TextInput
                                    style={styles.input}
                                    value={password}
                                    onChangeText={(text) => { setPassword(text); setAuthError(''); }}
                                    placeholder="••••••••"
                                    placeholderTextColor={colors.textTertiary}
                                    secureTextEntry
                                    editable={!authLoading}
                                    maxLength={INPUT_LIMITS.PASSWORD}
                                    accessibilityLabel="Password"
                                />

                                <TouchableOpacity
                                    style={[styles.authButton, authLoading && styles.authButtonDisabled]}
                                    onPress={handleAuth}
                                    disabled={authLoading}
                                    accessibilityLabel={isRegister ? 'Create account' : 'Sign in'}
                                    accessibilityRole="button"
                                >
                                    {authLoading ? (
                                        <ActivityIndicator color={colors.background} />
                                    ) : (
                                        <Text style={styles.authButtonText}>
                                            {isRegister ? 'Create Account' : 'Sign In'}
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            </View>

                            <TouchableOpacity
                                onPress={() => { setIsRegister(!isRegister); setAuthError(''); }}
                                style={styles.switchAuth}
                                accessibilityLabel={isRegister ? 'Switch to sign in form' : 'Switch to registration form'}
                                accessibilityRole="button"
                            >
                                <Text style={styles.switchText}>
                                    {isRegister ? 'Already have an account? ' : "Don't have an account? "}
                                    <Text style={styles.switchAccent}>
                                        {isRegister ? 'Sign In' : 'Register'}
                                    </Text>
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => setShowAdvanced(false)}
                                style={styles.hideAdvanced}
                                accessibilityLabel="Hide advanced options"
                                accessibilityRole="button"
                            >
                                <Text style={styles.hideAdvancedText}>Hide Advanced</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </ScrollView>
            </SafeAreaView>
        );
    }

    // ─── Profile (Logged In) ────────────────────────────────────

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Header */}
                <TouchableOpacity onPress={() => router.back()} style={styles.backLink}
                    accessibilityLabel="Go back" accessibilityRole="button"
                >
                    <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>

                {/* Avatar + Name */}
                <View style={styles.profileHeader}>
                    <View style={styles.avatarLarge}>
                        <Text style={styles.avatarLargeText}>
                            {(displayName || '?')[0].toUpperCase()}
                        </Text>
                    </View>
                    <Text style={styles.profileName}>{displayName || 'User'}</Text>
                    <Text style={styles.profileServer}>{chatClient.getHomeserver()}</Text>
                    {chatClient.isCryptoEnabled() && (
                        <Text style={styles.cryptoBadge}
                            accessibilityLabel="End-to-end encryption is enabled"
                        >🔒 Encryption enabled</Text>
                    )}
                </View>

                {/* Settings */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle} accessibilityRole="header">Chat Settings</Text>

                    <View style={styles.settingRow}>
                        <View style={styles.settingInfo}>
                            <Text style={styles.settingLabel}>Available for chat</Text>
                            <Text style={styles.settingHint}>Show online status to contacts</Text>
                        </View>
                        <Switch
                            value={availableForChat}
                            onValueChange={toggleAvailability}
                            trackColor={{ false: colors.borderLight, true: colors.accentTransparent }}
                            thumbColor={availableForChat ? colors.accent : colors.textTertiary}
                            accessibilityLabel={`Available for chat, currently ${availableForChat ? 'on' : 'off'}`}
                        />
                    </View>

                    <View style={styles.settingRow}>
                        <View style={styles.settingInfo}>
                            <Text style={styles.settingLabel}>Language</Text>
                            <Text style={styles.settingHint}>
                                {langInfo?.flag} {langInfo?.name || defaultLang} — messages will be translated to this language
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Info */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle} accessibilityRole="header">About</Text>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Protocol</Text>
                        <Text style={styles.infoValue}>
                            {chatClient.isCryptoEnabled() ? 'Matrix (E2E encrypted)' : 'Matrix (transit encrypted via TLS)'}
                        </Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Homeserver</Text>
                        <Text style={styles.infoValue}>{chatClient.getHomeserver()}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Translation</Text>
                        <Text style={styles.infoValue}>On-device (private)</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Encryption</Text>
                        <Text style={styles.infoValue}>
                            {chatClient.isCryptoEnabled() ? '🔒 Active' : '⚠️ Not available'}
                        </Text>
                    </View>
                </View>

                {/* Logout */}
                <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}
                    accessibilityLabel="Disconnect from chat" accessibilityRole="button"
                >
                    <Text style={styles.logoutText}>Disconnect from Chat</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    backLink: { paddingVertical: 8, minHeight: 44, justifyContent: 'center' },
    backText: { fontSize: 15, color: colors.accent, fontWeight: '600' },

    // ─── Welcome CTA (not logged in) ───────────────────────────
    welcomeSection: {
        alignItems: 'center',
        marginTop: 40,
        marginBottom: 32,
    },
    welcomeEmoji: { fontSize: 64, marginBottom: 16 },
    welcomeTitle: {
        fontSize: 28,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: 10,
    },
    welcomeSubtitle: {
        fontSize: 15,
        color: colors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 28,
    },
    featureChips: {
        gap: 10,
        marginBottom: 28,
        alignItems: 'center',
    },
    chip: {
        backgroundColor: colors.surface,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
    },
    chipText: {
        fontSize: 14,
        color: colors.textPrimary,
        fontWeight: '500',
    },
    getStartedButton: {
        width: '100%',
        backgroundColor: colors.accent,
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
        minHeight: 54,
        justifyContent: 'center',
    },
    getStartedText: {
        fontSize: 17,
        fontWeight: '700',
        color: colors.background,
    },

    // ─── Advanced Link ──────────────────────────────────────────
    advancedLink: {
        alignItems: 'center',
        paddingVertical: 12,
        minHeight: 44,
        justifyContent: 'center',
    },
    advancedLinkText: {
        fontSize: 13,
        color: colors.textTertiary,
    },
    advancedSection: {
        marginTop: 8,
        padding: 16,
        backgroundColor: colors.surface,
        borderRadius: 14,
    },
    advancedHeader: { marginBottom: 12 },
    advancedTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 4,
    },
    advancedHint: {
        fontSize: 12,
        color: colors.textTertiary,
        lineHeight: 17,
    },
    hideAdvanced: {
        alignItems: 'center',
        paddingVertical: 10,
        marginTop: 8,
        minHeight: 44,
        justifyContent: 'center',
    },
    hideAdvancedText: {
        fontSize: 13,
        color: colors.textTertiary,
    },

    // ─── Auth Form (inside Advanced) ────────────────────────────
    form: { marginBottom: 8 },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textSecondary,
        marginBottom: 6,
        marginTop: 14,
    },
    input: {
        backgroundColor: colors.background,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        color: colors.textPrimary,
        borderWidth: 1,
        borderColor: colors.borderLight,
        minHeight: 48,
    },
    authButton: {
        backgroundColor: colors.accent,
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 24,
        minHeight: 52,
        justifyContent: 'center',
    },
    authButtonDisabled: { opacity: 0.6 },
    authButtonText: { fontSize: 16, fontWeight: '700', color: colors.background },

    errorBox: {
        backgroundColor: 'rgba(239,68,68,0.15)',
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
    },
    errorText: { color: colors.stateError, fontSize: 14, textAlign: 'center' },

    switchAuth: { alignItems: 'center', paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
    switchText: { fontSize: 14, color: colors.textSecondary },
    switchAccent: { color: colors.accent, fontWeight: '600' },

    // ─── Profile (logged in) ────────────────────────────────────
    profileHeader: { alignItems: 'center', marginVertical: 28 },
    avatarLarge: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: colors.accentTransparent,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    avatarLargeText: { fontSize: 32, fontWeight: '700', color: colors.accent },
    profileName: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
    profileServer: { fontSize: 13, color: colors.textTertiary },
    cryptoBadge: { fontSize: 12, color: '#22c55e', fontWeight: '600', marginTop: 8 },

    // Sections
    section: {
        marginBottom: 24,
        backgroundColor: colors.surface,
        borderRadius: 14,
        padding: 16,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textSecondary,
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        minHeight: 44,
    },
    settingInfo: { flex: 1, marginRight: 12 },
    settingLabel: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    settingHint: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },

    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center', // VQ: vertical center for consistent layout
        paddingVertical: 10,
        minHeight: 44, // VQ: iOS 44pt minimum tap target
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    infoLabel: { fontSize: 14, color: colors.textSecondary },
    infoValue: { fontSize: 14, color: colors.textPrimary, fontWeight: '500' },

    logoutButton: {
        backgroundColor: 'rgba(239,68,68,0.15)',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 8,
        minHeight: 48,
        justifyContent: 'center',
    },
    logoutText: { fontSize: 15, fontWeight: '600', color: colors.stateError },
});
