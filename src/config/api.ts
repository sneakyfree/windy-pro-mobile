/**
 * 🧬 Centralized API Configuration
 * All server endpoint URLs in one place.
 * Point API_BASE_URL at localhost for dev, or at production for release.
 */
let _expoExtra: Record<string, unknown> = {};
try {
    // expo-constants may not be available in test environments
    const Constants = require('expo-constants').default;
    _expoExtra = Constants?.expoConfig?.extra || {};
} catch { /* test environment — no native module */ }

export const API_BASE_URL: string =
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL)
        || (_expoExtra.apiBaseUrl as string)
        || 'https://account.windyword.ai';

// ─── Endpoint paths (relative to API_BASE_URL) ────────────────

export const ENDPOINTS = {
    // Auth is owned by @/services/identityApi via OAuth2 device-code flow
    // against windy-pro account-server. The legacy /api/auth/* + /api/v1/auth/*
    // constants were removed post-Wave 3 when their last caller (the dead
    // storage-cloud.ts) was deleted.

    // Storage (live API — R2 cloud storage)
    STORAGE_HEALTH: '/api/storage/health',
    STORAGE_UPLOAD: '/api/storage/files/upload',
    STORAGE_LIST: '/api/storage/files',
    /** Use with /:fileId — e.g. `${STORAGE_FILE}/${fileId}` */
    STORAGE_FILE: '/api/storage/files',

    // Recordings (live — used by sync-manager for chunked recording upload)
    RECORDINGS_UPLOAD: '/api/v1/recordings/upload',
    RECORDINGS_CHECK: '/api/v1/recordings/check',

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

    // Identity / Ecosystem
    ECOSYSTEM_STATUS: '/api/v1/identity/ecosystem-status',

    // Health
    HEALTH: '/health',

    // Chat Onboarding (K2 — Windy Chat custom registration)
    CHAT_REGISTER: '/api/v1/chat/register',
    CHAT_VERIFY_OTP: '/api/v1/chat/verify',
    CHAT_SET_PROFILE: '/api/v1/chat/profile',
} as const;

/** Windy Chat Matrix homeserver — default, overridable from settings */
export const DEFAULT_CHAT_HOMESERVER = 'https://chat.windychat.ai';

/** Windy Mail webmail URL (external browser flow) */
export const WINDY_MAIL_URL = 'https://mail.windymail.ai';

/** Windy Mail WebView URL — localhost in dev, production in release */
export const WINDY_MAIL_WEBVIEW_URL: string = __DEV__
    ? 'http://localhost:5173'
    : 'https://windymail.ai';

/** Windy Chat WebView URL — localhost in dev, production in release */
export const WINDY_CHAT_WEBVIEW_URL: string = __DEV__
    ? 'http://localhost:3000'
    : 'https://chat.windychat.ai';

/**
 * Get the current chat homeserver URL.
 * Reads from the settings store if available, falls back to default.
 */
export function getChatHomeserver(): string {
    try {
        const { useSettingsStore } = require('@/stores/useSettingsStore');
        return useSettingsStore.getState().chatHomeserver || DEFAULT_CHAT_HOMESERVER;
    } catch {
        return DEFAULT_CHAT_HOMESERVER;
    }
}

/** @deprecated Use getChatHomeserver() for runtime, DEFAULT_CHAT_HOMESERVER for static */
export const CHAT_HOMESERVER = DEFAULT_CHAT_HOMESERVER;

// ─── CDN / External Service URLs ──────────────────────────────

/** HuggingFace CDN for whisper.cpp GGML models (overridable via app.json extra) */
export const WHISPER_MODEL_CDN: string =
    (_expoExtra.whisperModelCdn as string) || 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';

/** Windy CDN for engine binaries, offline packs, and pair catalog */
export const WINDY_CDN_BASE = `${API_BASE_URL}/models`;

/** Windy CDN URL for translation pair catalog JSON */
export const PAIR_CATALOG_URL = `${API_BASE_URL}/api/v1/pairs/catalog.json`;

/** Google Cloud Vision API */
export const GOOGLE_VISION_API = 'https://vision.googleapis.com/v1/images:annotate';

/** Google Cloud Vision API key — loaded from app.json extra config */
export const GOOGLE_VISION_API_KEY: string =
    (_expoExtra.googleVisionApiKey as string) || '';

/** Windy CDN URL for translation pair model binaries */
export const PAIR_CDN_BASE = `${API_BASE_URL}/pairs`;

/** Push token registration path */
export const PUSH_TOKEN_ENDPOINT = '/api/register-push-token';

/** CDN URL for translation pair model binaries (download) */
export const PAIR_DOWNLOAD_URL = (pairId: string) => `${API_BASE_URL}/pairs/${pairId}.bin`;

/** Web URL for pair purchase page */
export const PAIR_PURCHASE_URL = (productId: string) => `${API_BASE_URL}/pairs/${productId}`;

/** Web URL for bundle purchase page */
export const BUNDLE_PURCHASE_URL = (bundleId: string) => `${API_BASE_URL}/bundles/${bundleId}`;

/** Stripe checkout API */
export const CHECKOUT_API_URL = `${API_BASE_URL}/api/v1/payments/create-checkout`;

/** Marco Polo web page */
export const MARCO_POLO_URL = `${API_BASE_URL}/marco-polo`;

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
