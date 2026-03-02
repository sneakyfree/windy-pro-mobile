/**
 * 🧬 RP-4.5 — Clone Dashboard Screen
 * Shows voice clone progress with milestones and quality breakdown
 */
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius } from '@/theme';
import { cloneTracker, CloneProgress } from '@/services/clone-tracker';
import { feedbackService } from '@/services/feedback';

export default function CloneDashboardScreen() {
    const router = useRouter();
    const [progress, setProgress] = useState<CloneProgress | null>(null);

    useEffect(() => {
        const data = cloneTracker.getProgress();
        setProgress(data);
    }, []);

    if (!progress) {
        return <View style={styles.container}><Text style={styles.loading}>Loading...</Text></View>;
    }

    const readinessAngle = (progress.cloneReadiness / 100) * 360;

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backBtn}>
                    <Text style={styles.backText}>← Back</Text>
                </Pressable>
                <Text style={styles.title}>Voice Clone</Text>
            </View>

            {/* Progress Circle */}
            <View style={styles.circleContainer}>
                <View style={styles.circleOuter}>
                    <View style={styles.circleInner}>
                        <Text style={styles.circlePercent}>
                            {Math.round(progress.cloneReadiness)}%
                        </Text>
                        <Text style={styles.circleLabel}>Ready</Text>
                    </View>
                </View>
                <Text style={styles.hoursText}>
                    {progress.totalHours.toFixed(1)} of 10 hours
                </Text>
                {progress.estimatedTimeToReady > 0 && (
                    <Text style={styles.estimateText}>
                        ~{progress.estimatedTimeToReady.toFixed(1)} hours remaining
                    </Text>
                )}
            </View>

            {/* Milestones */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Milestones</Text>
                <View style={styles.milestonesRow}>
                    {progress.milestones.map((m) => (
                        <View
                            key={m.threshold}
                            style={[styles.milestone, m.reached && styles.milestoneReached]}
                        >
                            <Text style={styles.milestoneEmoji}>
                                {m.reached ? '🏆' : '🔒'}
                            </Text>
                            <Text style={[styles.milestoneLabel, m.reached && styles.milestoneLabelReached]}>
                                {m.label}
                            </Text>
                            <Text style={styles.milestoneTime}>
                                {m.threshold}h
                            </Text>
                        </View>
                    ))}
                </View>
            </View>

            {/* Quality Breakdown */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Quality Breakdown</Text>
                <View style={styles.qualityCard}>
                    <QualityRow label="Excellent" hours={progress.qualityDistribution.excellent} color={colors.qualityExcellent} total={progress.totalHours} />
                    <QualityRow label="Good" hours={progress.qualityDistribution.good} color={colors.qualityGood} total={progress.totalHours} />
                    <QualityRow label="Fair" hours={progress.qualityDistribution.fair} color={colors.qualityFair} total={progress.totalHours} />
                    <QualityRow label="Poor" hours={progress.qualityDistribution.poor} color={colors.qualityPoor} total={progress.totalHours} />
                </View>
                <Text style={styles.qualityNote}>
                    Poor-quality recordings don't count toward clone progress.
                    Record in quiet environments for best results.
                </Text>
            </View>

            {/* Start Clone CTA */}
            {progress.cloneReadiness >= 100 && (
                <View style={styles.section}>
                    <Pressable
                        style={styles.cloneCta}
                        onPress={async () => {
                            await feedbackService.success();
                            Alert.alert(
                                '🚀 Voice Clone Ready!',
                                'Your voice clone data is ready for processing. This feature will be available in a future update.',
                                [{ text: 'OK' }]
                            );
                        }}
                    >
                        <Text style={styles.cloneCtaEmoji}>🚀</Text>
                        <Text style={styles.cloneCtaText}>Start Voice Clone</Text>
                    </Pressable>
                </View>
            )}

            {/* What's a Voice Clone? */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>What's a Voice Clone?</Text>
                <View style={styles.infoCard}>
                    <Text style={styles.infoText}>
                        Once you reach 10 hours of high-quality speech, your data can be used to
                        create an AI voice clone that sounds exactly like you. Your recordings are
                        processed on-device and never shared without your explicit permission.
                    </Text>
                    <Text style={styles.infoText}>
                        {'\n'}💡 Tip: Just keep using Windy Pro normally — reading emails, writing notes,
                        translating conversations. Your clone builds itself in the background!
                    </Text>
                </View>
            </View>
        </ScrollView>
    );
}

function QualityRow({ label, hours, color, total }: {
    label: string; hours: number; color: string; total: number;
}) {
    const pct = total > 0 ? (hours / Math.max(total, 0.01)) * 100 : 0;
    return (
        <View style={qStyles.row}>
            <View style={[qStyles.dot, { backgroundColor: color }]} />
            <Text style={qStyles.label}>{label}</Text>
            <View style={qStyles.barContainer}>
                <View style={[qStyles.bar, { width: `${Math.min(100, pct)}%`, backgroundColor: color }]} />
            </View>
            <Text style={qStyles.hours}>{hours.toFixed(1)}h</Text>
        </View>
    );
}

const qStyles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
    dot: { width: 10, height: 10, borderRadius: 5 },
    label: { width: 70, fontSize: 13, color: colors.textSecondary },
    barContainer: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceLight, overflow: 'hidden' },
    bar: { height: '100%', borderRadius: 4 },
    hours: { width: 40, fontSize: 12, color: colors.textTertiary, textAlign: 'right', fontVariant: ['tabular-nums'] },
});

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.screenPadding, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
    loading: { color: colors.textSecondary, textAlign: 'center', marginTop: 100 },

    header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
    backBtn: { marginRight: spacing.md },
    backText: { fontSize: 16, color: colors.accent },
    title: { fontSize: 20, fontWeight: '600', color: colors.textPrimary },

    circleContainer: { alignItems: 'center', marginBottom: spacing.xl },
    circleOuter: {
        width: 160, height: 160, borderRadius: 80, borderWidth: 8,
        borderColor: colors.accent, alignItems: 'center', justifyContent: 'center',
        marginBottom: spacing.md,
    },
    circleInner: { alignItems: 'center' },
    circlePercent: { fontSize: 36, fontWeight: '700', color: colors.textPrimary },
    circleLabel: { fontSize: 14, color: colors.textSecondary },
    hoursText: { fontSize: 18, fontWeight: '500', color: colors.textPrimary },
    estimateText: { fontSize: 14, color: colors.textTertiary, marginTop: spacing.xs },

    section: { marginBottom: spacing.xl },
    sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm },

    milestonesRow: { flexDirection: 'row', gap: spacing.sm },
    milestone: {
        flex: 1, alignItems: 'center', backgroundColor: colors.surface,
        borderRadius: borderRadius.md, paddingVertical: spacing.md, gap: spacing.xs,
        borderWidth: 1, borderColor: colors.borderLight,
    },
    milestoneReached: { borderColor: colors.accent, backgroundColor: colors.accentTransparent },
    milestoneEmoji: { fontSize: 24 },
    milestoneLabel: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
    milestoneLabelReached: { color: colors.accent },
    milestoneTime: { fontSize: 12, color: colors.textTertiary },

    qualityCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md },
    qualityNote: { fontSize: 13, color: colors.textTertiary, marginTop: spacing.sm, lineHeight: 18 },

    infoCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md },
    infoText: { fontSize: 14, color: colors.textSecondary, lineHeight: 22 },

    cloneCta: {
        backgroundColor: colors.accent, borderRadius: borderRadius.lg,
        paddingVertical: spacing.md, flexDirection: 'row',
        alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    },
    cloneCtaEmoji: { fontSize: 24 },
    cloneCtaText: { fontSize: 18, fontWeight: '700', color: colors.background },
});
