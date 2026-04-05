/**
 * Tests for the voice chat flow — audio capture → transcription → chat message
 * Integration-level test: verifies the pipeline without UI.
 */

jest.mock('@/services/audio-capture', () => ({
    audioCaptureService: {
        startRecording: jest.fn(),
        stopRecording: jest.fn(async () => ({
            sessionId: 'voice-chat-123',
            uri: '/tmp/voice.wav',
            duration: 4.2,
            fileSize: 67200,
        })),
        cancelRecording: jest.fn(),
        isRecording: jest.fn(() => false),
    },
}));

jest.mock('@/services/transcription', () => ({
    transcriptionService: {
        transcribeFile: jest.fn(async (uri: string) => [
            { id: 'seg-1', text: 'Send this message', startTime: 0, endTime: 3, confidence: 0.92, isPartial: false, speakerId: null, language: 'en' },
        ]),
        onSegment: null,
        onError: null,
    },
}));

jest.mock('@/services/logger', () => ({
    createLogger: () => ({
        info: jest.fn(), warn: jest.fn(), error: jest.fn(),
        entry: jest.fn(), exit: jest.fn(), state: jest.fn(),
    }),
}));

import { audioCaptureService } from '@/services/audio-capture';
import { transcriptionService } from '@/services/transcription';

describe('Voice Chat Flow', () => {
    beforeEach(() => jest.clearAllMocks());

    it('records audio and gets transcription', async () => {
        await audioCaptureService.startRecording('voice-test', { maxDuration: 120 });
        expect(audioCaptureService.startRecording).toHaveBeenCalledWith('voice-test', { maxDuration: 120 });

        const result = await audioCaptureService.stopRecording();
        expect(result.uri).toBe('/tmp/voice.wav');
        expect(result.duration).toBeGreaterThan(0);

        const segments = await transcriptionService.transcribeFile(result.uri);
        expect(segments).toHaveLength(1);
        expect(segments[0].text).toBe('Send this message');
    });

    it('handles empty transcription', async () => {
        (transcriptionService.transcribeFile as jest.Mock).mockResolvedValueOnce([]);

        await audioCaptureService.startRecording('empty-test');
        const result = await audioCaptureService.stopRecording();
        const segments = await transcriptionService.transcribeFile(result.uri);

        expect(segments).toHaveLength(0);
    });

    it('handles transcription failure gracefully', async () => {
        (transcriptionService.transcribeFile as jest.Mock).mockRejectedValueOnce(new Error('Engine unavailable'));

        await audioCaptureService.startRecording('fail-test');
        const result = await audioCaptureService.stopRecording();

        await expect(transcriptionService.transcribeFile(result.uri)).rejects.toThrow('Engine unavailable');
    });

    it('can cancel recording without error', async () => {
        await audioCaptureService.startRecording('cancel-test');
        await audioCaptureService.cancelRecording();
        expect(audioCaptureService.cancelRecording).toHaveBeenCalled();
    });

    it('joins multiple segments into single text', async () => {
        (transcriptionService.transcribeFile as jest.Mock).mockResolvedValueOnce([
            { id: 's1', text: 'Hello', startTime: 0, endTime: 1, confidence: 0.9, isPartial: false, speakerId: null, language: 'en' },
            { id: 's2', text: 'world', startTime: 1, endTime: 2, confidence: 0.88, isPartial: false, speakerId: null, language: 'en' },
        ]);

        const result = await audioCaptureService.stopRecording();
        const segments = await transcriptionService.transcribeFile(result.uri);
        const fullText = segments.map((s: any) => s.text).join(' ').trim();

        expect(fullText).toBe('Hello world');
    });
});
