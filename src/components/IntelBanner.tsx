/**
 * 🛰️ IntelBanner — update nudge / maintenance / marketing surface
 * (INTEL-CONTRACT-V2 §3 client side).
 *
 * HARD LINES:
 *  - Never interrupts: banners only, one-tap dismiss. The single blocking
 *    surface is the contract-mandated "update required" wall when
 *    app_version < min_version.
 *  - NEVER shown during an active recording or dictation session — we
 *    poll isCaptureActive() and hide/defer while capture is live.
 *  - Renders nothing when telemetry is unconfigured (inert).
 */
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fontSizes } from '@/theme';
import { intelEnabled, isCaptureActive, APP_STORE_URL } from '@/services/intel';
import { useIntelUiStore, intelConfig, type IntelMessage } from '@/services/intelConfig';

const CAPTURE_POLL_MS = 3_000;

export function IntelBanner() {
    const updateRequired = useIntelUiStore((s) => s.updateRequired);
    const updateAvailable = useIntelUiStore((s) => s.updateAvailable);
    const maintenance = useIntelUiStore((s) => s.maintenance);
    const message = useIntelUiStore((s) => s.message);

    const [captureActive, setCaptureActive] = useState(false);
    const [maintenanceHidden, setMaintenanceHidden] = useState<string | null>(null);
    const impressionFor = useRef<string | null>(null);

    const anythingPending = !!(updateRequired || updateAvailable || maintenance || message);

    // Defer everything while recording/dictating (poll, cheap check).
    useEffect(() => {
        if (!anythingPending) return;
        setCaptureActive(isCaptureActive());
        const timer = setInterval(() => setCaptureActive(isCaptureActive()), CAPTURE_POLL_MS);
        return () => clearInterval(timer);
    }, [anythingPending]);

    if (!intelEnabled() || !anythingPending || captureActive) return null;

    // ── Blocking update-required wall (min_version policy, §3) ───────
    if (updateRequired) {
        return (
            <View style={styles.blockingOverlay} accessibilityViewIsModal>
                <Text style={styles.blockingEmoji}>⬆️</Text>
                <Text style={styles.blockingTitle}>Update Required</Text>
                <Text style={styles.blockingBody}>
                    This version of Windy Word is no longer supported. Please
                    update to keep everything working securely.
                </Text>
                <TouchableOpacity
                    style={styles.blockingBtn}
                    onPress={() => { void intelConfig.openUpdate(updateRequired.updateUrl || APP_STORE_URL); }}
                    accessibilityLabel="Update Windy Word"
                    accessibilityRole="button"
                >
                    <Text style={styles.blockingBtnText}>Update Now</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // One banner at a time: maintenance > update-available > message.
    if (maintenance && maintenanceHidden !== maintenance.banner) {
        return (
            <View style={[styles.banner, maintenance.severity === 'critical' ? styles.bannerCritical
                : maintenance.severity === 'warn' ? styles.bannerWarn : null]}>
                <Text style={styles.bannerText} numberOfLines={3}>🛠️ {maintenance.banner}</Text>
                <TouchableOpacity
                    onPress={() => setMaintenanceHidden(maintenance.banner)}
                    style={styles.dismissBtn}
                    accessibilityLabel="Dismiss" accessibilityRole="button"
                >
                    <Text style={styles.dismissText}>✕</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (updateAvailable) {
        return (
            <View style={styles.banner}>
                <Text style={styles.bannerText} numberOfLines={2}>
                    ⬆️ Update available — Windy Word {updateAvailable.latestVersion}
                </Text>
                <TouchableOpacity
                    onPress={() => { void intelConfig.openUpdate(updateAvailable.updateUrl); }}
                    style={styles.ctaBtn}
                    accessibilityLabel="Update Windy Word" accessibilityRole="button"
                >
                    <Text style={styles.ctaText}>Update</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => { void intelConfig.dismissUpdate(updateAvailable.latestVersion); }}
                    style={styles.dismissBtn}
                    accessibilityLabel="Dismiss update banner" accessibilityRole="button"
                >
                    <Text style={styles.dismissText}>✕</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (message) {
        return <MessageBanner message={message} impressionFor={impressionFor} />;
    }

    return null;
}

function MessageBanner({ message, impressionFor }: {
    message: IntelMessage;
    impressionFor: MutableRefObject<string | null>;
}) {
    // marketing.impression exactly once per message_id per display.
    useEffect(() => {
        if (impressionFor.current !== message.message_id) {
            impressionFor.current = message.message_id;
            void intelConfig.recordImpression(message);
        }
    }, [message.message_id, message, impressionFor]);

    const dismissible = message.dismissible !== false;
    return (
        <View style={styles.messageBanner}>
            <View style={styles.messageTextWrap}>
                <Text style={styles.messageTitle} numberOfLines={1}>{message.title}</Text>
                {!!message.body && (
                    <Text style={styles.messageBody} numberOfLines={2}>{message.body}</Text>
                )}
            </View>
            {!!message.cta_url && (
                <TouchableOpacity
                    onPress={() => { void intelConfig.ctaMessage(message); }}
                    style={styles.ctaBtn}
                    accessibilityLabel={message.cta_label || 'Open'} accessibilityRole="button"
                >
                    <Text style={styles.ctaText}>{message.cta_label || 'Open'}</Text>
                </TouchableOpacity>
            )}
            {dismissible && (
                <TouchableOpacity
                    onPress={() => { void intelConfig.dismissMessage(message); }}
                    style={styles.dismissBtn}
                    accessibilityLabel="Dismiss" accessibilityRole="button"
                >
                    <Text style={styles.dismissText}>✕</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    banner: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.surface,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
        paddingHorizontal: 12, paddingVertical: 8, gap: 8,
    },
    bannerWarn: { backgroundColor: 'rgba(251,191,36,0.15)' },
    bannerCritical: { backgroundColor: 'rgba(239,68,68,0.15)' },
    bannerText: { flex: 1, fontSize: fontSizes.sm, color: colors.textPrimary },

    messageBanner: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.surface,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
        paddingHorizontal: 12, paddingVertical: 8, gap: 8,
    },
    messageTextWrap: { flex: 1 },
    messageTitle: { fontSize: fontSizes.sm, fontWeight: '700', color: colors.textPrimary },
    messageBody: { fontSize: fontSizes.xs, color: colors.textSecondary, marginTop: 1 },

    ctaBtn: {
        backgroundColor: colors.accent, borderRadius: 14,
        paddingHorizontal: 12, paddingVertical: 6,
        minHeight: 28, justifyContent: 'center',
    },
    ctaText: { fontSize: fontSizes.xs, fontWeight: '700', color: colors.background },
    dismissBtn: {
        minWidth: 32, minHeight: 32,
        alignItems: 'center', justifyContent: 'center',
    },
    dismissText: { fontSize: fontSizes.sm, color: colors.textTertiary },

    blockingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: colors.background,
        alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: 32, zIndex: 9999, elevation: 20,
    },
    blockingEmoji: { fontSize: 56, marginBottom: 16 },
    blockingTitle: {
        fontSize: fontSizes['2xl'], fontWeight: '700',
        color: colors.textPrimary, marginBottom: 8, textAlign: 'center',
    },
    blockingBody: {
        fontSize: 15, color: colors.textSecondary,
        textAlign: 'center', lineHeight: 22, marginBottom: 24,
    },
    blockingBtn: {
        backgroundColor: colors.accent, borderRadius: 24,
        paddingHorizontal: 32, paddingVertical: 14, minHeight: 48,
        justifyContent: 'center',
    },
    blockingBtnText: { fontSize: 17, fontWeight: '700', color: colors.background },
});
