/**
 * Hatch API — client for the Wave 8 agent hatching flow.
 *
 * Calls `POST /api/v1/agent/hatch` on windy-pro account-server. The server
 * streams Server-Sent Events describing each step of the ceremony
 * (passport, chat, mail, trust, done). If the server does not yet publish
 * the SSE endpoint (older deployments), we fall back to the legacy
 * `POST /api/v1/identity/agent/provision` JSON endpoint and synthesize
 * ceremony events so the UI behaves the same way from the caller's POV.
 *
 * The SSE parser is built on XMLHttpRequest so it works reliably on both
 * iOS and Android React Native without a fetch streaming polyfill.
 */
import { API_BASE_URL } from '@/config/api';
import { identityApi } from './identityApi';
import { createLogger } from './logger';
import { fetchWithTimeout } from '@/utils/fetch-timeout';

const log = createLogger('HatchApi');

// ─── Request / event types ──────────────────────────────────────

export interface HatchRequest {
    agent_name: string;
    model_id: 'free' | 'openai' | 'anthropic' | 'other' | string;
    model_api_key?: string;
}

export type HatchStepKey =
    | 'eternitas'
    | 'mail'
    | 'chat'
    | 'cloud'
    | 'phone'
    | 'birth_certificate';

export type HatchStepState = 'pending' | 'in_progress' | 'done' | 'error';

export interface HatchStepEvent {
    kind: 'step';
    step: HatchStepKey;
    state: HatchStepState;
    detail?: string;
}

/** Ordered list of the steps, mirrored by the ceremony UI. */
export const HATCH_STEP_KEYS: readonly HatchStepKey[] = [
    'eternitas', 'mail', 'chat', 'cloud', 'phone', 'birth_certificate',
] as const;

/**
 * Maps the verb half of an SSE `event: <resource>.<verb>` name onto a
 * step state. Server-side emits, e.g. `eternitas.registering` →
 * in_progress, `eternitas.registered` → done.
 */
const STEP_VERB_TO_STATE: Record<string, HatchStepState> = {
    registering: 'in_progress',
    provisioning: 'in_progress',
    assigning: 'in_progress',
    generating: 'in_progress',
    registered: 'done',
    provisioned: 'done',
    assigned: 'done',
    ready: 'done',
};

const KNOWN_STEPS: ReadonlySet<HatchStepKey> = new Set(HATCH_STEP_KEYS);

export interface HatchResultEvent {
    kind: 'result';
    passport_number?: string;
    matrix_user_id?: string;
    dm_room_id?: string;
    trust_score?: number;
    pending?: boolean;
}

export interface HatchErrorEvent {
    kind: 'error';
    message: string;
    recoverable?: boolean;
}

export type HatchEvent = HatchStepEvent | HatchResultEvent | HatchErrorEvent;

export interface HatchStartOptions {
    /** Called for every SSE event — UI drives its ceremony from these. */
    onEvent: (event: HatchEvent) => void;
    /** Abort the in-flight request (used on unmount). */
    signal?: AbortSignal;
}

const HATCH_ENDPOINT = '/api/v1/agent/hatch';
const LEGACY_PROVISION_ENDPOINT = '/api/v1/identity/agent/provision';

/**
 * Start a hatch ceremony. Returns a promise that resolves once the stream
 * closes with a terminal event (result or error). The UI should consume
 * events via `onEvent` to drive the progress animation.
 */
export async function startHatch(
    req: HatchRequest,
    opts: HatchStartOptions,
): Promise<void> {
    // The SSE XHR below bypasses authedFetch, so it gets none of the
    // refresh-on-401 machinery — and access tokens live ~15 min. A raw
    // getToken() here 401'd every hatch attempted >15 min after sign-in
    // (found live 2026-07-17: fresh signup → browse a bit → hatch → 401).
    const token = await identityApi.getFreshToken();
    if (!token) {
        opts.onEvent({ kind: 'error', message: 'Please sign in first to hatch an agent.' });
        return;
    }

    const url = `${API_BASE_URL}${HATCH_ENDPOINT}`;
    const body = JSON.stringify(req);

    try {
        await streamSse(url, token, body, opts);
    } catch (err) {
        // Server hasn't deployed the SSE endpoint yet — fall back to the
        // legacy JSON provision endpoint and synthesize ceremony events.
        if (err instanceof EndpointUnavailableError) {
            log.info('startHatch', 'SSE endpoint unavailable, falling back to legacy provision');
            await legacyProvision(req, token, opts);
            return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        opts.onEvent({ kind: 'error', message: msg || 'Hatching failed' });
    }
}

// ─── SSE streaming over XMLHttpRequest ──────────────────────────

class EndpointUnavailableError extends Error {
    constructor(status: number) { super(`SSE endpoint returned ${status}`); }
}

function streamSse(
    url: string,
    token: string,
    body: string,
    opts: HatchStartOptions,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let lastIndex = 0;
        let buffer = '';
        let sawAnyEvent = false;
        let closed = false;

        const finish = (err?: Error) => {
            if (closed) return;
            closed = true;
            if (err) reject(err); else resolve();
        };

        if (opts.signal) {
            opts.signal.addEventListener('abort', () => { try { xhr.abort(); } catch { /* noop */ } finish(); });
        }

        xhr.open('POST', url);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Accept', 'text/event-stream');
        xhr.setRequestHeader('Cache-Control', 'no-cache');

        xhr.onreadystatechange = () => {
            if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
                // Server doesn't publish the endpoint — fall back.
                if (xhr.status === 404 || xhr.status === 405) {
                    try { xhr.abort(); } catch { /* noop */ }
                    finish(new EndpointUnavailableError(xhr.status));
                    return;
                }
                // Not SSE at all — treat as opaque failure so the legacy
                // fallback can take over.
                const ctype = xhr.getResponseHeader?.('content-type') || '';
                if (xhr.status >= 200 && xhr.status < 300 && !ctype.includes('text/event-stream')) {
                    try { xhr.abort(); } catch { /* noop */ }
                    finish(new EndpointUnavailableError(xhr.status));
                    return;
                }
            }
        };

        xhr.onprogress = () => {
            const chunk = xhr.responseText.slice(lastIndex);
            lastIndex = xhr.responseText.length;
            buffer += chunk;
            // SSE frames are separated by a blank line.
            const frames = buffer.split(/\r?\n\r?\n/);
            buffer = frames.pop() || '';
            for (const frame of frames) {
                const event = parseSseFrame(frame);
                if (!event) continue;
                sawAnyEvent = true;
                try { opts.onEvent(event); } catch (cbErr) { log.warn('onEvent', 'handler threw'); }
                if (event.kind === 'result' || event.kind === 'error') {
                    try { xhr.abort(); } catch { /* noop */ }
                    finish();
                    return;
                }
            }
        };

        xhr.onerror = () => {
            if (!sawAnyEvent) finish(new EndpointUnavailableError(xhr.status || 0));
            else finish(new Error(`network error (status ${xhr.status})`));
        };

        xhr.onabort = () => finish();

        xhr.onload = () => {
            // Final flush — in case the server closed without a trailing blank line.
            if (buffer.trim()) {
                const event = parseSseFrame(buffer);
                if (event) { try { opts.onEvent(event); } catch { /* noop */ } sawAnyEvent = true; }
                buffer = '';
            }
            if (!sawAnyEvent && (xhr.status < 200 || xhr.status >= 300)) {
                finish(new Error(`server returned ${xhr.status}`));
            } else {
                finish();
            }
        };

        try { xhr.send(body); } catch (sendErr) {
            finish(sendErr instanceof Error ? sendErr : new Error('xhr send failed'));
        }
    });
}

/**
 * Parse one SSE frame (a block of `field: value` lines terminated by a
 * blank line). windy-pro emits events with a resource-scoped event
 * name and a JSON data payload, e.g.
 *
 *   event: eternitas.registering
 *   data: {"detail": "..."}
 *
 * Resource prefixes (eternitas, mail, chat, cloud, phone,
 * birth_certificate) map onto HatchStepKey; verb suffixes
 * (registering/provisioning/assigning/generating ↔ registered/
 * provisioned/assigned/ready) map onto HatchStepState. A terminal
 * `hatch.complete` event carries the identity bundle; `error` events
 * carry a user-facing message.
 *
 * Backwards-compat: servers that send `{kind: "step"|"result"|"error"}`
 * directly in the JSON payload (an older shape) are still accepted so
 * the fallback path and dev fixtures keep working.
 */
function parseSseFrame(frame: string): HatchEvent | null {
    const lines = frame.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return null;
    let eventName: string | undefined;
    const dataLines: string[] = [];
    for (const line of lines) {
        if (line.startsWith(':')) continue; // comment / keepalive
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;
        const field = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trimStart();
        if (field === 'event') eventName = value;
        else if (field === 'data') dataLines.push(value);
    }
    const dataStr = dataLines.join('\n');
    let data: any = null;
    if (dataStr) {
        try { data = JSON.parse(dataStr); } catch { /* keep as raw string */ }
    }

    // Terminal success — `hatch.complete { passport_number, matrix_user_id, ... }`
    if (eventName === 'hatch.complete') {
        return { kind: 'result', ...(data && typeof data === 'object' ? data : {}) };
    }

    // Error — `event: error` with either JSON { message } or raw text.
    if (eventName === 'error') {
        const message = (data && typeof data === 'object' && (data.message || data.error))
            || (typeof data === 'string' ? data : null)
            || dataStr
            || 'Hatching failed';
        return { kind: 'error', message: String(message) };
    }

    // Resource.verb step events.
    if (eventName && eventName.includes('.')) {
        const dotIdx = eventName.indexOf('.');
        const resource = eventName.slice(0, dotIdx);
        const verb = eventName.slice(dotIdx + 1);
        if (KNOWN_STEPS.has(resource as HatchStepKey) && verb in STEP_VERB_TO_STATE) {
            return {
                kind: 'step',
                step: resource as HatchStepKey,
                state: STEP_VERB_TO_STATE[verb],
                detail: data && typeof data === 'object' ? data.detail : undefined,
            };
        }
    }

    // Backwards-compat: explicit {kind, ...} payload (legacy / test fixtures).
    if (data && typeof data === 'object' && 'kind' in data) {
        return data as HatchEvent;
    }

    return null;
}

// ─── Legacy JSON fallback ───────────────────────────────────────

/**
 * Backwards-compat: if the server is on the pre-Wave-8 build and doesn't
 * publish the SSE endpoint, talk to the old JSON provision endpoint and
 * manufacture ceremony events so the UI still gets a progressive feel.
 */
async function legacyProvision(
    req: HatchRequest,
    token: string,
    opts: HatchStartOptions,
): Promise<void> {
    const emit = (e: HatchEvent) => { try { opts.onEvent(e); } catch { /* noop */ } };

    emit({ kind: 'step', step: 'eternitas', state: 'in_progress' });

    try {
        const res = await fetchWithTimeout(`${API_BASE_URL}${LEGACY_PROVISION_ENDPOINT}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                agent_name: req.agent_name,
                model_id: req.model_id,
                ...(req.model_api_key ? { model_api_key: req.model_api_key } : {}),
            }),
        });

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            const message = body.error || `Server error (${res.status})`;
            emit({ kind: 'error', message });
            return;
        }

        const data = await res.json();

        // The legacy provision endpoint only covers Eternitas / chat / mail.
        // Cloud, phone, and birth_certificate are added in the Wave-8 SSE
        // flow, so in fallback mode we surface them as pending — the
        // ceremony UI will show them as still-setting-up and the user
        // gets routed through to the "alive" celebration anyway.
        emit({ kind: 'step', step: 'eternitas', state: data.passport_number ? 'done' : (data.pending ? 'pending' : 'error') });
        await delay(500);
        emit({ kind: 'step', step: 'chat', state: data.chat_provisioned ? 'done' : (data.pending ? 'pending' : 'error') });
        await delay(400);
        emit({ kind: 'step', step: 'mail', state: 'done' });

        emit({
            kind: 'result',
            passport_number: data.passport_number,
            matrix_user_id: data.matrix_user_id,
            dm_room_id: data.dm_room_id,
            trust_score: data.trust_score,
            pending: !!data.pending,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        emit({ kind: 'error', message: msg || 'Hatching failed' });
    }
}

function delay(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

// ─── Test hooks ─────────────────────────────────────────────────
// Exposed for Jest so we can exercise SSE parsing without an HTTP server.
export const __test__ = { parseSseFrame, EndpointUnavailableError };
