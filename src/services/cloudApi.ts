/**
 * 🧬 Cloud API Client
 * Typed client for windyword.ai R2 cloud storage API.
 *
 * Endpoints:
 *   POST /api/auth/register       → { email, password } → { token, userId }
 *   POST /api/auth/login          → { email, password } → { token, userId }
 *   GET  /api/storage/health      → R2 health
 *   POST /api/storage/files/upload→ multipart file upload (auth)
 *   GET  /api/storage/files       → list files (auth)
 *   GET  /api/storage/files/:id   → download file (auth)
 *   DELETE /api/storage/files/:id → delete file (auth)
 *
 * Features:
 *   - JWT stored in expo-secure-store (NOT AsyncStorage)
 *   - Auto-redirect to login on 401
 *   - FormData multipart for uploads
 *   - 30s request timeout
 *   - Retry queue for failed uploads
 */
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import { API_BASE_URL, ENDPOINTS, apiUrl } from '@/config/api';
import type { LicenseTier } from '@/types';
import { normalizeBackendTier } from './license';
import { createLogger } from './logger';

const log = createLogger('CloudApi');

// ─── Secure Store Keys ──────────────────────────────────────────
// Unified token key — shared with heartbeat, license, pairManager, model-crypto
const TOKEN_KEY = 'windy_jwt_token';
const REFRESH_TOKEN_KEY = 'windy_cloud_refresh_token';
const USER_ID_KEY = 'windy_cloud_user_id';
const USER_EMAIL_KEY = 'windy_cloud_email';
const IDENTITY_ID_KEY = 'windy_identity_id';

// ─── Timeout ────────────────────────────────────────────────────
const REQUEST_TIMEOUT_MS = 30_000;

// ─── Storage Tiers (bytes) ──────────────────────────────────────
export const STORAGE_TIERS: Record<LicenseTier, { label: string; limitBytes: number }> = {
    free:          { label: 'Free',           limitBytes: 500 * 1024 * 1024 },       // 500 MB
    pro:           { label: 'Pro',            limitBytes: 5 * 1024 * 1024 * 1024 },   // 5 GB
    translate:     { label: 'Windy Ultra',     limitBytes: 10 * 1024 * 1024 * 1024 },  // 10 GB
    translate_pro: { label: 'Windy Max',      limitBytes: 25 * 1024 * 1024 * 1024 },  // 25 GB
};

// ─── Types ──────────────────────────────────────────────────────

export interface CloudFile {
    id: string;
    filename: string;
    size: number;
    contentType: string;
    uploadedAt: string;
    metadata?: Record<string, string>;
}

export interface AuthResult {
    success: boolean;
    token?: string;
    userId?: string;
    error?: string;
}

export interface UploadResult {
    success: boolean;
    fileId?: string;
    error?: string;
}

export interface HealthResult {
    ok: boolean;
    status?: string;
    nodeId?: string;
    version?: string;
    disk?: {
        totalHuman: string;
        usedHuman: string;
        availableHuman: string;
        usedPercent: number;
    };
}

export interface StorageUsageResult {
    usedBytes: number;
    limitBytes: number;
    fileCount: number;
    tierLabel: string;
    percentUsed: number;
}

/** Queued upload for retry */
interface QueuedUpload {
    fileUri: string;
    filename: string;
    contentType: string;
    metadata?: Record<string, string>;
    addedAt: string;
    retries: number;
}

// ─── Callbacks ──────────────────────────────────────────────────
type AuthExpiredCallback = () => void;

// ─── Client ─────────────────────────────────────────────────────

class CloudApiClient {
    private jwt: string | null = null;
    private refreshTokenValue: string | null = null;
    private userId: string | null = null;
    private email: string | null = null;
    private windyIdentityId: string | null = null;
    private uploadQueue: QueuedUpload[] = [];
    private onAuthExpired: AuthExpiredCallback | null = null;
    private isRefreshing: Promise<boolean> | null = null;

    // ─── Auth ───────────────────────────────────────────────────

    /**
     * Register a new account.
     */
    async register(email: string, password: string): Promise<AuthResult> {
        try {
            const res = await this.fetchWithTimeout(
                apiUrl(ENDPOINTS.AUTH_REGISTER),
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                }
            );

            if (!res.ok) {
                const body = await this.safeJson(res);
                return { success: false, error: String(body?.error || body?.message || `Registration failed (${res.status})`) };
            }

            const data = await res.json();
            await this.persistAuth(data.token, data.userId, email, data.refreshToken);
            return { success: true, token: data.token, userId: data.userId };
        } catch (err: unknown) {
            return { success: false, error: err instanceof Error ? err.message : 'Network error' };
        }
    }

    /**
     * Login with email + password.
     */
    async login(email: string, password: string): Promise<AuthResult> {
        try {
            const res = await this.fetchWithTimeout(
                apiUrl(ENDPOINTS.AUTH_LOGIN_LIVE),
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                }
            );

            if (!res.ok) {
                const body = await this.safeJson(res);
                return { success: false, error: String(body?.error || body?.message || `Login failed (${res.status})`) };
            }

            const data = await res.json();
            await this.persistAuth(data.token, data.userId, email, data.refreshToken);
            return { success: true, token: data.token, userId: data.userId };
        } catch (err: unknown) {
            return { success: false, error: err instanceof Error ? err.message : 'Network error' };
        }
    }

    /**
     * Restore session from secure store on app launch.
     */
    async restoreSession(): Promise<boolean> {
        try {
            const token = await SecureStore.getItemAsync(TOKEN_KEY);
            const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
            const userId = await SecureStore.getItemAsync(USER_ID_KEY);
            const email = await SecureStore.getItemAsync(USER_EMAIL_KEY);
            const identityId = await SecureStore.getItemAsync(IDENTITY_ID_KEY);

            if (token) {
                this.jwt = token;
                this.refreshTokenValue = refreshToken;
                this.userId = userId;
                this.email = email;
                this.windyIdentityId = identityId;
                // Sync identity ID to Zustand store for app-wide access
                try {
                    const { useSettingsStore } = require('@/stores/useSettingsStore');
                    useSettingsStore.getState().setWindyIdentityId(identityId);
                } catch {
                    // Store may not be ready during early init
                }
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    /**
     * Logout — clear all stored auth state.
     */
    async logout(): Promise<void> {
        this.jwt = null;
        this.refreshTokenValue = null;
        this.userId = null;
        this.email = null;
        this.windyIdentityId = null;
        await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => {});
        await SecureStore.deleteItemAsync(USER_ID_KEY).catch(() => {});
        await SecureStore.deleteItemAsync(USER_EMAIL_KEY).catch(() => {});
        await SecureStore.deleteItemAsync(IDENTITY_ID_KEY).catch(() => {});
        // Clear identity from Zustand store
        try {
            const { useSettingsStore } = require('@/stores/useSettingsStore');
            useSettingsStore.getState().setWindyIdentityId(null);
        } catch {}
    }

    isAuthenticated(): boolean {
        return !!this.jwt;
    }

    getUserId(): string | null {
        return this.userId;
    }

    getEmail(): string | null {
        return this.email;
    }

    getToken(): string | null {
        return this.jwt;
    }

    getWindyIdentityId(): string | null {
        return this.windyIdentityId;
    }

    /**
     * Register a callback for when auth expires (401).
     * Used to redirect to login screen.
     */
    setAuthExpiredHandler(handler: AuthExpiredCallback): void {
        this.onAuthExpired = handler;
    }

    // ─── Storage: Upload ────────────────────────────────────────

    /**
     * Upload a file to cloud storage using multipart FormData.
     * @param fileUri - Local file URI (React Native file://)
     * @param filename - Display filename
     * @param contentType - MIME type (e.g. 'audio/wav')
     * @param metadata - Optional key-value metadata
     */
    async uploadFile(
        fileUri: string,
        filename: string,
        contentType: string = 'application/octet-stream',
        metadata?: Record<string, string>,
    ): Promise<UploadResult> {
        if (!this.jwt) {
            return { success: false, error: 'Not authenticated' };
        }

        try {
            // Use expo-file-system uploadAsync for React Native file URIs
            const uploadUrl = apiUrl(ENDPOINTS.STORAGE_UPLOAD);

            const parameters: Record<string, string> = {};
            if (metadata) {
                // Send metadata as JSON string in a form field
                parameters['metadata'] = JSON.stringify(metadata);
            }

            const uploadHeaders: Record<string, string> = {
                'Authorization': `Bearer ${this.jwt}`,
            };
            if (this.windyIdentityId) {
                uploadHeaders['X-Windy-Identity-Id'] = this.windyIdentityId;
            }

            const result = await FileSystem.uploadAsync(uploadUrl, fileUri, {
                httpMethod: 'POST',
                uploadType: FileSystem.FileSystemUploadType.MULTIPART,
                fieldName: 'file',
                mimeType: contentType,
                headers: uploadHeaders,
                parameters,
            });

            if (result.status === 401) {
                // Attempt token refresh before giving up
                const refreshed = await this.refreshAuth();
                if (refreshed && this.jwt) {
                    const retryUploadHeaders: Record<string, string> = {
                        'Authorization': `Bearer ${this.jwt}`,
                    };
                    if (this.windyIdentityId) {
                        retryUploadHeaders['X-Windy-Identity-Id'] = this.windyIdentityId;
                    }
                    // Retry the upload with the new token
                    const retryResult = await FileSystem.uploadAsync(uploadUrl, fileUri, {
                        httpMethod: 'POST',
                        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
                        fieldName: 'file',
                        mimeType: contentType,
                        headers: retryUploadHeaders,
                        parameters,
                    });
                    if (retryResult.status >= 200 && retryResult.status < 300) {
                        let fileId: string | undefined;
                        try {
                            const body = JSON.parse(retryResult.body);
                            fileId = body.fileId || body.id;
                        } catch {}
                        return { success: true, fileId };
                    }
                    if (retryResult.status === 401) {
                        this.handleAuthExpired();
                        return { success: false, error: 'Session expired — please log in again' };
                    }
                }
                this.handleAuthExpired();
                return { success: false, error: 'Session expired — please log in again' };
            }

            if (result.status >= 200 && result.status < 300) {
                let fileId: string | undefined;
                try {
                    const body = JSON.parse(result.body);
                    fileId = body.fileId || body.id;
                } catch {}
                return { success: true, fileId };
            }

            let errorMsg = `Upload failed (${result.status})`;
            try {
                const body = JSON.parse(result.body);
                errorMsg = body.error || body.message || errorMsg;
            } catch {}
            return { success: false, error: errorMsg };
        } catch (err: unknown) {
            // Queue for retry on network errors
            this.queueUpload(fileUri, filename, contentType, metadata);
            return { success: false, error: (err instanceof Error ? err.message : 'Network error') + ' — queued for retry' };
        }
    }

    // ─── Storage: List ──────────────────────────────────────────

    /**
     * List all files in cloud storage.
     */
    async listFiles(): Promise<{ files: CloudFile[]; error?: string }> {
        try {
            const res = await this.authedFetch(apiUrl(ENDPOINTS.STORAGE_LIST));
            if (!res) return { files: [], error: 'Not authenticated' };

            if (!res.ok) {
                const body = await this.safeJson(res);
                return { files: [], error: String(body?.error || `List failed (${res.status})`) };
            }

            const data = await res.json();
            // API may return { files: [...] } or direct array
            const files: CloudFile[] = Array.isArray(data) ? data : (data.files || []);
            return { files };
        } catch (err: unknown) {
            return { files: [], error: err instanceof Error ? err.message : 'Network error' };
        }
    }

    // ─── Storage: Download ──────────────────────────────────────

    /**
     * Download a file from cloud storage.
     * @returns Local file path, or null on failure.
     */
    async downloadFile(fileId: string, destFilename?: string): Promise<string | null> {
        if (!this.jwt) return null;

        try {
            const url = `${apiUrl(ENDPOINTS.STORAGE_FILE)}/${fileId}`;
            const destDir = (FileSystem.documentDirectory || '') + 'cloud-downloads/';
            await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
            const destPath = destDir + (destFilename || fileId);

            const download = await FileSystem.downloadAsync(url, destPath, {
                headers: { 'Authorization': `Bearer ${this.jwt}` },
            });

            if (download.status === 401) {
                this.handleAuthExpired();
                return null;
            }

            return download.status >= 200 && download.status < 300 ? destPath : null;
        } catch (err: unknown) {
            log.warn('downloadFile', 'downloadFile failed', err instanceof Error ? { message: err.message, stack: err.stack } : { error: String(err) });
            return null;
        }
    }

    // ─── Storage: Delete ────────────────────────────────────────

    /**
     * Delete a file from cloud storage.
     */
    async deleteFile(fileId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const res = await this.authedFetch(
                `${apiUrl(ENDPOINTS.STORAGE_FILE)}/${fileId}`,
                { method: 'DELETE' }
            );
            if (!res) return { success: false, error: 'Not authenticated' };

            if (res.status === 401) {
                this.handleAuthExpired();
                return { success: false, error: 'Session expired' };
            }

            if (res.ok) return { success: true };

            const body = await this.safeJson(res);
            return { success: false, error: String(body?.error || `Delete failed (${res.status})`) };
        } catch (err: unknown) {
            return { success: false, error: err instanceof Error ? err.message : 'Network error' };
        }
    }

    // ─── Storage Usage ──────────────────────────────────────────

    /**
     * Calculate storage usage from file list + current tier.
     */
    async getStorageUsage(tier: LicenseTier = 'free'): Promise<StorageUsageResult> {
        const { files } = await this.listFiles();
        const usedBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
        const tierInfo = STORAGE_TIERS[tier] || STORAGE_TIERS.free;

        return {
            usedBytes,
            limitBytes: tierInfo.limitBytes,
            fileCount: files.length,
            tierLabel: tierInfo.label,
            percentUsed: tierInfo.limitBytes > 0
                ? Math.round((usedBytes / tierInfo.limitBytes) * 100)
                : 0,
        };
    }

    // ─── Health ─────────────────────────────────────────────────

    /**
     * Check cloud storage health.
     */
    async getHealth(): Promise<HealthResult> {
        try {
            const res = await this.fetchWithTimeout(apiUrl(ENDPOINTS.STORAGE_HEALTH));
            if (!res.ok) return { ok: false };

            const data = await res.json();
            return {
                ok: data.status === 'ok',
                status: data.status,
                nodeId: data.nodeId,
                version: data.version,
                disk: data.disk ? {
                    totalHuman: data.disk.totalHuman,
                    usedHuman: data.disk.usedHuman,
                    availableHuman: data.disk.availableHuman,
                    usedPercent: data.disk.usedPercent,
                } : undefined,
            };
        } catch {
            return { ok: false };
        }
    }

    /**
     * Check gateway health.
     */
    async getGatewayHealth(): Promise<boolean> {
        try {
            const res = await this.fetchWithTimeout(apiUrl(ENDPOINTS.HEALTH));
            if (!res.ok) return false;
            const data = await res.json();
            return data.status === 'ok';
        } catch {
            return false;
        }
    }

    // ─── Retry Queue ────────────────────────────────────────────

    private queueUpload(
        fileUri: string,
        filename: string,
        contentType: string,
        metadata?: Record<string, string>,
    ): void {
        // Prevent duplicates
        if (this.uploadQueue.some(q => q.fileUri === fileUri)) return;

        this.uploadQueue.push({
            fileUri,
            filename,
            contentType,
            metadata,
            addedAt: new Date().toISOString(),
            retries: 0,
        });
    }

    /**
     * Process the retry queue — call when network comes back.
     */
    async processRetryQueue(): Promise<{ succeeded: number; failed: number }> {
        if (!this.jwt || this.uploadQueue.length === 0) {
            return { succeeded: 0, failed: 0 };
        }

        let succeeded = 0;
        let failed = 0;
        const toProcess = [...this.uploadQueue];
        this.uploadQueue = [];

        for (const item of toProcess) {
            const result = await this.uploadFile(
                item.fileUri,
                item.filename,
                item.contentType,
                item.metadata,
            );

            if (result.success) {
                succeeded++;
            } else {
                item.retries++;
                if (item.retries < 5) {
                    this.uploadQueue.push(item);
                }
                failed++;
            }
        }

        return { succeeded, failed };
    }

    getRetryQueueLength(): number {
        return this.uploadQueue.length;
    }

    // ─── Internal Helpers ───────────────────────────────────────

    /**
     * Decode a JWT payload without verification (the server already verified it).
     * Returns null if the token is malformed.
     */
    private decodeJwtPayload(token: string): Record<string, unknown> | null {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;
            const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
            return JSON.parse(payload);
        } catch {
            return null;
        }
    }

    private async persistAuth(token: string, userId: string, email: string, refreshToken?: string): Promise<void> {
        this.jwt = token;
        this.userId = userId;
        this.email = email;
        if (refreshToken !== undefined) {
            this.refreshTokenValue = refreshToken || null;
        }

        // Extract windy_identity_id and tier from JWT payload
        const payload = this.decodeJwtPayload(token);
        this.windyIdentityId = typeof payload?.windy_identity_id === 'string'
            ? payload.windy_identity_id : null;

        // Normalize backend tier (free/pro/ultra/max) to mobile tier
        if (typeof payload?.tier === 'string') {
            const normalizedTier = normalizeBackendTier(payload.tier as string);
            try {
                const { useSettingsStore } = require('@/stores/useSettingsStore');
                useSettingsStore.getState().setTier?.(normalizedTier);
            } catch {
                // Store may not be ready during early init
            }
        }

        await SecureStore.setItemAsync(TOKEN_KEY, token).catch(() => {});
        if (userId) await SecureStore.setItemAsync(USER_ID_KEY, userId).catch(() => {});
        await SecureStore.setItemAsync(USER_EMAIL_KEY, email).catch(() => {});
        if (this.refreshTokenValue) {
            await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, this.refreshTokenValue).catch(() => {});
        }
        if (this.windyIdentityId) {
            await SecureStore.setItemAsync(IDENTITY_ID_KEY, this.windyIdentityId).catch(() => {});
        }

        // Sync identity ID to Zustand store for app-wide access
        try {
            const { useSettingsStore } = require('@/stores/useSettingsStore');
            useSettingsStore.getState().setWindyIdentityId(this.windyIdentityId);
        } catch {
            // Store may not be ready during early init
        }

        // Fetch ecosystem status after auth (non-blocking)
        this.fetchEcosystemStatus();
    }

    /**
     * Fetch ecosystem status and store in Zustand (non-blocking).
     * Called after login, register, and token refresh.
     */
    private async fetchEcosystemStatus(): Promise<void> {
        try {
            const { getEcosystemStatus } = require('./ecosystem-status');
            const status = await getEcosystemStatus();
            if (status) {
                const { useSettingsStore } = require('@/stores/useSettingsStore');
                useSettingsStore.getState().setEcosystemStatus(status);
            }
        } catch {
            // Non-critical — ecosystem status is supplementary
        }
    }

    private handleAuthExpired(): void {
        this.jwt = null;
        this.refreshTokenValue = null;
        SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
        SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => {});
        this.onAuthExpired?.();
    }

    /**
     * Attempt to refresh the JWT using the stored refresh token.
     * Uses a mutex so concurrent 401s only trigger one refresh.
     * Returns true if refresh succeeded and new JWT is stored.
     */
    private async refreshAuth(): Promise<boolean> {
        // If already refreshing, wait for that result
        if (this.isRefreshing) {
            return this.isRefreshing;
        }

        this.isRefreshing = this._doRefresh();
        try {
            return await this.isRefreshing;
        } finally {
            this.isRefreshing = null;
        }
    }

    private async _doRefresh(): Promise<boolean> {
        if (!this.refreshTokenValue) {
            log.warn('refreshAuth', 'No refresh token available');
            return false;
        }

        try {
            const res = await this.fetchWithTimeout(
                apiUrl(ENDPOINTS.AUTH_REFRESH_LIVE),
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken: this.refreshTokenValue }),
                }
            );

            if (!res.ok) {
                log.warn('refreshAuth', `Refresh failed with status ${res.status}`);
                return false;
            }

            const data = await res.json();
            const newToken = data.token || data.accessToken;
            const newRefresh = data.refreshToken;

            if (!newToken) {
                log.warn('refreshAuth', 'No token in refresh response');
                return false;
            }

            // Persist the new tokens
            this.jwt = newToken;
            if (newRefresh) this.refreshTokenValue = newRefresh;
            await SecureStore.setItemAsync(TOKEN_KEY, newToken).catch(() => {});
            if (newRefresh) await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, newRefresh).catch(() => {});

            log.info('refreshAuth', 'Token refreshed successfully');
            return true;
        } catch (err: unknown) {
            log.warn('refreshAuth', 'Refresh error', err instanceof Error ? { message: err.message } : { error: String(err) });
            return false;
        }
    }

    /**
     * Fetch with auth header + 401 handling.
     * On 401: attempts token refresh, retries once, then fires authExpired.
     * Returns null if not authenticated.
     */
    private async authedFetch(
        url: string,
        init?: RequestInit,
    ): Promise<Response | null> {
        if (!this.jwt) {
            this.onAuthExpired?.();
            return null;
        }

        const headers: Record<string, string> = {
            ...init?.headers as Record<string, string>,
            'Authorization': `Bearer ${this.jwt}`,
        };
        if (this.windyIdentityId) {
            headers['X-Windy-Identity-Id'] = this.windyIdentityId;
        }

        const res = await this.fetchWithTimeout(url, {
            ...init,
            headers,
        });

        if (res.status === 401) {
            // Attempt token refresh before giving up
            const refreshed = await this.refreshAuth();
            if (refreshed && this.jwt) {
                // Retry the original request with the new token
                const retryHeaders: Record<string, string> = {
                    ...init?.headers as Record<string, string>,
                    'Authorization': `Bearer ${this.jwt}`,
                };
                if (this.windyIdentityId) {
                    retryHeaders['X-Windy-Identity-Id'] = this.windyIdentityId;
                }
                const retryRes = await this.fetchWithTimeout(url, {
                    ...init,
                    headers: retryHeaders,
                });
                if (retryRes.status === 401) {
                    // Refresh succeeded but still 401 — token is truly invalid
                    this.handleAuthExpired();
                }
                return retryRes;
            }
            // Refresh failed — session is over
            this.handleAuthExpired();
        }

        return res;
    }

    /**
     * Fetch with 30s timeout via AbortController.
     */
    private async fetchWithTimeout(
        url: string,
        init?: RequestInit,
    ): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            return await fetch(url, {
                ...init,
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Safely parse JSON from a response (returns null on failure).
     */
    private async safeJson(res: Response): Promise<Record<string, unknown> | null> {
        try {
            return await res.json();
        } catch {
            return null;
        }
    }
}

export const cloudApi = new CloudApiClient();
