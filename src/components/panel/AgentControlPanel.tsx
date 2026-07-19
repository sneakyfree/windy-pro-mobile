/**
 * AgentControlPanel — grandma's native control panel for her Windy Fly
 * agent, embedded in the Fly tab. Personality sliders are the hero;
 * preset chips sit above them; Memory / Skills / Costs render honest
 * empty-states until the cloud agent grows those capabilities.
 *
 * Backed by `windy.panel.v1` (flyPanelApi). Capability-driven: sections
 * render only if the capability is in `summary.capabilities`, otherwise
 * the honest copy from DASHBOARD_API_CONTRACT.md §2.6 — never a broken
 * panel, never a spinner that can't resolve.
 */
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, spacing, borderRadius } from '@/theme';
import { typography } from '@/theme/typography';
import { feedbackService } from '@/services/feedback';
import { flyPanelApi } from '@/services/flyPanelApi';
import type { PanelSummary, SliderInfo } from '@/services/panelContract';
import { PANEL_PRESETS, matchPreset } from '@/services/panelPresets';
import { PanelSlider } from './PanelSlider';

type Phase = 'loading' | 'ready' | 'auth' | 'no_agent' | 'unreachable';

// §2.6 honest empty-state copy — keep verbatim with the contract.
const EMPTY_COPY = {
    memory: "Your agent's deep memory is coming. Today it remembers your recent conversation — its long-term memory arrives with the soul-memory upgrade.",
    skills: 'Skills live on self-hosted agents today. Cloud agents will learn skills in a future update.',
    costs: "Included in your plan — your cloud agent's thinking is on the house.",
    local: 'Your agent lives on your own machine. Manage it there with `windy start` → localhost:3000 for now — remote control from here is coming.',
} as const;

export function AgentControlPanel() {
    const [phase, setPhase] = useState<Phase>('loading');
    const [summary, setSummary] = useState<PanelSummary | null>(null);
    const [sliderInfo, setSliderInfo] = useState<Record<string, SliderInfo>>({});
    const [values, setValues] = useState<Record<string, number>>({});
    const [applyingPreset, setApplyingPreset] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);

    const load = useCallback(async () => {
        const summaryRes = await flyPanelApi.getSummary();
        if (summaryRes.status === 'no_agent') { setPhase('no_agent'); return; }
        if (summaryRes.status === 'auth') { setPhase('auth'); return; }
        if (summaryRes.status !== 'ok') { setPhase('unreachable'); return; }
        setSummary(summaryRes.data);

        if (summaryRes.data.capabilities.includes('sliders')) {
            const infoRes = await flyPanelApi.getSliderInfo();
            if (infoRes.status === 'ok') {
                setSliderInfo(infoRes.data.sliders);
                const initial: Record<string, number> = {};
                for (const [name, info] of Object.entries(infoRes.data.sliders)) {
                    initial[name] = info.value;
                }
                setValues(initial);
            } else {
                // Summary answered but slider detail didn't — degrade honestly.
                setSliderInfo({});
                setValues(summaryRes.data.personality.sliders);
            }
        }
        setPhase('ready');
    }, []);

    useFocusEffect(useCallback(() => {
        setSaveError(null);
        load();
    }, [load]));

    // Optimistic per-slider save with honest revert (contract §4: no
    // silent error swallow — on failure the slider goes back and we say so).
    const commitSlider = useCallback(async (name: string, value: number) => {
        const previous = values[name];
        setValues(prev => ({ ...prev, [name]: value }));
        setSaveError(null);
        feedbackService.tap().catch(() => {});
        const result = await flyPanelApi.setSlider(name, value);
        if (result.status !== 'ok') {
            setValues(prev => ({ ...prev, [name]: previous }));
            const label = sliderInfo[name]?.label ?? name;
            setSaveError(`Couldn't save ${label} — check your connection and try again.`);
            feedbackService.error().catch(() => {});
        }
    }, [values, sliderInfo]);

    const applyPreset = useCallback(async (presetName: string) => {
        if (applyingPreset) return;
        setApplyingPreset(presetName);
        setSaveError(null);
        feedbackService.tap().catch(() => {});
        const before = values;
        const preset = PANEL_PRESETS.find(p => p.name === presetName);
        const serverSliders = Object.keys(values);
        if (preset) {
            // Optimistic: show the preset immediately, then write through.
            setValues(prev => {
                const next = { ...prev };
                for (const [k, v] of Object.entries(preset.values)) {
                    if (k in next) next[k] = v;
                }
                return next;
            });
        }
        const result = await flyPanelApi.applyPreset(presetName, serverSliders);
        if (result.status !== 'ok') {
            setValues(before);
            setSaveError("Couldn't apply the preset — check your connection and try again.");
            feedbackService.error().catch(() => {});
        } else if (result.data.failed.length > 0) {
            // Partial write — resync to what the server actually has.
            const fresh = await flyPanelApi.getSliders();
            if (fresh.status === 'ok') setValues(prev => ({ ...prev, ...fresh.data.sliders }));
            setSaveError('Some settings didn\'t save — the sliders show what your agent is actually using.');
            feedbackService.error().catch(() => {});
        } else {
            feedbackService.success().catch(() => {});
        }
        setApplyingPreset(null);
    }, [applyingPreset, values]);

    // ── Non-ready states ───────────────────────────────────────
    // no_agent / auth: the Fly tab already renders the hatch CTA and the
    // sign-in prompt — the panel stays out of the way.
    if (phase === 'no_agent' || phase === 'auth') return null;

    if (phase === 'loading') {
        return (
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Personality</Text>
                <View style={[styles.card, styles.centerCard]}>
                    <ActivityIndicator color={colors.accent} />
                </View>
            </View>
        );
    }

    if (phase === 'unreachable' || !summary) {
        return (
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Personality</Text>
                <View style={[styles.card, styles.centerCard]}>
                    <Text style={styles.centerText}>
                        Can't reach your agent's control panel right now.
                    </Text>
                    <Pressable
                        style={styles.retryBtn}
                        onPress={() => { setPhase('loading'); load(); }}
                        accessibilityRole="button"
                        accessibilityLabel="Retry loading the control panel"
                    >
                        <Text style={styles.retryText}>Try again</Text>
                    </Pressable>
                </View>
            </View>
        );
    }

    const hasSliders = summary.capabilities.includes('sliders') && Object.keys(values).length > 0;
    const activePreset = matchPreset(values);

    return (
        <View testID="agent-control-panel">
            {/* ── Personality: presets + sliders (the hero) ── */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Personality</Text>
                {hasSliders ? (
                    <>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.presetRow}
                        >
                            {PANEL_PRESETS.map(preset => {
                                const active = activePreset === preset.name;
                                const applying = applyingPreset === preset.name;
                                return (
                                    <Pressable
                                        key={preset.name}
                                        style={[styles.presetChip, active && styles.presetChipActive]}
                                        disabled={applyingPreset !== null}
                                        onPress={() => applyPreset(preset.name)}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Apply ${preset.label} preset`}
                                        accessibilityState={{ selected: active, disabled: applyingPreset !== null }}
                                        testID={`preset-chip-${preset.name}`}
                                    >
                                        <Text style={styles.presetEmoji}>{preset.emoji}</Text>
                                        <Text style={[styles.presetLabel, active && styles.presetLabelActive]}>
                                            {applying ? 'Applying…' : preset.label}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>

                        {saveError && (
                            <View style={styles.errorBanner}>
                                <Text style={styles.errorText}>{saveError}</Text>
                            </View>
                        )}

                        {Object.entries(sliderInfo).map(([name, info]) => (
                            <PanelSlider
                                key={name}
                                name={name}
                                info={{ ...info, value: values[name] ?? info.value }}
                                value={values[name] ?? info.value}
                                disabled={applyingPreset !== null}
                                onCommit={commitSlider}
                            />
                        ))}
                        <Text style={styles.footnote}>
                            Changes apply to your agent's very next reply.
                        </Text>
                    </>
                ) : (
                    <View style={[styles.card, styles.emptyCard]}>
                        <Text style={styles.emptyEmoji}>🖥️</Text>
                        <Text style={styles.emptyText}>{EMPTY_COPY.local}</Text>
                    </View>
                )}
            </View>

            {/* ── Honest capability sections ── */}
            <CapabilitySection
                title="Memory" emoji="🧠" capability="memory"
                summary={summary} emptyCopy={EMPTY_COPY.memory}
            />
            <CapabilitySection
                title="Skills" emoji="🎓" capability="skills"
                summary={summary} emptyCopy={EMPTY_COPY.skills}
            />
            <CapabilitySection
                title="Costs" emoji="🧾" capability="costs"
                summary={summary} emptyCopy={EMPTY_COPY.costs}
            />
        </View>
    );
}

/**
 * A section that renders real content only when the backend declares the
 * capability. Today none of these are lit on Type-B, so they show the
 * §2.6 copy — when the capability list grows, this is where the real
 * section slots in without the panel changing shape.
 */
function CapabilitySection({ title, emoji, capability, summary, emptyCopy }: {
    title: string; emoji: string; capability: string;
    summary: PanelSummary; emptyCopy: string;
}) {
    const lit = (summary.capabilities as string[]).includes(capability);
    return (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <View style={[styles.card, styles.emptyCard]}>
                <Text style={styles.emptyEmoji}>{emoji}</Text>
                <Text style={styles.emptyText}>
                    {lit ? `${title} is available on your agent — this view is coming in the next update.` : emptyCopy}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    section: { marginBottom: spacing.lg },
    sectionTitle: {
        ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary,
        textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm,
    },
    card: {
        backgroundColor: colors.surface, borderRadius: borderRadius.lg,
        borderWidth: 1, borderColor: colors.borderLight,
    },
    centerCard: { alignItems: 'center', padding: spacing.lg },

    presetRow: { gap: spacing.sm, paddingBottom: spacing.sm },
    presetChip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 14, paddingVertical: 10,
        borderRadius: 20, backgroundColor: colors.surface,
        borderWidth: 1, borderColor: colors.borderLight,
    },
    presetChipActive: { borderColor: colors.accent, backgroundColor: colors.accentTransparent },
    presetEmoji: { fontSize: 16 },
    presetLabel: { ...typography.bodySmall, fontWeight: '600', color: colors.textPrimary },
    presetLabelActive: { color: colors.accent },

    emptyCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
    emptyEmoji: { fontSize: 28 },
    emptyText: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
    centerText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },

    footnote: { ...typography.caption, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.xs },

    errorBanner: {
        backgroundColor: 'rgba(239,68,68,0.1)', padding: 12,
        borderRadius: 8, marginBottom: spacing.sm,
    },
    errorText: { ...typography.bodySmall, color: '#f87171', textAlign: 'center' },

    retryBtn: {
        marginTop: spacing.sm, paddingHorizontal: 20, paddingVertical: 10,
        borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.accent,
    },
    retryText: { ...typography.bodySmall, fontWeight: '600', color: colors.accent },
});
