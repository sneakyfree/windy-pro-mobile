/**
 * 🌪️ WindyTune Smart Nudge
 * Monitors device performance during transcription and suggests
 * options when the device is struggling. Never auto-switches.
 * Respects user preferences and nudge frequency limits.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';
import { createLogger } from './logger';

const log = createLogger('WindyTuneNudge');

const NUDGE_STORAGE_KEY = 'windy_nudge_state';
const MAX_DISMISSALS = 3; // After 3 dismissals, stop nudging forever
const MIN_NUDGE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week between nudges
const SLOW_THRESHOLD_MULTIPLIER = 3; // 3x slower than expected = struggling
const CONSECUTIVE_SLOW_THRESHOLD = 2; // Need 2 consecutive slow transcriptions

interface NudgeState {
    dismissCount: number;
    lastNudgeTimestamp: number;
    permanentlyDismissed: boolean;
    consecutiveSlowCount: number;
}

async function getNudgeState(): Promise<NudgeState> {
    try {
        const raw = await AsyncStorage.getItem(NUDGE_STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) {
        log.warn('state_read_error', 'Failed to read nudge state', { error: String(e) });
    }
    return { dismissCount: 0, lastNudgeTimestamp: 0, permanentlyDismissed: false, consecutiveSlowCount: 0 };
}

async function saveNudgeState(state: NudgeState): Promise<void> {
    try {
        await AsyncStorage.setItem(NUDGE_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        log.warn('state_save_error', 'Failed to save nudge state', { error: String(e) });
    }
}

/**
 * Report a transcription result to the nudge system.
 * Call this after every transcription with timing data.
 * @param durationMs - How long the transcription took
 * @param audioLengthMs - How long the audio clip was
 * @param engine - Which engine was used
 * @param cloudFallbackEnabled - Current user setting
 */
export async function reportTranscriptionPerformance(
    durationMs: number,
    audioLengthMs: number,
    engine: string,
    cloudFallbackEnabled: boolean,
): Promise<void> {
    // Don't nudge if cloud fallback is already enabled (they already have the best experience)
    if (cloudFallbackEnabled) return;

    // Don't nudge for cloud engines
    if (engine.startsWith('cloud')) return;

    const state = await getNudgeState();

    // Respect permanent dismissal
    if (state.permanentlyDismissed) return;

    // Check if we've exceeded max dismissals
    if (state.dismissCount >= MAX_DISMISSALS) {
        state.permanentlyDismissed = true;
        await saveNudgeState(state);
        return;
    }

    // Calculate if this was slow
    // Expected: transcription should take less than audio length (realtime or better)
    // "Struggling" = took 3x longer than the audio
    const ratio = durationMs / Math.max(audioLengthMs, 1000);
    const isSlow = ratio > SLOW_THRESHOLD_MULTIPLIER;

    if (isSlow) {
        state.consecutiveSlowCount++;
    } else {
        state.consecutiveSlowCount = 0;
    }

    await saveNudgeState(state);

    // Only nudge after consecutive slow transcriptions
    if (state.consecutiveSlowCount < CONSECUTIVE_SLOW_THRESHOLD) return;

    // Rate limit: max once per week
    const now = Date.now();
    if (now - state.lastNudgeTimestamp < MIN_NUDGE_INTERVAL_MS) return;

    // Show the nudge
    state.lastNudgeTimestamp = now;
    state.consecutiveSlowCount = 0;
    await saveNudgeState(state);

    showNudgeAlert(state);
}

function showNudgeAlert(state: NudgeState): void {
    Alert.alert(
        '🌪️ WindyTune Notice',
        'Your device seems to be working hard on transcriptions. A few things that might help:\n\n'
        + '🔄 Try a lighter model — smaller models run faster\n'
        + '☁️ Switch to "Auto" mode — lets WindyTune pick cloud or local for the best result\n'
        + '❄️ Give your device a moment to cool down\n\n'
        + 'You can adjust these in Settings → Voice Engine.',
        [
            {
                text: 'Open Settings',
                // Navigation would need to be injected — for now just dismiss
                onPress: () => {
                    log.info('nudge_settings', 'User tapped Open Settings from nudge');
                },
            },
            {
                text: 'Dismiss',
                style: 'cancel',
                onPress: async () => {
                    state.dismissCount++;
                    await saveNudgeState(state);
                    log.info('nudge_dismissed', `Nudge dismissed (${state.dismissCount}/${MAX_DISMISSALS})`);
                },
            },
            {
                text: "Don't show again",
                style: 'destructive',
                onPress: async () => {
                    state.permanentlyDismissed = true;
                    await saveNudgeState(state);
                    log.info('nudge_permanent_dismiss', 'User permanently dismissed nudges');
                },
            },
        ],
    );
}

/**
 * Reset nudge state (called from Settings if user wants to re-enable nudges)
 */
export async function resetNudgeState(): Promise<void> {
    await saveNudgeState({
        dismissCount: 0,
        lastNudgeTimestamp: 0,
        permanentlyDismissed: false,
        consecutiveSlowCount: 0,
    });
}
