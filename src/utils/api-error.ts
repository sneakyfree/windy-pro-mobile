/**
 * 🧬 Shared API Error Handler
 * Parses Zod-style server errors and provides user-friendly messages.
 * Used across all service files for consistent error handling.
 */

// ─── Error class ────────────────────────────────────────────────

export interface ApiErrorDetail {
    field: string;
    message: string;
}

export class ApiError extends Error {
    constructor(
        public readonly status: number,
        message: string,
        public readonly details: ApiErrorDetail[] = [],
        public readonly retryable: boolean = false,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

// ─── Parse server response into ApiError ────────────────────────

/**
 * Parse a non-ok Response into an ApiError.
 * Handles the server's Zod-style `{ error, details: [{ field, message }] }` shape.
 */
export async function parseApiError(response: Response): Promise<ApiError> {
    const status = response.status;
    let serverMessage = '';
    let details: ApiErrorDetail[] = [];

    try {
        const body = await response.json();
        serverMessage = body.error || body.message || '';
        if (Array.isArray(body.details)) {
            details = body.details.map((d: any) => ({
                field: d.field || d.path || '',
                message: d.message || '',
            }));
        }
    } catch {
        // Body wasn't JSON — use status text
        serverMessage = response.statusText || `HTTP ${status}`;
    }

    const userMsg = getUserMessage(status, serverMessage, details);
    return new ApiError(status, userMsg, details, isRetryable(status));
}

/**
 * Parse an upload result (from expo-file-system uploadAsync) into an ApiError.
 */
export function parseUploadError(status: number, body: string): ApiError {
    let serverMessage = '';
    let details: ApiErrorDetail[] = [];

    try {
        const parsed = JSON.parse(body);
        serverMessage = parsed.error || parsed.message || '';
        if (Array.isArray(parsed.details)) {
            details = parsed.details.map((d: any) => ({
                field: d.field || d.path || '',
                message: d.message || '',
            }));
        }
    } catch {
        serverMessage = body.slice(0, 200);
    }

    const userMsg = getUserMessage(status, serverMessage, details);
    return new ApiError(status, userMsg, details, isRetryable(status));
}

// ─── Status helpers ─────────────────────────────────────────────

/**
 * Whether a request with this status code is worth retrying.
 */
export function isRetryable(status: number): boolean {
    return status === 429 || status === 502 || status === 503 || status === 0;
}

/**
 * Whether the status indicates an auth problem (token expired/invalid).
 */
export function isAuthError(status: number): boolean {
    return status === 401;
}

/**
 * Whether the status indicates a validation error.
 */
export function isValidationError(status: number): boolean {
    return status === 400;
}

/**
 * Whether the status indicates rate limiting.
 */
export function isRateLimited(status: number): boolean {
    return status === 429;
}

// ─── Retry delay ────────────────────────────────────────────────

/**
 * Compute retry delay with exponential backoff.
 * Respects Retry-After header if present.
 * @returns delay in milliseconds
 */
export function getRetryDelay(
    status: number,
    retryCount: number,
    retryAfterHeader?: string | null,
): number {
    // Respect Retry-After if server sends it (429)
    if (retryAfterHeader) {
        const seconds = parseInt(retryAfterHeader, 10);
        if (!isNaN(seconds) && seconds > 0) {
            return seconds * 1000;
        }
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, capped at 30s
    const base = 1000;
    return Math.min(base * Math.pow(2, retryCount), 30_000);
}

// ─── User-friendly messages ─────────────────────────────────────

/**
 * Map HTTP status to a user-friendly message.
 */
export function getUserMessage(
    status: number,
    serverMessage?: string,
    details?: ApiErrorDetail[],
): string {
    switch (status) {
        case 400: {
            if (details && details.length > 0) {
                const fieldErrors = details.map(d => `${d.field}: ${d.message}`).join(', ');
                return `Invalid request — ${fieldErrors}`;
            }
            return serverMessage
                ? `Invalid request — ${serverMessage}`
                : 'Invalid request — please check your input';
        }
        case 401:
            return 'Session expired — please log in again';
        case 403:
            return 'Access denied — this feature requires a higher tier';
        case 404:
            return serverMessage || 'Resource not found';
        case 429:
            return 'Too many attempts, please try again later';
        case 502:
        case 503:
            return 'Server is down for maintenance, your data is safe locally';
        default:
            if (status >= 500) {
                return 'Server error — please try again in a moment';
            }
            return serverMessage || `Unexpected error (${status})`;
    }
}

/**
 * Message for network-level failures (no response at all).
 */
export function getNetworkErrorMessage(): string {
    return 'No connection — recording saved locally, will sync when online';
}

/**
 * Create an ApiError for a network failure (no HTTP response).
 */
export function createNetworkError(err?: unknown): ApiError {
    const msg = err instanceof Error ? err.message : String(err || '');
    return new ApiError(0, getNetworkErrorMessage(), [], true);
}
