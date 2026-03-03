/**
 * 🧬 M2.1 — Audio Capture Service
 * Records audio using expo-av with metering for waveform display.
 * Produces WAV files for transcription.
 */
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import type { RecordingConfig, RecordingResult, AudioQuality, QualityLabel } from '@/types';

/** Default recording configuration */
const DEFAULT_CONFIG: RecordingConfig = {
    sampleRate: 44100,
    channels: 1,
    encoding: 'wav',
    meteringEnabled: true,
    maxDuration: 300, // 5 minutes (free tier)
};

class AudioCaptureService {
    private recording: Audio.Recording | null = null;
    private config: RecordingConfig = DEFAULT_CONFIG;

    /** Callback for real-time audio level (0.0 - 1.0) */
    public onMeterUpdate: ((level: number) => void) | null = null;

    /**
     * Start recording audio
     */
    async startRecording(sessionId: string, config?: Partial<RecordingConfig>): Promise<void> {
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Request permissions
        const permission = await Audio.requestPermissionsAsync();
        if (permission.status !== 'granted') {
            throw new Error('Microphone permission not granted');
        }

        // Configure audio mode for recording
        await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
        });

        // Create recording with high quality preset
        const { recording } = await Audio.Recording.createAsync(
            {
                android: {
                    extension: '.wav',
                    outputFormat: Audio.AndroidOutputFormat.DEFAULT,
                    audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
                    sampleRate: this.config.sampleRate,
                    numberOfChannels: this.config.channels,
                    bitRate: 128000,
                },
                ios: {
                    extension: '.wav',
                    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
                    audioQuality: Audio.IOSAudioQuality.MAX,
                    sampleRate: this.config.sampleRate,
                    numberOfChannels: this.config.channels,
                    bitRate: 128000,
                    linearPCMBitDepth: 16,
                    linearPCMIsBigEndian: false,
                    linearPCMIsFloat: false,
                },
                web: {},
            },
            // Status callback for metering
            (status) => {
                if (status.isRecording && status.metering !== undefined && this.onMeterUpdate) {
                    // Convert dB to 0.0-1.0 scale
                    // expo-av metering is in dB, typically -160 (silence) to 0 (max)
                    const normalized = Math.max(0, Math.min(1, (status.metering + 60) / 60));
                    this.onMeterUpdate(normalized);
                }
            },
            100 // metering update interval (ms)
        );

        this.recording = recording;
    }

    /**
     * Stop recording and return the result
     */
    async stopRecording(): Promise<RecordingResult> {
        if (!this.recording) {
            throw new Error('No active recording');
        }

        // Stop the recording
        await this.recording.stopAndUnloadAsync();

        // Reset audio mode
        await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
        });

        // Clear meter callback to prevent stale references
        this.onMeterUpdate = null;

        // Get the URI and file info
        const uri = this.recording.getURI();
        if (!uri) {
            throw new Error('Recording URI is null');
        }

        const status = await this.recording.getStatusAsync();
        const fileInfo = await FileSystem.getInfoAsync(uri);
        const fileSize = (fileInfo as any).size || 0;

        const result: RecordingResult = {
            sessionId: `session-${Date.now()}`,
            uri,
            duration: (status.durationMillis || 0) / 1000,
            fileSize,
        };

        this.recording = null;
        return result;
    }

    /**
     * Cancel and discard current recording
     */
    async cancelRecording(): Promise<void> {
        if (this.recording) {
            try {
                await this.recording.stopAndUnloadAsync();
                const uri = this.recording.getURI();
                if (uri) {
                    await FileSystem.deleteAsync(uri, { idempotent: true });
                }
            } catch {
                // Ignore errors during cancel
            }
            this.recording = null;
            this.onMeterUpdate = null;
        }
    }

    /**
     * Check if currently recording
     */
    isRecording(): boolean {
        return this.recording !== null;
    }
}

/**
 * 🧬 M2.2 — Audio Quality Scorer
 * Scores recording quality for clone pipeline tracking
 */
export function scoreAudioQuality(
    durationSeconds: number,
    sampleRate: number,
    avgLevel: number,
    peakLevel: number
): AudioQuality {
    let score = 0;

    // Duration scoring (longer is better, up to 60s)
    score += Math.min(20, (durationSeconds / 60) * 20);

    // Sample rate scoring
    if (sampleRate >= 44100) score += 20;
    else if (sampleRate >= 16000) score += 10;

    // Signal level scoring (not too quiet, not clipping)
    if (avgLevel >= 0.1 && avgLevel <= 0.7) score += 25;
    else if (avgLevel >= 0.05) score += 15;

    // Clipping detection
    const hasClipping = peakLevel > 0.98;
    if (!hasClipping) score += 15;

    // Speech ratio estimation (based on level variance)
    const estimatedSpeechRatio = Math.min(1, avgLevel * 3);
    score += estimatedSpeechRatio * 20;

    // Cap at 100
    score = Math.min(100, Math.round(score));

    let label: QualityLabel;
    if (score >= 80) label = 'excellent';
    else if (score >= 60) label = 'good';
    else if (score >= 40) label = 'fair';
    else label = 'poor';

    return {
        score,
        label,
        snrDb: avgLevel > 0 ? 20 * Math.log10(avgLevel / 0.01) : 0,
        speechRatio: estimatedSpeechRatio,
        hasClipping,
        sampleRate,
    };
}

// Singleton instance
export const audioCaptureService = new AudioCaptureService();
