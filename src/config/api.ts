/**
 * 🧬 Centralized API Configuration
 * All server endpoint URLs in one place.
 * Point API_BASE_URL at localhost for dev, or at production for release.
 */

export const API_BASE_URL = 'https://windypro.thewindstorm.uk';

// ─── Endpoint paths (relative to API_BASE_URL) ────────────────

export const ENDPOINTS = {
    // Auth (live API)
    AUTH_REGISTER: '/api/auth/register',
    AUTH_LOGIN_LIVE: '/api/auth/login',

    // Storage (live API — R2 cloud storage)
    STORAGE_HEALTH: '/api/storage/health',
    STORAGE_UPLOAD: '/api/storage/files/upload',
    STORAGE_LIST: '/api/storage/files',
    /** Use with /:fileId — e.g. `${STORAGE_FILE}/${fileId}` */
    STORAGE_FILE: '/api/storage/files',

    // Auth (legacy v1 — kept for backward compat)
    AUTH_LOGIN: '/api/v1/auth/login',
    AUTH_REFRESH: '/api/v1/auth/refresh',

    // Recordings (legacy v1)
    RECORDINGS_UPLOAD: '/api/v1/recordings/upload',
    RECORDINGS_LIST: '/api/v1/recordings/list',
    RECORDINGS_CHECK: '/api/v1/recordings/check',
    /** Use with /:id — e.g. `${RECORDINGS_BY_ID}/${id}` */
    RECORDINGS_BY_ID: '/api/v1/recordings',

    // Translation
    TRANSLATE_TEXT: '/api/v1/translate/text',
    TRANSLATE_SPEECH: '/api/v1/translate/speech',
    TRANSLATE_LANGUAGES: '/api/v1/translate/languages',

    // Transcription
    TRANSCRIBE: '/api/v1/transcribe',
    WS_TRANSCRIBE: '/ws/transcribe',

    // OCR
    OCR_TRANSLATE: '/api/v1/ocr/translate',

    // License
    LICENSE_ACTIVATE: '/api/v1/license/activate',

    // Stripe
    STRIPE_CHECKOUT: '/api/stripe/checkout',

    // Health
    HEALTH: '/health',

    // Chat Onboarding (K2 — Windy Chat custom registration)
    CHAT_REGISTER: '/api/v1/chat/register',
    CHAT_VERIFY_OTP: '/api/v1/chat/verify',
    CHAT_SET_PROFILE: '/api/v1/chat/profile',
} as const;

/** Windy Chat Matrix homeserver — users never see this URL */
export const CHAT_HOMESERVER = 'https://chat.windypro.com';

// ─── Helper to build full URL ──────────────────────────────────

/**
 * Build a full endpoint URL from a path.
 * @param path - One of the ENDPOINTS values
 * @param baseOverride - Optional base URL override (e.g. from settings)
 */
export function apiUrl(path: string, baseOverride?: string): string {
    return `${(baseOverride || API_BASE_URL).replace(/\/+$/, '')}${path}`;
}

/**
 * Build a WebSocket URL from a path.
 * Converts http(s) to ws(s).
 */
export function wsUrl(path: string, baseOverride?: string): string {
    const base = (baseOverride || API_BASE_URL).replace(/\/+$/, '');
    return `${base.replace(/^http/, 'ws')}${path}`;
}
