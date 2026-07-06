/**
 * 🧬 Chat SSO — bridge from the Windy account (identityApi JWT) to a live
 * Matrix session, mirroring the chat web app's unified-login flow
 * (windy-chat/web/src/lib/auth.ts).
 *
 * One tap "Sign in with Windy" → device-code flow gives us a Windy JWT →
 * POST chat.windychat.ai/api/v1/chat/provision/unified-login provisions
 * (or re-uses) the caller's Matrix account and mints a fresh device
 * session → chatClient connects with those credentials. The user never
 * sees a second login, a homeserver URL, or the word "Matrix".
 *
 * Server contract (windy-chat/services/onboarding/routes/provision.js,
 * POST /unified-login, mounted at /api/v1/chat/provision/unified-login):
 *   auth:  Bearer <Windy JWT> — MUST carry windy_identity_id claim
 *   200 → { matrix_user_id, access_token, device_id, home_server,
 *           display_name, already_existed?, chat_user_id,
 *           matrix: { matrixUserId, accessToken, deviceId, homeServer } | null }
 *   The nested `matrix` object is the canonical client contract; it is
 *   null when the account exists but a fresh session could not be minted.
 */
import { identityApi } from './identityApi';
import { chatClient } from './chatClient';
import { DEFAULT_CHAT_HOMESERVER } from '@/config/api';
import { createLogger } from './logger';

const log = createLogger('ChatSso');

const UNIFIED_LOGIN_URL = `${DEFAULT_CHAT_HOMESERVER}/api/v1/chat/provision/unified-login`;

export interface ChatConnectResult {
    success: boolean;
    /** Set on success */
    matrixUserId?: string;
    displayName?: string;
    /** User-facing error message on failure */
    error?: string;
}

interface UnifiedLoginResponse {
    matrix_user_id?: string;
    access_token?: string | null;
    device_id?: string | null;
    home_server?: string;
    display_name?: string;
    already_existed?: boolean;
    chat_user_id?: string;
    matrix?: {
        matrixUserId: string;
        accessToken: string;
        deviceId: string;
        homeServer: string;
    } | null;
    error?: string;
}

class ChatSsoService {
    /** Serialize concurrent connect calls (tab focus + boot can race). */
    private connectPromise: Promise<ChatConnectResult> | null = null;

    /**
     * Ensure a live Matrix session for the signed-in Windy account.
     *
     * Order matters: a restored session is preferred over unified-login
     * because every unified-login mints a NEW Matrix device session —
     * reconnecting on every app start would churn devices server-side.
     */
    async ensureChatSession(): Promise<ChatConnectResult> {
        if (chatClient.isLoggedIn()) {
            return { success: true, matrixUserId: chatClient.getUserId() || undefined };
        }

        const restored = await chatClient.restoreSession();
        if (restored && chatClient.isLoggedIn()) {
            return { success: true, matrixUserId: chatClient.getUserId() || undefined };
        }

        return this.connectWithWindyAccount();
    }

    /**
     * Provision/attach the chat account via unified-login and start the
     * Matrix client with the minted credentials.
     */
    async connectWithWindyAccount(): Promise<ChatConnectResult> {
        if (this.connectPromise) return this.connectPromise;
        this.connectPromise = this._connect();
        try {
            return await this.connectPromise;
        } finally {
            this.connectPromise = null;
        }
    }

    private async _connect(): Promise<ChatConnectResult> {
        if (!identityApi.isAuthenticated()) {
            return { success: false, error: 'Sign in with your Windy account first' };
        }

        let res: Response | null;
        try {
            // authedFetch refreshes the JWT on 401 and retries once.
            res = await identityApi.authedFetch(UNIFIED_LOGIN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
        } catch (err) {
            log.warn('unified_login_network', 'unified-login request failed', {
                error: err instanceof Error ? err.message : String(err),
            });
            return { success: false, error: 'Could not reach chat — check your connection' };
        }

        if (!res) {
            return { success: false, error: 'Session expired — please sign in again' };
        }

        let data: UnifiedLoginResponse = {};
        try {
            data = await res.json();
        } catch { /* non-JSON error body */ }

        if (!res.ok) {
            log.warn('unified_login_http', `unified-login HTTP ${res.status}`, { error: data.error });
            if (res.status === 403) {
                // account-server email-verification gate bubbles through here
                return { success: false, error: 'Please verify your email address, then try again' };
            }
            return { success: false, error: data.error || `Chat sign-in failed (${res.status})` };
        }

        // Canonical contract: nested matrix object. Flat fields kept as a
        // fallback for older deploys.
        const matrixUserId = data.matrix?.matrixUserId || data.matrix_user_id;
        const accessToken = data.matrix?.accessToken || data.access_token;
        const deviceId = data.matrix?.deviceId || data.device_id || 'mobile';
        const homeServer = data.matrix?.homeServer || data.home_server;

        if (!matrixUserId || !accessToken) {
            log.warn('unified_login_no_session', 'unified-login returned no usable session', {
                alreadyExisted: data.already_existed,
            });
            return { success: false, error: 'Chat is warming up — please try again in a moment' };
        }

        // home_server comes back as a bare server name ("chat.windychat.ai");
        // the client needs the https base URL.
        const homeserverUrl = homeServer && homeServer.startsWith('http')
            ? homeServer
            : `https://${homeServer || 'chat.windychat.ai'}`;

        const login = await chatClient.loginWithCredentials(
            accessToken,
            matrixUserId,
            deviceId,
            homeserverUrl,
        );
        if (!login.success) {
            return { success: false, error: login.error || 'Could not connect to chat' };
        }

        log.info('chat_connected', 'Chat connected via Windy account', {
            alreadyExisted: !!data.already_existed,
        });
        return {
            success: true,
            matrixUserId,
            displayName: data.display_name,
        };
    }
}

export const chatSso = new ChatSsoService();
