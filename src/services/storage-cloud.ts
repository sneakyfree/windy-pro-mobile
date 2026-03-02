/**
 * 🧬 RP-6.1 — Cloud Storage Client
 * S3/MinIO upload client for cloud sync
 */
import * as FileSystem from 'expo-file-system';

interface UploadOptions {
    endpoint: string;
    bucket: string;
    region: string;
    accessKey: string;
    secretKey: string;
}

class CloudStorageClient {
    private config: UploadOptions | null = null;

    /**
     * Configure the S3-compatible client
     */
    configure(options: UploadOptions): void {
        this.config = options;
    }

    isConfigured(): boolean {
        return this.config !== null;
    }

    /**
     * Upload a file to S3/MinIO using pre-signed URL approach
     * (Avoids bundling the full @aws-sdk/client-s3 which is huge)
     */
    async uploadFile(
        localPath: string,
        remotePath: string,
        onProgress?: (pct: number) => void
    ): Promise<void> {
        if (!this.config) throw new Error('Cloud storage not configured');

        const fileInfo = await FileSystem.getInfoAsync(localPath);
        if (!fileInfo.exists) throw new Error(`File not found: ${localPath}`);
        const fileSize = 'size' in fileInfo ? (fileInfo as any).size : 0;

        // Step 1: Get pre-signed upload URL from our API
        const presignResponse = await fetch(
            `${this.config.endpoint}/api/sync/presign-upload`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.accessKey}`,
                },
                body: JSON.stringify({
                    path: remotePath,
                    bucket: this.config.bucket,
                    contentType: 'application/octet-stream',
                    contentLength: fileSize,
                }),
            }
        );

        if (!presignResponse.ok) {
            throw new Error(`Pre-sign failed: ${presignResponse.status}`);
        }

        const { uploadUrl } = await presignResponse.json();

        // Step 2: Upload via FileSystem.uploadAsync (native, supports progress)
        const uploadResult = await FileSystem.uploadAsync(uploadUrl, localPath, {
            httpMethod: 'PUT',
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            headers: {
                'Content-Type': 'application/octet-stream',
            },
        });

        if (uploadResult.status < 200 || uploadResult.status >= 300) {
            throw new Error(`Upload failed: HTTP ${uploadResult.status}`);
        }

        onProgress?.(100);
        console.log(`[CloudStorage] Uploaded: ${remotePath}`);
    }

    /**
     * Upload session metadata as JSON
     */
    async uploadMetadata(
        sessionId: string,
        metadata: Record<string, any>
    ): Promise<void> {
        if (!this.config) throw new Error('Cloud storage not configured');

        const response = await fetch(
            `${this.config.endpoint}/api/sync/metadata`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.accessKey}`,
                },
                body: JSON.stringify({
                    sessionId,
                    bucket: this.config.bucket,
                    metadata,
                }),
            }
        );

        if (!response.ok) {
            throw new Error(`Metadata upload failed: ${response.status}`);
        }
    }

    /**
     * Check if a file exists on remote storage
     */
    async fileExists(remotePath: string): Promise<boolean> {
        if (!this.config) return false;

        try {
            const response = await fetch(
                `${this.config.endpoint}/api/sync/exists`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.config.accessKey}`,
                    },
                    body: JSON.stringify({
                        path: remotePath,
                        bucket: this.config.bucket,
                    }),
                }
            );
            const data = await response.json();
            return data.exists === true;
        } catch {
            return false;
        }
    }
}

export const cloudStorageClient = new CloudStorageClient();
