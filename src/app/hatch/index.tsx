/**
 * Agent Hatch Wizard — Mobile flow to create a Windy Fly agent.
 * 4 steps: Name → Brain → Hatching (SSE ceremony) → IT'S ALIVE!
 *
 * Consumes the Wave-8 SSE endpoint from hatchApi.startHatch(). Each
 * ceremony event updates a step in the progress list, and the
 * final `result` event deep-links into the agent's DM chat room.
 */
import { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TextInput, Pressable, ScrollView,
    ActivityIndicator, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, spacing, borderRadius } from '@/theme';
import { typography } from '@/theme/typography';
import { cloudApi } from '@/services/cloudApi';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { getEcosystemStatus } from '@/services/ecosystem-status';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { API_BASE_URL } from '@/config/api';
import { INPUT_LIMITS } from '@/utils/validation';
import { startHatch, type HatchEvent, type HatchStepKey, type HatchStepState } from '@/services/hatchApi';

type Step = 'name' | 'brain' | 'hatching' | 'alive';

type ProgressMap = Record<HatchStepKey, HatchStepState>;

interface HatchResult {
    passport_number?: string;
    matrix_user_id?: string;
    dm_room_id?: string;
    trust_score?: number;
    agent_name: string;
    pending?: boolean;
}

const BRAIN_OPTIONS = [
    { id: 'free', label: 'Free (Gemini)', desc: 'No API key needed — great to start', emoji: '🆓', needsKey: false },
    { id: 'openai', label: 'OpenAI', desc: 'GPT-4o — powerful & versatile', emoji: '🧠', needsKey: true },
    { id: 'anthropic', label: 'Anthropic', desc: 'Claude — thoughtful & precise', emoji: '🎭', needsKey: true },
    { id: 'other', label: 'Other / Custom', desc: 'Advanced — bring your own model', emoji: '⚙️', needsKey: true },
];

const STEP_LABELS: Record<HatchStepKey, string> = {
    passport: 'Getting passport...',
    chat: 'Connecting to chat...',
    mail: 'Setting up email...',
    trust: 'Sealing integrity score...',
};

const initialProgress: ProgressMap = {
    passport: 'pending',
    chat: 'pending',
    mail: 'pending',
    trust: 'pending',
};

export default function HatchScreen() {
    const router = useRouter();
    const settings = useSettingsStore();
    const [step, setStep] = useState<Step>('name');
    const [agentName, setAgentName] = useState('');
    const [selectedBrain, setSelectedBrain] = useState('free');
    const [apiKey, setApiKey] = useState('');
    const [progress, setProgress] = useState<ProgressMap>(initialProgress);
    const [result, setResult] = useState<HatchResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const flyAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.5)).current;
    const hatchAbort = useRef<AbortController | null>(null);

    // Fly animation during hatching
    useEffect(() => {
        if (step === 'hatching') {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(flyAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
                    Animated.timing(flyAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
                ]),
            ).start();
        }
        if (step === 'alive') {
            Animated.spring(scaleAnim, { toValue: 1, friction: 4, useNativeDriver: true }).start();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
    }, [step]);

    // Abort the in-flight hatch if the user leaves the screen mid-ceremony.
    useEffect(() => () => { hatchAbort.current?.abort(); }, []);

    const runPreFlight = async (): Promise<boolean> => {
        if (!cloudApi.getToken()) {
            setError('Please sign in first to hatch an agent.');
            return false;
        }
        try {
            const healthRes = await fetch(`${API_BASE_URL}/health`, { signal: AbortSignal.timeout(5000) });
            if (!healthRes.ok) {
                setError('Our servers are having a moment. Try again in a few minutes.');
                return false;
            }
        } catch {
            setError('You need an internet connection to hatch your agent. Connect to Wi-Fi and try again.');
            return false;
        }
        return true;
    };

    const beginHatch = async () => {
        setError(null);
        const ready = await runPreFlight();
        if (!ready) return;

        setProgress(initialProgress);
        setResult(null);
        setStep('hatching');

        hatchAbort.current?.abort();
        const controller = new AbortController();
        hatchAbort.current = controller;

        let finalResult: HatchResult | null = null;
        let sawError = false;

        await startHatch(
            {
                agent_name: agentName.trim(),
                model_id: selectedBrain,
                ...(apiKey ? { model_api_key: apiKey } : {}),
            },
            {
                signal: controller.signal,
                onEvent: (event: HatchEvent) => {
                    if (event.kind === 'step') {
                        setProgress(prev => ({ ...prev, [event.step]: event.state }));
                    } else if (event.kind === 'result') {
                        finalResult = {
                            passport_number: event.passport_number,
                            matrix_user_id: event.matrix_user_id,
                            dm_room_id: event.dm_room_id,
                            trust_score: event.trust_score,
                            agent_name: agentName.trim(),
                            pending: event.pending,
                        };
                    } else if (event.kind === 'error') {
                        sawError = true;
                        setError(event.message);
                    }
                },
            },
        );

        if (sawError) {
            setStep('brain');
            return;
        }

        // Refresh ecosystem status so Fly tab / Home CTA update immediately.
        try {
            const eco = await getEcosystemStatus();
            if (eco) settings.setEcosystemStatus(eco);
        } catch { /* ignore — non-fatal */ }

        if (finalResult) {
            setResult(finalResult);
            setStep('alive');
        } else {
            setError('Hatching finished but we could not confirm your agent. Pull to refresh on the Fly tab.');
            setStep('brain');
        }
    };

    // Auto-navigate 3s after celebration
    useEffect(() => {
        if (step !== 'alive') return;
        const timer = setTimeout(() => {
            if (result?.dm_room_id) {
                router.replace('/(tabs)/chat');
                setTimeout(() => router.push(`/chat/${result.dm_room_id}`), 300);
            } else if (progress.chat === 'error' || progress.chat === 'pending') {
                router.replace('/(tabs)/ecosystem');
            } else {
                router.replace('/(tabs)/chat');
            }
        }, 3000);
        return () => clearTimeout(timer);
    }, [step, result]);

    // ─── Step Renderers ─────────────────────────────────────────

    const renderNameStep = () => (
        <View style={styles.stepContent}>
            <Text style={styles.stepEmoji}>{'\uD83E\uDEB0'}</Text>
            <Text style={styles.stepTitle}>Name your agent</Text>
            <Text style={styles.stepDesc}>This is how your AI assistant will introduce itself.</Text>
            <TextInput
                style={styles.nameInput}
                value={agentName}
                onChangeText={setAgentName}
                placeholder="e.g. Buzz, Friday, Jarvis..."
                placeholderTextColor={colors.textTertiary}
                autoFocus
                maxLength={INPUT_LIMITS.DISPLAY_NAME || 50}
                returnKeyType="next"
                accessibilityLabel="Agent name"
            />
            <Pressable
                style={[styles.primaryBtn, !agentName.trim() && styles.btnDisabled]}
                disabled={!agentName.trim()}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setStep('brain'); }}
                accessibilityLabel="Next: choose an AI brain"
                accessibilityRole="button"
            >
                <Text style={styles.primaryBtnText}>Next →</Text>
            </Pressable>
        </View>
    );

    const renderBrainStep = () => (
        <ScrollView contentContainerStyle={styles.stepContent}>
            <Text style={styles.stepEmoji}>🧠</Text>
            <Text style={styles.stepTitle}>Choose an AI brain</Text>
            <Text style={styles.stepDesc}>You can change this later in the agent dashboard.</Text>

            {BRAIN_OPTIONS.map(opt => (
                <Pressable
                    key={opt.id}
                    style={[styles.brainCard, selectedBrain === opt.id && styles.brainCardSelected]}
                    onPress={() => { setSelectedBrain(opt.id); setApiKey(''); }}
                    accessibilityLabel={`${opt.label}: ${opt.desc}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: selectedBrain === opt.id }}
                >
                    <Text style={styles.brainEmoji}>{opt.emoji}</Text>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.brainLabel}>{opt.label}</Text>
                        <Text style={styles.brainDesc}>{opt.desc}</Text>
                    </View>
                    {selectedBrain === opt.id && <Text style={{ color: colors.accent, fontSize: 18 }}>✓</Text>}
                </Pressable>
            ))}

            {BRAIN_OPTIONS.find(b => b.id === selectedBrain)?.needsKey && (
                <TextInput
                    style={styles.apiKeyInput}
                    value={apiKey}
                    onChangeText={setApiKey}
                    placeholder="Paste your API key here..."
                    placeholderTextColor={colors.textTertiary}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel="API key"
                />
            )}

            {error && (
                <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            )}

            <Pressable
                style={[styles.primaryBtn, { marginTop: spacing.lg }]}
                onPress={beginHatch}
                accessibilityLabel={`Hatch ${agentName || 'agent'} with ${selectedBrain} brain`}
                accessibilityRole="button"
            >
                <Text style={styles.primaryBtnText}>{'\uD83E\uDD5A'} Hatch {agentName || 'Agent'}</Text>
            </Pressable>

            <Pressable style={styles.backBtn} onPress={() => setStep('name')}
                accessibilityLabel="Go back to name step" accessibilityRole="button"
            >
                <Text style={styles.backBtnText}>← Back</Text>
            </Pressable>
        </ScrollView>
    );

    const hasPartialFailure = progress.passport === 'error' || progress.chat === 'error';

    const renderHatchingStep = () => {
        const translateY = flyAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -15] });

        return (
            <View style={styles.stepContent}>
                <Animated.Text style={[styles.hatchEmoji, { transform: [{ translateY }] }]}>
                    {'\uD83E\uDEB0'}
                </Animated.Text>
                <Text style={styles.stepTitle}>Hatching {agentName}...</Text>

                <View style={styles.progressList}>
                    {(Object.keys(STEP_LABELS) as HatchStepKey[]).map(key => (
                        <ProgressRow key={key} label={STEP_LABELS[key]} status={progress[key]} />
                    ))}
                </View>

                {hasPartialFailure && (
                    <View style={{ marginTop: spacing.lg, alignItems: 'center', gap: 8 }}>
                        <Text style={{ ...typography.bodySmall, color: '#facc15', textAlign: 'center' }}>
                            Some services are still setting up and will be ready shortly.
                        </Text>
                        <Pressable
                            style={[styles.primaryBtn, { backgroundColor: '#facc15', width: 'auto', paddingHorizontal: 24 }]}
                            onPress={beginHatch}
                            accessibilityLabel="Retry failed provisioning steps"
                            accessibilityRole="button"
                        >
                            <Text style={[styles.primaryBtnText, { color: '#0f172a' }]}>Retry</Text>
                        </Pressable>
                    </View>
                )}
            </View>
        );
    };

    const chatReady = progress.chat === 'done' && result?.dm_room_id;
    const partialSuccess = progress.passport === 'pending' || progress.chat === 'pending' || progress.chat === 'error' || !!result?.pending;

    const renderAliveStep = () => (
        <View style={styles.stepContent}>
            <Animated.Text style={[styles.aliveEmoji, { transform: [{ scale: scaleAnim }] }]}>
                {'\uD83E\uDEB0'}
            </Animated.Text>
            <Text style={styles.aliveTitle}>IT'S ALIVE!</Text>
            <Text style={styles.aliveSubtitle}>{result?.agent_name} has hatched</Text>

            {partialSuccess && (
                <Text style={{ ...typography.bodySmall, color: '#facc15', textAlign: 'center', marginBottom: spacing.sm }}>
                    Some services are still setting up and will be ready shortly.
                </Text>
            )}

            <View style={styles.birthCard}>
                {result?.passport_number && (
                    <View style={styles.birthRow}>
                        <Text style={styles.birthLabel}>Passport</Text>
                        <Text style={styles.birthValue}>{result.passport_number}</Text>
                    </View>
                )}
                {result?.matrix_user_id && (
                    <View style={styles.birthRow}>
                        <Text style={styles.birthLabel}>Chat ID</Text>
                        <Text style={styles.birthValue}>{result.matrix_user_id}</Text>
                    </View>
                )}
                {result?.trust_score != null && (
                    <View style={styles.birthRow}>
                        <Text style={styles.birthLabel}>Trust</Text>
                        <Text style={styles.birthValue}>{result.trust_score}%</Text>
                    </View>
                )}
            </View>

            <Pressable
                style={[styles.primaryBtn, { backgroundColor: chatReady ? '#22c55e' : colors.accent }]}
                accessibilityLabel={chatReady ? 'Go to chat with your new agent' : 'View ecosystem status'}
                accessibilityRole="button"
                onPress={() => {
                    if (chatReady) {
                        router.replace('/(tabs)/chat');
                        setTimeout(() => router.push(`/chat/${result!.dm_room_id}`), 300);
                    } else {
                        router.replace('/(tabs)/ecosystem');
                    }
                }}
            >
                <Text style={styles.primaryBtnText}>{chatReady ? '💬 Go to Chat' : '🌪️ View Ecosystem'}</Text>
            </Pressable>

            <Text style={{ ...typography.caption, color: colors.textTertiary, marginTop: spacing.sm }}>
                Auto-navigating in 3 seconds...
            </Text>
        </View>
    );

    return (
        <ScreenErrorBoundary screenName="Hatch">
            <SafeAreaView style={styles.container} edges={['top']}>
                {step === 'name' && renderNameStep()}
                {step === 'brain' && renderBrainStep()}
                {step === 'hatching' && renderHatchingStep()}
                {step === 'alive' && renderAliveStep()}
            </SafeAreaView>
        </ScreenErrorBoundary>
    );
}

// ─── Sub-components ─────────────────────────────────────────────

function ProgressRow({ label, status }: { label: string; status: HatchStepState }) {
    return (
        <View style={styles.progressRow}>
            {(status === 'pending' || status === 'in_progress') && <ActivityIndicator size="small" color={colors.accent} />}
            {status === 'done' && <Text style={styles.progressCheck}>✅</Text>}
            {status === 'error' && <Text style={styles.progressCheck}>⚠️</Text>}
            <Text style={[styles.progressLabel, status === 'done' && { color: colors.accent }]}>{label}</Text>
        </View>
    );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    stepContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
    stepEmoji: { fontSize: 72, marginBottom: spacing.lg },
    stepTitle: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    stepDesc: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xl },

    nameInput: {
        width: '100%', backgroundColor: colors.surface, borderRadius: borderRadius.lg,
        paddingHorizontal: 20, paddingVertical: 16, fontSize: 18, color: colors.textPrimary,
        borderWidth: 1, borderColor: colors.borderLight, textAlign: 'center', marginBottom: spacing.lg,
    },

    brainCard: {
        flexDirection: 'row', alignItems: 'center', width: '100%', backgroundColor: colors.surface,
        borderRadius: borderRadius.lg, padding: spacing.md, gap: 12, marginBottom: spacing.sm,
        borderWidth: 1.5, borderColor: colors.borderLight,
    },
    brainCardSelected: { borderColor: colors.accent, backgroundColor: 'rgba(163,230,53,0.06)' },
    brainEmoji: { fontSize: 28 },
    brainLabel: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
    brainDesc: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },

    apiKeyInput: {
        width: '100%', backgroundColor: colors.surface, borderRadius: borderRadius.md,
        paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: colors.textPrimary,
        borderWidth: 1, borderColor: colors.borderLight, marginTop: spacing.sm,
    },

    primaryBtn: {
        width: '100%', backgroundColor: colors.accent, borderRadius: borderRadius.lg,
        paddingVertical: 16, alignItems: 'center',
    },
    primaryBtnText: { fontSize: 17, fontWeight: '600', color: colors.background },
    btnDisabled: { opacity: 0.4 },
    backBtn: { paddingVertical: 12, marginTop: spacing.sm },
    backBtnText: { ...typography.body, color: colors.textTertiary },

    errorBanner: { backgroundColor: 'rgba(239,68,68,0.1)', padding: 12, borderRadius: 8, width: '100%', marginTop: spacing.sm },
    errorText: { ...typography.bodySmall, color: '#f87171', textAlign: 'center' },

    hatchEmoji: { fontSize: 96, marginBottom: spacing.lg },
    progressList: { marginTop: spacing.xl, gap: 16, width: '100%' },
    progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.lg },
    progressCheck: { fontSize: 20 },
    progressLabel: { ...typography.body, color: colors.textSecondary },

    aliveEmoji: { fontSize: 96, marginBottom: spacing.md },
    aliveTitle: { fontSize: 28, fontWeight: '800', color: colors.accent, letterSpacing: 1 },
    aliveSubtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.lg },
    birthCard: {
        width: '100%', backgroundColor: colors.surface, borderRadius: borderRadius.lg,
        padding: spacing.lg, gap: 12, borderWidth: 1, borderColor: colors.accent, marginBottom: spacing.xl,
    },
    birthRow: { flexDirection: 'row', justifyContent: 'space-between' },
    birthLabel: { ...typography.bodySmall, color: colors.textTertiary },
    birthValue: { ...typography.bodySmall, fontWeight: '600', color: colors.textPrimary },
});
