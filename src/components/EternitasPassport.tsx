/**
 * 🪪 Eternitas Passport Display
 * Shows an agent's passport info: ID, trust score, registration date, status.
 * Fetches from Eternitas registry API with 1-hour cache.
 */
import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, borderRadius, spacing } from '@/theme';
import { typography } from '@/theme/typography';
import { createLogger } from '@/services/logger';
import { fetchWithTimeout } from '@/utils/fetch-timeout';

const log = createLogger('EternitasPassport');

const ETERNITAS_API = 'https://api.eternitas.ai/api/v1/registry/verify';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ─── Types ──────────────────────────────────────────────────────

export interface PassportData {
    passport_id: string;
    agent_name: string;
    trust_score: number;        // 0-100
    status: 'active' | 'suspended' | 'revoked' | 'pending';
    registered_at: string;      // ISO date
    last_verified_at?: string;
    capabilities?: string[];
}

// ─── Cache ──────────────────────────────────────────────────────

let cachedPassport: PassportData | null = null;
let cacheExpiry = 0;

export async function fetchPassport(passportId: string): Promise<PassportData | null> {
    if (cachedPassport && cachedPassport.passport_id === passportId && Date.now() < cacheExpiry) {
        return cachedPassport;
    }

    try {
        const res = await fetchWithTimeout(`${ETERNITAS_API}/${encodeURIComponent(passportId)}`, {
            headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
            log.warn('fetchPassport', `Eternitas API returned ${res.status}`);
            return cachedPassport; // Return stale cache if available
        }
        const data = await res.json();
        cachedPassport = data;
        cacheExpiry = Date.now() + CACHE_TTL_MS;
        return data;
    } catch (err) {
        log.warn('fetchPassport', 'Failed to fetch passport');
        return cachedPassport; // Return stale cache
    }
}

// ─── Trust Score Helpers ────────────────────────────────────────

function getTrustColor(score: number): string {
    if (score >= 70) return '#22c55e'; // green
    if (score >= 50) return '#eab308'; // yellow
    return '#ef4444';                  // red
}

function getTrustLabel(score: number): string {
    if (score >= 70) return 'Trusted';
    if (score >= 50) return 'Moderate';
    return 'Low Trust';
}

function getStatusColor(status: string): string {
    switch (status) {
        case 'active': return '#22c55e';
        case 'suspended': return '#f97316';
        case 'revoked': return '#ef4444';
        case 'pending': return '#eab308';
        default: return '#64748b';
    }
}

// ─── Component ──────────────────────────────────────────────────

interface Props {
    passportId: string;
    compact?: boolean; // Smaller version for chat header
}

export default function EternitasPassport({ passportId, compact = false }: Props) {
    const [passport, setPassport] = useState<PassportData | null>(cachedPassport);
    const [loading, setLoading] = useState(!cachedPassport);

    useEffect(() => {
        let mounted = true;
        fetchPassport(passportId).then(data => {
            if (mounted && data) {
                setPassport(data);
                setLoading(false);
            }
        });
        return () => { mounted = false; };
    }, [passportId]);

    if (loading && !passport) {
        return (
            <View style={[styles.card, compact && styles.cardCompact]}>
                <ActivityIndicator color={colors.accent} size="small" />
            </View>
        );
    }

    if (!passport) return null;

    const trustColor = getTrustColor(passport.trust_score);
    const statusColor = getStatusColor(passport.status);

    if (compact) {
        return (
            <View style={styles.cardCompact} accessibilityLabel={`Eternitas passport ${passport.passport_id}, trust score ${passport.trust_score}`}>
                <View style={[styles.trustDot, { backgroundColor: trustColor }]} />
                <Text style={styles.compactId}>{passport.passport_id}</Text>
                <Text style={[styles.compactScore, { color: trustColor }]}>{passport.trust_score}</Text>
            </View>
        );
    }

    return (
        <View style={styles.card} accessibilityLabel={`Eternitas passport for ${passport.agent_name}. ID ${passport.passport_id}. Trust score ${passport.trust_score}. Status ${passport.status}.`}>
            <View style={styles.header}>
                <Text style={styles.emoji}>🪪</Text>
                <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{passport.agent_name}</Text>
                    <Text style={styles.passportId}>{passport.passport_id}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor + '40' }]}>
                    <Text style={[styles.statusText, { color: statusColor }]}>{passport.status}</Text>
                </View>
            </View>

            <View style={styles.trustRow}>
                <Text style={styles.trustLabel}>Trust Score</Text>
                <View style={styles.trustBarBg}>
                    <View style={[styles.trustBarFill, { width: `${passport.trust_score}%`, backgroundColor: trustColor }]} />
                </View>
                <Text style={[styles.trustValue, { color: trustColor }]}>{passport.trust_score} — {getTrustLabel(passport.trust_score)}</Text>
            </View>

            <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Registered</Text>
                <Text style={styles.metaValue}>{new Date(passport.registered_at).toLocaleDateString()}</Text>
            </View>
        </View>
    );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginHorizontal: spacing.screenPadding,
        marginBottom: spacing.sm,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    cardCompact: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 4,
        paddingHorizontal: 8,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 12,
    },
    emoji: { fontSize: 28 },
    title: { ...typography.bodySmall, color: colors.textPrimary, fontWeight: '600' },
    passportId: { ...typography.caption, color: colors.textTertiary, fontFamily: 'monospace' },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: borderRadius.sm,
        borderWidth: 1,
    },
    statusText: { ...typography.caption, fontWeight: '600', textTransform: 'capitalize' },
    trustRow: { marginBottom: 10 },
    trustLabel: { ...typography.caption, color: colors.textTertiary, marginBottom: 4 },
    trustBarBg: {
        height: 6,
        backgroundColor: colors.borderLight,
        borderRadius: 3,
        marginBottom: 4,
    },
    trustBarFill: { height: 6, borderRadius: 3 },
    trustValue: { ...typography.caption, fontWeight: '600' },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
    metaLabel: { ...typography.caption, color: colors.textTertiary },
    metaValue: { ...typography.caption, color: colors.textSecondary },
    trustDot: { width: 8, height: 8, borderRadius: 4 },
    compactId: { ...typography.caption, color: colors.textTertiary, fontFamily: 'monospace' },
    compactScore: { ...typography.caption, fontWeight: '700' },
});
