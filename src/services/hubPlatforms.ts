/**
 * 🧬 Hub Mode — platform provenance + connection API.
 *
 * Windy Chat's Hub consolidates external chat networks (Telegram first;
 * Slack/WhatsApp/Discord next) into the normal room list. Server-side,
 * each network runs as a bridge next to the homeserver and every external
 * conversation is just another room — so the client's job is only:
 *   1. classify each room's source platform (badges + solo views), and
 *   2. drive the connect/disconnect flow via the hub service
 *      (chat.windychat.ai/api/v1/hub — see windy-chat services/hub).
 *
 * User-facing copy never says "Matrix" or "bridge" — platforms are
 * "connected", conversations just appear.
 */

import { CHAT_PUSH_BASE_URL } from '@/config/api';

// ─── Provenance ─────────────────────────────────────────────────

export type RoomPlatform =
    | 'native'
    | 'agent'
    | 'telegram'
    | 'slack'
    | 'whatsapp'
    | 'discord';

export const PLATFORM_META: Record<string, { label: string; color: string; emoji: string }> = {
    telegram: { label: 'Telegram', color: '#2AABEE', emoji: '✈️' },
    slack: { label: 'Slack', color: '#E01E5A', emoji: '💼' },
    whatsapp: { label: 'WhatsApp', color: '#25D366', emoji: '🟢' },
    discord: { label: 'Discord', color: '#5865F2', emoji: '🎮' },
};

/** Puppet + bridge-bot MXID prefixes each bridge registers (exclusive
 * namespaces in its appservice registration). Fallback when the room's
 * bridge state event isn't loaded yet. */
const PUPPET_PREFIXES: Array<[RegExp, RoomPlatform]> = [
    [/^@(telegram_|telegrambot:)/, 'telegram'],
    [/^@(slack_|slackbot:)/, 'slack'],
    [/^@(whatsapp_|whatsappbot:)/, 'whatsapp'],
    [/^@(discord_|discordbot:)/, 'discord'],
];

/** Matches windy-chat agent provisioning (agent-provision.js). Duplicated
 * from chatClient to keep this module import-cycle-free. */
const AGENT_PATTERN = /^@(agent_|windy_)[^:]+:chat\.windychat\.ai$/;

/**
 * Pure classifier — pass the room's bridge-protocol id (from its
 * `m.bridge` / `uk.half-shot.bridge` state event, if any) and member ids.
 */
export function classifyRoomPlatform(
    bridgeProtocolId: string | null | undefined,
    memberIds: string[],
): RoomPlatform {
    if (bridgeProtocolId && PLATFORM_META[bridgeProtocolId]) {
        return bridgeProtocolId as RoomPlatform;
    }
    for (const id of memberIds) {
        for (const [pattern, platform] of PUPPET_PREFIXES) {
            if (pattern.test(id)) return platform;
        }
    }
    if (memberIds.some(id => AGENT_PATTERN.test(id))) return 'agent';
    return 'native';
}

/** Extract the bridge protocol id from a matrix-js-sdk Room, if present. */
export function getBridgeProtocolId(room: any): string | null {
    try {
        for (const type of ['m.bridge', 'uk.half-shot.bridge']) {
            const events = room?.currentState?.getStateEvents?.(type) || [];
            for (const ev of events) {
                const id = ev?.getContent?.()?.protocol?.id;
                if (id) return String(id);
            }
        }
    } catch { /* state not loaded yet — fall back to member scan */ }
    return null;
}

// ─── Hub connection API ─────────────────────────────────────────

export interface HubConnection {
    platform: string;
    login_id: string;
    state: string;
    remote_name?: string | null;
}

export interface HubPlatform {
    key: string;
    displayName: string;
    puppetPrefix?: string;
    connections: HubConnection[];
}

export interface LoginStep {
    login_id: string;
    type: 'user_input' | 'cookies' | 'display_and_wait' | 'complete';
    step_id: string;
    instructions?: string;
    user_input?: { fields: Array<{ id: string; name?: string; type?: string; description?: string }> };
    display_and_wait?: { type: string; data: string };
    [k: string]: unknown;
}

export class HubApiError extends Error {
    constructor(message: string, public status: number, public code?: string) {
        super(message);
    }
}

const HUB_BASE = `${CHAT_PUSH_BASE_URL}/api/v1/hub`;

async function getWindyJwt(): Promise<string> {
    const SecureStore = require('expo-secure-store');
    return (await SecureStore.getItemAsync('windy_jwt_token')) || '';
}

async function hubFetch(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<any> {
    const token = await getWindyJwt();
    if (!token) throw new HubApiError('Sign in to Windy first', 401, 'no_token');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), init?.timeoutMs ?? 30_000);
    let res: Response;
    try {
        res = await fetch(`${HUB_BASE}${path}`, {
            ...init,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...(init?.headers || {}),
            },
            signal: controller.signal,
        });
    } catch (err: any) {
        clearTimeout(timer);
        throw new HubApiError(
            err?.name === 'AbortError' ? 'Connection timed out' : 'Could not reach Windy Chat',
            0, 'network',
        );
    }
    clearTimeout(timer);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        throw new HubApiError(
            body?.message || body?.error || `Request failed (${res.status})`,
            res.status,
            body?.error,
        );
    }
    return body;
}

export const hubApi = {
    /** Configured platforms + the caller's connections. */
    async getPlatforms(): Promise<HubPlatform[]> {
        const body = await hubFetch('/platforms');
        return body?.platforms || [];
    },

    /** Available login flows for a platform (e.g. telegram: phone, qr). */
    async getLoginFlows(platform: string): Promise<Array<{ id: string; name: string; description?: string }>> {
        const body = await hubFetch(`/${platform}/provision/v3/login/flows`);
        return body?.flows || [];
    },

    /** Start a login flow; returns the first step. */
    startLogin(platform: string, flowId: string): Promise<LoginStep> {
        return hubFetch(`/${platform}/provision/v3/login/start/${encodeURIComponent(flowId)}`, {
            method: 'POST',
            body: JSON.stringify({}),
        });
    },

    /**
     * Advance a login: for user_input steps pass the field values keyed by
     * field id; for display_and_wait pass {} (long-polls server-side, so
     * give it a generous timeout).
     */
    submitStep(
        platform: string,
        step: Pick<LoginStep, 'login_id' | 'step_id' | 'type'>,
        values: Record<string, string> = {},
    ): Promise<LoginStep> {
        const path = `/${platform}/provision/v3/login/step/`
            + `${encodeURIComponent(step.login_id)}/${encodeURIComponent(step.step_id)}/${encodeURIComponent(step.type)}`;
        return hubFetch(path, {
            method: 'POST',
            body: JSON.stringify(values),
            timeoutMs: step.type === 'display_and_wait' ? 130_000 : 30_000,
        });
    },

    /** Live connection state straight from the platform (syncs the server's
     * connection rows too — surfaces "reconnect needed"). */
    whoami(platform: string): Promise<{ logins?: Array<{ id: string; name?: string; state?: any }> }> {
        return hubFetch(`/${platform}/whoami`);
    },

    /** Disconnect a linked account. */
    logout(platform: string, loginId: string): Promise<unknown> {
        return hubFetch(`/${platform}/provision/v3/logout/${encodeURIComponent(loginId)}`, {
            method: 'POST',
            body: JSON.stringify({}),
        });
    },
};
