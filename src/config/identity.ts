import { API_BASE_URL } from './api';

let _expoExtra: Record<string, unknown> = {};
try {
    const Constants = require('expo-constants').default;
    _expoExtra = Constants?.expoConfig?.extra || {};
} catch { /* test environment — no native module */ }

export const ACCOUNT_SERVER_URL: string = API_BASE_URL;

/**
 * Eternitas trust API base URL (no /api/v1 suffix — trustApi.ts adds it).
 * Dev default: http://localhost:8200 (the local Eternitas service).
 * Prod default: https://api.eternitas.ai.
 * Override via EXPO_PUBLIC_ETERNITAS_URL or app.json `extra.eternitasUrl`.
 */
export const ETERNITAS_URL: string =
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_ETERNITAS_URL)
        || (_expoExtra.eternitasUrl as string)
        || (typeof __DEV__ !== 'undefined' && __DEV__
            ? 'http://localhost:8200'
            : 'https://api.eternitas.ai');

export const OAUTH_CLIENT_ID = 'windy_pro_mobile';

export const OAUTH_SCOPES = 'openid profile email windy_pro:* windy_mail:read';

export const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';
export const REFRESH_GRANT_TYPE = 'refresh_token';

export const OAUTH_ENDPOINTS = {
    DEVICE: '/api/v1/oauth/device',
    TOKEN: '/api/v1/oauth/token',
} as const;

export const DEFAULT_POLL_INTERVAL_MS = 5_000;
export const DEFAULT_DEVICE_CODE_TTL_MS = 900_000;
export const IDENTITY_REQUEST_TIMEOUT_MS = 30_000;
