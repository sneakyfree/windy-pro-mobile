/**
 * Unit tests for mailApi.listInbox.
 *
 * Covers:
 *   - URL construction (default + all query params)
 *   - auth header delegation to identityApi.authedFetch
 *   - success path parsing
 *   - non-ok response error mapping (JSON body + fallback)
 *   - null response from authedFetch (not signed in)
 *   - network error caught by outer try
 *   - malformed success body wrapped in ok:false error
 */

jest.mock('../identityApi', () => ({
    identityApi: {
        authedFetch: jest.fn(),
    },
}));

jest.mock('@/config/api', () => ({
    WINDY_MAIL_URL: 'https://mail.windymail.ai',
}));

import { listInbox, type InboxPage } from '../mailApi';
import { identityApi } from '../identityApi';

const mockAuthedFetch = (identityApi as unknown as {
    authedFetch: jest.Mock;
}).authedFetch;

function makePage(): InboxPage {
    return {
        messages: [
            { id: 'm1', from: 'a@b.c', to: ['u@x.y'], subject: 'hello', date: '2026-04-16T00:00:00Z', preview: 'hi', read: false, size: 123 },
        ],
        total: 1,
        unread: 1,
    };
}

beforeEach(() => { mockAuthedFetch.mockReset(); });

describe('listInbox URL construction', () => {
    it('uses default limit=50 offset=0 and omits unread', async () => {
        mockAuthedFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(makePage()) });
        await listInbox();
        const url = mockAuthedFetch.mock.calls[0][0] as string;
        expect(url).toContain('https://mail.windymail.ai/api/v1/inbox');
        expect(url).toContain('limit=50');
        expect(url).toContain('offset=0');
        expect(url).not.toContain('unread=');
    });

    it('forwards explicit limit + offset + unread', async () => {
        mockAuthedFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(makePage()) });
        await listInbox({ limit: 25, offset: 50, unread: true });
        const url = mockAuthedFetch.mock.calls[0][0] as string;
        expect(url).toContain('limit=25');
        expect(url).toContain('offset=50');
        expect(url).toContain('unread=true');
    });

    it('serialises unread=false explicitly', async () => {
        mockAuthedFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(makePage()) });
        await listInbox({ unread: false });
        const url = mockAuthedFetch.mock.calls[0][0] as string;
        expect(url).toContain('unread=false');
    });
});

describe('listInbox outcomes', () => {
    it('returns ok + page on 200', async () => {
        const page = makePage();
        mockAuthedFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(page) });
        const r = await listInbox();
        expect(r.ok).toBe(true);
        expect(r.page).toEqual(page);
    });

    it('returns ok=false with "Not signed in" when authedFetch returns null', async () => {
        mockAuthedFetch.mockResolvedValue(null);
        const r = await listInbox();
        expect(r.ok).toBe(false);
        expect(r.error).toContain('Not signed in');
    });

    it('maps non-ok JSON error body', async () => {
        mockAuthedFetch.mockResolvedValue({
            ok: false, status: 503,
            json: () => Promise.resolve({ error: 'mail server unreachable' }),
        });
        const r = await listInbox();
        expect(r.ok).toBe(false);
        expect(r.error).toBe('mail server unreachable');
    });

    it('maps non-ok message body when `error` is absent', async () => {
        mockAuthedFetch.mockResolvedValue({
            ok: false, status: 500,
            json: () => Promise.resolve({ message: 'internal' }),
        });
        const r = await listInbox();
        expect(r.error).toBe('internal');
    });

    it('falls back to status-code string when body has neither field', async () => {
        mockAuthedFetch.mockResolvedValue({
            ok: false, status: 418,
            json: () => Promise.resolve({}),
        });
        const r = await listInbox();
        expect(r.error).toBe('Inbox failed (418)');
    });

    it('handles non-ok responses with non-JSON bodies (Cloudflare HTML)', async () => {
        mockAuthedFetch.mockResolvedValue({
            ok: false, status: 502,
            json: () => Promise.reject(new SyntaxError('<html>')),
        });
        const r = await listInbox();
        expect(r.ok).toBe(false);
        expect(r.error).toBe('Inbox failed (502)');
    });

    it('catches malformed success body as network error', async () => {
        mockAuthedFetch.mockResolvedValue({
            ok: true, status: 200,
            json: () => Promise.reject(new SyntaxError('Unexpected token <')),
        });
        const r = await listInbox();
        expect(r.ok).toBe(false);
        expect(r.error).toContain('Unexpected token');
    });

    it('catches thrown network error', async () => {
        mockAuthedFetch.mockRejectedValue(new Error('ETIMEDOUT'));
        const r = await listInbox();
        expect(r.ok).toBe(false);
        expect(r.error).toBe('ETIMEDOUT');
    });
});
