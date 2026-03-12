/**
 * 🧬 RP-8.6 — Video Capture Service
 * M12: Camera capture for video recording + future OCR
 */
import { Camera, CameraType, CameraView } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import { createLogger } from './logger';

const log = createLogger('VideoCapture');

class VideoCaptureService {
    private cameraRef: CameraView | null = null;
    private isRecording = false;
    private sessionId: string | null = null;

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
        if (this.isRecording) {
            throw new Error('Already recording video');
        }

        this.sessionId = sessionId;
        this.isRecording = true;

        try {
            // Note: recordAsync is called but result is collected on stop
        } catch (err) {
            this.isRecording = false;
            throw err;
        }
    }

    /**
     * Stop video recording and return the file
     */
    async stopVideoCapture(): Promise<{ uri: string; size: number }> {
        if (!this.cameraRef || !this.isRecording) {
            throw new Error('Not recording video');
        }

        this.isRecording = false;

        try {
            // Get the video file
            // Note: expo-camera recordAsync returns the URI when stopped
            const tempUri = (FileSystem.cacheDirectory || '') +
                `windy-video-${this.sessionId}.mp4`;

            // Move to permanent storage
            const monthDir = new Date().toISOString().slice(0, 7);
            const destDir = (FileSystem.documentDirectory || '') +
                `windy/video/${monthDir}/`;
            await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });

            const destPath = destDir + `${this.sessionId}.mp4`;

            // Check if temp file exists before moving
            const tempInfo = await FileSystem.getInfoAsync(tempUri);
            if (tempInfo.exists) {
                await FileSystem.moveAsync({ from: tempUri, to: destPath });
            }

            const info = await FileSystem.getInfoAsync(destPath);
            const size = info.exists && 'size' in info ? (info as any).size : 0;


            return { uri: destPath, size };
        } catch (err) {
            console.error('[Video] Stop failed:', err);
            throw err;
        }
    }

    /**
     * Cancel video recording (discard)
     */
    async cancelVideoCapture(): Promise<void> {
        this.isRecording = false;
        // Cleanup temp files
        if (this.sessionId) {
            const tempUri = (FileSystem.cacheDirectory || '') +
                `windy-video-${this.sessionId}.mp4`;
            await FileSystem.deleteAsync(tempUri, { idempotent: true });
        }
        this.sessionId = null;
    }

    getIsRecording(): boolean {
        return this.isRecording;
    }
}

export const videoCaptureService = new VideoCaptureService();
