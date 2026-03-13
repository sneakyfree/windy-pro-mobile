/**
 * 🧬 M9.1 — Clone Tracker
 * Silently accumulates recording data toward the 10-hour
 * threshold needed for quality voice clone training.
 *
 * Features:
 *   - Quality-weighted hour tracking (poor recordings = 0×)
 *   - Milestone detection (25/50/75/100%) with haptic + notification
 *   - SQLite persistence for milestones surviving app restarts
 *   - Recording tip generation based on quality distribution
 */
import type { AudioQuality, QualityLabel } from '@/types';
import { isCloneUsable } from './quality-scorer';
import { createLogger } from './logger';

const log = createLogger('CloneTracker');

/** Clone milestone thresholds */
export interface CloneMilestone {
    threshold: number;   // hours
    percent: number;     // 25, 50, 75, 100
    label: string;
    emoji: string;
    reached: boolean;
    reachedAt: string | null;
}

/** Full clone progress report */
export interface CloneProgress {
    totalHours: number;
    weightedHours: number;  // Quality-adjusted hours
    sessionsCount: number;
    qualityDistribution: Record<QualityLabel, number>; // hours per quality
    averageQuality: number;
    milestones: CloneMilestone[];
    cloneReadiness: number;        // 0-100
    estimatedTimeToReady: number;  // hours remaining
    tips: string[];
}

/** Quality multipliers — poor recordings don't count toward clone */
const QUALITY_WEIGHTS: Record<QualityLabel, number> = {
    excellent: 1.0,
    good: 0.8,
    fair: 0.5,
    poor: 0.0,
};

const CLONE_HOURS_TARGET = 10;

const DEFAULT_MILESTONES: CloneMilestone[] = [
    { threshold: 2.5, percent: 25, label: '25%', emoji: '🌱', reached: false, reachedAt: null },
    { threshold: 5.0, percent: 50, label: '50%', emoji: '🌿', reached: false, reachedAt: null },
    { threshold: 7.5, percent: 75, label: '75%', emoji: '🌳', reached: false, reachedAt: null },
    { threshold: 10, percent: 100, label: 'Ready!', emoji: '🚀', reached: false, reachedAt: null },
];

class CloneTracker {
    private totalHours = 0;
    private weightedHours = 0;
    private sessionsCount = 0;
    private qualityScores: number[] = [];
    private qualityDistribution: Record<QualityLabel, number> = {
        excellent: 0,
        good: 0,
        fair: 0,
        poor: 0,
    };
    private milestones: CloneMilestone[] = DEFAULT_MILESTONES.map((m) => ({ ...m }));

    /**
     * Add a recording session's contribution to clone progress
     */
    addSession(durationSeconds: number, quality: AudioQuality): void {
        const hours = durationSeconds / 3600;
        const weight = QUALITY_WEIGHTS[quality.label] ?? 0;
        const weighted = hours * weight;

        this.qualityDistribution[quality.label] += hours;
        this.totalHours += hours;
        this.weightedHours += weighted;
        this.sessionsCount++;
        this.qualityScores.push(quality.score);

        // Check milestones
        const now = new Date().toISOString();
        for (const milestone of this.milestones) {
            if (!milestone.reached && this.weightedHours >= milestone.threshold) {
                milestone.reached = true;
                milestone.reachedAt = now;

                // Haptic celebration
                try {
                    const { feedbackService } = require('@/services/feedback');
                    feedbackService.success();
                } catch (err) { console.warn('[clonetracker] Error:', err); }

                // Push notification celebration
                try {
                    const Notifications = require('expo-notifications');
                    const { Platform } = require('react-native');
                    Notifications.scheduleNotificationAsync({
                        content: {
                            title: `${milestone.emoji} Clone Milestone!`,
                            body: `You reached ${milestone.label}! ${this.getMilestoneMessage(milestone.percent)}`,
                            sound: true,
                            ...(Platform.OS === 'android' ? { channelId: 'translation' } : {}),
                        },
                        trigger: null,
                    });
                } catch (e: unknown) {
                    log.warn('Notification', 'Notification failed', e instanceof Error ? { message: e.message, stack: e.stack } : { error: String(e) });
                }

                // Persist milestone to storage
                this.persistMilestone(milestone);
            }
        }
    }

    /**
     * Recalculate from all sessions (called on app start)
     */
    async recalculate(): Promise<CloneProgress> {
        try {
            const { localStorageService } = require('@/services/storage-local');
            const sessions = await localStorageService.getSessions({
                minQuality: 0, // Get all sessions, we filter by quality weight
                searchQuery: null,
                source: null,
                synced: null,
                dateRange: null,
            });

            // Reset
            this.totalHours = 0;
            this.weightedHours = 0;
            this.sessionsCount = sessions.length;
            this.qualityScores = [];
            this.qualityDistribution = { excellent: 0, good: 0, fair: 0, poor: 0 };

            for (const s of sessions) {
                const hours = s.duration / 3600;
                const label = (s.quality?.label || 'fair') as QualityLabel;
                const weight = QUALITY_WEIGHTS[label] ?? 0.5;

                this.qualityDistribution[label] = (this.qualityDistribution[label] || 0) + hours;
                this.totalHours += hours;
                this.weightedHours += hours * weight;
                this.qualityScores.push(s.quality?.score ?? 50);
            }

            // Recalculate milestones
            for (const milestone of this.milestones) {
                milestone.reached = this.weightedHours >= milestone.threshold;
            }

            // Restore persisted milestone dates
            await this.restoreMilestones();
        } catch (e: unknown) {
            log.warn('Recalculate_from_DB', 'Recalculate from DB failed', e instanceof Error ? { message: e.message, stack: e.stack } : { error: String(e) });
        }

        return this.getProgress();
    }

    /**
     * Get current clone progress
     */
    getProgress(): CloneProgress {
        const cloneReadiness = Math.min(100, (this.weightedHours / CLONE_HOURS_TARGET) * 100);
        const remaining = Math.max(0, CLONE_HOURS_TARGET - this.weightedHours);
        const avgQuality = this.qualityScores.length > 0
            ? this.qualityScores.reduce((a, b) => a + b, 0) / this.qualityScores.length
            : 0;

        return {
            totalHours: this.totalHours,
            weightedHours: this.weightedHours,
            sessionsCount: this.sessionsCount,
            qualityDistribution: { ...this.qualityDistribution },
            averageQuality: Math.round(avgQuality),
            milestones: this.milestones.map((m) => ({ ...m })),
            cloneReadiness,
            estimatedTimeToReady: remaining,
            tips: this.generateTips(),
        };
    }

    /**
     * Generate contextual tips based on quality distribution
     */
    private generateTips(): string[] {
        const tips: string[] = [];
        const total = this.totalHours;

        if (total === 0) {
            tips.push('Start recording to build your voice clone! Every session counts.');
            return tips;
        }

        const poorPct = total > 0 ? (this.qualityDistribution.poor / total) * 100 : 0;
        const excellentPct = total > 0 ? (this.qualityDistribution.excellent / total) * 100 : 0;

        if (poorPct > 30) {
            tips.push('💡 Over 30% of recordings are poor quality. Try a quieter room.');
        }
        if (excellentPct > 50) {
            tips.push('🌟 Great quality! Over half your recordings are excellent.');
        }
        if (this.sessionsCount > 0 && this.sessionsCount < 5) {
            tips.push('📱 Keep recording daily — consistency builds the best clones.');
        }
        if (this.weightedHours > 5 && this.weightedHours < 10) {
            tips.push('🏁 Over halfway there! The finish line is in sight.');
        }
        if (this.weightedHours >= 10) {
            tips.push('🚀 Your voice clone is ready for processing!');
        }

        return tips;
    }

    /**
     * Get milestone-specific celebration message
     */
    private getMilestoneMessage(percent: number): string {
        switch (percent) {
            case 25: return 'Your voice clone is budding! Keep recording.';
            case 50: return 'Halfway there — your clone is taking shape!';
            case 75: return 'Almost ready! Just a few more hours of speech.';
            case 100: return 'Your voice clone data is ready for processing!';
            default: return 'Keep going!';
        }
    }

    /**
     * Persist milestone dates to AsyncStorage
     */
    private async persistMilestone(milestone: CloneMilestone): Promise<void> {
        try {
            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
            const key = `clone_milestone_${milestone.percent}`;
            await AsyncStorage.setItem(key, milestone.reachedAt || '');
        } catch (err) { console.warn('[clonetracker] Error:', err); }
    }

    /**
     * Restore milestone dates from AsyncStorage
     */
    private async restoreMilestones(): Promise<void> {
        try {
            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
            for (const milestone of this.milestones) {
                const key = `clone_milestone_${milestone.percent}`;
                const date = await AsyncStorage.getItem(key);
                if (date) {
                    milestone.reachedAt = date;
                }
            }
        } catch (err) { console.warn('[clonetracker] Error:', err); }
    }
}

// Singleton instance
export const cloneTracker = new CloneTracker();
