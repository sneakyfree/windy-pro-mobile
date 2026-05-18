/**
 * Cloud API — shim delegating auth to identityApi (OAuth2 device-code flow).
 *
 * As of Wave 3, this file is a thin wrapper kept to avoid breaking the ~15
 * call sites that still import `cloudApi`. Auth is owned by
 * `@/services/identityApi`; storage APIs (upload/list/download/delete/health)
 * continue to live here for one release, after which storage moves to
 * `storageApi.ts` and this file is deleted.
 *
 * Preserves the existing public surface:
 *   - getters: getToken, getUserId, getEmail, getWindyIdentityId, isAuthenticated
 *   - lifecycle: restoreSession, logout, setAuthExpiredHandler
 *   - storage: uploadFile, listFiles, downloadFile, deleteFile, getStorageUsage, getHealth
 *   - retry queue: processRetryQueue, getRetryQueueLength
 *
 * Deprecated:
 *   - login(email, password) / register(email, password) now throw
 *     AuthFlowDeprecatedError. Callers must use identityApi.startDeviceFlow()
 *     via the /auth/login → /auth/device-code screens.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { API_BASE_URL, ENDPOINTS, apiUrl } from '@/config/api';
import type { LicenseTier } from '@/types';
import { identityApi } from './identityApi';
import { createLogger } from './logger';

const log = createLogger('CloudApi');

const REQUEST_TIMEOUT_MS = 30_000;

export const STORAGE_TIERS: Record<LicenseTier, { label: string; limitBytes: number }> = {
    free:          { label: 'Free',           limitBytes: 500 * 1024 * 1024 },
    pro:           { label: 'Pro',            limitBytes: 5 * 1024 * 1024 * 1024 },
    translate:     { label: 'Windy Ultra',    limitBytes: 10 * 1024 * 1024 * 1024 },
    translate_pro: { label: 'Windy Max',      limitBytes: 25 * 1024 * 1024 * 1024 },
};

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

interface QueuedUpload {
    fileUri: string;
    filename: string;
    contentType: string;
    metadata?: Record<string, string>;
    addedAt: string;
    retries: number;
}

export class AuthFlowDeprecatedError extends Error {
    constructor(method: string) {
        super(`cloudApi.${method}() is deprecated — use identityApi.startDeviceFlow() via /auth/login`);
        this.name = 'AuthFlowDeprecatedError';
    }
}

class CloudApiClient {
    private uploadQueue: QueuedUpload[] = [];

    // ─── Auth: deprecated password flow ─────────────────────────

    async register(_email: string, _password: string): Promise<AuthResult> {
        throw new AuthFlowDeprecatedError('register');
    }

    async login(_email: string, _password: string): Promise<AuthResult> {
        throw new AuthFlowDeprecatedError('login');
    }

    // ─── Auth: delegated to identityApi ─────────────────────────

    async restoreSession(): Promise<boolean> {
        return identityApi.restoreSession();
    }

    async logout(): Promise<void> {
        return identityApi.logout();
    }

    isAuthenticated(): boolean { return identityApi.isAuthenticated(); }
    getToken(): string | null { return identityApi.getToken(); }
    getUserId(): string | null { return identityApi.getUserId(); }
    getEmail(): string | null { return identityApi.getEmail(); }
    getWindyIdentityId(): string | null { return identityApi.getWindyIdentityId(); }

    setAuthExpiredHandler(handler: () => void): void {
        identityApi.setAuthExpiredHandler(handler);
    }

    // ─── Storage: Upload ────────────────────────────────────────

    async uploadFile(
        fileUri: string,
        filename: string,
        contentType: string = 'application/octet-stream',
        metadata?: Record<string, string>,
    ): Promise<UploadResult> {
        const token = identityApi.getToken();
        if (!token) return { success: false, error: 'Not authenticated' };

        const uploadUrl = apiUrl(ENDPOINTS.STORAGE_UPLOAD);
        const parameters: Record<string, string> = {};
        if (metadata) parameters['metadata'] = JSON.stringify(metadata);

        try {
            let result = await this.runUpload(uploadUrl, fileUri, contentType, parameters, token);

            if (result.status === 401) {
                const refreshed = await identityApi.refresh();
                const retryToken = identityApi.getToken();
                if (refreshed && retryToken) {
                    result = await this.runUpload(uploadUrl, fileUri, contentType, parameters, retryToken);
                    if (result.status === 401) {
                        return { success: false, error: 'Session expired — please log in again' };
                    }
                } else {
                    return { success: false, error: 'Session expired — please log in again' };
                }
            }

            if (result.status >= 200 && result.status < 300) {
                let fileId: string | undefined;
                try {
                    const body = JSON.parse(result.body);
                    fileId = body.fileId || body.id;
                } catch { /* non-JSON body */ }
                return { success: true, fileId };
            }

            let errorMsg = `Upload failed (${result.status})`;
            try {
                const body = JSON.parse(result.body);
                errorMsg = body.error || body.message || errorMsg;
            } catch { /* non-JSON body */ }
            return { success: false, error: errorMsg };
        } catch (err: unknown) {
            this.queueUpload(fileUri, filename, contentType, metadata);
            return {
                success: false,
                error: (err instanceof Error ? err.message : 'Network error') + ' — queued for retry',
            };
        }
    }

    private async runUpload(
        url: string,
        fileUri: string,
        contentType: string,
        parameters: Record<string, string>,
        token: string,
    ): Promise<FileSystem.FileSystemUploadResult> {
        const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
        const identityId = identityApi.getWindyIdentityId();
        if (identityId) headers['X-Windy-Identity-Id'] = identityId;
        return FileSystem.uploadAsync(url, fileUri, {
            httpMethod: 'POST',
            uploadType: FileSystem.FileSystemUploadType.MULTIPART,
            fieldName: 'file',
            mimeType: contentType,
            headers,
            parameters,
        });
    }

    // ─── Storage: List ──────────────────────────────────────────

    async listFiles(): Promise<{ files: CloudFile[]; error?: string }> {
        try {
            const res = await identityApi.authedFetch(apiUrl(ENDPOINTS.STORAGE_LIST));
            if (!res) return { files: [], error: 'Not authenticated' };
            if (!res.ok) {
                const body = await this.safeJson(res);
                return { files: [], error: String(body?.error || `List failed (${res.status})`) };
            }
            const data = await res.json();
            const files: CloudFile[] = Array.isArray(data) ? data : (data.files || []);
            return { files };
        } catch (err: unknown) {
            return { files: [], error: err instanceof Error ? err.message : 'Network error' };
        }
    }

    // ─── Storage: Download ──────────────────────────────────────

    async downloadFile(fileId: string, destFilename?: string): Promise<string | null> {
        const token = identityApi.getToken();
        if (!token) return null;
        try {
            const url = `${apiUrl(ENDPOINTS.STORAGE_FILE)}/${fileId}`;
            const destDir = (FileSystem.documentDirectory || '') + 'cloud-downloads/';
            await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
            const destPath = destDir + (destFilename || fileId);
            const download = await FileSystem.downloadAsync(url, destPath, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            return download.status >= 200 && download.status < 300 ? destPath : null;
        } catch (err: unknown) {
            log.warn('downloadFile', 'downloadFile failed', err instanceof Error ? { message: err.message } : { error: String(err) });
            return null;
        }
    }

    // ─── Storage: Delete ────────────────────────────────────────

    async deleteFile(fileId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const res = await identityApi.authedFetch(
                `${apiUrl(ENDPOINTS.STORAGE_FILE)}/${fileId}`,
                { method: 'DELETE' },
            );
            if (!res) return { success: false, error: 'Not authenticated' };
            if (res.status === 401) return { success: false, error: 'Session expired' };
            if (res.ok) return { success: true };
            const body = await this.safeJson(res);
            return { success: false, error: String(body?.error || `Delete failed (${res.status})`) };
        } catch (err: unknown) {
            return { success: false, error: err instanceof Error ? err.message : 'Network error' };
        }
    }

    // ─── Storage Usage ──────────────────────────────────────────

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

    async processRetryQueue(): Promise<{ succeeded: number; failed: number }> {
        if (!identityApi.isAuthenticated() || this.uploadQueue.length === 0) {
            return { succeeded: 0, failed: 0 };
        }
        let succeeded = 0;
        let failed = 0;
        const toProcess = [...this.uploadQueue];
        this.uploadQueue = [];
        for (const item of toProcess) {
            const result = await this.uploadFile(item.fileUri, item.filename, item.contentType, item.metadata);
            if (result.success) {
                succeeded++;
            } else {
                item.retries++;
                if (item.retries < 5) this.uploadQueue.push(item);
                failed++;
            }
        }
        return { succeeded, failed };
    }

    getRetryQueueLength(): number { return this.uploadQueue.length; }

    // ─── Internal helpers ───────────────────────────────────────

    private async fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            return await fetch(url, { ...init, signal: controller.signal });
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private async safeJson(res: Response): Promise<Record<string, unknown> | null> {
        try { return await res.json(); } catch { return null; }
    }
}

export const cloudApi = new CloudApiClient();

// Keep API_BASE_URL import alive for callers that peek at it via cloudApi module.
export { API_BASE_URL };
