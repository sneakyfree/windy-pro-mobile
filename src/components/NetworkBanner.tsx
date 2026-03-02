/**
 * 🧬 M1 — Network Status Banner
 * Offline/online detection with animated slide-down banner
 */
import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { colors, spacing, borderRadius } from '@/theme';

export function NetworkBanner() {
    const [isOffline, setIsOffline] = useState(false);
    const [wasOffline, setWasOffline] = useState(false);
    const slideAnim = useRef(new Animated.Value(-60)).current;
    const onlineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
            const offline = !(state.isConnected && state.isInternetReachable !== false);

            if (offline) {
                setIsOffline(true);
                setWasOffline(true);
                // Clear any pending online timer
                if (onlineTimer.current) {
                    clearTimeout(onlineTimer.current);
                    onlineTimer.current = null;
                }
                // Slide in
                Animated.spring(slideAnim, {
                    toValue: 0,
                    tension: 50,
                    friction: 10,
                    useNativeDriver: true,
                }).start();
            } else if (wasOffline || isOffline) {
                // Back online — show "back online" briefly
                setIsOffline(false);
                // Keep banner visible for 2s showing "back online"
                onlineTimer.current = setTimeout(() => {
                    setWasOffline(false);
                    Animated.timing(slideAnim, {
                        toValue: -60,
                        duration: 300,
                        useNativeDriver: true,
                    }).start();
                }, 2000);
            }
        });

        return () => {
            unsubscribe();
            if (onlineTimer.current) clearTimeout(onlineTimer.current);
        };
    }, [wasOffline, isOffline]);

    // Don't render at all if never been offline
    if (!wasOffline && !isOffline) return null;

    return (
        <Animated.View
            style={[
                styles.banner,
                isOffline ? styles.bannerOffline : styles.bannerOnline,
                { transform: [{ translateY: slideAnim }] },
            ]}
        >
            <Text style={styles.bannerEmoji}>{isOffline ? '📡' : '✅'}</Text>
            <View style={styles.bannerContent}>
                <Text style={styles.bannerTitle}>
                    {isOffline ? 'You\'re offline' : 'Back online'}
                </Text>
                <Text style={styles.bannerSubtext}>
                    {isOffline
                        ? 'Recordings are saved locally. Sync when reconnected.'
                        : 'Connection restored. Syncing...'}
                </Text>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    banner: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingTop: Platform.OS === 'ios' ? 50 : 30,
        paddingBottom: spacing.sm,
        paddingHorizontal: spacing.md,
    },
    bannerOffline: {
        backgroundColor: 'rgba(239, 68, 68, 0.95)',
    },
    bannerOnline: {
        backgroundColor: 'rgba(34, 197, 94, 0.95)',
    },
    bannerEmoji: { fontSize: 20 },
    bannerContent: { flex: 1 },
    bannerTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#fff',
    },
    bannerSubtext: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.85)',
        marginTop: 1,
    },
});
