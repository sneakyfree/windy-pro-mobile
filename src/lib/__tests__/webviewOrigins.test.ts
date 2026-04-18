/**
 * Unit tests for the WebView origin-scoping helpers.
 */

const mockOpenURL = jest.fn().mockResolvedValue(undefined);

jest.mock('react-native', () => ({
    Linking: {
        openURL: (url: string) => mockOpenURL(url),
    },
}));

import { buildOriginWhitelist, buildNavigationGuard } from '../webviewOrigins';

describe('buildOriginWhitelist', () => {
    it('returns the primary origin', () => {
        const list = buildOriginWhitelist('https://chat.windyword.ai');
        expect(list).toContain('https://chat.windyword.ai');
    });

    it('strips paths and queries from the input url', () => {
        const list = buildOriginWhitelist('https://windymail.ai/webmail/message/123?x=1');
        expect(list).toContain('https://windymail.ai');
        expect(list).not.toContain('https://windymail.ai/webmail/message/123?x=1');
    });

    it('returns empty list when the url is malformed', () => {
        // When input is unparseable AND __DEV__ is false, list is empty (everything blocked).
        const originalDev = (global as any).__DEV__;
        (global as any).__DEV__ = false;
        try {
            const list = buildOriginWhitelist('not a url');
            expect(list).toEqual([]);
        } finally {
            (global as any).__DEV__ = originalDev;
        }
    });
});

describe('buildNavigationGuard', () => {
    beforeEach(() => { mockOpenURL.mockClear(); });

    const allowed = ['https://chat.windyword.ai'];
    const guard = buildNavigationGuard(allowed);

    function req(url: string) {
        return {
            url,
            loading: false,
            title: '',
            canGoBack: false,
            canGoForward: false,
            lockIdentifier: 0,
            navigationType: 'click' as const,
            mainDocumentURL: undefined,
        } as any;
    }

    it('allows navigations on the whitelisted origin', () => {
        expect(guard(req('https://chat.windyword.ai/room/123'))).toBe(true);
        expect(mockOpenURL).not.toHaveBeenCalled();
    });

    it('allows non-http(s) schemes (e.g. about:blank, mailto:)', () => {
        expect(guard(req('about:blank'))).toBe(true);
        expect(guard(req('mailto:foo@example.com'))).toBe(true);
        expect(guard(req('blob:https://chat.windyword.ai/abc'))).toBe(true);
        expect(mockOpenURL).not.toHaveBeenCalled();
    });

    it('blocks off-domain navigation and opens the URL in the system browser', () => {
        const result = guard(req('https://evil.example.com/steal?t=' + 'x'.repeat(100)));
        expect(result).toBe(false);
        expect(mockOpenURL).toHaveBeenCalledWith(expect.stringContaining('evil.example.com'));
    });

    it('blocks a protocol-relative escape attempt', () => {
        const result = guard(req('https://chat.windyword.ai.evil.com/'));
        expect(result).toBe(false);
        expect(mockOpenURL).toHaveBeenCalled();
    });

    it('blocks a subdomain that is not exactly whitelisted', () => {
        const result = guard(req('https://evil.chat.windyword.ai/'));
        expect(result).toBe(false);
        expect(mockOpenURL).toHaveBeenCalled();
    });

    it('blocks and externalises malformed URLs', () => {
        const result = guard(req('https://[bad-url'));
        expect(result).toBe(false);
        expect(mockOpenURL).toHaveBeenCalled();
    });
});
