/**
 * 🧬 RP-8.6 — Video Capture Service
 * M12: Camera capture for video recording + future OCR
 *
 * Follows the same patterns as audio-capture.ts:
 *   - Start/stop/cancel lifecycle
 *   - Session ID tracking
 *   - Temp -> permanent file move on stop
 *   - Permission handling
 */
import { Camera, CameraView } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import { createLogger } from './logger';

const log = createLogger('VideoCapture');

class VideoCaptureService {
    private cameraRef: CameraView | null = null;
    private isCurrentlyRecording = false;
    private sessionId: string | null = null;
    /** Promise that resolves when recordAsync completes (on stop) */
    private recordingPromise: Promise<{ uri: string }> | null = null;

    /**
     * Set the camera ref (from React component)
     */
    setCameraRef(ref: CameraView | null): void {
        this.cameraRef = ref;
    }

    /**
     * Request camera permission
     */
    async requestPermission(): Promise<boolean> {
        const { status } = await Camera.requestCameraPermissionsAsync();
        return status === 'granted';
    }

    /**
     * Check if camera permission is granted
     */
    async hasPermission(): Promise<boolean> {
        const { status } = await Camera.getCameraPermissionsAsync();
        return status === 'granted';
    }

    /**
     * Start video recording
     * Uses front camera, 720p, for clone data collection
     */
    async startVideoCapture(sessionId: string): Promise<void> {
        if (!this.cameraRef) {
            throw new Error('Camera ref not set');
        }
        if (this.isCurrentlyRecording) {
            throw new Error('Already recording video');
        }

        this.sessionId = sessionId;
        this.isCurrentlyRecording = true;

        try {
            // recordAsync returns a promise that resolves when recording stops
            this.recordingPromise = this.cameraRef.recordAsync({
                maxDuration: 3600, // 1 hour max
            }) as Promise<{ uri: string }>;
        } catch (err) {
            this.isCurrentlyRecording = false;
            this.recordingPromise = null;
            log.error('startVideoCapture', err);
            throw err;
        }
    }

    /**
     * Stop video recording and return the file
     */
    async stopVideoCapture(): Promise<{ uri: string; size: number }> {
        if (!this.cameraRef || !this.isCurrentlyRecording) {
            throw new Error('Not recording video');
        }

        this.isCurrentlyRecording = false;

        try {
            // stopRecording causes the recordAsync promise to resolve with the URI
            this.cameraRef.stopRecording();

            if (!this.recordingPromise) {
                throw new Error('No active recording promise');
            }

            const result = await this.recordingPromise;
            this.recordingPromise = null;
            const tempUri = result.uri;

            // Move to permanent storage organized by month
            const monthDir = new Date().toISOString().slice(0, 7);
            const destDir = (FileSystem.documentDirectory || '') +
                `windy/video/${monthDir}/`;
            await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });

            const destPath = destDir + `${this.sessionId}.mp4`;
            await FileSystem.moveAsync({ from: tempUri, to: destPath });

            const info = await FileSystem.getInfoAsync(destPath);
            const size = info.exists && 'size' in info ? (info as { size: number }).size : 0;

            log.info('stopVideoCapture', 'Video saved', {
                sessionId: this.sessionId,
                size,
                path: destPath,
            });

            return { uri: destPath, size };
        } catch (err) {
            this.recordingPromise = null;
            log.error('stopVideoCapture', err);
            throw err;
        }
    }

    /**
     * Cancel video recording (discard)
     */
    async cancelVideoCapture(): Promise<void> {
        if (this.isCurrentlyRecording && this.cameraRef) {
            this.cameraRef.stopRecording();
        }
        this.isCurrentlyRecording = false;

        // Wait for the recording promise to settle, then delete the file
        if (this.recordingPromise) {
            try {
                const result = await this.recordingPromise;
                await FileSystem.deleteAsync(result.uri, { idempotent: true });
            } catch {
                // Ignore errors during cancel cleanup
            }
            this.recordingPromise = null;
        }

        // Also clean up any temp files for this session
        if (this.sessionId) {
            const tempUri = (FileSystem.cacheDirectory || '') +
                `windy-video-${this.sessionId}.mp4`;
            await FileSystem.deleteAsync(tempUri, { idempotent: true });
        }
        this.sessionId = null;
    }

    getIsRecording(): boolean {
        return this.isCurrentlyRecording;
    }
}

export const videoCaptureService = new VideoCaptureService();
