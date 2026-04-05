/**
 * 🧬 RP-8.3 — Terms of Service Screen
 */
import { ScrollView, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '@/theme';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

export default function TermsOfServiceScreen() {
    return (
        <ScreenErrorBoundary screenName="Terms of Service">
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <Text style={styles.title}>Terms of Service</Text>
            <Text style={styles.updated}>Last updated: March 1, 2026</Text>

            <Text style={styles.heading}>License</Text>
            <Text style={styles.body}>
                Windy Pro is licensed, not sold. Each license key grants you a
                perpetual, non-transferable right to use the software on up to 5
                personal devices. One-time purchase, no subscription required.
            </Text>

            <Text style={styles.heading}>Acceptable Use</Text>
            <Text style={styles.body}>
                You may use Windy Pro for any lawful purpose. You may not reverse
                engineer, redistribute, or sublicense the software. Voice engine
                models included with Windy Pro are subject to their respective
                open-source licenses (open-source voice engine: MIT License).
            </Text>

            <Text style={styles.heading}>Cloud Services</Text>
            <Text style={styles.body}>
                Cloud transcription and translation services require an active
                internet connection and a valid license. We reserve the right to
                rate-limit or suspend cloud access for abusive usage patterns.
                Self-hosted processing (on-device engines) always remains available.
            </Text>

            <Text style={styles.heading}>Disclaimer</Text>
            <Text style={styles.body}>
                Windy Pro is provided "as is" without warranty of any kind.
                Transcription and translation accuracy depend on audio quality,
                language, and environmental factors. We are not liable for
                inaccuracies in transcriptions or translations.
            </Text>

            <Text style={styles.heading}>Contact</Text>
            <Text style={styles.body}>
                Questions? Email legal@thewindstorm.uk
            </Text>
        </ScrollView>
        </ScreenErrorBoundary>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.screenPadding, paddingBottom: spacing.xxl },
    title: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
    updated: { fontSize: 13, color: colors.textTertiary, marginBottom: spacing.xl },
    heading: { fontSize: 18, fontWeight: '600', color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.sm },
    body: { fontSize: 15, lineHeight: 24, color: colors.textSecondary },
});
