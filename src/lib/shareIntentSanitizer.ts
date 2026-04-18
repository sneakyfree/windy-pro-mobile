/**
 * Sanitizers for Android SEND-intent (share) params.
 *
 * `sharedText` and `sharedUrl` are completely untrusted — any app on the
 * device can pass arbitrary strings. We forward them to `/(tabs)/mail`
 * which hasn't rendered them yet, but the moment it does (as a link,
 * preview, or WebView embed) an unvalidated value is a
 * `javascript://` / `data:` / `file:` / overlong-URL demo waiting to
 * happen. Validate here and drop anything that doesn't parse as a
 * normal http(s) URL or reasonable text.
 */
import { sanitizeText, INPUT_LIMITS } from '@/utils/validation';

const MAX_URL_LEN = 2048;

/**
 * Return a canonicalised http(s) URL string, or `null` if `raw` is not
 * a well-formed http / https URL under `MAX_URL_LEN` characters.
 */
export function sanitizeSharedUrl(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > MAX_URL_LEN) return null;
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
        return parsed.toString();
    } catch {
        return null;
    }
}

/**
 * Return a cleaned text string, truncated to
 * `INPUT_LIMITS.TRANSLATE_TEXT`, or `null` if the input is empty or
 * non-string.
 */
export function sanitizeSharedText(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const cleaned = sanitizeText(raw).slice(0, INPUT_LIMITS.TRANSLATE_TEXT);
    return cleaned || null;
}
