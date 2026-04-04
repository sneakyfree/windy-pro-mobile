/**
 * Agent Hatch Wizard — Mobile flow to create a Windy Fly agent
 * 4 steps: Name → Brain → Hatching (animated) → IT'S ALIVE!
 * Calls POST /api/v1/identity/agent/provision on the account-server.
 */
import { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TextInput, Pressable, ScrollView,
    ActivityIndicator, Animated, Alert, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, spacing, borderRadius, fontSizes } from '@/theme';
import { typography } from '@/theme/typography';
import { cloudApi } from '@/services/cloudApi';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { getEcosystemStatus } from '@/services/ecosystem-status';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { API_BASE_URL } from '@/config/api';
import { fetchWithTimeout } from '@/utils/fetch-timeout';
import { INPUT_LIMITS } from '@/utils/validation';

type Step = 'name' | 'brain' | 'hatching' | 'alive';

interface HatchProgress {
    passport: 'pending' | 'done' | 'error';
    chat: 'pending' | 'done' | 'error';
    mail: 'pending' | 'done' | 'error';
}

interface HatchResult {
    passport_number?: string;
    matrix_user_id?: string;
    dm_room_id?: string;
    agent_name: string;
}

const BRAIN_OPTIONS = [
    { id: 'free', label: 'Free (Gemini)', desc: 'No API key needed — great to start', emoji: '🆓', needsKey: false },
    { id: 'openai', label: 'OpenAI', desc: 'GPT-4o — powerful & versatile', emoji: '🧠', needsKey: true },
    { id: 'anthropic', label: 'Anthropic', desc: 'Claude — thoughtful & precise', emoji: '🎭', needsKey: true },
    { id: 'other', label: 'Other / Custom', desc: 'Advanced — bring your own model', emoji: '⚙️', needsKey: true },
];

export default function HatchScreen() {
    const router = useRouter();
    const settings = useSettingsStore();
    const [step, setStep] = useState<Step>('name');
    const [agentName, setAgentName] = useState('');
    const [selectedBrain, setSelectedBrain] = useState('free');
    const [apiKey, setApiKey] = useState('');
    const [progress, setProgress] = useState<HatchProgress>({ passport: 'pending', chat: 'pending', mail: 'pending' });
    const [result, setResult] = useState<HatchResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const flyAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.5)).current;

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

    const startHatch = async () => {
        setStep('hatching');
        setError(null);

        const token = cloudApi.getToken();
        if (!token) {
            setError('Please sign in first');
            setStep('brain');
            return;
        }

        try {
            // Call the account-server's agent provision endpoint
            const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/identity/agent/provision`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    agent_name: agentName.trim(),
                    model_id: selectedBrain,
                    ...(apiKey ? { model_api_key: apiKey } : {}),
                }),
            });

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `Server error (${res.status})`);
            }

            const data = await res.json();

            // Simulate step-by-step progress for the ceremony
            setProgress(p => ({ ...p, passport: 'done' }));
            await delay(800);
            setProgress(p => ({ ...p, chat: data.chat_provisioned ? 'done' : (data.pending ? 'pending' : 'error') }));
            await delay(600);
            setProgress(p => ({ ...p, mail: 'done' }));
            await delay(400);

            setResult({
                passport_number: data.passport_number,
                matrix_user_id: data.matrix_user_id,
                dm_room_id: data.dm_room_id,
                agent_name: agentName.trim(),
            });

            // Refresh ecosystem status
            const eco = await getEcosystemStatus();
            if (eco) settings.setEcosystemStatus(eco);

            setStep('alive');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Hatching failed');
            setStep('brain');
        }
    };

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
                onPress={startHatch}
            >
                <Text style={styles.primaryBtnText}>{'\uD83E\uDD5A'} Hatch {agentName || 'Agent'}</Text>
            </Pressable>

            <Pressable style={styles.backBtn} onPress={() => setStep('name')}>
                <Text style={styles.backBtnText}>← Back</Text>
            </Pressable>
        </ScrollView>
    );

    const renderHatchingStep = () => {
        const translateY = flyAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -15] });

        return (
            <View style={styles.stepContent}>
                <Animated.Text style={[styles.hatchEmoji, { transform: [{ translateY }] }]}>
                    {'\uD83E\uDEB0'}
                </Animated.Text>
                <Text style={styles.stepTitle}>Hatching {agentName}...</Text>

                <View style={styles.progressList}>
                    <ProgressRow label="Getting passport..." status={progress.passport} />
                    <ProgressRow label="Connecting to chat..." status={progress.chat} />
                    <ProgressRow label="Setting up email..." status={progress.mail} />
                </View>
            </View>
        );
    };

    const renderAliveStep = () => (
        <View style={styles.stepContent}>
            <Animated.Text style={[styles.aliveEmoji, { transform: [{ scale: scaleAnim }] }]}>
                {'\uD83E\uDEB0'}
            </Animated.Text>
            <Text style={styles.aliveTitle}>IT'S ALIVE!</Text>
            <Text style={styles.aliveSubtitle}>{result?.agent_name} has hatched</Text>

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
            </View>

            <Pressable
                style={[styles.primaryBtn, { backgroundColor: '#22c55e' }]}
                onPress={() => {
                    if (result?.dm_room_id) {
                        router.replace('/(tabs)/chat');
                        setTimeout(() => router.push(`/chat/${result.dm_room_id}`), 300);
                    } else {
                        router.replace('/(tabs)/chat');
                    }
                }}
            >
                <Text style={styles.primaryBtnText}>💬 Go to Chat</Text>
            </Pressable>

            <Pressable style={styles.backBtn} onPress={() => router.replace('/(tabs)/ecosystem')}>
                <Text style={styles.backBtnText}>Back to Ecosystem</Text>
            </Pressable>
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

function ProgressRow({ label, status }: { label: string; status: 'pending' | 'done' | 'error' }) {
    return (
        <View style={styles.progressRow}>
            {status === 'pending' && <ActivityIndicator size="small" color={colors.accent} />}
            {status === 'done' && <Text style={styles.progressCheck}>✅</Text>}
            {status === 'error' && <Text style={styles.progressCheck}>⚠️</Text>}
            <Text style={[styles.progressLabel, status === 'done' && { color: colors.accent }]}>{label}</Text>
        </View>
    );
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

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
