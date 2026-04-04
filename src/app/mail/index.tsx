/**
 * Windy Mail Screen
 * Opens the Windy Mail webmail interface in an in-app browser.
 * Passes JWT token for auto-authentication.
 */
import { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { colors, spacing, borderRadius } from '@/theme';
import { typography } from '@/theme/typography';
import { cloudApi } from '@/services/cloudApi';
import { WINDY_MAIL_URL } from '@/config/api';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

export default function WindyMailScreen() {
    const router = useRouter();

    useEffect(() => {
        openMailInBrowser();
    }, []);

    const openMailInBrowser = async () => {
        const token = cloudApi.getToken();
        const mailUrl = token
            ? `${WINDY_MAIL_URL}?token=${encodeURIComponent(token)}`
            : WINDY_MAIL_URL;

        try {
            // Try expo-web-browser for in-app browser experience
            const WebBrowser = require('expo-web-browser');
            await WebBrowser.openBrowserAsync(mailUrl, {
                presentationStyle: WebBrowser.WebBrowserPresentationStyle?.FULL_SCREEN,
                controlsColor: '#a3e635',
                toolbarColor: '#0f172a',
            });
        } catch {
            // Fallback to system browser
            await Linking.openURL(mailUrl).catch(() => {});
        }
    };

    return (
        <ScreenErrorBoundary screenName="WindyMail">
            <SafeAreaView style={styles.container} edges={['top']}>
                <View style={styles.content}>
                    <Text style={styles.emoji}>📧</Text>
                    <Text style={styles.title}>Windy Mail</Text>
                    <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: 16 }} />
                    <Text style={styles.subtitle}>Opening your inbox...</Text>

                    <Pressable style={styles.retryBtn} onPress={openMailInBrowser}>
                        <Text style={styles.retryText}>Open Inbox</Text>
                    </Pressable>

                    <Pressable style={styles.backBtn} onPress={() => router.back()}>
                        <Text style={styles.backText}>Back to Settings</Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        </ScreenErrorBoundary>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
    emoji: { fontSize: 64, marginBottom: 16 },
    title: { ...typography.h1, color: colors.textPrimary, marginBottom: 8 },
    subtitle: { ...typography.body, color: colors.textTertiary, marginTop: 12 },
    retryBtn: {
        backgroundColor: colors.accent, paddingHorizontal: 24, paddingVertical: 12,
        borderRadius: borderRadius.md, marginTop: 32,
    },
    retryText: { ...typography.button, color: colors.background },
    backBtn: { paddingHorizontal: 24, paddingVertical: 12, marginTop: 16 },
    backText: { ...typography.body, color: colors.textSecondary },
});
