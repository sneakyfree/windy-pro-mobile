/**
 * 🧬 M10.1 — Daily Usage Limits Hook
 * Tracks per-feature daily usage counts in AsyncStorage.
 * Free tier: 5 translations/day, 3 OCR scans/day.
 * Paid tiers: unlimited.
 */
import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { Alert } from 'react-native';
import { router } from 'expo-router';

type LimitedFeature = 'translation' | 'ocr';

/** Daily limits per feature for the free tier */
const FREE_LIMITS: Record<LimitedFeature, number> = {
    translation: 5,
    ocr: 3,
};

function getStorageKey(feature: LimitedFeature): string {
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return `windy-usage-${feature}-${date}`;
}

async function getCount(feature: LimitedFeature): Promise<number> {
    try {
        const raw = await AsyncStorage.getItem(getStorageKey(feature));
        return raw ? parseInt(raw, 10) : 0;
    } catch {
        return 0;
    }
}

async function incrementCount(feature: LimitedFeature): Promise<number> {
    const key = getStorageKey(feature);
    const current = await getCount(feature);
    const next = current + 1;
    await AsyncStorage.setItem(key, String(next));
    return next;
}

export function useUsageLimits() {
    const tier = useSettingsStore((s) => s.licenseTier);
    const isPaid = tier !== 'free';

    /** Check if the user can perform this action. Returns { allowed, remaining, limit }. */
    const checkLimit = useCallback(async (feature: LimitedFeature) => {
        if (isPaid) return { allowed: true, remaining: Infinity, limit: Infinity };

        const limit = FREE_LIMITS[feature];
        const used = await getCount(feature);
        const remaining = Math.max(0, limit - used);
        return { allowed: remaining > 0, remaining, limit };
    }, [isPaid]);

    /** Record a usage and return updated remaining count. */
    const recordUsage = useCallback(async (feature: LimitedFeature): Promise<number> => {
        if (isPaid) return Infinity;
        const newCount = await incrementCount(feature);
        const limit = FREE_LIMITS[feature];
        return Math.max(0, limit - newCount);
    }, [isPaid]);

    /** Check limit and show upgrade alert if exhausted. Returns true if allowed. */
    const requireUsage = useCallback(async (feature: LimitedFeature, featureLabel: string): Promise<boolean> => {
        if (isPaid) return true;

        const { allowed, remaining, limit } = await checkLimit(feature);
        if (allowed) return true;

        Alert.alert(
            '🔓 Daily Limit Reached',
            `You've used all ${limit} free ${featureLabel} for today. Upgrade to Windy Word for unlimited access.`,
            [
                { text: 'Later', style: 'cancel' },
                { text: 'View Plans', onPress: () => router.push('/subscription') },
            ]
        );
        return false;
    }, [isPaid, checkLimit]);

    return { checkLimit, recordUsage, requireUsage, isPaid };
}
