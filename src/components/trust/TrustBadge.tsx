/**
 * Compact trust badge: "ET • {band} ({score})" colored by band.
 *
 * Use next to an agent's name in any list. Fetches through trustApi so the
 * 5-minute cache is shared with the settings/trust screen and the polling
 * monitor.
 */
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fontSizes } from '@/theme';
import {
    getTrustOrNull,
    peekTrust,
    BAND_COLORS,
    BAND_LABELS,
    type TrustProfile,
} from '@/services/trustApi';

interface Props {
    passport: string | null | undefined;
    /** Render a shorter version suited for row badges (no "ET •" prefix). */
    compact?: boolean;
}

export function TrustBadge({ passport, compact = false }: Props) {
    const [profile, setProfile] = useState<TrustProfile | null>(
        passport ? peekTrust(passport) : null,
    );

    useEffect(() => {
        let cancelled = false;
        if (!passport) { setProfile(null); return; }
        // Keep the cached value visible while the fetch resolves.
        setProfile(prev => prev?.passport_number === passport ? prev : peekTrust(passport));
        getTrustOrNull(passport).then((p) => {
            if (!cancelled) setProfile(p);
        });
        return () => { cancelled = true; };
    }, [passport]);

    if (!passport) return null;

    if (!profile) {
        return (
            <View style={[styles.badge, styles.unknown]}>
                <Text style={styles.unknownText}>{compact ? '—' : 'ET • —'}</Text>
            </View>
        );
    }

    const color = BAND_COLORS[profile.band];
    return (
        <View
            style={[styles.badge, { borderColor: color }]}
            accessibilityLabel={`Trust band ${BAND_LABELS[profile.band]}, score ${profile.integrity_score}`}
        >
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Text style={styles.text}>
                {compact ? '' : 'ET • '}
                <Text style={{ color }}>{BAND_LABELS[profile.band].toLowerCase()}</Text>
                {' '}
                <Text style={styles.score}>({profile.integrity_score})</Text>
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.borderLight,
        borderRadius: 999,
        paddingVertical: 2,
        paddingHorizontal: 8,
        alignSelf: 'flex-start',
        gap: 6,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    text: {
        fontSize: fontSizes.xs,
        color: colors.textSecondary,
        fontWeight: '600',
    },
    score: {
        color: colors.textSecondary,
        fontWeight: '500',
    },
    unknown: { borderColor: colors.borderLight },
    unknownText: {
        fontSize: fontSizes.xs,
        color: colors.textTertiary,
    },
});
