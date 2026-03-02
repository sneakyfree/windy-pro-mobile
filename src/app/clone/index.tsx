/**
 * 🧬 M9 — Premium Clone Dashboard Screen
 * Voice clone progress with milestones, quality breakdown, tips, stats,
 * training status banner, voice sample management, and Test My Clone preview.
 */
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert, Animated, Modal, TextInput } from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import { colors, spacing, borderRadius } from '@/theme';
import { cloneTracker, CloneProgress } from '@/services/clone-tracker';
import { feedbackService } from '@/services/feedback';
import { localStorageService } from '@/services/storage-local';
import type { SessionSummary } from '@/types';

// ── Training states ──
type TrainingStatus = 'collecting' | 'ready' | 'training' | 'complete';

function getTrainingStatus(readiness: number): TrainingStatus {
    if (readiness >= 100) return 'ready';
    return 'collecting';
}

const STATUS_CONFIG: Record<TrainingStatus, { label: string; emoji: string; color: string; bgColor: string }> = {
    collecting: { label: 'Collecting Voice Data', emoji: '🎙️', color: '#a3e635', bgColor: 'rgba(163, 230, 53, 0.12)' },
    ready: { label: 'Ready for Training', emoji: '🚀', color: '#10B981', bgColor: 'rgba(16, 185, 129, 0.12)' },
    training: { label: 'Training in Progress', emoji: '⚙️', color: '#eab308', bgColor: 'rgba(234, 179, 8, 0.12)' },
    complete: { label: 'Clone Complete', emoji: '✅', color: '#2dd4bf', bgColor: 'rgba(45, 212, 191, 0.12)' },
};

export default function CloneDashboardScreen() {
    const router = useRouter();
    const [progress, setProgress] = useState<CloneProgress | null>(null);
    const [loading, setLoading] = useState(true);
    const progressAnim = useRef(new Animated.Value(0)).current;
    const bannerPulse = useRef(new Animated.Value(0.7)).current;

    // Voice sample list
    const [samples, setSamples] = useState<SessionSummary[]>([]);

    // Test My Clone modal
    const [showTestModal, setShowTestModal] = useState(false);
    const [testText, setTestText] = useState('Hello, this is my cloned voice speaking.');
    const [testPlaying, setTestPlaying] = useState(false);

    useEffect(() => {
        (async () => {
            setLoading(true);
            const data = await cloneTracker.recalculate();
            setProgress(data);

            // Load recent voice samples (sessions with cloneUsable quality)
            try {
                const allSessions = await localStorageService.getSessions({ minQuality: 40 } as any);
                setSamples(allSessions.slice(0, 8));
            } catch {
                setSamples([]);
            }

            setLoading(false);

            // Animate progress ring
            Animated.timing(progressAnim, {
                toValue: data.cloneReadiness,
                duration: 1200,
                useNativeDriver: false,
            }).start();

            // Pulse the training status banner
            Animated.loop(
                Animated.sequence([
                    Animated.timing(bannerPulse, { toValue: 1, duration: 1500, useNativeDriver: true }),
                    Animated.timing(bannerPulse, { toValue: 0.7, duration: 1500, useNativeDriver: true }),
                ])
            ).start();
        })();
    }, []);

    const handleDeleteSample = useCallback(async (id: string) => {
        Alert.alert('Remove Sample', 'Remove this recording from your voice data?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await localStorageService.deleteSession(id);
                        setSamples(prev => prev.filter(s => s.id !== id));
                        await feedbackService.tap();
                    } catch (err) {
                        console.warn('[Clone] Delete failed:', err);
                    }
                },
            },
        ]);
    }, []);

    const handleTestClone = async () => {
        setTestPlaying(true);
        await feedbackService.success();
        // Simulate clone preview with a brief delay
        setTimeout(() => {
            setTestPlaying(false);
            Alert.alert(
                '🎙️ Clone Preview',
                `Your AI voice would say:\n\n"${testText}"\n\nFull clone synthesis will be available when training is complete.`
            );
        }, 2000);
    };

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

    const status = getTrainingStatus(progress.cloneReadiness);
    const statusConfig = STATUS_CONFIG[status];

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

            {/* Training Status Banner */}
            <Animated.View style={[styles.statusBanner, { backgroundColor: statusConfig.bgColor, opacity: bannerPulse }]}>
                <Text style={styles.statusEmoji}>{statusConfig.emoji}</Text>
                <View style={styles.statusContent}>
                    <Text style={[styles.statusLabel, { color: statusConfig.color }]}>
                        {statusConfig.label}
                    </Text>
                    <Text style={styles.statusSubtext}>
                        {status === 'collecting'
                            ? `${Math.round(progress.cloneReadiness)}% complete — ${progress.estimatedTimeToReady.toFixed(1)}h remaining`
                            : status === 'ready'
                                ? 'Sufficient voice data collected for training'
                                : 'Processing your voice model...'}
                    </Text>
                </View>
            </Animated.View>

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
            </View>

            {/* Quality Factor Breakdown */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Quality Score</Text>
                <View style={styles.qualityCard}>
                    <View style={styles.qualityScoreRow}>
                        <Text style={styles.qualityScoreBig}>
                            {progress.averageQuality}
                        </Text>
                        <Text style={styles.qualityScoreMax}>/100</Text>
                    </View>
                    <QualityRow label="Excellent" emoji="🟢" hours={progress.qualityDistribution.excellent} color={colors.qualityExcellent} total={progress.totalHours} weight="1.0×" />
                    <QualityRow label="Good" emoji="🔵" hours={progress.qualityDistribution.good} color={colors.qualityGood} total={progress.totalHours} weight="0.8×" />
                    <QualityRow label="Fair" emoji="🟡" hours={progress.qualityDistribution.fair} color={colors.qualityFair} total={progress.totalHours} weight="0.5×" />
                    <QualityRow label="Poor" emoji="🔴" hours={progress.qualityDistribution.poor} color={colors.qualityPoor} total={progress.totalHours} weight="0.0×" />
                </View>
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

            {/* Voice Samples */}
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Voice Samples</Text>
                    <Text style={styles.sectionCount}>{samples.length} recordings</Text>
                </View>
                {samples.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyEmoji}>🎤</Text>
                        <Text style={styles.emptyText}>
                            No voice samples yet. Start recording to build your clone data.
                        </Text>
                    </View>
                ) : (
                    <View style={styles.samplesCard}>
                        {samples.map((sample) => (
                            <View key={sample.id} style={styles.sampleRow}>
                                <View style={styles.sampleQualityBadge}>
                                    <Text style={styles.sampleQualityEmoji}>
                                        {sample.quality.label === 'excellent' ? '🟢'
                                            : sample.quality.label === 'good' ? '🔵'
                                                : sample.quality.label === 'fair' ? '🟡' : '🔴'}
                                    </Text>
                                </View>
                                <View style={styles.sampleInfo}>
                                    <Text style={styles.samplePreview} numberOfLines={1}>
                                        {sample.previewText || 'No transcript'}
                                    </Text>
                                    <Text style={styles.sampleMeta}>
                                        {Math.round(sample.duration)}s · {sample.quality.score}/100 · {new Date(sample.createdAt).toLocaleDateString()}
                                    </Text>
                                </View>
                                <Pressable
                                    style={styles.sampleDeleteBtn}
                                    onPress={() => handleDeleteSample(sample.id)}
                                >
                                    <Text style={styles.sampleDeleteText}>✕</Text>
                                </Pressable>
                            </View>
                        ))}
                    </View>
                )}
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

            {/* Test My Clone / Start Clone CTA */}
            <View style={styles.section}>
                <Pressable
                    style={[
                        styles.cloneCta,
                        progress.cloneReadiness < 100 && styles.cloneCtaDisabled,
                    ]}
                    onPress={async () => {
                        if (progress.cloneReadiness < 100) {
                            Alert.alert(
                                '🔒 More Data Needed',
                                `Your clone is ${Math.round(progress.cloneReadiness)}% ready. Keep recording to unlock this feature.`
                            );
                            return;
                        }
                        setShowTestModal(true);
                        await feedbackService.success();
                    }}
                >
                    <Text style={styles.cloneCtaEmoji}>🎙️</Text>
                    <View style={styles.cloneCtaContent}>
                        <Text style={styles.cloneCtaText}>Test My Clone</Text>
                        <Text style={styles.cloneCtaSubtext}>
                            {progress.cloneReadiness >= 100
                                ? 'Preview how your AI voice sounds'
                                : `Unlocks at 100% (${Math.round(progress.cloneReadiness)}% now)`}
                        </Text>
                    </View>
                </Pressable>
            </View>

            {/* How It Works */}
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

            {/* Test My Clone Modal */}
            <Modal
                visible={showTestModal}
                animationType="slide"
                transparent
                onRequestClose={() => setShowTestModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>🎙️ Test My Clone</Text>
                            <Pressable onPress={() => setShowTestModal(false)}>
                                <Text style={styles.modalClose}>✕</Text>
                            </Pressable>
                        </View>
                        <Text style={styles.modalSubtext}>
                            Type text below and hear how your AI clone voice would sound.
                        </Text>
                        <TextInput
                            style={styles.modalInput}
                            value={testText}
                            onChangeText={setTestText}
                            multiline
                            numberOfLines={3}
                            placeholder="Enter text to speak..."
                            placeholderTextColor={colors.textTertiary}
                        />
                        <Pressable
                            style={[styles.modalPlayBtn, testPlaying && styles.modalPlayBtnActive]}
                            onPress={handleTestClone}
                            disabled={testPlaying}
                        >
                            <Text style={styles.modalPlayEmoji}>
                                {testPlaying ? '⏳' : '▶️'}
                            </Text>
                            <Text style={styles.modalPlayText}>
                                {testPlaying ? 'Generating...' : 'Play Clone Preview'}
                            </Text>
                        </Pressable>
                        <Text style={styles.modalDisclaimer}>
                            Preview uses text-to-speech simulation. Full clone synthesis coming soon.
                        </Text>
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );
}

// ── Quality Row Component ──
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
    content: { padding: spacing.screenPadding, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 60 },

    // Loading
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingEmoji: { fontSize: 48, marginBottom: spacing.md },
    loadingText: { color: colors.textSecondary, fontSize: 16 },

    // Header
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
    backBtn: { marginRight: spacing.md },
    backText: { fontSize: 16, color: colors.accent },
    title: { fontSize: 20, fontWeight: '600', color: colors.textPrimary, flex: 1 },
    headerRight: {},
    headerStat: { fontSize: 13, color: colors.textTertiary },

    // Training Status Banner
    statusBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(163, 230, 53, 0.12)',
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginBottom: spacing.lg,
        gap: spacing.sm,
        borderWidth: 1,
        borderColor: 'rgba(163, 230, 53, 0.2)',
    },
    statusEmoji: { fontSize: 28 },
    statusContent: { flex: 1 },
    statusLabel: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
    statusSubtext: { fontSize: 12, color: colors.textSecondary },

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

    // Sections
    section: { marginBottom: spacing.xl },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
    sectionTitle: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm },
    sectionCount: { fontSize: 12, color: colors.textTertiary },

    // Quality Score
    qualityCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md },
    qualityScoreRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginBottom: spacing.md },
    qualityScoreBig: { fontSize: 48, fontWeight: '700', color: colors.accent },
    qualityScoreMax: { fontSize: 20, fontWeight: '400', color: colors.textTertiary, marginLeft: 4 },

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

    // Voice Samples
    samplesCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, overflow: 'hidden' },
    sampleRow: {
        flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
        paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md,
        borderBottomWidth: 1, borderBottomColor: colors.borderLight,
    },
    sampleQualityBadge: { width: 28, alignItems: 'center' },
    sampleQualityEmoji: { fontSize: 14 },
    sampleInfo: { flex: 1 },
    samplePreview: { fontSize: 13, color: colors.textPrimary, marginBottom: 2 },
    sampleMeta: { fontSize: 11, color: colors.textTertiary, fontVariant: ['tabular-nums'] },
    sampleDeleteBtn: {
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        alignItems: 'center', justifyContent: 'center',
    },
    sampleDeleteText: { fontSize: 14, color: colors.stateError, fontWeight: '600' },

    // Empty state
    emptyCard: {
        backgroundColor: colors.surface, borderRadius: borderRadius.lg,
        padding: spacing.xl, alignItems: 'center',
    },
    emptyEmoji: { fontSize: 36, marginBottom: spacing.sm },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },

    // Tips
    tipsCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.sm },
    tipText: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },

    // CTA
    cloneCta: {
        backgroundColor: '#10B981', borderRadius: borderRadius.lg,
        paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
        flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    },
    cloneCtaDisabled: {
        backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight,
    },
    cloneCtaEmoji: { fontSize: 28 },
    cloneCtaContent: { flex: 1 },
    cloneCtaText: { fontSize: 18, fontWeight: '700', color: '#fff' },
    cloneCtaSubtext: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },

    // Info
    infoCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.md },
    infoStep: { flexDirection: 'row', gap: spacing.sm },
    infoStepEmoji: { fontSize: 22, width: 30, textAlign: 'center' },
    infoStepContent: { flex: 1 },
    infoStepTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
    infoText: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },

    // Modal
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
    },
    modalCard: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: borderRadius.xl,
        borderTopRightRadius: borderRadius.xl,
        padding: spacing.lg,
        paddingBottom: Platform.OS === 'ios' ? 40 : spacing.lg,
    },
    modalHeader: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: spacing.md,
    },
    modalTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
    modalClose: { fontSize: 20, color: colors.textTertiary, padding: spacing.xs },
    modalSubtext: { fontSize: 14, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 20 },
    modalInput: {
        backgroundColor: colors.background,
        borderRadius: borderRadius.md,
        padding: spacing.md,
        fontSize: 15,
        color: colors.textPrimary,
        borderWidth: 1,
        borderColor: colors.borderLight,
        marginBottom: spacing.md,
        minHeight: 80,
        textAlignVertical: 'top',
    },
    modalPlayBtn: {
        backgroundColor: colors.accent,
        borderRadius: borderRadius.md,
        paddingVertical: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        marginBottom: spacing.sm,
    },
    modalPlayBtnActive: {
        backgroundColor: colors.stateProcessing,
    },
    modalPlayEmoji: { fontSize: 20 },
    modalPlayText: { fontSize: 16, fontWeight: '600', color: colors.background },
    modalDisclaimer: {
        fontSize: 11, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.xs,
    },
});
