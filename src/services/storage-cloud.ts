/**
 * 🧬 M8 — Cloud Storage Client (Account Server API)
 * @deprecated Use `cloudApi` from `@/services/cloudApi` for new code.
 * This file is kept for backward compatibility with existing consumers.
 *
 * Legacy API Endpoints (v1):
 *   POST /api/v1/auth/login         → JWT token
 *   POST /api/v1/recordings/upload  → upload recording + metadata
 *   GET  /api/v1/recordings/list    → list all recordings
 *   GET  /api/v1/recordings/:id     → get single recording
 *   DELETE /api/v1/recordings/:id   → delete recording
 *
 * New live API (use cloudApi instead):
 *   POST /api/auth/register | /api/auth/login
 *   POST /api/storage/files/upload
 *   GET  /api/storage/files
 *   GET  /api/storage/files/:id
 *   DELETE /api/storage/files/:id
 */

// Re-export the new client for gradual migration
export { cloudApi } from './cloudApi';
import * as FileSystem from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { ENDPOINTS, apiUrl } from '@/config/api';
import {
    parseApiError,
    parseUploadError,
    createNetworkError,
    isAuthError,
    isRateLimited,
    ApiError,
} from '@/utils/api-error';

const TOKEN_KEY = 'windy_jwt_token';
const REFRESH_KEY = 'windy_refresh_token';
const USER_KEY = 'windy_user_email';

export interface CloudConfig {
    apiBase?: string;
    email?: string;
    password?: string;
}

export interface CloudRecording {
    id: string;
    title: string;
    duration: number;
    transcript: string;
    createdAt: string;
    audioUrl?: string;
    quality: number;
    engineUsed: string;
    languages: string[];
    source: string;
    synced: boolean;
}

class CloudStorageClient {
    private apiBase: string | undefined;
    private jwtToken: string | null = null;
    private refreshToken: string | null = null;
    private tokenExpiry: number = 0;

    /**
     * Configure API base URL override
     */
    configure(config: CloudConfig): void {
        if (config.apiBase) this.apiBase = config.apiBase;
    }

    // ─── URL helper ────────────────────────────────────────────

    private url(endpoint: string): string {
        return apiUrl(endpoint, this.apiBase);
    }

    // ─── Authentication ────────────────────────────────────────

    /**
     * Login with email/password → get JWT token
     */
    async login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
        try {
            const response = await fetch(this.url(ENDPOINTS.AUTH_LOGIN), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            if (!response.ok) {
                const apiErr = await parseApiError(response);
                return { success: false, error: apiErr.message };
            }

            const data = await response.json();
            this.jwtToken = data.token || data.accessToken;
            this.refreshToken = data.refreshToken || null;
            this.tokenExpiry = Date.now() + (data.expiresIn || 3600) * 1000;

            // Persist tokens securely
            if (this.jwtToken) {
                await SecureStore.setItemAsync(TOKEN_KEY, this.jwtToken);
            }
            if (this.refreshToken) {
                await SecureStore.setItemAsync(REFRESH_KEY, this.refreshToken);
            }
            await SecureStore.setItemAsync(USER_KEY, email);

            return { success: true };
        } catch (error: any) {
            if (error instanceof ApiError) {
                return { success: false, error: error.message };
            }
            console.error('[Cloud] Login error:', error);
            return { success: false, error: error.message || 'Network error' };
        }
    }

    /**
     * Restore saved JWT from secure storage
     */
    async restoreSession(): Promise<boolean> {
        try {
            const token = await SecureStore.getItemAsync(TOKEN_KEY);
            const refresh = await SecureStore.getItemAsync(REFRESH_KEY);

            if (token) {
                this.jwtToken = token;
                this.refreshToken = refresh;
                return true;
            }
            return false;
        } catch (err) {
            console.warn('[CloudStorage] restoreSession failed:', err);
            return false;
        }
    }

    /**
     * Refresh JWT using refresh token
     */
    async refreshAuth(): Promise<boolean> {
        if (!this.refreshToken) return false;

        try {
            const response = await fetch(this.url(ENDPOINTS.AUTH_REFRESH), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: this.refreshToken }),
            });

            if (!response.ok) return false;

            const data = await response.json();
            this.jwtToken = data.token || data.accessToken;
            this.tokenExpiry = Date.now() + (data.expiresIn || 3600) * 1000;

            if (this.jwtToken) {
                await SecureStore.setItemAsync(TOKEN_KEY, this.jwtToken);
            }

            return true;
        } catch (err) {
            console.warn('[CloudStorage] refreshAuth failed:', err);
            return false;
        }
    }

    /**
     * Logout — clear stored tokens
     */
    async logout(): Promise<void> {
        this.jwtToken = null;
        this.refreshToken = null;
        this.tokenExpiry = 0;
        await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => { });
        await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => { });
        await SecureStore.deleteItemAsync(USER_KEY).catch(() => { });
    }

    /**
     * Check if authenticated
     */
    isAuthenticated(): boolean {
        return !!this.jwtToken;
    }

    /**
     * Get stored email
     */
    async getEmail(): Promise<string | null> {
        return SecureStore.getItemAsync(USER_KEY);
    }

    /**
     * Get auth headers with auto-refresh
     */
    private async getAuthHeaders(): Promise<Record<string, string>> {
        // Auto-refresh if expired
        if (this.tokenExpiry > 0 && Date.now() > this.tokenExpiry - 60000) {
            await this.refreshAuth();
        }

        if (!this.jwtToken) {
            throw new Error('Not authenticated — call login() first');
        }

        return {
            'Authorization': `Bearer ${this.jwtToken}`,
            'Content-Type': 'application/json',
        };
    }

    // ─── Recording Upload ──────────────────────────────────────

    /**
     * Upload a recording session (metadata + audio) to the account server
     * POST /api/v1/recordings/upload
     */
    async uploadRecording(
        sessionId: string,
        metadata: {
            title?: string;
            duration: number;
            transcript: string;
            quality: number;
            engineUsed: string;
            languages: string[];
            source: string;
            createdAt: string;
        },
        audioPath?: string,
        onProgress?: (pct: number) => void
    ): Promise<{ success: boolean; remoteId?: string; error?: string }> {
        try {
            const headers = await this.getAuthHeaders();
            onProgress?.(10);

            // Step 1: Upload metadata
            const metaResponse = await fetch(this.url(ENDPOINTS.RECORDINGS_UPLOAD), {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    clientId: sessionId,
                    title: metadata.title || `Recording ${new Date(metadata.createdAt).toLocaleString()}`,
                    duration: metadata.duration,
                    transcript: metadata.transcript,
                    quality: metadata.quality,
                    engineUsed: metadata.engineUsed,
                    languages: metadata.languages,
                    source: metadata.source,
                    createdAt: metadata.createdAt,
                }),
            });

            if (!metaResponse.ok) {
                const apiErr = await parseApiError(metaResponse);
                if (isAuthError(metaResponse.status)) {
                    // Try refresh and retry once
                    const refreshed = await this.refreshAuth();
                    if (!refreshed) throw apiErr;
                    return this.uploadRecording(sessionId, metadata, audioPath, onProgress);
                }
                throw apiErr;
            }

            const result = await metaResponse.json();
            const remoteId = result.id || result.recordingId || sessionId;
            onProgress?.(50);

            // Step 2: Upload audio file if exists
            if (audioPath) {
                const fileInfo = await FileSystem.getInfoAsync(audioPath);
                if (fileInfo.exists) {
                    const uploadResult = await FileSystem.uploadAsync(
                        `${this.url(ENDPOINTS.RECORDINGS_BY_ID)}/${remoteId}/audio`,
                        audioPath,
                        {
                            httpMethod: 'PUT',
                            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
                            headers: {
                                'Authorization': `Bearer ${this.jwtToken}`,
                                'Content-Type': 'audio/wav',
                            },
                        }
                    );

                    if (uploadResult.status < 200 || uploadResult.status >= 300) {
                        console.warn(`[Cloud] Audio upload got HTTP ${uploadResult.status} — metadata still synced`);
                    }
                }
            }

            onProgress?.(100);
            return { success: true, remoteId };
        } catch (error: any) {
            console.error('[Cloud] Upload failed:', error);
            return { success: false, error: error.message };
        }
    }

    // ─── Recording List / Fetch ────────────────────────────────

    /**
     * List all recordings from the cloud
     * GET /api/v1/recordings/list
     */
    async listRecordings(
        page = 1,
        limit = 50
    ): Promise<{ recordings: CloudRecording[]; total: number }> {
        try {
            const headers = await this.getAuthHeaders();
            const response = await fetch(
                `${this.url(ENDPOINTS.RECORDINGS_LIST)}?page=${page}&limit=${limit}`,
                { headers }
            );

            if (!response.ok) {
                const apiErr = await parseApiError(response);
                if (isAuthError(response.status)) {
                    const refreshed = await this.refreshAuth();
                    if (refreshed) return this.listRecordings(page, limit);
                }
                throw apiErr;
            }

            const data = await response.json();
            return {
                recordings: data.recordings || data.data || [],
                total: data.total || data.count || 0,
            };
        } catch (error: any) {
            console.error('[Cloud] List recordings failed:', error);
            return { recordings: [], total: 0 };
        }
    }

    /**
     * Get a single recording from the cloud
     * GET /api/v1/recordings/:id
     */
    async getRecording(id: string): Promise<CloudRecording | null> {
        try {
            const headers = await this.getAuthHeaders();
            const response = await fetch(
                `${this.url(ENDPOINTS.RECORDINGS_BY_ID)}/${id}`,
                { headers }
            );

            if (!response.ok) {
                if (isAuthError(response.status)) {
                    const refreshed = await this.refreshAuth();
                    if (refreshed) return this.getRecording(id);
                }
                return null;
            }
            return await response.json();
        } catch (err) {
            console.warn('[CloudStorage] getRecording failed:', err);
            return null;
        }
    }

    /**
     * Delete a recording from the cloud
     * DELETE /api/v1/recordings/:id
     */
    async deleteRecording(id: string): Promise<boolean> {
        try {
            const headers = await this.getAuthHeaders();
            const response = await fetch(
                `${this.url(ENDPOINTS.RECORDINGS_BY_ID)}/${id}`,
                {
                    method: 'DELETE',
                    headers,
                }
            );

            if (!response.ok) {
                if (isAuthError(response.status)) {
                    const refreshed = await this.refreshAuth();
                    if (refreshed) return this.deleteRecording(id);
                }
                return false;
            }
            return true;
        } catch (err) {
            console.warn('[CloudStorage] deleteRecording failed:', err);
            return false;
        }
    }

    // ─── Compatibility bridge (for existing sync-engine.ts) ────

    /**
     * @deprecated Use uploadRecording instead. Kept for backward compat.
     */
    async uploadFile(
        localPath: string,
        remotePath: string,
        onProgress?: (pct: number) => void
    ): Promise<void> {
        // Extract session ID from path
        const sessionId = remotePath.replace(/.*\/([^/]+)\.\w+$/, '$1');
        const result = await this.uploadRecording(
            sessionId,
            {
                duration: 0,
                transcript: '',
                quality: 0,
                engineUsed: 'unknown',
                languages: ['en'],
                source: 'record',
                createdAt: new Date().toISOString(),
            },
            localPath,
            onProgress
        );
        if (!result.success) throw new Error(result.error || 'Upload failed');
    }

    /**
     * @deprecated Use uploadRecording instead. Kept for backward compat.
     */
    async uploadMetadata(
        sessionId: string,
        metadata: Record<string, any>
    ): Promise<void> {
        // No-op — metadata is now sent with uploadRecording
    }

    /**
     * @deprecated Kept for backward compat.
     */
    isConfigured(): boolean {
        return this.isAuthenticated();
    }
}

export const cloudStorageClient = new CloudStorageClient();
