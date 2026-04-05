/**
 * Agent Management Panel — Mobile control panel for Windy Fly agent
 * Shows status, passport, trust score, quick actions.
 */
import { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
    RefreshControl, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { colors, spacing, borderRadius } from '@/theme';
import { typography } from '@/theme/typography';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { getEcosystemStatus, type EcosystemProduct } from '@/services/ecosystem-status';
import { feedbackService } from '@/services/feedback';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import EternitasBadge from '@/components/EternitasBadge';

export default function AgentScreen() {
    const router = useRouter();
    const settings = useSettingsStore();
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const ecosystem = settings.ecosystemStatus;
    const flyProduct = ecosystem?.products?.windy_fly;
    const eternitasProduct = ecosystem?.products?.eternitas;

    const [loadError, setLoadError] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        try {
            setLoadError(null);
            const eco = await getEcosystemStatus();
            if (eco) settings.setEcosystemStatus(eco);
        } catch {
            setLoadError('Could not load agent status. Pull to refresh.');
        }
    }, []);

    useFocusEffect(useCallback(() => {
        setLoading(true);
        loadData().finally(() => setLoading(false));
    }, []));

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    }, [loadData]);

    // No agent
    if (!flyProduct || flyProduct.status === 'not_provisioned') {
        return (
            <ScreenErrorBoundary screenName="Agent">
                <SafeAreaView style={styles.container} edges={['top']}>
                    <View style={styles.emptyState}>
                        <Text style={{ fontSize: 64, marginBottom: 16 }}>{'\uD83E\uDEB0'}</Text>
                        <Text style={styles.emptyTitle}>No agent yet</Text>
                        <Text style={styles.emptySubtitle}>Hatch a Windy Fly to get your own AI assistant.</Text>
                        <Pressable style={styles.hatchBtn} onPress={() => router.push('/hatch')}
                            accessibilityLabel="Hatch a new Windy Fly agent" accessibilityRole="button"
                        >
                            <Text style={styles.hatchBtnText}>{'\uD83E\uDD5A'} Hatch Agent</Text>
                        </Pressable>
                    </View>
                </SafeAreaView>
            </ScreenErrorBoundary>
        );
    }

    const agentName = flyProduct.agent_name || 'Windy Fly';
    const passportId = flyProduct.passport_id || eternitasProduct?.passport_id;
    const trustScore = flyProduct.trust_score ?? eternitasProduct?.trust_score;
    const agentStatus = flyProduct.agent_status || (flyProduct.status === 'active' ? 'online' : 'offline');
    const matrixId = flyProduct.matrix_user_id;
    const dmRoomId = flyProduct.room_id;

    return (
        <ScreenErrorBoundary screenName="Agent">
            <SafeAreaView style={styles.container} edges={['top']}>
                <ScrollView
                    contentContainerStyle={styles.content}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
                >
                    {/* Agent Header */}
                    <View style={styles.headerCard}>
                        <Text style={styles.agentEmoji}>{'\uD83E\uDEB0'}</Text>
                        <Text style={styles.agentName}>{agentName}</Text>
                        <View style={[styles.statusBadge, agentStatus === 'online' && styles.statusOnline]}>
                            <View style={[styles.statusDot, { backgroundColor: agentStatus === 'online' ? '#22c55e' : colors.textTertiary }]} />
                            <Text style={[styles.statusText, agentStatus === 'online' && { color: '#22c55e' }]}>
                                {agentStatus}
                            </Text>
                        </View>
                        {passportId && <EternitasBadge passportId={passportId} size={12} />}
                    </View>

                    {/* Info Cards */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Identity</Text>
                        <View style={styles.card}>
                            {passportId && <InfoRow label="Passport" value={passportId} />}
                            {matrixId && <InfoRow label="Chat ID" value={matrixId} />}
                            {trustScore != null && <InfoRow label="Trust Score" value={`${trustScore}%`} />}
                            {flyProduct.clearance_level != null && <InfoRow label="Clearance" value={`Level ${flyProduct.clearance_level}`} />}
                            {flyProduct.agent_vps && <InfoRow label="VPS" value={flyProduct.agent_vps} />}
                        </View>
                    </View>

                    {/* Quick Actions */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Quick Actions</Text>
                        <View style={styles.card}>
                            {dmRoomId && (
                                <ActionRow
                                    emoji="💬"
                                    label="Open Chat"
                                    onPress={() => {
                                        feedbackService.tap().catch(() => {});
                                        router.push(`/chat/${dmRoomId}`);
                                    }}
                                />
                            )}
                            <ActionRow
                                emoji="🌐"
                                label="View Dashboard"
                                subtitle="Full agent management (web)"
                                onPress={() => Linking.openURL('https://windyword.ai/app/fly').catch(() => {})}
                            />
                            {passportId && (
                                <ActionRow
                                    emoji="🪪"
                                    label="View Passport"
                                    subtitle="Eternitas identity page"
                                    onPress={() => Linking.openURL(`https://eternitas.app/registry/${passportId}`).catch(() => {})}
                                />
                            )}
                        </View>
                    </View>

                    {loading && (
                        <View style={{ padding: 20, alignItems: 'center' }}>
                            <ActivityIndicator color={colors.accent} />
                        </View>
                    )}
                    {loadError && (
                        <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', padding: 12, borderRadius: 8, margin: spacing.md }}>
                            <Text style={{ ...typography.bodySmall, color: '#f87171', textAlign: 'center' }}>{loadError}</Text>
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

function ActionRow({ emoji, label, subtitle, onPress }: {
    emoji: string; label: string; subtitle?: string; onPress: () => void;
}) {
    return (
        <Pressable style={styles.actionRow} onPress={onPress}
            accessibilityLabel={subtitle ? `${label}: ${subtitle}` : label}
            accessibilityRole="button"
        >
            <Text style={{ fontSize: 22 }}>{emoji}</Text>
            <View style={{ flex: 1 }}>
                <Text style={styles.actionLabel}>{label}</Text>
                {subtitle && <Text style={styles.actionSubtitle}>{subtitle}</Text>}
            </View>
            <Text style={styles.chevron}>›</Text>
        </Pressable>
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
    statusOnline: { backgroundColor: 'rgba(34,197,94,0.1)' },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { ...typography.caption, fontWeight: '600', color: colors.textTertiary },

    section: { marginBottom: spacing.lg },
    sectionTitle: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm },
    card: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.borderLight },

    infoRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: spacing.md, paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight,
    },
    infoLabel: { ...typography.bodySmall, color: colors.textTertiary },
    infoValue: { ...typography.bodySmall, fontWeight: '600', color: colors.textPrimary, maxWidth: '60%', textAlign: 'right' },

    actionRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: spacing.md, paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight,
    },
    actionLabel: { ...typography.body, fontWeight: '500', color: colors.textPrimary },
    actionSubtitle: { ...typography.caption, color: colors.textTertiary, marginTop: 1 },
    chevron: { fontSize: 22, fontWeight: '300', color: colors.textTertiary },

    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
    emptySubtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
    hatchBtn: { backgroundColor: colors.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: borderRadius.md, marginTop: spacing.lg },
    hatchBtnText: { ...typography.button, color: colors.background },
});
