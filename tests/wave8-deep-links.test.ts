/**
 * Wave 8 — Deep-link routing tests for the Clone + Cloud handlers.
 *
 * Mirrors the simulation strategy in tests/deep-links.test.ts: we
 * re-implement the narrow slice of the _layout.tsx switch we added
 * in Wave 8, so routing behavior can be unit-tested without mounting
 * the whole app router. If the handler in _layout.tsx changes, these
 * tests must be updated in lock-step.
 */

jest.mock('expo-linking', () => ({
    parse: (url: string) => {
        const schemeEnd = url.indexOf('://');
        const scheme = schemeEnd >= 0 ? url.slice(0, schemeEnd) : '';
        const rest = schemeEnd >= 0 ? url.slice(schemeEnd + 3) : url;
        const [pathAndQuery] = rest.split('#');
        const qIdx = pathAndQuery.indexOf('?');
        const path = qIdx >= 0 ? pathAndQuery.slice(0, qIdx) : pathAndQuery;
        const queryParams: Record<string, string> = {};
        if (qIdx >= 0) {
            const qs = pathAndQuery.slice(qIdx + 1);
            qs.split('&').forEach(pair => {
                const [k, v] = pair.split('=');
                if (k) queryParams[decodeURIComponent(k)] = decodeURIComponent(v || '');
            });
        }
        return { scheme, path: path || null, queryParams };
    },
}));

import * as Linking from 'expo-linking';

// Sanitization that mirrors _layout.tsx's sanitizeSessionId.
const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;
function sanitizeSessionId(raw: string): string | null {
    if (!raw || raw.length > 128) return null;
    if (raw.includes('..') || raw.includes('/') || raw.includes('\\')) return null;
    return SAFE_ID_RE.test(raw) ? raw : null;
}

interface Nav {
    pathname: string;
    params?: Record<string, string>;
    triggersBackup?: boolean;
}

function routeWave8(url: string): Nav | null {
    const parsed = Linking.parse(url);
    const scheme = (parsed as any).scheme || url.split('://')[0];

    if (scheme === 'windyclone') {
        if (parsed.path === 'discover' || parsed.path === 'dashboard') {
            return { pathname: '/(tabs)/clone-data' };
        }
        if (parsed.path?.startsWith('studio/')) {
            const raw = parsed.path.replace('studio/', '');
            const id = sanitizeSessionId(raw);
            if (!id) return { pathname: '/(tabs)/clone-data' };
            return { pathname: '/clone-data', params: { studio: id } };
        }
        if (parsed.path?.startsWith('order/')) {
            const raw = parsed.path.replace('order/', '');
            const id = sanitizeSessionId(raw);
            if (!id) return { pathname: '/(tabs)/clone-data' };
            return { pathname: '/(tabs)/clone-data', params: { order: id } };
        }
        return { pathname: '/clone' };
    }

    if (scheme === 'windycloud') {
        if (parsed.path === 'dashboard') return { pathname: '/(tabs)/cloud' };
        if (parsed.path === 'backup') {
            return { pathname: '/(tabs)/cloud', params: { backup: '1' }, triggersBackup: true };
        }
        return { pathname: '/(tabs)/cloud' };
    }

    return null;
}

describe('Wave 8 — windyclone deep links', () => {
    it('windyclone://discover routes to clone-data marketplace tab', () => {
        expect(routeWave8('windyclone://discover')).toEqual({ pathname: '/(tabs)/clone-data' });
    });

    it('windyclone://dashboard routes to the legacy clone-data tab', () => {
        expect(routeWave8('windyclone://dashboard')).toEqual({ pathname: '/(tabs)/clone-data' });
    });

    it('windyclone://order/{id} routes to clone-data with a sanitized order param', () => {
        expect(routeWave8('windyclone://order/ord-abc_123')).toEqual({
            pathname: '/(tabs)/clone-data',
            params: { order: 'ord-abc_123' },
        });
    });

    it('windyclone://order/{id} rejects path traversal and falls back to dashboard', () => {
        expect(routeWave8('windyclone://order/../secrets')).toEqual({ pathname: '/(tabs)/clone-data' });
    });

    it('windyclone://order/{id} rejects overly long ids', () => {
        const long = 'a'.repeat(200);
        expect(routeWave8(`windyclone://order/${long}`)).toEqual({ pathname: '/(tabs)/clone-data' });
    });

    it('windyclone://studio/{id} routes to studio detail with sanitized id', () => {
        expect(routeWave8('windyclone://studio/voice-abc_123')).toEqual({
            pathname: '/clone-data',
            params: { studio: 'voice-abc_123' },
        });
    });

    it('windyclone://studio/{id} rejects path traversal and falls back to marketplace', () => {
        expect(routeWave8('windyclone://studio/../../etc/passwd')).toEqual({ pathname: '/(tabs)/clone-data' });
    });

    it('windyclone://studio/{id} rejects overly long ids', () => {
        const long = 'a'.repeat(200);
        expect(routeWave8(`windyclone://studio/${long}`)).toEqual({ pathname: '/(tabs)/clone-data' });
    });

    it('unknown windyclone sub-path lands on the clone dashboard', () => {
        expect(routeWave8('windyclone://unknown')).toEqual({ pathname: '/clone' });
    });
});

describe('Wave 8 — windycloud deep links', () => {
    it('windycloud://dashboard routes to cloud tab', () => {
        expect(routeWave8('windycloud://dashboard')).toEqual({ pathname: '/(tabs)/cloud' });
    });

    it('windycloud://backup triggers sync and lands on cloud tab', () => {
        const nav = routeWave8('windycloud://backup');
        expect(nav?.pathname).toBe('/(tabs)/cloud');
        expect(nav?.params).toEqual({ backup: '1' });
        expect(nav?.triggersBackup).toBe(true);
    });

    it('unknown windycloud sub-path falls back to cloud tab (no stuck screen)', () => {
        expect(routeWave8('windycloud://somewhere-else')).toEqual({ pathname: '/(tabs)/cloud' });
    });
});
