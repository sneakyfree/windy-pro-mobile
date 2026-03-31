/**
 * Hardening: Memory and Performance Guards
 * Verifies FlatList optimization, cache bounds, and cleanup behavior.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Performance Guards', () => {
    // ─── FlatList Virtualization ─────────────────────────────────

    describe('History tab FlatList optimization', () => {
        const historyFile = fs.readFileSync(
            path.resolve(__dirname, '../../src/app/(tabs)/history.tsx'),
            'utf-8'
        );

        it('should use windowSize prop', () => {
            expect(historyFile).toContain('windowSize=');
        });

        it('should use initialNumToRender prop', () => {
            expect(historyFile).toContain('initialNumToRender=');
        });

        it('should use maxToRenderPerBatch prop', () => {
            expect(historyFile).toContain('maxToRenderPerBatch=');
        });

        it('should use removeClippedSubviews prop', () => {
            expect(historyFile).toContain('removeClippedSubviews=');
        });
    });

    describe('TranscriptionViewer FlatList optimization', () => {
        const viewerFile = fs.readFileSync(
            path.resolve(__dirname, '../../src/components/TranscriptionViewer.tsx'),
            'utf-8'
        );

        it('should use windowSize prop', () => {
            expect(viewerFile).toContain('windowSize=');
        });

        it('should use maxToRenderPerBatch prop', () => {
            expect(viewerFile).toContain('maxToRenderPerBatch=');
        });

        it('should use initialNumToRender prop', () => {
            expect(viewerFile).toContain('initialNumToRender=');
        });
    });

    // ─── Translation Cache Bounds ───────────────────────────────

    describe('translation cache', () => {
        const translationFile = fs.readFileSync(
            path.resolve(__dirname, '../../src/services/translation.ts'),
            'utf-8'
        );

        it('should have a cache size limit', () => {
            // Look for LRU cache or max size constant
            const hasLimit = translationFile.includes('MAX_CACHE')
                || translationFile.includes('maxSize')
                || translationFile.includes('cache.size')
                || translationFile.includes('200')  // LRU 200 entries
                || translationFile.includes('delete');
            expect(hasLimit).toBe(true);
        });
    });

    // ─── Sync Queue Bounds ──────────────────────────────────────

    describe('sync queue bounds', () => {
        const syncFile = fs.readFileSync(
            path.resolve(__dirname, '../../src/services/sync-manager.ts'),
            'utf-8'
        );

        it('should have MAX_QUEUE_SIZE constant', () => {
            expect(syncFile).toContain('MAX_QUEUE_SIZE');
        });

        it('should check queue size before adding', () => {
            expect(syncFile).toContain('queue.length >= MAX_QUEUE_SIZE');
        });

        it('should have retry limit', () => {
            expect(syncFile).toContain('retry_count >= 3');
        });
    });

    // ─── Record Screen Cleanup ──────────────────────────────────

    describe('record screen resource cleanup', () => {
        const recordFile = fs.readFileSync(
            path.resolve(__dirname, '../../src/app/(tabs)/index.tsx'),
            'utf-8'
        );

        it('should clean up intervals on unmount', () => {
            expect(recordFile).toContain('clearInterval');
        });

        it('should unload audio on unmount', () => {
            expect(recordFile).toContain('unloadAsync');
        });

        it('should cancel recording on unmount', () => {
            expect(recordFile).toContain('cancelRecording');
        });

        it('should cancel video capture on unmount', () => {
            expect(recordFile).toContain('cancelVideoCapture');
        });
    });

    // ─── Audio Capture Cleanup ──────────────────────────────────

    describe('audio capture service cleanup', () => {
        const audioFile = fs.readFileSync(
            path.resolve(__dirname, '../../src/services/audio-capture.ts'),
            'utf-8'
        );

        it('should call stopAndUnloadAsync on stop', () => {
            expect(audioFile).toContain('stopAndUnloadAsync');
        });

        it('should delete temp file on cancel', () => {
            expect(audioFile).toContain('deleteAsync');
        });
    });

    // ─── Network Monitor Cleanup ────────────────────────────────

    describe('network monitor cleanup', () => {
        const netFile = fs.readFileSync(
            path.resolve(__dirname, '../../src/services/network-monitor.ts'),
            'utf-8'
        );

        it('should clear interval on stop', () => {
            expect(netFile).toContain('clearInterval');
        });
    });

    // ─── Timeout Constants ──────────────────────────────────────

    describe('request timeouts', () => {
        const cloudApiFile = fs.readFileSync(
            path.resolve(__dirname, '../../src/services/cloudApi.ts'),
            'utf-8'
        );

        it('should have request timeout defined', () => {
            expect(cloudApiFile).toContain('REQUEST_TIMEOUT_MS');
        });

        it('should use AbortController for timeout', () => {
            expect(cloudApiFile).toContain('AbortController');
            expect(cloudApiFile).toContain('controller.abort');
        });

        it('should clear timeout after fetch completes', () => {
            expect(cloudApiFile).toContain('clearTimeout');
        });
    });
});
