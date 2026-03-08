/**
 * 🧬 Phone-as-Camera Mode
 * Link phone to desktop via pairing code. Stream front camera via WebRTC.
 * Persistent notification while linked, front/back camera switch.
 */
import { View, Text, StyleSheet, Pressable, Platform, Alert, Switch, AppState, AppStateStatus } from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { colors, spacing, borderRadius } from '@/theme';
import { feedbackService } from '@/services/feedback';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

const SIGNALING_URL = 'wss://windypro.thewindstorm.uk/ws/camera-link';

type LinkState = 'idle' | 'generating' | 'waiting' | 'connecting' | 'linked' | 'error';

export default function PhoneCameraScreen() {
    const router = useRouter();
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);

    const [state, setState] = useState<LinkState>('idle');
    const [pairingCode, setPairingCode] = useState('');
    const [facing, setFacing] = useState<CameraType>('front');
    const [streamAudio, setStreamAudio] = useState(true);
    const [linkDuration, setLinkDuration] = useState(0);
    const [desktopName, setDesktopName] = useState('Desktop');

    const wsRef = useRef<WebSocket | null>(null);
    const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ─── Generate Pairing Code ──────────────────────────────────

    const generatePairingCode = useCallback(async () => {
        setState('generating');
        await feedbackService.tap();

        try {
            // Generate 6-digit code
            const code = String(Math.floor(100000 + Math.random() * 900000));
            setPairingCode(code);
            setState('waiting');

            // Connect to signaling server
            const ws = new WebSocket(`${SIGNALING_URL}?code=${code}&role=camera`);
            wsRef.current = ws;

            ws.onopen = () => {
                // Waiting for desktop to connect with this code
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);

                    if (msg.type === 'desktop-connected') {
                        setState('connecting');
                        setDesktopName(msg.desktop_name || 'Desktop');
                        // In production: exchange WebRTC offer/answer/ICE here
                        // For now, simulate connected state
                        setTimeout(() => {
                            setState('linked');
                            startLinkTimer();
                            activateKeepAwakeAsync('camera-link').catch(() => { });
                            feedbackService.success();
                        }, 1500);
                    }

                    if (msg.type === 'switch-camera') {
                        setFacing(f => f === 'front' ? 'back' : 'front');
                    }

                    if (msg.type === 'disconnect') {
                        handleDisconnect();
                    }
                } catch (err) { console.warn("[CameraLink] Invalid message:", err); }
            };

            ws.onerror = () => {
                setState('error');
            };

            ws.onclose = () => {
                if (state === 'linked') handleDisconnect();
            };
        } catch (err) { console.warn("[CameraLink] Error:", err);
            setState('error');
        }
    }, []);

    const startLinkTimer = () => {
        setLinkDuration(0);
        durationRef.current = setInterval(() => {
            setLinkDuration(prev => prev + 1);
        }, 1000);
    };

    const handleDisconnect = useCallback(() => {
        wsRef.current?.close();
        wsRef.current = null;
        if (durationRef.current) {
            clearInterval(durationRef.current);
            durationRef.current = null;
        }
        setState('idle');
        setPairingCode('');
        setLinkDuration(0);
        deactivateKeepAwake('camera-link');
        feedbackService.tap();
    }, []);

    const toggleCamera = () => {
        setFacing(f => f === 'front' ? 'back' : 'front');
        // Notify desktop of camera switch
        wsRef.current?.send(JSON.stringify({ type: 'camera-switched', facing: facing === 'front' ? 'back' : 'front' }));
    };

    // ─── Cleanup ────────────────────────────────────────────────

    useEffect(() => {
        return () => {
            wsRef.current?.close();
            if (durationRef.current) clearInterval(durationRef.current);
            deactivateKeepAwake('camera-link');
        };
    }, []);

    // Keep awake while app is in background too
    useEffect(() => {
        const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
            if (nextState === 'active' && state === 'linked') {
                activateKeepAwakeAsync('camera-link').catch(() => { });
            }
        });
        return () => sub.remove();
    }, [state]);

    const formatDuration = (secs: number): string => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    // ─── Permission ─────────────────────────────────────────────

    if (!permission?.granted) {
        return (
            <View style={styles.container}>
                <View style={styles.permissionCard}>
                    <Text style={styles.permissionEmoji}>📷</Text>
                    <Text style={styles.permissionTitle}>Camera Access Required</Text>
                    <Text style={styles.permissionText}>Camera access is needed to stream video to your desktop for clone training.</Text>
                    <Pressable style={styles.primaryBtn} onPress={requestPermission}>
                        <Text style={styles.primaryBtnText}>Grant Camera Access</Text>
                    </Pressable>
                </View>
            </View>
        );
    }

    // ─── Render ─────────────────────────────────────────────────

    return (
        <ScreenErrorBoundary screenName="PhoneCamera">
            <View style={styles.container}>
                {/* Camera Preview (always visible) */}
                <CameraView ref={cameraRef} style={styles.camera} facing={facing}>
                    {/* Top Bar */}
                    <View style={styles.topBar}>
                        <Pressable onPress={() => state === 'linked' ? handleDisconnect() : router.back()} style={styles.topBtn}>
                            <Text style={styles.topBtnText}>{state === 'linked' ? '⏹ Disconnect' : '← Back'}</Text>
                        </Pressable>
                        <View style={styles.topCenter}>
                            {state === 'linked' && (
                                <>
                                    <View style={styles.liveDot} />
                                    <Text style={styles.liveText}>LINKED • {formatDuration(linkDuration)}</Text>
                                </>
                            )}
                        </View>
                        <Pressable onPress={toggleCamera} style={styles.topBtn}>
                            <Text style={styles.topBtnText}>🔄</Text>
                        </Pressable>
                    </View>

                    {/* Center Content */}
                    <View style={styles.centerContent}>
                        {state === 'idle' && (
                            <View style={styles.actionCard}>
                                <Text style={styles.actionEmoji}>📱</Text>
                                <Text style={styles.actionTitle}>Link to Desktop</Text>
                                <Text style={styles.actionDesc}>
                                    Use your phone as a camera for clone training.{'\n'}
                                    Stream video directly to Windy Pro Desktop.
                                </Text>
                                <Pressable style={styles.primaryBtn} onPress={generatePairingCode}>
                                    <Text style={styles.primaryBtnText}>🔗 Generate Pairing Code</Text>
                                </Pressable>
                            </View>
                        )}

                        {state === 'generating' && (
                            <View style={styles.actionCard}>
                                <Text style={styles.actionEmoji}>⏳</Text>
                                <Text style={styles.actionTitle}>Generating code...</Text>
                            </View>
                        )}

                        {state === 'waiting' && (
                            <View style={styles.actionCard}>
                                <Text style={styles.codeLabel}>Enter this code on Desktop:</Text>
                                <View style={styles.codeRow}>
                                    {pairingCode.split('').map((digit, i) => (
                                        <View key={i} style={styles.codeDigit}>
                                            <Text style={styles.codeDigitText}>{digit}</Text>
                                        </View>
                                    ))}
                                </View>
                                <Text style={styles.waitingText}>
                                    Waiting for desktop to connect...
                                </Text>
                                <Pressable style={styles.cancelBtn} onPress={handleDisconnect}>
                                    <Text style={styles.cancelBtnText}>Cancel</Text>
                                </Pressable>
                            </View>
                        )}

                        {state === 'connecting' && (
                            <View style={styles.actionCard}>
                                <Text style={styles.actionEmoji}>🔗</Text>
                                <Text style={styles.actionTitle}>Connecting to {desktopName}...</Text>
                            </View>
                        )}

                        {state === 'error' && (
                            <View style={styles.actionCard}>
                                <Text style={styles.actionEmoji}>❌</Text>
                                <Text style={styles.actionTitle}>Connection Failed</Text>
                                <Pressable style={styles.primaryBtn} onPress={generatePairingCode}>
                                    <Text style={styles.primaryBtnText}>Try Again</Text>
                                </Pressable>
                            </View>
                        )}
                    </View>

                    {/* Bottom Controls (shown when linked) */}
                    {state === 'linked' && (
                        <View style={styles.bottomBar}>
                            <View style={styles.linkedCard}>
                                <View style={styles.linkedRow}>
                                    <View style={styles.liveDot} />
                                    <Text style={styles.linkedText}>Streaming to {desktopName}</Text>
                                </View>

                                <View style={styles.toggleRow}>
                                    <Text style={styles.toggleLabel}>Stream Audio</Text>
                                    <Switch
                                        value={streamAudio}
                                        onValueChange={setStreamAudio}
                                        trackColor={{ false: colors.border, true: colors.accent }}
                                        thumbColor="#fff"
                                    />
                                </View>

                                <View style={styles.toggleRow}>
                                    <Text style={styles.toggleLabel}>Camera</Text>
                                    <Text style={styles.toggleValue}>{facing === 'front' ? '🤳 Front' : '📷 Back'}</Text>
                                </View>
                            </View>
                        </View>
                    )}
                </CameraView>
            </View>
        </ScreenErrorBoundary>
    );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    camera: { flex: 1 },

    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingHorizontal: 16 },
    topBtn: { padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12 },
    topBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
    topCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
    liveText: { color: '#fff', fontSize: 13, fontWeight: '600' },

    centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },

    actionCard: { backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 24, padding: 28, alignItems: 'center', maxWidth: 320, width: '100%' },
    actionEmoji: { fontSize: 40, marginBottom: 12 },
    actionTitle: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 8, textAlign: 'center' },
    actionDesc: { fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 20, marginBottom: 20 },

    primaryBtn: { backgroundColor: colors.accent, borderRadius: borderRadius.lg, paddingVertical: 14, paddingHorizontal: 28, width: '100%', alignItems: 'center' },
    primaryBtnText: { color: '#000', fontWeight: '700', fontSize: 16 },

    codeLabel: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 16 },
    codeRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
    codeDigit: { width: 44, height: 56, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
    codeDigitText: { fontSize: 28, fontWeight: '700', color: colors.accent },
    waitingText: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 16 },
    cancelBtn: { paddingVertical: 10 },
    cancelBtnText: { color: '#ef4444', fontSize: 14, fontWeight: '600' },

    bottomBar: { paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 40 : 20 },
    linkedCard: { backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 20, padding: 16 },
    linkedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    linkedText: { color: '#fff', fontSize: 15, fontWeight: '600' },
    toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
    toggleLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
    toggleValue: { color: colors.accent, fontSize: 14, fontWeight: '600' },

    permissionCard: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, backgroundColor: colors.background },
    permissionEmoji: { fontSize: 64, marginBottom: spacing.lg },
    permissionTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
    permissionText: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.lg },
});
