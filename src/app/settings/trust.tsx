/**
 * Trust & Clearance screen.
 *
 * Shows the signed-in user's own Eternitas passport, score, band, clearance
 * badge, and an expandable "What this unlocks" list (allowed vs denied
 * actions). If the user doesn't have a passport yet, shows an enrolment CTA.
 */
import { useEffect, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Linking, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors, fontSizes } from '@/theme';
import {
    getTrustOrNull,
    BAND_COLORS,
    BAND_LABELS,
    CLEARANCE_LABELS,
    type TrustProfile,
} from '@/services/trustApi';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

const ETERNITAS_ENROL_URL = 'https://api.eternitas.ai/enrol';

export default function TrustScreen() {
    const [passport, setPassport] = useState<string | null>(null);
    const [profile, setProfile] = useState<TrustProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showActions, setShowActions] = useState(true);

    useEffect(() => {
        void load('initial');
    }, []);

    async function load(mode: 'initial' | 'refresh'): Promise<void> {
        if (mode === 'initial') setLoading(true);
        if (mode === 'refresh') setRefreshing(true);

        let myPassport: string | null = null;
        try {
            const { useSettingsStore } = require('@/stores/useSettingsStore');
            const eco = useSettingsStore.getState().ecosystemStatus;
            myPassport = eco?.products?.eternitas?.passport_id ?? null;
        } catch { /* store may not be ready */ }
        setPassport(myPassport);

        if (myPassport) {
            const p = await getTrustOrNull(myPassport, { fresh: mode === 'refresh' });
            setProfile(p);
        } else {
            setProfile(null);
        }
        setLoading(false);
        setRefreshing(false);
    }

    return (
        <ScreenErrorBoundary screenName="Trust">
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/settings'))}
                        style={styles.backButton}
                    >
                        <Text style={styles.backText}>← Settings</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Trust &amp; Clearance</Text>
                </View>

                {loading ? (
                    <View style={styles.center}>
                        <ActivityIndicator color={colors.accent} />
                    </View>
                ) : !passport ? (
                    <View style={styles.empty}>
                        <Text style={styles.emptyIcon}>🪪</Text>
                        <Text style={styles.emptyTitle}>No Eternitas passport yet</Text>
                        <Text style={styles.emptyBody}>
                            Enrol with Eternitas to get a passport, an integrity score, and
                            a clearance level that unlocks features across the Windy
                            ecosystem.
                        </Text>
                        <TouchableOpacity
                            style={styles.primaryButton}
                            onPress={() => Linking.openURL(ETERNITAS_ENROL_URL).catch(() => {})}
                        >
                            <Text style={styles.primaryButtonText}>Enrol on eternitas.ai</Text>
                        </TouchableOpacity>
                    </View>
                ) : !profile ? (
                    <View style={styles.empty}>
                        <Text style={styles.emptyIcon}>⚠️</Text>
                        <Text style={styles.emptyTitle}>Couldn't reach Eternitas</Text>
                        <Text style={styles.emptyBody}>Pull down to retry.</Text>
                    </View>
                ) : (
                    <ScrollView
                        contentContainerStyle={styles.content}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={() => load('refresh')}
                                tintColor={colors.accent}
                            />
                        }
                    >
                        <View style={styles.passportCard}>
                            <Text style={styles.cardLabel}>PASSPORT</Text>
                            <Text style={styles.passport} selectable>
                                {profile.passport_number}
                            </Text>

                            <View style={styles.scoreRow}>
                                <View>
                                    <Text style={styles.cardLabel}>INTEGRITY</Text>
                                    <Text style={styles.score}>{profile.integrity_score}</Text>
                                    <Text style={styles.scoreMax}>/ 1000</Text>
                                </View>
                                <View style={styles.bandColumn}>
                                    <Text style={styles.cardLabel}>BAND</Text>
                                    <View style={[styles.bandPill, { backgroundColor: BAND_COLORS[profile.band] + '22', borderColor: BAND_COLORS[profile.band] }]}>
                                        <Text style={[styles.bandText, { color: BAND_COLORS[profile.band] }]}>
                                            {BAND_LABELS[profile.band]}
                                        </Text>
                                    </View>
                                </View>
                            </View>

                            <View style={styles.clearanceRow}>
                                <Text style={styles.cardLabel}>CLEARANCE</Text>
                                <View style={styles.clearancePill}>
                                    <Text style={styles.clearanceText}>
                                        {CLEARANCE_LABELS[profile.clearance_level]}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        <DimensionsBlock profile={profile} />

                        <TouchableOpacity
                            style={styles.sectionHeader}
                            onPress={() => setShowActions(s => !s)}
                            accessibilityRole="button"
                        >
                            <Text style={styles.sectionTitle}>What this unlocks</Text>
                            <Text style={styles.chevron}>{showActions ? '−' : '+'}</Text>
                        </TouchableOpacity>
                        {showActions && (
                            <View style={styles.actionsBlock}>
                                {profile.allowed_actions.length > 0 && (
                                    <View style={styles.actionGroup}>
                                        <Text style={styles.actionGroupLabel}>ALLOWED</Text>
                                        {profile.allowed_actions.map(a => (
                                            <View key={`allow-${a}`} style={styles.actionRow}>
                                                <Text style={styles.allowIcon}>✓</Text>
                                                <Text style={styles.actionText}>{a}</Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                                {profile.denied_actions.length > 0 && (
                                    <View style={styles.actionGroup}>
                                        <Text style={styles.actionGroupLabel}>DENIED</Text>
                                        {profile.denied_actions.map(a => (
                                            <View key={`deny-${a}`} style={styles.actionRow}>
                                                <Text style={styles.denyIcon}>✕</Text>
                                                <Text style={styles.actionText}>{a}</Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                                {profile.allowed_actions.length === 0 && profile.denied_actions.length === 0 && (
                                    <Text style={styles.emptyBody}>
                                        No action policies returned by Eternitas.
                                    </Text>
                                )}
                            </View>
                        )}

                        <Text style={styles.footer}>
                            Evaluated {new Date(profile.evaluated_at).toLocaleString()}
                        </Text>
                    </ScrollView>
                )}
            </SafeAreaView>
        </ScreenErrorBoundary>
    );
}

function DimensionsBlock({ profile }: { profile: TrustProfile }) {
    const dims = profile.dimensions;
    const rows: Array<[string, number]> = [
        ['Honesty', dims.honesty],
        ['Reliability', dims.reliability],
        ['Compliance', dims.compliance],
        ['Safety', dims.safety],
        ['Reputation', dims.reputation],
    ];
    return (
        <View style={styles.dimensionsBlock}>
            <Text style={styles.sectionTitle}>Dimensions</Text>
            {rows.map(([label, value]) => (
                <View key={label} style={styles.dimensionRow}>
                    <Text style={styles.dimensionLabel}>{label}</Text>
                    <View style={styles.dimensionBarBg}>
                        <View style={[styles.dimensionBar, { width: `${Math.max(0, Math.min(100, value / 10))}%` }]} />
                    </View>
                    <Text style={styles.dimensionValue}>{value}</Text>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    backButton: { paddingVertical: 8, paddingHorizontal: 8, minHeight: 44, justifyContent: 'center' },
    backText: { color: colors.accent, fontSize: fontSizes.base, fontWeight: '600' },
    headerTitle: { fontSize: fontSizes.base, fontWeight: '700', color: colors.textPrimary, marginLeft: 8 },

    content: { padding: 16, paddingBottom: 40 },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    emptyIcon: { fontSize: 52, marginBottom: 16 },
    emptyTitle: { fontSize: fontSizes.base, fontWeight: '700', color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
    emptyBody: { fontSize: fontSizes.sm, color: colors.textSecondary, textAlign: 'center', marginBottom: 24 },

    primaryButton: {
        backgroundColor: colors.accent, borderRadius: 12,
        paddingVertical: 14, paddingHorizontal: 24,
        minHeight: 44, alignItems: 'center', justifyContent: 'center',
    },
    primaryButtonText: { color: colors.background, fontWeight: '700', fontSize: fontSizes.base },

    passportCard: {
        backgroundColor: colors.surface,
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    cardLabel: { fontSize: 11, letterSpacing: 1, color: colors.textTertiary, fontWeight: '700', marginBottom: 4 },
    passport: {
        fontSize: 22, fontWeight: '700', color: colors.textPrimary,
        fontVariant: ['tabular-nums'], marginBottom: 20, letterSpacing: 1,
    },
    scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
    score: { fontSize: 40, fontWeight: '800', color: colors.textPrimary, lineHeight: 44 },
    scoreMax: { fontSize: fontSizes.xs, color: colors.textTertiary },
    bandColumn: { alignItems: 'flex-end' },
    bandPill: {
        borderWidth: 1, borderRadius: 999,
        paddingHorizontal: 10, paddingVertical: 4, marginTop: 4,
    },
    bandText: { fontSize: fontSizes.sm, fontWeight: '700' },
    clearanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    clearancePill: {
        backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderLight,
        borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
    },
    clearanceText: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.textPrimary },

    dimensionsBlock: { marginBottom: 20 },
    dimensionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 10 },
    dimensionLabel: { width: 90, fontSize: fontSizes.sm, color: colors.textSecondary },
    dimensionBarBg: { flex: 1, height: 6, backgroundColor: colors.surface, borderRadius: 3, overflow: 'hidden' },
    dimensionBar: { height: 6, backgroundColor: colors.accent, borderRadius: 3 },
    dimensionValue: { width: 40, textAlign: 'right', fontSize: fontSizes.sm, color: colors.textSecondary, fontVariant: ['tabular-nums'] },

    sectionHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight,
    },
    sectionTitle: { fontSize: fontSizes.base, fontWeight: '700', color: colors.textPrimary },
    chevron: { fontSize: 20, color: colors.textSecondary, fontWeight: '700' },

    actionsBlock: { paddingBottom: 16 },
    actionGroup: { marginBottom: 12 },
    actionGroupLabel: { fontSize: 11, letterSpacing: 1, color: colors.textTertiary, fontWeight: '700', marginBottom: 6 },
    actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 10 },
    allowIcon: { color: '#22c55e', fontSize: fontSizes.base, fontWeight: '700', width: 14 },
    denyIcon: { color: '#ef4444', fontSize: fontSizes.base, fontWeight: '700', width: 14 },
    actionText: { fontSize: fontSizes.sm, color: colors.textPrimary, flex: 1 },

    footer: { fontSize: fontSizes.xs, color: colors.textTertiary, textAlign: 'center', marginTop: 24 },
});
