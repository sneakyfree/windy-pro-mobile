/**
 * 🧬 M1 — Transcript store (Zustand)
 * Manages real-time and completed transcript segments
 */
import { create } from 'zustand';
import type { TranscriptSegment } from '@/types';

interface TranscriptStore {
    segments: TranscriptSegment[];
    fullText: string;
    isStreaming: boolean;

    addSegment: (segment: TranscriptSegment) => void;
    updateSegment: (id: string, updates: Partial<TranscriptSegment>) => void;
    setSegments: (segments: TranscriptSegment[]) => void;
    setStreaming: (streaming: boolean) => void;
    clear: () => void;
}

export const useTranscriptStore = create<TranscriptStore>((set) => ({
    segments: [],
    fullText: '',
    isStreaming: false,

    addSegment: (segment) =>
        set((s) => {
            const newSegments = [...s.segments, segment];
            return {
                segments: newSegments,
                fullText: newSegments
                    .filter((seg) => !seg.isPartial)
                    .map((seg) => seg.text)
                    .join(' '),
            };
        }),

    updateSegment: (id, updates) =>
        set((s) => {
            const newSegments = s.segments.map((seg) =>
                seg.id === id ? { ...seg, ...updates } : seg
            );
            return {
                segments: newSegments,
                fullText: newSegments
                    .filter((seg) => !seg.isPartial)
                    .map((seg) => seg.text)
                    .join(' '),
            };
        }),

    setSegments: (segments) =>
        set({
            segments,
            fullText: segments
                .filter((seg) => !seg.isPartial)
                .map((seg) => seg.text)
                .join(' '),
        }),

    setStreaming: (streaming) => set({ isStreaming: streaming }),

    clear: () => set({ segments: [], fullText: '', isStreaming: false }),
}));
