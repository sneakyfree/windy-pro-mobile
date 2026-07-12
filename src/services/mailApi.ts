/**
 * Mail API — thin client for Windy Mail's inbox endpoint.
 *
 * Endpoint: GET {WINDY_MAIL_URL}/api/v1/inbox
 *   Query: limit (1..100), offset (>=0), unread (bool, optional)
 *   Auth:  Bearer <account-server JWT>  (verified via JWKS by windy-mail)
 *
 * Authenticated requests go through identityApi.authedFetch so a 401 triggers
 * a transparent refresh + retry.
 */
import { identityApi } from './identityApi';
import { WINDY_MAIL_URL } from '@/config/api';

export interface InboxMessage {
    id: string;
    from: string;
    to: string[];
    subject: string;
    /** ISO 8601 received-at timestamp. */
    date: string;
    preview: string;
    read: boolean;
    size: number;
}

export interface InboxPage {
    messages: InboxMessage[];
    total: number;
    unread: number;
}

export interface ListInboxOptions {
    limit?: number;
    offset?: number;
    unread?: boolean;
}

export interface ListInboxResult {
    ok: boolean;
    page?: InboxPage;
    error?: string;
}

function buildUrl({ limit = 50, offset = 0, unread }: ListInboxOptions): string {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    if (unread !== undefined) params.set('unread', unread ? 'true' : 'false');
    return `${WINDY_MAIL_URL}/api/v1/inbox?${params.toString()}`;
}

export async function listInbox(opts: ListInboxOptions = {}): Promise<ListInboxResult> {
    try {
        const res = await identityApi.authedFetch(buildUrl(opts));
        if (!res) return { ok: false, error: 'Not signed in' };
        if (!res.ok) {
            let msg = `Inbox failed (${res.status})`;
            try {
                const body = await res.json();
                // windy-mail is FastAPI: errors arrive as { detail: {...} } (or a
                // plain detail string). Surface the human message it sends —
                // e.g. JMAP_NOT_CONNECTED's "your emails are being stored…" —
                // instead of a raw status code (stress-final-mobile 2026-07-11).
                const detail = body?.detail;
                msg = (typeof detail === 'string' ? detail : undefined)
                    || (detail?.message as string)
                    || (detail?.error as string)
                    || (body?.error as string)
                    || (body?.message as string)
                    || msg;
            } catch { /* non-JSON */ }
            return { ok: false, error: msg };
        }
        const body = await res.json() as InboxPage;
        return { ok: true, page: body };
    } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
    }
}
