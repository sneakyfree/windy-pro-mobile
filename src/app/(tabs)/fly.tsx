/**
 * Fly Tab — live view of the user's Windy Fly agent.
 *
 * Shows the hatched agent's status (alive/sleeping), latest known action,
 * Eternitas integrity score, and a quick "Message Agent" deep-link into
 * the DM room. Polls ecosystem-status every 30s on focus so the tab
 * reflects the backend without a manual refresh. If the user has not
 * hatched an agent yet, the tab renders a hatch call-to-action instead.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Pressable,
    ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { colors, spacing, borderRadius } from '@/theme';
import { typography } from '@/theme/typography';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { getEcosystemStatus, type EcosystemProduct } from '@/services/ecosystem-status';
import { feedbackService } from '@/services/feedback';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { identityApi } from '@/services/identityApi';
import { formatAgentStatus } from '@/lib/flyStatus';
import { AgentControlPanel } from '@/components/panel/AgentControlPanel';

export { formatAgentStatus } from '@/lib/flyStatus';

const POLL_INTERVAL_MS = 30_000;

export default function FlyTab() {
    const router = useRouter();
    const settings = useSettingsStore();
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const ecosystem = settings.ecosystemStatus;
    const fly: EcosystemProduct | undefined = ecosystem?.products?.windy_fly;
    const eternitas: EcosystemProduct | undefined = ecosystem?.products?.eternitas;

    const fetchStatus = useCallback(async (isInitial = false) => {
        if (isInitial) setLoading(true);
        try {
            const eco = await getEcosystemStatus();
            if (eco) {
                settings.setEcosystemStatus(eco);
                setLoadError(null);
            } else if (!ecosystem) {
                // Null return means auth-less or network — only surface on cold start.
                setLoadError(identityApi.isAuthenticated()
                    ? 'Could not reach agent status. Pull to refresh.'
                    : 'Sign in to see your agent.');
            }
        } catch {
            setLoadError('Could not load agent status. Pull to refresh.');
        } finally {
            if (isInitial) setLoading(false);
        }
    }, [ecosystem]);

    // Focus-based polling: fetch on focus, poll every 30s while focused,
    // stop when the tab loses focus to avoid background network traffic.
    useFocusEffect(useCallback(() => {
        fetchStatus(true);
        pollRef.current = setInterval(() => fetchStatus(false), POLL_INTERVAL_MS);
        return () => {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        };
    }, [fetchStatus]));

    // Cleanup on unmount in case focus effect cleanup was skipped.
    useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchStatus(false);
        setRefreshing(false);
    }, [fetchStatus]);

    // ── Empty state: no agent yet ──────────────────────────────
    const noAgent = !fly || fly.status === 'not_provisioned';
    if (noAgent) {
        return (
            <ScreenErrorBoundary screenName="Fly">
                <SafeAreaView style={styles.container} edges={['top']}>
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyEmoji}>{'\uD83E\uDEB0'}</Text>
                        <Text style={styles.emptyTitle}>No agent yet</Text>
                        <Text style={styles.emptySubtitle}>
                            Hatch a Windy Fly to get your own AI assistant that works when you don't.
                        </Text>
                        <Pressable
                            style={styles.primaryBtn}
                            onPress={() => {
                                feedbackService.tap().catch(() => {});
                                router.push('/hatch');
                            }}
                            accessibilityRole="button"
                            accessibilityLabel="Hatch a Windy Fly agent"
                        >
                            <Text style={styles.primaryBtnText}>{'\uD83E\uDD5A'} Hatch Agent</Text>
                        </Pressable>
                        {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />}
                        {loadError && <Text style={styles.errorText}>{loadError}</Text>}
                    </View>
                </SafeAreaView>
            </ScreenErrorBoundary>
        );
    }

    const agentName = fly.agent_name || 'Windy Fly';
    const passport = fly.passport_id || eternitas?.passport_id;
    const trustScore = fly.trust_score ?? eternitas?.trust_score;
    const clearance = fly.clearance_level ?? eternitas?.clearance_level;
    const vps = fly.agent_vps;
    const dmRoom = fly.room_id;
    const { label: statusLabel, tone: statusTone } = formatAgentStatus(fly.agent_status || (fly.status === 'active' ? 'online' : undefined));
    const latestAction: string | undefined = (fly as any).last_action || fly.detail;

    const openDm = () => {
        feedbackService.tap().catch(() => {});
        if (dmRoom) {
            router.push(`/chat/${dmRoom}`);
        } else {
            router.push('/(tabs)/chat');
        }
    };

    return (
        <ScreenErrorBoundary screenName="Fly">
            <SafeAreaView style={styles.container} edges={['top']}>
                <ScrollView
                    contentContainerStyle={styles.content}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
                >
                    {/* Agent Header */}
                    <View style={styles.headerCard}>
                        <Text style={styles.agentEmoji}>{'\uD83E\uDEB0'}</Text>
                        <Text style={styles.agentName}>{agentName}</Text>
                        <View style={[
                            styles.statusBadge,
                            statusTone === 'alive' && styles.statusAlive,
                            statusTone === 'sleep' && styles.statusSleep,
                        ]}>
                            <View style={[
                                styles.statusDot,
                                { backgroundColor: statusTone === 'alive' ? '#22c55e' : statusTone === 'sleep' ? '#94a3b8' : colors.textTertiary },
                            ]} />
                            <Text style={[
                                styles.statusText,
                                statusTone === 'alive' && { color: '#22c55e' },
                                statusTone === 'sleep' && { color: '#94a3b8' },
                            ]}>
                                {statusLabel}
                            </Text>
                        </View>
                    </View>

                    {/* Control Panel — personality sliders (windy.panel.v1) + honest capability sections */}
                    <AgentControlPanel />

                    {/* Latest Action */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Latest Action</Text>
                        <View style={styles.card}>
                            <Text style={styles.latestAction} numberOfLines={3}>
                                {latestAction || '—  Your agent is quiet for now. Send it a message to get started.'}
                            </Text>
                        </View>
                    </View>

                    {/* Integrity / Eternitas */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Integrity</Text>
                        <View style={styles.card}>
                            <InfoRow label="Trust Score" value={trustScore != null ? `${trustScore}%` : 'Pending'} />
                            {clearance != null && <InfoRow label="Clearance" value={`Level ${clearance}`} />}
                            {passport && <InfoRow label="Passport" value={passport} />}
                            {vps && <InfoRow label="VPS" value={vps} />}
                        </View>
                    </View>

                    {/* Actions */}
                    <View style={styles.section}>
                        <Pressable
                            style={styles.primaryBtn}
                            onPress={openDm}
                            accessibilityRole="button"
                            accessibilityLabel={`Message ${agentName}`}
                            testID="fly-message-agent-btn"
                        >
                            <Text style={styles.primaryBtnText}>💬 Message {agentName}</Text>
                        </Pressable>
                        <Pressable
                            style={styles.secondaryBtn}
                            onPress={() => {
                                feedbackService.tap().catch(() => {});
                                router.push('/agent');
                            }}
                            accessibilityRole="button"
                            accessibilityLabel="Open agent settings"
                        >
                            <Text style={styles.secondaryBtnText}>⚙️ Agent Settings</Text>
                        </Pressable>
                        {passport && (
                            <Pressable
                                style={styles.secondaryBtn}
                                onPress={() => Linking.openURL(`https://eternitas.app/registry/${passport}`).catch(() => {})}
                                accessibilityRole="button"
                                accessibilityLabel="View Eternitas passport"
                            >
                                <Text style={styles.secondaryBtnText}>🪪 View Passport</Text>
                            </Pressable>
                        )}
                    </View>

                    {loadError && (
                        <View style={styles.errorBanner}>
                            <Text style={styles.errorText}>{loadError}</Text>
                        </View>
                    )}
                </ScrollView>
            </SafeAreaView>
        </ScreenErrorBoundary>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.screenPadding, paddingBottom: spacing.xxl },

    headerCard: {
        alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.lg,
        padding: spacing.xl, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.borderLight,
    },
    agentEmoji: { fontSize: 64, marginBottom: spacing.sm },
    agentName: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
    statusBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm,
        paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: colors.surfaceLight,
    },
    statusAlive: { backgroundColor: 'rgba(34,197,94,0.1)' },
    statusSleep: { backgroundColor: 'rgba(148,163,184,0.1)' },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { ...typography.caption, fontWeight: '600', color: colors.textTertiary },

    section: { marginBottom: spacing.lg },
    sectionTitle: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm },
    card: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.borderLight },

    latestAction: { ...typography.body, color: colors.textPrimary, padding: spacing.md },

    infoRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: spacing.md, paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight,
    },
    infoLabel: { ...typography.bodySmall, color: colors.textTertiary },
    infoValue: { ...typography.bodySmall, fontWeight: '600', color: colors.textPrimary, maxWidth: '60%', textAlign: 'right' },

    primaryBtn: {
        backgroundColor: colors.accent, borderRadius: borderRadius.lg,
        paddingVertical: 14, alignItems: 'center', marginBottom: spacing.sm,
    },
    primaryBtnText: { fontSize: 16, fontWeight: '600', color: colors.background },
    secondaryBtn: {
        backgroundColor: colors.surface, borderRadius: borderRadius.lg,
        paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.borderLight,
        marginBottom: spacing.sm,
    },
    secondaryBtnText: { ...typography.body, fontWeight: '500', color: colors.textPrimary },

    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
    emptyEmoji: { fontSize: 64, marginBottom: spacing.md },
    emptyTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
    emptySubtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.lg },

    errorBanner: { backgroundColor: 'rgba(239,68,68,0.1)', padding: 12, borderRadius: 8, marginTop: spacing.md },
    errorText: { ...typography.bodySmall, color: '#f87171', textAlign: 'center' },
});
