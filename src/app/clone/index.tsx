/**
 * 🧬 M9 — Clone Dashboard Screen
 * Voice clone progress with milestones, quality breakdown, tips, and stats
 */
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert, Animated } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius } from '@/theme';
import { cloneTracker, CloneProgress } from '@/services/clone-tracker';
import { feedbackService } from '@/services/feedback';

export default function CloneDashboardScreen() {
    const router = useRouter();
    const [progress, setProgress] = useState<CloneProgress | null>(null);
    const [loading, setLoading] = useState(true);
    const progressAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        (async () => {
            setLoading(true);
            const data = await cloneTracker.recalculate();
            setProgress(data);
            setLoading(false);

            // Animate progress ring
            Animated.timing(progressAnim, {
                toValue: data.cloneReadiness,
                duration: 1200,
                useNativeDriver: false,
            }).start();
        })();
    }, []);

    if (loading || !progress) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainer}>
                    <Text style={styles.loadingEmoji}>🧬</Text>
                    <Text style={styles.loadingText}>Analyzing voice data...</Text>
                </View>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backBtn}>
                    <Text style={styles.backText}>← Back</Text>
                </Pressable>
                <Text style={styles.title}>Voice Clone</Text>
                <View style={styles.headerRight}>
                    <Text style={styles.headerStat}>{progress.sessionsCount} sessions</Text>
                </View>
            </View>

            {/* Progress Ring */}
            <View style={styles.circleContainer}>
                <View style={[
                    styles.circleOuter,
                    progress.cloneReadiness >= 100 && styles.circleOuterReady,
                ]}>
                    <View style={styles.circleInner}>
                        <Text style={[
                            styles.circlePercent,
                            progress.cloneReadiness >= 100 && styles.circlePercentReady,
                        ]}>
                            {Math.round(progress.cloneReadiness)}%
                        </Text>
                        <Text style={styles.circleLabel}>
                            {progress.cloneReadiness >= 100 ? '🚀 Ready!' : 'Clone Readiness'}
                        </Text>
                    </View>
                </View>

                {/* Hours stats */}
                <View style={styles.hoursRow}>
                    <View style={styles.hoursStat}>
                        <Text style={styles.hoursValue}>{progress.weightedHours.toFixed(1)}h</Text>
                        <Text style={styles.hoursLabel}>Weighted</Text>
                    </View>
                    <View style={styles.hoursDivider} />
                    <View style={styles.hoursStat}>
                        <Text style={styles.hoursValue}>{progress.totalHours.toFixed(1)}h</Text>
                        <Text style={styles.hoursLabel}>Total</Text>
                    </View>
                    <View style={styles.hoursDivider} />
                    <View style={styles.hoursStat}>
                        <Text style={styles.hoursValue}>{progress.averageQuality}</Text>
                        <Text style={styles.hoursLabel}>Avg Quality</Text>
                    </View>
                </View>

                {progress.estimatedTimeToReady > 0 && (
                    <Text style={styles.estimateText}>
                        ~{progress.estimatedTimeToReady.toFixed(1)} weighted hours remaining
                    </Text>
                )}
            </View>

            {/* Milestones */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Milestones</Text>
                <View style={styles.milestonesRow}>
                    {progress.milestones.map((m) => (
                        <Pressable
                            key={m.threshold}
                            style={[styles.milestone, m.reached && styles.milestoneReached]}
                            onPress={() => {
                                if (m.reached && m.reachedAt) {
                                    Alert.alert(
                                        `${m.emoji} ${m.label}`,
                                        `Reached on ${new Date(m.reachedAt).toLocaleDateString()}`
                                    );
                                }
                            }}
                        >
                            <Text style={styles.milestoneEmoji}>
                                {m.reached ? m.emoji : '🔒'}
                            </Text>
                            <Text style={[styles.milestoneLabel, m.reached && styles.milestoneLabelReached]}>
                                {m.label}
                            </Text>
                            <Text style={styles.milestoneTime}>
                                {m.threshold}h
                            </Text>
                        </Pressable>
                    ))}
                </View>
            </View>

            {/* Quality Breakdown */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Quality Breakdown</Text>
                <View style={styles.qualityCard}>
                    <QualityRow label="Excellent" emoji="🟢" hours={progress.qualityDistribution.excellent} color={colors.qualityExcellent} total={progress.totalHours} weight="1.0×" />
                    <QualityRow label="Good" emoji="🔵" hours={progress.qualityDistribution.good} color={colors.qualityGood} total={progress.totalHours} weight="0.8×" />
                    <QualityRow label="Fair" emoji="🟡" hours={progress.qualityDistribution.fair} color={colors.qualityFair} total={progress.totalHours} weight="0.5×" />
                    <QualityRow label="Poor" emoji="🔴" hours={progress.qualityDistribution.poor} color={colors.qualityPoor} total={progress.totalHours} weight="0.0×" />
                </View>
            </View>

            {/* Tips */}
            {progress.tips.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Tips</Text>
                    <View style={styles.tipsCard}>
                        {progress.tips.map((tip, i) => (
                            <Text key={`tip-${i}`} style={styles.tipText}>{tip}</Text>
                        ))}
                    </View>
                </View>
            )}

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

            {/* Info */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>How It Works</Text>
                <View style={styles.infoCard}>
                    <View style={styles.infoStep}>
                        <Text style={styles.infoStepEmoji}>🎙️</Text>
                        <View style={styles.infoStepContent}>
                            <Text style={styles.infoStepTitle}>Record Naturally</Text>
                            <Text style={styles.infoText}>
                                Use Windy Pro as you normally would — transcribe, translate, take notes.
                            </Text>
                        </View>
                    </View>
                    <View style={styles.infoStep}>
                        <Text style={styles.infoStepEmoji}>🧬</Text>
                        <View style={styles.infoStepContent}>
                            <Text style={styles.infoStepTitle}>Data Accumulates</Text>
                            <Text style={styles.infoText}>
                                Each session silently contributes quality-weighted hours toward your clone.
                            </Text>
                        </View>
                    </View>
                    <View style={styles.infoStep}>
                        <Text style={styles.infoStepEmoji}>🚀</Text>
                        <View style={styles.infoStepContent}>
                            <Text style={styles.infoStepTitle}>Clone Ready at 10h</Text>
                            <Text style={styles.infoText}>
                                At 10 weighted hours, your data can create an AI voice that sounds like you.
                            </Text>
                        </View>
                    </View>
                    <View style={styles.infoStep}>
                        <Text style={styles.infoStepEmoji}>🔒</Text>
                        <View style={styles.infoStepContent}>
                            <Text style={styles.infoStepTitle}>Privacy First</Text>
                            <Text style={styles.infoText}>
                                Recordings are processed locally. Never shared without your permission.
                            </Text>
                        </View>
                    </View>
                </View>
            </View>
        </ScrollView>
    );
}

function QualityRow({ label, emoji, hours, color, total, weight }: {
    label: string; emoji: string; hours: number; color: string; total: number; weight: string;
}) {
    const pct = total > 0 ? (hours / Math.max(total, 0.01)) * 100 : 0;
    return (
        <View style={qStyles.row}>
            <Text style={qStyles.emoji}>{emoji}</Text>
            <Text style={qStyles.label}>{label}</Text>
            <View style={qStyles.barContainer}>
                <View style={[qStyles.bar, { width: `${Math.min(100, pct)}%`, backgroundColor: color }]} />
            </View>
            <Text style={qStyles.hours}>{hours.toFixed(1)}h</Text>
            <Text style={qStyles.weight}>{weight}</Text>
        </View>
    );
}

const qStyles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
    emoji: { fontSize: 12 },
    label: { width: 60, fontSize: 12, color: colors.textSecondary },
    barContainer: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceLight, overflow: 'hidden' },
    bar: { height: '100%', borderRadius: 4 },
    hours: { width: 36, fontSize: 11, color: colors.textTertiary, textAlign: 'right', fontVariant: ['tabular-nums'] },
    weight: { width: 30, fontSize: 10, color: colors.textTertiary, textAlign: 'right' },
});

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.screenPadding, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 40 },

    // Loading
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingEmoji: { fontSize: 48, marginBottom: spacing.md },
    loadingText: { color: colors.textSecondary, fontSize: 16 },

    // Header
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
    backBtn: { marginRight: spacing.md },
    backText: { fontSize: 16, color: colors.accent },
    title: { fontSize: 20, fontWeight: '600', color: colors.textPrimary, flex: 1 },
    headerRight: {},
    headerStat: { fontSize: 13, color: colors.textTertiary },

    // Progress Ring
    circleContainer: { alignItems: 'center', marginBottom: spacing.xl },
    circleOuter: {
        width: 160, height: 160, borderRadius: 80, borderWidth: 8,
        borderColor: colors.accent, alignItems: 'center', justifyContent: 'center',
        marginBottom: spacing.md,
    },
    circleOuterReady: { borderColor: '#10B981', borderWidth: 10 },
    circleInner: { alignItems: 'center' },
    circlePercent: { fontSize: 36, fontWeight: '700', color: colors.textPrimary },
    circlePercentReady: { color: '#10B981' },
    circleLabel: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },

    hoursRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
    hoursStat: { alignItems: 'center' },
    hoursValue: { fontSize: 18, fontWeight: '600', color: colors.textPrimary },
    hoursLabel: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
    hoursDivider: { width: 1, height: 24, backgroundColor: colors.borderLight },
    estimateText: { fontSize: 13, color: colors.textTertiary },

    // Sections
    section: { marginBottom: spacing.xl },
    sectionTitle: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm },

    // Milestones
    milestonesRow: { flexDirection: 'row', gap: spacing.xs },
    milestone: {
        flex: 1, alignItems: 'center', backgroundColor: colors.surface,
        borderRadius: borderRadius.md, paddingVertical: spacing.md, gap: 4,
        borderWidth: 1, borderColor: colors.borderLight,
    },
    milestoneReached: { borderColor: colors.accent, backgroundColor: colors.accentTransparent },
    milestoneEmoji: { fontSize: 22 },
    milestoneLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    milestoneLabelReached: { color: colors.accent },
    milestoneTime: { fontSize: 11, color: colors.textTertiary },

    // Quality
    qualityCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md },

    // Tips
    tipsCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.sm },
    tipText: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },

    // CTA
    cloneCta: {
        backgroundColor: '#10B981', borderRadius: borderRadius.lg,
        paddingVertical: spacing.md, flexDirection: 'row',
        alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    },
    cloneCtaEmoji: { fontSize: 24 },
    cloneCtaText: { fontSize: 18, fontWeight: '700', color: '#fff' },

    // Info
    infoCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.md },
    infoStep: { flexDirection: 'row', gap: spacing.sm },
    infoStepEmoji: { fontSize: 22, width: 30, textAlign: 'center' },
    infoStepContent: { flex: 1 },
    infoStepTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
    infoText: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
});
