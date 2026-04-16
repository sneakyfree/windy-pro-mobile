/**
 * Normalized parser for Windy-ecosystem deep links.
 *
 * Recognized schemes:
 *   windyword://recording/{id}
 *   windyclone://clone/{id}
 *   windycloud://file/{id}
 *
 * (Legacy windypro://, windychat://, windymail://, windyfly:// paths are kept
 * handled inline in _layout.tsx for backward compatibility — this helper is
 * only for the Wave-3 cross-product contracts.)
 */
import * as Linking from 'expo-linking';

export type WindyProduct = 'word' | 'clone' | 'cloud';

export interface ParsedWindyUrl {
    product: WindyProduct;
    /** Target route within the app, e.g. '/(tabs)' or '/clone-data/abc'. */
    route: string;
    /** Route params, e.g. { id: 'abc' } or { open: 'xyz' }. */
    params: Record<string, string>;
    /** Original URL — kept for logging/debugging. */
    raw: string;
}

const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

function sanitizeId(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const id = raw.trim();
    if (!SAFE_ID_RE.test(id)) return null;
    return id;
}

/**
 * Parse a URL into a Wave-3 deep-link target, or return null if it doesn't
 * match one of the three contracts. Invalid IDs return null (rejecting path
 * traversal and overlong inputs).
 */
export function parseWindyUrl(url: string): ParsedWindyUrl | null {
    try {
        const parsed = Linking.parse(url);
        const scheme = (parsed.scheme || url.split('://')[0] || '').toLowerCase();

        // Linking.parse sometimes puts the first path segment into `hostname`
        // for custom schemes, so combine hostname + path for a single rule.
        const combined = [parsed.hostname, parsed.path].filter(Boolean).join('/');
        const segments = combined.split('/').filter(Boolean);

        if (scheme === 'windyword' && segments[0] === 'recording') {
            const id = sanitizeId(segments[1]);
            if (!id) return null;
            return {
                product: 'word',
                route: '/(tabs)',
                params: { recordingId: id },
                raw: url,
            };
        }

        if (scheme === 'windyclone' && segments[0] === 'clone') {
            const id = sanitizeId(segments[1]);
            if (!id) return null;
            return {
                product: 'clone',
                route: '/clone-data',
                params: { id },
                raw: url,
            };
        }

        if (scheme === 'windycloud' && segments[0] === 'file') {
            const id = sanitizeId(segments[1]);
            if (!id) return null;
            return {
                product: 'cloud',
                route: '/cloud/files',
                params: { open: id },
                raw: url,
            };
        }

        return null;
    } catch {
        return null;
    }
}
