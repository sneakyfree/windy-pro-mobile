/**
 * 🧬 RP-5.3 — Feature Gating Hook
 * Central hook for checking feature access by license tier
 */
import { useSettingsStore } from '@/stores/useSettingsStore';
import { licenseService } from '@/services/license';
import { Alert } from 'react-native';
import * as Linking from 'expo-linking';

type Feature =
    | 'translate'
    | 'cloud-sync'
    | 'cloud-pro-engine'
    | 'cloud-realtime-engine'
    | 'large-model'
    | 'video-capture'
    | 'voice-clone'
    | 'unlimited-recording';

/** Maps features to the minimum tier required */
const FEATURE_TIERS: Record<Feature, string[]> = {
    'translate': ['pro', 'team', 'enterprise'],
    'cloud-sync': ['pro', 'team', 'enterprise'],
    'cloud-pro-engine': ['pro', 'team', 'enterprise'],
    'cloud-realtime-engine': ['team', 'enterprise'],
    'large-model': ['pro', 'team', 'enterprise'],
    'video-capture': ['pro', 'team', 'enterprise'],
    'voice-clone': ['pro', 'team', 'enterprise'],
    'unlimited-recording': ['pro', 'team', 'enterprise'],
};

/** Recording duration limits per tier (seconds) */
export const RECORDING_LIMITS: Record<string, number> = {
    'free': 5 * 60,       // 5 minutes
    'pro': 60 * 60,       // 1 hour
    'team': 4 * 60 * 60,  // 4 hours
    'enterprise': Infinity,
};

/**
 * Check if a feature is unlocked for the current tier
 */
export function useFeatureGate() {
    const tier = useSettingsStore((s) => s.licenseTier);

    const isUnlocked = (feature: Feature): boolean => {
        const allowed = FEATURE_TIERS[feature];
        if (!allowed) return true;
        return allowed.includes(tier);
    };

    const requireFeature = (feature: Feature, featureLabel?: string): boolean => {
        if (isUnlocked(feature)) return true;

        Alert.alert(
            '🔒 Upgrade Required',
            `${featureLabel || feature} requires Windy Pro. Upgrade to unlock this feature.`,
            [
                { text: 'Later', style: 'cancel' },
                {
                    text: 'Upgrade',
                    onPress: async () => {
                        const url = await licenseService.getPurchaseUrl('');
                        Linking.openURL(url);
                    },
                },
            ]
        );
        return false;
    };

    const getRecordingLimit = (): number => {
        return RECORDING_LIMITS[tier] || RECORDING_LIMITS['free'];
    };

    return {
        isUnlocked,
        requireFeature,
        getRecordingLimit,
        tier,
    };
}
