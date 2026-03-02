/**
 * 🧪 Unit tests for CloneTracker
 * Tests clone pipeline progress calculation, quality weighting, and milestones
 */

// Mock dependencies before importing
jest.mock('@/services/feedback', () => ({
    feedbackService: { success: jest.fn() },
}));
jest.mock('expo-notifications', () => ({
    scheduleNotificationAsync: jest.fn(),
}));
jest.mock('@/services/storage-local', () => ({
    localStorageService: { getSessions: jest.fn().mockResolvedValue([]) },
}));

// We need a fresh CloneTracker instance for each test
// Since the module exports a singleton, we import the class indirectly
// by re-requiring the module in each test

describe('CloneTracker', () => {
    let CloneTrackerModule: typeof import('../clone-tracker');

    beforeEach(() => {
        jest.resetModules();
        // Re-require to get a fresh singleton
        CloneTrackerModule = require('../clone-tracker');
    });

    // ─── Initial State ──────────────────────────────────────────
    describe('initial state', () => {
        it('should start with 0 hours', () => {
            const progress = CloneTrackerModule.cloneTracker.getProgress();
            expect(progress.totalHours).toBe(0);
        });

        it('should start with 0% readiness', () => {
            const progress = CloneTrackerModule.cloneTracker.getProgress();
            expect(progress.cloneReadiness).toBe(0);
        });

        it('should have 4 milestones', () => {
            const progress = CloneTrackerModule.cloneTracker.getProgress();
            expect(progress.milestones).toHaveLength(4);
        });

        it('should have all milestones unreached initially', () => {
            const progress = CloneTrackerModule.cloneTracker.getProgress();
            for (const m of progress.milestones) {
                expect(m.reached).toBe(false);
                expect(m.reachedAt).toBeNull();
            }
        });

        it('should have 10 hours estimated to ready', () => {
            const progress = CloneTrackerModule.cloneTracker.getProgress();
            expect(progress.estimatedTimeToReady).toBe(10);
        });

        it('should have zero in all quality distribution buckets', () => {
            const progress = CloneTrackerModule.cloneTracker.getProgress();
            expect(progress.qualityDistribution.excellent).toBe(0);
            expect(progress.qualityDistribution.good).toBe(0);
            expect(progress.qualityDistribution.fair).toBe(0);
            expect(progress.qualityDistribution.poor).toBe(0);
        });
    });

    // ─── Quality Weighting ─────────────────────────────────────
    describe('quality weighting', () => {
        it('should count excellent quality at 100%', () => {
            const tracker = CloneTrackerModule.cloneTracker;
            // Add 1 hour of excellent quality
            tracker.addSession(3600, { score: 90, label: 'excellent', snrDb: 30, speechRatio: 0.8, hasClipping: false, sampleRate: 44100 });
            const progress = tracker.getProgress();
            expect(progress.totalHours).toBeCloseTo(1.0);
        });

        it('should count good quality at 80%', () => {
            const tracker = CloneTrackerModule.cloneTracker;
            tracker.addSession(3600, { score: 70, label: 'good', snrDb: 25, speechRatio: 0.7, hasClipping: false, sampleRate: 44100 });
            const progress = tracker.getProgress();
            expect(progress.weightedHours).toBeCloseTo(0.8);
        });

        it('should count fair quality at 50%', () => {
            const tracker = CloneTrackerModule.cloneTracker;
            tracker.addSession(3600, { score: 50, label: 'fair', snrDb: 15, speechRatio: 0.5, hasClipping: false, sampleRate: 16000 });
            const progress = tracker.getProgress();
            expect(progress.weightedHours).toBeCloseTo(0.5);
        });

        it('should count poor quality at 0% (does not contribute)', () => {
            const tracker = CloneTrackerModule.cloneTracker;
            tracker.addSession(3600, { score: 20, label: 'poor', snrDb: 5, speechRatio: 0.1, hasClipping: true, sampleRate: 8000 });
            const progress = tracker.getProgress();
            expect(progress.weightedHours).toBe(0);
        });

        it('should accumulate hours from multiple sessions', () => {
            const tracker = CloneTrackerModule.cloneTracker;
            // 1h excellent + 1h good = 1.0 + 0.8 = 1.8
            tracker.addSession(3600, { score: 90, label: 'excellent', snrDb: 30, speechRatio: 0.8, hasClipping: false, sampleRate: 44100 });
            tracker.addSession(3600, { score: 70, label: 'good', snrDb: 25, speechRatio: 0.7, hasClipping: false, sampleRate: 44100 });
            const progress = tracker.getProgress();
            expect(progress.weightedHours).toBeCloseTo(1.8);
        });
    });

    // ─── Quality Distribution ──────────────────────────────────
    describe('quality distribution tracking', () => {
        it('should track raw hours (not weighted) per quality bucket', () => {
            const tracker = CloneTrackerModule.cloneTracker;
            tracker.addSession(3600, { score: 90, label: 'excellent', snrDb: 30, speechRatio: 0.8, hasClipping: false, sampleRate: 44100 });
            tracker.addSession(7200, { score: 70, label: 'good', snrDb: 25, speechRatio: 0.7, hasClipping: false, sampleRate: 44100 });
            tracker.addSession(1800, { score: 20, label: 'poor', snrDb: 5, speechRatio: 0.1, hasClipping: true, sampleRate: 8000 });

            const progress = tracker.getProgress();
            expect(progress.qualityDistribution.excellent).toBeCloseTo(1.0);
            expect(progress.qualityDistribution.good).toBeCloseTo(2.0);
            expect(progress.qualityDistribution.poor).toBeCloseTo(0.5);
        });
    });

    // ─── Readiness Calculation ─────────────────────────────────
    describe('clone readiness', () => {
        it('should calculate readiness as percentage of 10 hours', () => {
            const tracker = CloneTrackerModule.cloneTracker;
            // 5 hours excellent = 50%
            tracker.addSession(5 * 3600, { score: 90, label: 'excellent', snrDb: 30, speechRatio: 0.8, hasClipping: false, sampleRate: 44100 });
            const progress = tracker.getProgress();
            expect(progress.cloneReadiness).toBeCloseTo(50);
        });

        it('should cap readiness at 100%', () => {
            const tracker = CloneTrackerModule.cloneTracker;
            // 15 hours excellent = 150% → should cap at 100
            tracker.addSession(15 * 3600, { score: 90, label: 'excellent', snrDb: 30, speechRatio: 0.8, hasClipping: false, sampleRate: 44100 });
            const progress = tracker.getProgress();
            expect(progress.cloneReadiness).toBe(100);
        });

        it('should calculate remaining time correctly', () => {
            const tracker = CloneTrackerModule.cloneTracker;
            // 3 hours excellent → 7 remaining
            tracker.addSession(3 * 3600, { score: 90, label: 'excellent', snrDb: 30, speechRatio: 0.8, hasClipping: false, sampleRate: 44100 });
            const progress = tracker.getProgress();
            expect(progress.estimatedTimeToReady).toBeCloseTo(7);
        });

        it('should have 0 remaining time when complete', () => {
            const tracker = CloneTrackerModule.cloneTracker;
            tracker.addSession(12 * 3600, { score: 90, label: 'excellent', snrDb: 30, speechRatio: 0.8, hasClipping: false, sampleRate: 44100 });
            const progress = tracker.getProgress();
            expect(progress.estimatedTimeToReady).toBe(0);
        });
    });

    // ─── Milestones ─────────────────────────────────────────────
    describe('milestones', () => {
        it('should mark 25% milestone at 2.5 hours', () => {
            const tracker = CloneTrackerModule.cloneTracker;
            tracker.addSession(3 * 3600, { score: 90, label: 'excellent', snrDb: 30, speechRatio: 0.8, hasClipping: false, sampleRate: 44100 });
            const progress = tracker.getProgress();
            expect(progress.milestones[0].reached).toBe(true);
            expect(progress.milestones[0].reachedAt).not.toBeNull();
        });

        it('should not mark milestones that are not yet reached', () => {
            const tracker = CloneTrackerModule.cloneTracker;
            tracker.addSession(1 * 3600, { score: 90, label: 'excellent', snrDb: 30, speechRatio: 0.8, hasClipping: false, sampleRate: 44100 });
            const progress = tracker.getProgress();
            expect(progress.milestones[0].reached).toBe(false);
            expect(progress.milestones[1].reached).toBe(false);
        });

        it('should mark all milestones at 10+ hours', () => {
            const tracker = CloneTrackerModule.cloneTracker;
            tracker.addSession(11 * 3600, { score: 90, label: 'excellent', snrDb: 30, speechRatio: 0.8, hasClipping: false, sampleRate: 44100 });
            const progress = tracker.getProgress();
            for (const m of progress.milestones) {
                expect(m.reached).toBe(true);
            }
        });

        it('should have milestone thresholds at 2.5, 5, 7.5, 10', () => {
            const progress = CloneTrackerModule.cloneTracker.getProgress();
            expect(progress.milestones.map((m) => m.threshold)).toEqual([2.5, 5, 7.5, 10]);
        });
    });

    // ─── Immutability ──────────────────────────────────────────
    describe('data immutability', () => {
        it('should return copies of quality distribution', () => {
            const tracker = CloneTrackerModule.cloneTracker;
            const p1 = tracker.getProgress();
            p1.qualityDistribution.excellent = 999;
            const p2 = tracker.getProgress();
            expect(p2.qualityDistribution.excellent).toBe(0);
        });

        it('should return copies of milestones', () => {
            const tracker = CloneTrackerModule.cloneTracker;
            const p1 = tracker.getProgress();
            p1.milestones[0].reached = true;
            const p2 = tracker.getProgress();
            expect(p2.milestones[0].reached).toBe(false);
        });
    });
});
