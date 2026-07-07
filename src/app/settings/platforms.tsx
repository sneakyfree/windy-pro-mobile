/**
 * Connected Platforms — Hub Mode.
 *
 * Link your other chat accounts (Telegram first) to Windy Chat: once
 * connected, those conversations appear in the normal chat list with a
 * platform badge, and replies go out from your own account there.
 *
 * The connect wizard renders the hub service's generic login steps:
 * text-input steps (phone number → code → password if enabled) become
 * form fields. QR-style steps are deferred to a later release — phone
 * login covers Telegram fully.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, TextInput, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSizes } from '@/theme';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import {
    hubApi, HubApiError, PLATFORM_META,
    type HubPlatform, type LoginStep,
} from '@/services/hubPlatforms';

type WizardState =
    | { phase: 'idle' }
    | { phase: 'starting'; platform: string }
    | { phase: 'step'; platform: string; step: LoginStep; values: Record<string, string>; submitting: boolean; error?: string }
    | { phase: 'done'; platform: string; remoteName?: string };

export default function ConnectedPlatformsScreen() {
    const [platforms, setPlatforms] = useState<HubPlatform[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [wizard, setWizard] = useState<WizardState>({ phase: 'idle' });
    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
        if (mode === 'initial') setLoading(true); else setRefreshing(true);
        setLoadError(null);
        try {
            const list = await hubApi.getPlatforms();
            // Refresh live state for connected platforms (surfaces
            // "reconnect needed" after e.g. a password change).
            for (const p of list) {
                if (p.connections.length > 0) {
                    try { await hubApi.whoami(p.key); } catch { /* keep stored state */ }
                }
            }
            const fresh = await hubApi.getPlatforms();
            if (isMounted.current) setPlatforms(fresh);
        } catch (err) {
            if (!isMounted.current) return;
            if (err instanceof HubApiError && err.code === 'no_chat_account') {
                setLoadError('Connect to chat first — open the Chat tab and tap "Connect Chat", then come back.');
            } else if (err instanceof HubApiError && err.status === 401) {
                setLoadError('Sign in to your Windy account to manage connected platforms.');
            } else {
                setLoadError('Could not load platforms. Pull down to retry.');
            }
        } finally {
            if (isMounted.current) { setLoading(false); setRefreshing(false); }
        }
    }, []);

    useEffect(() => { void load('initial'); }, [load]);

    // ─── Wizard ──────────────────────────────────────────────────

    const startConnect = useCallback(async (platformKey: string) => {
        setWizard({ phase: 'starting', platform: platformKey });
        try {
            const flows = await hubApi.getLoginFlows(platformKey);
            // Phone login is fully form-based; QR needs camera timing that
            // belongs in a later release.
            const flow = flows.find(f => f.id === 'phone') || flows[0];
            if (!flow) throw new HubApiError('No sign-in method available yet', 0);
            const step = await hubApi.startLogin(platformKey, flow.id);
            handleStep(platformKey, step);
        } catch (err) {
            if (!isMounted.current) return;
            setWizard({ phase: 'idle' });
            Alert.alert('Could not start', err instanceof Error ? err.message : 'Please try again.');
        }
    }, []);

    const handleStep = (platformKey: string, step: LoginStep) => {
        if (!isMounted.current) return;
        if (step.type === 'complete') {
            setWizard({ phase: 'done', platform: platformKey, remoteName: (step as any)?.login?.remote_name || (step as any)?.login?.name });
            void load('refresh');
            return;
        }
        if (step.type === 'user_input') {
            setWizard({ phase: 'step', platform: platformKey, step, values: {}, submitting: false });
            return;
        }
        // display_and_wait (QR) — not in this release; steer to phone flow.
        setWizard({ phase: 'idle' });
        Alert.alert(
            'Use phone number sign-in',
            'QR sign-in is coming soon. Start again and sign in with your phone number instead.',
        );
    };

    const submitStep = useCallback(async () => {
        if (wizard.phase !== 'step') return;
        setWizard({ ...wizard, submitting: true, error: undefined });
        try {
            const next = await hubApi.submitStep(wizard.platform, wizard.step, wizard.values);
            handleStep(wizard.platform, next);
        } catch (err) {
            if (!isMounted.current) return;
            setWizard({
                ...wizard,
                submitting: false,
                error: err instanceof Error ? err.message : 'That didn’t work — check and try again.',
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wizard]);

    const disconnect = useCallback((platformKey: string, loginId: string, label: string) => {
        Alert.alert(
            `Disconnect ${label}?`,
            'Conversations already in Windy Chat stay; new messages stop arriving.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Disconnect',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await hubApi.logout(platformKey, loginId);
                            void load('refresh');
                        } catch {
                            Alert.alert('Could not disconnect', 'Please try again.');
                        }
                    },
                },
            ],
        );
    }, [load]);

    // ─── Render ──────────────────────────────────────────────────

    const meta = (key: string) => PLATFORM_META[key] || { label: key, color: colors.accent, emoji: '💬' };

    return (
        <ScreenErrorBoundary screenName="ConnectedPlatforms">
            <SafeAreaView style={styles.container} edges={['top']}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle} accessibilityRole="header">🔗 Connected Platforms</Text>
                </View>
                <ScrollView
                    contentContainerStyle={styles.body}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={colors.accent} />}
                >
                    <Text style={styles.intro}>
                        Bring your other chats into Windy Chat. Connected conversations show up
                        in your chat list with a platform badge — reply right from here.
                    </Text>

                    {loading ? (
                        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 40 }} />
                    ) : loadError ? (
                        <View style={styles.errorBox}>
                            <Text style={styles.errorText}>{loadError}</Text>
                        </View>
                    ) : platforms.length === 0 ? (
                        <View style={styles.errorBox}>
                            <Text style={styles.errorText}>No platforms are available to connect yet.</Text>
                        </View>
                    ) : (
                        platforms.map((p) => {
                            const m = meta(p.key);
                            const connected = p.connections.filter(c => c.state && c.state !== 'LOGGED_OUT');
                            const needsReconnect = connected.some(c => String(c.state).toUpperCase().includes('BAD_CREDENTIALS'));
                            return (
                                <View key={p.key} style={styles.platformCard}>
                                    <View style={[styles.platformIcon, { backgroundColor: `${m.color}22` }]}>
                                        <Text style={{ fontSize: 22 }}>{m.emoji}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.platformName}>{m.label}</Text>
                                        {connected.length > 0 ? (
                                            <Text style={styles.platformState}>
                                                {needsReconnect
                                                    ? '⚠️ Needs reconnecting'
                                                    : `Connected${connected[0].remote_name ? ` as ${connected[0].remote_name}` : ''}`}
                                            </Text>
                                        ) : (
                                            <Text style={styles.platformState}>Not connected</Text>
                                        )}
                                    </View>
                                    {connected.length > 0 ? (
                                        <TouchableOpacity
                                            style={styles.secondaryBtn}
                                            onPress={() => needsReconnect
                                                ? startConnect(p.key)
                                                : disconnect(p.key, connected[0].login_id, m.label)}
                                            accessibilityRole="button"
                                            accessibilityLabel={needsReconnect ? `Reconnect ${m.label}` : `Disconnect ${m.label}`}
                                        >
                                            <Text style={styles.secondaryBtnText}>{needsReconnect ? 'Reconnect' : 'Disconnect'}</Text>
                                        </TouchableOpacity>
                                    ) : (
                                        <TouchableOpacity
                                            style={[styles.connectBtn, { backgroundColor: m.color }]}
                                            onPress={() => startConnect(p.key)}
                                            disabled={wizard.phase === 'starting'}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Connect ${m.label}`}
                                        >
                                            {wizard.phase === 'starting' && wizard.platform === p.key
                                                ? <ActivityIndicator size="small" color="#fff" />
                                                : <Text style={styles.connectBtnText}>Connect</Text>}
                                        </TouchableOpacity>
                                    )}
                                </View>
                            );
                        })
                    )}

                    {/* Login wizard */}
                    {wizard.phase === 'step' && (
                        <View style={styles.wizardCard}>
                            <Text style={styles.wizardTitle}>Connect {meta(wizard.platform).label}</Text>
                            {!!wizard.step.instructions && (
                                <Text style={styles.wizardInstructions}>{wizard.step.instructions}</Text>
                            )}
                            {(wizard.step.user_input?.fields || []).map((field) => (
                                <View key={field.id} style={{ marginTop: 10 }}>
                                    <Text style={styles.fieldLabel}>{field.name || field.id}</Text>
                                    {!!field.description && <Text style={styles.fieldHint}>{field.description}</Text>}
                                    <TextInput
                                        style={styles.fieldInput}
                                        value={wizard.values[field.id] || ''}
                                        onChangeText={(v) => setWizard({ ...wizard, values: { ...wizard.values, [field.id]: v } })}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        keyboardType={field.type === 'phone_number' ? 'phone-pad'
                                            : field.type === '2fa_code' ? 'number-pad' : 'default'}
                                        secureTextEntry={field.type === 'password'}
                                        placeholder={field.type === 'phone_number' ? '+1 555 123 4567' : undefined}
                                        placeholderTextColor={colors.textTertiary}
                                        accessibilityLabel={field.name || field.id}
                                    />
                                </View>
                            ))}
                            {!!wizard.error && <Text style={styles.wizardError}>{wizard.error}</Text>}
                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                                <TouchableOpacity
                                    style={styles.secondaryBtn}
                                    onPress={() => setWizard({ phase: 'idle' })}
                                    accessibilityRole="button" accessibilityLabel="Cancel connecting"
                                >
                                    <Text style={styles.secondaryBtnText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.connectBtn, { flex: 1, backgroundColor: colors.accent }]}
                                    onPress={submitStep}
                                    disabled={wizard.submitting}
                                    accessibilityRole="button" accessibilityLabel="Continue"
                                >
                                    {wizard.submitting
                                        ? <ActivityIndicator size="small" color={colors.background} />
                                        : <Text style={[styles.connectBtnText, { color: colors.background }]}>Continue</Text>}
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {wizard.phase === 'done' && (
                        <View style={[styles.wizardCard, { borderColor: '#22c55e' }]}>
                            <Text style={styles.wizardTitle}>✅ {meta(wizard.platform).label} connected</Text>
                            <Text style={styles.wizardInstructions}>
                                {wizard.remoteName ? `Signed in as ${wizard.remoteName}. ` : ''}
                                Your conversations are syncing — they'll appear in the Chat tab within a minute.
                            </Text>
                            <TouchableOpacity
                                style={[styles.connectBtn, { backgroundColor: colors.accent, marginTop: 12 }]}
                                onPress={() => setWizard({ phase: 'idle' })}
                                accessibilityRole="button" accessibilityLabel="Done"
                            >
                                <Text style={[styles.connectBtnText, { color: colors.background }]}>Done</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </ScrollView>
            </SafeAreaView>
        </ScreenErrorBoundary>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
        paddingHorizontal: 20, paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
    body: { padding: 16, paddingBottom: 48 },
    intro: { fontSize: fontSizes.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: 16 },

    platformCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: colors.surface, borderRadius: 12,
        padding: 14, marginBottom: 10,
        borderWidth: 1, borderColor: colors.borderLight,
    },
    platformIcon: {
        width: 44, height: 44, borderRadius: 22,
        justifyContent: 'center', alignItems: 'center',
    },
    platformName: { fontSize: fontSizes.base, fontWeight: '600', color: colors.textPrimary },
    platformState: { fontSize: fontSizes.xs, color: colors.textTertiary, marginTop: 2 },

    connectBtn: {
        borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10,
        minHeight: 40, justifyContent: 'center', alignItems: 'center',
    },
    connectBtnText: { fontSize: fontSizes.sm, fontWeight: '700', color: '#fff' },
    secondaryBtn: {
        borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
        minHeight: 40, justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: colors.borderLight, backgroundColor: colors.background,
    },
    secondaryBtnText: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.textSecondary },

    wizardCard: {
        backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginTop: 8,
        borderWidth: 1, borderColor: colors.borderLight,
    },
    wizardTitle: { fontSize: fontSizes.base, fontWeight: '700', color: colors.textPrimary },
    wizardInstructions: { fontSize: fontSizes.sm, color: colors.textSecondary, marginTop: 6, lineHeight: 20 },
    wizardError: { fontSize: fontSizes.sm, color: '#ef4444', marginTop: 10 },
    fieldLabel: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.textPrimary },
    fieldHint: { fontSize: fontSizes.xs, color: colors.textTertiary, marginTop: 2 },
    fieldInput: {
        backgroundColor: colors.background, borderRadius: 10,
        paddingHorizontal: 12, paddingVertical: 10, marginTop: 6,
        fontSize: 15, color: colors.textPrimary,
        borderWidth: 1, borderColor: colors.borderLight, minHeight: 44,
    },
    errorBox: {
        backgroundColor: colors.surface, borderRadius: 12, padding: 16,
        borderWidth: 1, borderColor: colors.borderLight,
    },
    errorText: { fontSize: fontSizes.sm, color: colors.textSecondary, lineHeight: 20 },
});
