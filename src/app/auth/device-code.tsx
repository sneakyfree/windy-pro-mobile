/**
 * Device Code Screen — OAuth2 device-authorization entry point.
 *
 * Flow:
 *   1. On mount, request a device_code from account-server and render the
 *      user_code in big monospace for the user to enter on the web.
 *   2. Tapping the Approve button opens verification_uri_complete in the
 *      browser (code auto-filled).
 *   3. In parallel, poll the token endpoint every `interval` seconds until
 *      approval, denial, or expiry.
 *   4. On success, resume any pending deep link or land on the tabs route.
 */
import { useEffect, useRef, useState } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
    Linking,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSizes } from '@/theme';
import { identityApi, type DeviceCodeStart } from '@/services/identityApi';
import { pendingDeepLink } from '@/state/pendingDeepLink';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

type Status =
    | { kind: 'initializing' }
    | { kind: 'awaitingApproval'; start: DeviceCodeStart }
    | { kind: 'expired' }
    | { kind: 'denied' }
    | { kind: 'error'; message: string };

export default function DeviceCodeScreen() {
    const [status, setStatus] = useState<Status>({ kind: 'initializing' });
    const activeRef = useRef(true);

    useEffect(() => {
        activeRef.current = true;
        beginFlow();
        return () => {
            activeRef.current = false;
            identityApi.cancelDeviceFlow();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function beginFlow(): Promise<void> {
        setStatus({ kind: 'initializing' });
        try {
            const start = await identityApi.startDeviceFlow();
            if (!activeRef.current) return;
            setStatus({ kind: 'awaitingApproval', start });
            const outcome = await identityApi.pollForToken();
            if (!activeRef.current) return;
            if (outcome.success) {
                const pending = pendingDeepLink.consume();
                if (pending) {
                    router.replace({ pathname: pending.route as any, params: pending.params });
                } else if (router.canGoBack()) {
                    router.back();
                } else {
                    router.replace('/(tabs)');
                }
                return;
            }
            if (outcome.error === 'expired') setStatus({ kind: 'expired' });
            else if (outcome.error === 'denied') setStatus({ kind: 'denied' });
            else if (outcome.error === 'cancelled') { /* component unmounting */ }
            else setStatus({ kind: 'error', message: outcome.message || 'Sign-in failed' });
        } catch (err: unknown) {
            if (!activeRef.current) return;
            setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Sign-in failed' });
        }
    }

    function openVerificationUrl(): void {
        if (status.kind !== 'awaitingApproval') return;
        const url = status.start.verification_uri_complete || status.start.verification_uri;
        Linking.openURL(url).catch(() => { /* user can copy the code instead */ });
    }

    return (
        <ScreenErrorBoundary screenName="DeviceCode">
            <SafeAreaView style={styles.container}>
                <View style={styles.content}>
                    <Text style={styles.icon}>🌬️</Text>
                    <Text style={styles.title}>Sign in with Windy</Text>

                    {status.kind === 'initializing' && (
                        <View style={styles.center}>
                            <ActivityIndicator color={colors.accent} />
                            <Text style={styles.subtitle}>Starting sign-in…</Text>
                        </View>
                    )}

                    {status.kind === 'awaitingApproval' && (
                        <>
                            <Text style={styles.subtitle}>
                                Enter this code on the web to finish signing in.
                            </Text>
                            <Text style={styles.userCode} selectable>
                                {status.start.user_code}
                            </Text>
                            <TouchableOpacity
                                style={styles.button}
                                onPress={openVerificationUrl}
                                accessibilityRole="button"
                                accessibilityLabel="Approve on the web"
                            >
                                <Text style={styles.buttonText}>Approve on windyword.ai →</Text>
                            </TouchableOpacity>
                            <View style={styles.waitingRow}>
                                <ActivityIndicator color={colors.textSecondary} />
                                <Text style={styles.waiting}>Waiting for approval…</Text>
                            </View>
                        </>
                    )}

                    {status.kind === 'expired' && (
                        <View style={styles.center}>
                            <Text style={styles.errorText}>That code expired.</Text>
                            <TouchableOpacity style={styles.button} onPress={beginFlow}>
                                <Text style={styles.buttonText}>Try again</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {status.kind === 'denied' && (
                        <View style={styles.center}>
                            <Text style={styles.errorText}>Sign-in was denied.</Text>
                            <TouchableOpacity
                                style={styles.button}
                                onPress={() => router.replace('/auth/login')}
                            >
                                <Text style={styles.buttonText}>Back</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {status.kind === 'error' && (
                        <View style={styles.center}>
                            <Text style={styles.errorText}>{status.message}</Text>
                            <TouchableOpacity style={styles.button} onPress={beginFlow}>
                                <Text style={styles.buttonText}>Try again</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <TouchableOpacity
                        style={styles.cancelLink}
                        onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
                    >
                        <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </ScreenErrorBoundary>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { flex: 1, paddingHorizontal: 28, paddingVertical: 40, justifyContent: 'center' },
    icon: { fontSize: 52, textAlign: 'center', marginBottom: 16 },
    title: {
        fontSize: 28, fontWeight: '700', color: colors.textPrimary,
        textAlign: 'center', marginBottom: 12,
    },
    subtitle: {
        fontSize: 15, color: colors.textSecondary,
        textAlign: 'center', marginTop: 12, marginBottom: 24,
    },
    userCode: {
        fontSize: 44, fontWeight: '700', letterSpacing: 6,
        color: colors.accent, textAlign: 'center',
        fontVariant: ['tabular-nums'], marginVertical: 20,
    },
    button: {
        backgroundColor: colors.accent, borderRadius: 12,
        paddingVertical: 16, paddingHorizontal: 20,
        alignItems: 'center', minHeight: 52, justifyContent: 'center',
        marginTop: 16,
    },
    buttonText: {
        fontSize: fontSizes.base, fontWeight: '700', color: colors.background,
    },
    waitingRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        marginTop: 24, gap: 10,
    },
    waiting: { fontSize: fontSizes.sm, color: colors.textSecondary },
    errorText: {
        fontSize: fontSizes.base, color: colors.stateError,
        textAlign: 'center', marginBottom: 16,
    },
    center: { alignItems: 'center' },
    cancelLink: { alignItems: 'center', paddingVertical: 16, marginTop: 24 },
    cancelText: { color: colors.textSecondary, fontSize: fontSizes.sm },
});
