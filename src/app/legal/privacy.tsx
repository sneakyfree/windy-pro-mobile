/**
 * 🧬 RP-8.3 — Privacy Policy Screen
 */
import { ScrollView, Text, StyleSheet } from 'react-native';
import { colors, spacing, fontSizes } from '@/theme';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

export default function PrivacyPolicyScreen() {
    return (
        <ScreenErrorBoundary screenName="Privacy Policy">
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <Text style={styles.title}>Privacy Policy</Text>
            <Text style={styles.updated}>Last updated: March 1, 2026</Text>

            <Text style={styles.heading}>Audio Data</Text>
            <Text style={styles.body}>
                Windy Pro processes your voice recordings on your device by default.
                Audio data is never sent to our servers unless you explicitly enable
                cloud transcription or cloud sync. When you use cloud transcription,
                audio is streamed to our servers, processed in real-time, and
                immediately discarded — we do not store your audio on our servers.
            </Text>

            <Text style={styles.heading}>Cloud Sync</Text>
            <Text style={styles.body}>
                If you enable Cloud Sync, your recordings are uploaded to your
                designated storage endpoint (Windy Cloud or your own S3-compatible
                server). You control where your data lives. You can disable Cloud
                Sync at any time, and data already synced remains on your storage.
            </Text>

            <Text style={styles.heading}>Voice Clone Data</Text>
            <Text style={styles.body}>
                Clone data accumulates locally on your device. It is never transmitted
                without your explicit action. You can delete all clone data at any
                time from Settings → Voice Clone → Reset Progress.
            </Text>

            <Text style={styles.heading}>Analytics</Text>
            <Text style={styles.body}>
                Windy Pro does not use third-party analytics, tracking pixels, or
                advertising frameworks. We collect no personal data, no usage
                statistics, no nothing. Your device, your data, your business.
            </Text>

            <Text style={styles.heading}>Contact</Text>
            <Text style={styles.body}>
                Questions? Email privacy@windyword.ai
            </Text>
        </ScrollView>
        </ScreenErrorBoundary>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.screenPadding, paddingBottom: spacing.xxl },
    title: { fontSize: fontSizes['2xl'], fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
    updated: { fontSize: 13, color: colors.textTertiary, marginBottom: spacing.xl },
    heading: { fontSize: fontSizes.lg, fontWeight: '600', color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.sm },
    body: { fontSize: 15, lineHeight: 24, color: colors.textSecondary },
});
