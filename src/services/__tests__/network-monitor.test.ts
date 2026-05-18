/**
 * 🧪 Unit tests for NetworkMonitor
 * Tests connectivity detection, status listeners, and translation queue
 */

// Mock expo-file-system
const mockDeleteAsync = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-file-system/legacy', () => ({
    deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { networkMonitor } from '../network-monitor';

describe('NetworkMonitor', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        mockDeleteAsync.mockResolvedValue(undefined);
        networkMonitor.stop();
        networkMonitor.clearQueue();
        // Reset to online state
        mockFetch.mockResolvedValue({ ok: true });
        await networkMonitor.checkConnectivity();
        mockFetch.mockReset();
    });

    // ─── Initial State ──────────────────────────────────────────

    describe('initial state', () => {
        it('should default to online', () => {
            expect(networkMonitor.isOnline).toBe(true);
            expect(networkMonitor.status).toBe('online');
        });

        it('should have empty queue', () => {
            expect(networkMonitor.getQueueSize()).toBe(0);
            expect(networkMonitor.getQueue()).toEqual([]);
        });
    });

    // ─── Connectivity Check ─────────────────────────────────────

    describe('checkConnectivity()', () => {
        it('should go online on successful ping', async () => {
            mockFetch.mockResolvedValue({ ok: true });

            const result = await networkMonitor.checkConnectivity();
            expect(result).toBe(true);
            expect(networkMonitor.isOnline).toBe(true);
        });

        it('should go offline on failed ping', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));

            const result = await networkMonitor.checkConnectivity();
            expect(result).toBe(false);
            expect(networkMonitor.isOnline).toBe(false);
        });

        it('should go offline on non-ok response', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 500 });

            const result = await networkMonitor.checkConnectivity();
            expect(result).toBe(false);
            expect(networkMonitor.isOnline).toBe(false);
        });
    });

    // ─── Status Listeners ───────────────────────────────────────

    describe('onStatusChange()', () => {
        it('should notify listener on status change', async () => {
            const listener = jest.fn();
            networkMonitor.onStatusChange(listener);

            // Force offline
            mockFetch.mockRejectedValue(new Error('down'));
            await networkMonitor.checkConnectivity();

            expect(listener).toHaveBeenCalledWith('offline');
        });

        it('should not notify if status unchanged', async () => {
            // Ensure online first
            mockFetch.mockResolvedValue({ ok: true });
            await networkMonitor.checkConnectivity();

            const listener = jest.fn();
            networkMonitor.onStatusChange(listener);

            // Check again (still online)
            mockFetch.mockResolvedValue({ ok: true });
            await networkMonitor.checkConnectivity();

            expect(listener).not.toHaveBeenCalled();
        });

        it('should unsubscribe correctly', async () => {
            const listener = jest.fn();
            const unsub = networkMonitor.onStatusChange(listener);

            unsub();

            mockFetch.mockRejectedValue(new Error('down'));
            await networkMonitor.checkConnectivity();

            expect(listener).not.toHaveBeenCalled();
        });
    });

    // ─── Translation Queue ──────────────────────────────────────

    describe('queueTranslation()', () => {
        it('should add items to the queue', () => {
            const id = networkMonitor.queueTranslation('file:///a.wav', 'en', 'es');
            expect(id).toBeTruthy();
            expect(networkMonitor.getQueueSize()).toBe(1);
        });

        it('should maintain order', () => {
            networkMonitor.queueTranslation('file:///a.wav', 'en', 'es');
            networkMonitor.queueTranslation('file:///b.wav', 'fr', 'de');

            const queue = networkMonitor.getQueue();
            expect(queue).toHaveLength(2);
            expect(queue[0].audioUri).toBe('file:///a.wav');
            expect(queue[1].audioUri).toBe('file:///b.wav');
        });

        it('should generate unique IDs', () => {
            const id1 = networkMonitor.queueTranslation('file:///a.wav', 'en', 'es');
            const id2 = networkMonitor.queueTranslation('file:///b.wav', 'en', 'es');
            expect(id1).not.toBe(id2);
        });
    });

    describe('dequeue()', () => {
        it('should remove and return the item', () => {
            const id = networkMonitor.queueTranslation('file:///a.wav', 'en', 'es');
            const item = networkMonitor.dequeue(id);

            expect(item).toBeDefined();
            expect(item?.audioUri).toBe('file:///a.wav');
            expect(networkMonitor.getQueueSize()).toBe(0);
        });

        it('should return undefined for non-existent ID', () => {
            const item = networkMonitor.dequeue('nope');
            expect(item).toBeUndefined();
        });
    });

    describe('clearQueue()', () => {
        it('should clear all items and delete audio files', () => {
            mockDeleteAsync.mockResolvedValue(undefined);

            networkMonitor.queueTranslation('file:///a.wav', 'en', 'es');
            networkMonitor.queueTranslation('file:///b.wav', 'fr', 'de');

            networkMonitor.clearQueue();

            expect(networkMonitor.getQueueSize()).toBe(0);
            expect(mockDeleteAsync).toHaveBeenCalledTimes(2);
        });
    });

    // ─── Queue Ready Callback ───────────────────────────────────

    describe('onQueueReady()', () => {
        it('should fire callback when reconnecting with queued items', async () => {
            const handler = jest.fn();
            networkMonitor.onQueueReady(handler);

            // Go offline
            mockFetch.mockRejectedValue(new Error('down'));
            await networkMonitor.checkConnectivity();
            expect(networkMonitor.isOnline).toBe(false);

            // Queue something
            networkMonitor.queueTranslation('file:///a.wav', 'en', 'es');

            // Come back online
            mockFetch.mockResolvedValue({ ok: true });
            await networkMonitor.checkConnectivity();

            expect(handler).toHaveBeenCalled();
        });

        it('should not fire callback when reconnecting with empty queue', async () => {
            const handler = jest.fn();
            networkMonitor.onQueueReady(handler);

            // Go offline
            mockFetch.mockRejectedValue(new Error('down'));
            await networkMonitor.checkConnectivity();

            // Come back online (no queue)
            mockFetch.mockResolvedValue({ ok: true });
            await networkMonitor.checkConnectivity();

            expect(handler).not.toHaveBeenCalled();
        });
    });
});
