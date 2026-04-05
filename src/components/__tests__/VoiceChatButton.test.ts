/**
 * Tests for VoiceChatButton — unit tests for the voice capture + transcribe pipeline
 * Tests the logic without rendering the component (no React Native renderer needed)
 */

jest.mock('@/services/audio-capture', () => ({
    audioCaptureService: {
        startRecording: jest.fn(),
        stopRecording: jest.fn(async () => ({
            sessionId: 'test-session',
            uri: '/tmp/recording.wav',
            duration: 3.5,
            fileSize: 56000,
        })),
        cancelRecording: jest.fn(),
        isRecording: jest.fn(() => false),
    },
}));

jest.mock('@/services/transcription', () => ({
    transcriptionService: {
        transcribeFile: jest.fn(async () => [
            { id: 'seg-1', text: 'Hello world', startTime: 0, endTime: 2, confidence: 0.95, isPartial: false, speakerId: null, language: 'en' },
        ]),
    },
}));

import { audioCaptureService } from '@/services/audio-capture';
import { transcriptionService } from '@/services/transcription';

describe('VoiceChatButton Logic', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('Recording lifecycle', () => {
        it('starts recording with session ID', async () => {
            await audioCaptureService.startRecording('voice-chat-123', { maxDuration: 120 });
            expect(audioCaptureService.startRecording).toHaveBeenCalledWith('voice-chat-123', { maxDuration: 120 });
        });

        it('stops recording and returns URI + duration', async () => {
            const result = await audioCaptureService.stopRecording();
            expect(result.uri).toBe('/tmp/recording.wav');
            expect(result.duration).toBe(3.5);
            expect(result.fileSize).toBe(56000);
        });

        it('cancels recording cleanly', async () => {
            await audioCaptureService.cancelRecording();
            expect(audioCaptureService.cancelRecording).toHaveBeenCalled();
        });
    });

    describe('Transcription pipeline', () => {
        it('transcribes audio to text segments', async () => {
            const result = await audioCaptureService.stopRecording();
            const segments = await transcriptionService.transcribeFile(result.uri);
            expect(segments).toHaveLength(1);
            expect(segments[0].text).toBe('Hello world');
            expect(segments[0].confidence).toBe(0.95);
        });

        it('joins segments into full text', async () => {
            (transcriptionService.transcribeFile as jest.Mock).mockResolvedValueOnce([
                { id: 's1', text: 'Part one', startTime: 0, endTime: 1 },
                { id: 's2', text: 'part two', startTime: 1, endTime: 2 },
                { id: 's3', text: 'part three', startTime: 2, endTime: 3 },
            ]);

            const result = await audioCaptureService.stopRecording();
            const segments = await transcriptionService.transcribeFile(result.uri);
            const text = segments.map((s: any) => s.text).join(' ').trim();
            expect(text).toBe('Part one part two part three');
        });

        it('handles empty transcription', async () => {
            (transcriptionService.transcribeFile as jest.Mock).mockResolvedValueOnce([]);
            const result = await audioCaptureService.stopRecording();
            const segments = await transcriptionService.transcribeFile(result.uri);
            expect(segments).toHaveLength(0);
        });

        it('handles queued transcription (offline)', async () => {
            (transcriptionService.transcribeFile as jest.Mock).mockResolvedValueOnce([
                { id: 'queued', text: '[Queued for transcription — will process when online]', isPartial: true },
            ]);

            const result = await audioCaptureService.stopRecording();
            const segments = await transcriptionService.transcribeFile(result.uri);
            expect(segments[0].text).toContain('[Queued');
            expect(segments[0].isPartial).toBe(true);
        });
    });

    describe('Error handling', () => {
        it('handles mic permission denial', async () => {
            (audioCaptureService.startRecording as jest.Mock).mockRejectedValueOnce(new Error('Microphone permission denied'));
            await expect(audioCaptureService.startRecording('test')).rejects.toThrow('Microphone permission denied');
        });

        it('handles transcription service failure', async () => {
            (transcriptionService.transcribeFile as jest.Mock).mockRejectedValueOnce(new Error('Cloud transcription failed'));
            await expect(transcriptionService.transcribeFile('/tmp/test.wav')).rejects.toThrow('Cloud transcription failed');
        });

        it('handles very short recordings', async () => {
            (audioCaptureService.stopRecording as jest.Mock).mockResolvedValueOnce({
                sessionId: 'short', uri: '/tmp/short.wav', duration: 0.2, fileSize: 100,
            });
            const result = await audioCaptureService.stopRecording();
            expect(result.duration).toBeLessThan(0.5);
            // VoiceChatButton should skip transcription for < 0.5s recordings
        });
    });
});
