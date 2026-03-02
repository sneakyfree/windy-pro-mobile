/**
 * 🧬 M1 — Recording state store (Zustand)
 * Manages the global recording state machine
 */
import { create } from 'zustand';
import type { RecordingState, MediaCapture } from '@/types';

interface RecordingStore {
    // State
    state: RecordingState;
    sessionId: string | null;
    duration: number;
    audioLevel: number;          // 0.0-1.0 for waveform
    mediaCapture: MediaCapture;

    // Actions
    startRecording: (sessionId: string) => void;
    stopRecording: () => void;
    setProcessing: () => void;
    setError: () => void;
    reset: () => void;
    setDuration: (seconds: number) => void;
    setAudioLevel: (level: number) => void;
    toggleMedia: (type: keyof MediaCapture) => void;
}

export const useRecordingStore = create<RecordingStore>((set) => ({
    // Default state
    state: 'idle',
    sessionId: null,
    duration: 0,
    audioLevel: 0,
    mediaCapture: {
        audio: true,
        video: false,
        text: true,
    },

    // Actions
    startRecording: (sessionId) =>
        set({ state: 'recording', sessionId, duration: 0, audioLevel: 0 }),

    stopRecording: () =>
        set({ state: 'processing' }),

    setProcessing: () =>
        set({ state: 'processing' }),

    setError: () =>
        set({ state: 'error' }),

    reset: () =>
        set({ state: 'idle', sessionId: null, duration: 0, audioLevel: 0 }),

    setDuration: (seconds) =>
        set({ duration: seconds }),

    setAudioLevel: (level) =>
        set({ audioLevel: level }),

    toggleMedia: (type) =>
        set((s) => ({
            mediaCapture: { ...s.mediaCapture, [type]: !s.mediaCapture[type] },
        })),
}));
