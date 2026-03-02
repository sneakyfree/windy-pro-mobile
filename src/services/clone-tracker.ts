/**
 * 🧬 M9.1 — Clone Tracker
 * Silently accumulates recording data toward the 10-hour
 * threshold needed for quality voice clone training.
 */
import type { AudioQuality, QualityLabel } from '@/types';

/** Clone milestone thresholds */
export interface CloneMilestone {
    threshold: number;   // hours
    label: string;
    reached: boolean;
    reachedAt: string | null;
}

/** Full clone progress report */
export interface CloneProgress {
    totalHours: number;
    qualityDistribution: Record<QualityLabel, number>; // hours per quality
    milestones: CloneMilestone[];
    cloneReadiness: number;        // 0-100
    estimatedTimeToReady: number;  // hours remaining
}

/** Quality multipliers — poor recordings don't count */
const QUALITY_WEIGHTS: Record<QualityLabel, number> = {
    excellent: 1.0,
    good: 0.8,
    fair: 0.5,
    poor: 0.0,
};

const CLONE_HOURS_TARGET = 10;

const DEFAULT_MILESTONES: CloneMilestone[] = [
    { threshold: 2.5, label: '25%', reached: false, reachedAt: null },
    { threshold: 5.0, label: '50%', reached: false, reachedAt: null },
    { threshold: 7.5, label: '75%', reached: false, reachedAt: null },
    { threshold: 10, label: 'Ready!', reached: false, reachedAt: null },
];

class CloneTracker {
    private totalHours = 0;
    private qualityDistribution: Record<QualityLabel, number> = {
        excellent: 0,
        good: 0,
        fair: 0,
        poor: 0,
    };
    private milestones: CloneMilestone[] = [...DEFAULT_MILESTONES];

    /**
     * Add a recording session's contribution to clone progress
     */
    addSession(durationSeconds: number, quality: AudioQuality): void {
        const hours = durationSeconds / 3600;
        const weightedHours = hours * QUALITY_WEIGHTS[quality.label];

        this.qualityDistribution[quality.label] += hours;
        this.totalHours += weightedHours;

        // Check milestones
        for (const milestone of this.milestones) {
            if (!milestone.reached && this.totalHours >= milestone.threshold) {
                milestone.reached = true;
                milestone.reachedAt = new Date().toISOString();
                console.log(`[Clone] 🎉 Milestone reached: ${milestone.label}`);
                // Haptic celebration
                try {
                    const { feedbackService } = require('@/services/feedback');
                    feedbackService.success();
                } catch { /* ignore */ }
                // Send celebration notification
                try {
                    const Notifications = require('expo-notifications');
                    Notifications.scheduleNotificationAsync({
                        content: {
                            title: '🎉 Clone Milestone!',
                            body: `You reached ${milestone.label}! Keep going to build your perfect voice clone.`,
                            sound: true,
                        },
                        trigger: null,
                    });
                } catch (e) {
                    console.warn('[Clone] Notification failed:', e);
                }
            }
        }
    }

    /**
     * Recalculate from all sessions (called on app start)
     */
    async recalculate(): Promise<CloneProgress> {
        // Query all clone-usable sessions from SQLite
        try {
            const { localStorageService } = require('@/services/storage-local');
            const sessions = await localStorageService.getSessions({
                minQuality: 60,
                searchQuery: null,
                source: null,
                synced: null,
                dateRange: null,
            });
            // Reset and recalculate
            this.totalHours = 0;
            this.qualityDistribution = { excellent: 0, good: 0, fair: 0, poor: 0 };
            for (const s of sessions) {
                const hours = s.duration / 3600;
                const label = (s.quality?.label || 'fair') as import('@/types').QualityLabel;
                const weight = QUALITY_WEIGHTS[label] ?? 0.5;
                this.qualityDistribution[label] = (this.qualityDistribution[label] || 0) + hours;
                this.totalHours += hours * weight;
            }
        } catch (e) {
            console.warn('[Clone] Recalculate from DB failed:', e);
        }
        return this.getProgress();
    }

    /**
     * Get current clone progress
     */
    getProgress(): CloneProgress {
        const cloneReadiness = Math.min(100, (this.totalHours / CLONE_HOURS_TARGET) * 100);
        const remaining = Math.max(0, CLONE_HOURS_TARGET - this.totalHours);

        return {
            totalHours: this.totalHours,
            qualityDistribution: { ...this.qualityDistribution },
            milestones: this.milestones.map((m) => ({ ...m })),
            cloneReadiness,
            estimatedTimeToReady: remaining,
        };
    }
}

// Singleton instance
export const cloneTracker = new CloneTracker();
