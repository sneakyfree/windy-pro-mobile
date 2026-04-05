/**
 * 🪪 Eternitas Trust Badge
 * Small colored circle showing an agent's trust level.
 * Green (70+), yellow (50-69), red (<50), gray (unknown/error).
 * On press, shows passport details in a modal.
 */
import { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, borderRadius, spacing } from '@/theme';
import { typography } from '@/theme/typography';
import { createLogger } from '@/services/logger';
import { fetchWithTimeout } from '@/utils/fetch-timeout';

const log = createLogger('EternitasBadge');

const ETERNITAS_API = 'https://api.eternitas.ai/api/v1/registry/verify';
const CACHE_PREFIX = 'eternitas_badge_';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CachedResult {
    data: BadgeData;
    cachedAt: number;
}

interface BadgeData {
    passport_id: string;
    agent_name: string;
    trust_score: number;
    status: string;
}

function getTrustColor(score: number | null): string {
    if (score === null) return '#64748b'; // gray
    if (score >= 70) return '#22c55e';    // green
    if (score >= 50) return '#eab308';    // yellow
    return '#ef4444';                     // red
}

interface Props {
    passportId: string;
    size?: number;
}

export default function EternitasBadge({ passportId, size = 12 }: Props) {
    const [data, setData] = useState<BadgeData | null>(null);
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        let mounted = true;

        (async () => {
            // Check AsyncStorage cache
            try {
                const cached = await AsyncStorage.getItem(CACHE_PREFIX + passportId);
                if (cached) {
                    const parsed: CachedResult = JSON.parse(cached);
                    if (Date.now() - parsed.cachedAt < CACHE_TTL_MS) {
                        if (mounted) setData(parsed.data);
                        return;
                    }
                }
            } catch { /* cache miss */ }

            // Fetch from API
            try {
                const res = await fetchWithTimeout(`${ETERNITAS_API}/${encodeURIComponent(passportId)}`);
                if (res.ok) {
                    const result = await res.json();
                    const badgeData: BadgeData = {
                        passport_id: result.passport_id || passportId,
                        agent_name: result.agent_name || 'Unknown Agent',
                        trust_score: result.trust_score ?? 0,
                        status: result.status || 'unknown',
                    };
                    if (mounted) setData(badgeData);
                    await AsyncStorage.setItem(
                        CACHE_PREFIX + passportId,
                        JSON.stringify({ data: badgeData, cachedAt: Date.now() })
                    ).catch(() => {});
                }
            } catch {
                log.warn('fetch', 'Failed to fetch trust badge');
            }
        })();

        return () => { mounted = false; };
    }, [passportId]);

    const trustColor = getTrustColor(data?.trust_score ?? null);

    return (
        <>
            <Pressable
                onPress={() => data && setShowModal(true)}
                accessibilityLabel={`Trust badge: ${data ? `score ${data.trust_score}` : 'loading'}`}
                accessibilityRole="button"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
                <View style={[styles.dot, { width: size, height: size, borderRadius: size / 2, backgroundColor: trustColor }]} />
            </Pressable>

            {data && (
                <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
                    <Pressable style={styles.overlay} onPress={() => setShowModal(false)}>
                        <View style={styles.tooltip}>
                            <Text style={styles.tooltipTitle}>🪪 {data.agent_name}</Text>
                            <Text style={styles.tooltipId}>{data.passport_id}</Text>
                            <View style={styles.tooltipRow}>
                                <Text style={styles.tooltipLabel}>Trust Score</Text>
                                <Text style={[styles.tooltipValue, { color: trustColor }]}>{data.trust_score}/100</Text>
                            </View>
                            <View style={styles.tooltipRow}>
                                <Text style={styles.tooltipLabel}>Status</Text>
                                <Text style={styles.tooltipValue}>{data.status}</Text>
                            </View>
                        </View>
                    </Pressable>
                </Modal>
            )}
        </>
    );
}

const styles = StyleSheet.create({
    dot: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)' },
    overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
    tooltip: {
        backgroundColor: colors.surface, borderRadius: borderRadius.lg,
        padding: spacing.md, width: 260, borderWidth: 1, borderColor: colors.borderLight,
    },
    tooltipTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '600', marginBottom: 4 },
    tooltipId: { ...typography.caption, color: colors.textTertiary, fontFamily: 'monospace', marginBottom: 12 },
    tooltipRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    tooltipLabel: { ...typography.bodySmall, color: colors.textTertiary },
    tooltipValue: { ...typography.bodySmall, color: colors.textPrimary, fontWeight: '600' },
});
