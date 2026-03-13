/**
 * 🧬 Windy Chat — Matrix Client Wrapper
 * Connects to a Matrix homeserver for real-time messaging.
 * Same protocol as desktop app — messages sync across both.
 *
 * Features:
 *   - Login/register with Matrix homeserver
 *   - Access token in expo-secure-store
 *   - DM room management
 *   - Real-time message events
 *   - Presence (online/offline)
 *   - Contact list with presence status
 *   - Homeserver URL validation
 *   - Message content sanitization
 *   - Offline message queue with auto-retry
 *   - App lifecycle (pause/resume sync)
 *   - E2E encryption foundation (when Olm is available)
 */
import * as SecureStore from 'expo-secure-store';
import { createLogger } from './logger';

const log = createLogger('ChatClient');

// ─── Secure Store Keys ──────────────────────────────────────────
const MATRIX_TOKEN_KEY = 'windy_matrix_token';
const MATRIX_USER_KEY = 'windy_matrix_user';
const MATRIX_SERVER_KEY = 'windy_matrix_server';
const MATRIX_DEVICE_KEY = 'windy_matrix_device';

// ─── Default Homeserver ─────────────────────────────────────────
const DEFAULT_HOMESERVER = 'https://matrix.org';

// ─── Constants ──────────────────────────────────────────────────
const MAX_MESSAGE_LENGTH = 4000;
const MAX_PENDING_MESSAGES = 50;

// ─── Error Codes ────────────────────────────────────────────────

export type ChatErrorCode =
    | 'WRONG_PASSWORD'
    | 'SERVER_UNREACHABLE'
    | 'RATE_LIMITED'
    | 'USER_EXISTS'
    | 'NETWORK_ERROR'
    | 'SDK_UNAVAILABLE'
    | 'INVALID_HOMESERVER'
    | 'UIAA_REQUIRED'
    | 'UNKNOWN';

/** Maps Matrix error codes to our ChatErrorCode */
function classifyMatrixError(err: unknown): { code: ChatErrorCode; message: string } {
    const errObj = err as Record<string, unknown> | undefined;
    const errcode = (errObj as Record<string, Record<string, string>> | undefined)?.data?.errcode;
    const dataErr = (errObj as Record<string, Record<string, string>> | undefined)?.data?.error;

    switch (errcode) {
        case 'M_FORBIDDEN':
            return { code: 'WRONG_PASSWORD', message: 'Incorrect username or password' };
        case 'M_USER_IN_USE':
            return { code: 'USER_EXISTS', message: 'Username is already taken' };
        case 'M_LIMIT_EXCEEDED':
            return { code: 'RATE_LIMITED', message: 'Too many attempts — try again in a minute' };
        case 'M_UNKNOWN_TOKEN':
        case 'M_MISSING_TOKEN':
            return { code: 'WRONG_PASSWORD', message: 'Session expired — please sign in again' };
        default:
            break;
    }

    if (err instanceof TypeError && (err.message?.includes('fetch') || err.message?.includes('Network'))) {
        return { code: 'NETWORK_ERROR', message: 'Network error — check your connection' };
    }

    if (err instanceof Error && err.message?.includes('ECONNREFUSED')) {
        return { code: 'SERVER_UNREACHABLE', message: 'Server unavailable — check the homeserver URL' };
    }

    return {
        code: 'UNKNOWN',
        message: dataErr || (err instanceof Error ? err.message : 'An unexpected error occurred'),
    };
}

// ─── Security Helpers ───────────────────────────────────────────

/**
 * Validate homeserver URL. Must be HTTPS (except localhost for dev).
 * Returns error message or null if valid.
 */
export function validateHomeserverUrl(url: string): string | null {
    const trimmed = url.trim();
    if (!trimmed) return 'Homeserver URL is required';

    try {
        const parsed = new URL(trimmed);
        const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
        if (parsed.protocol !== 'https:' && !isLocalhost) {
            return 'Homeserver must use HTTPS for security';
        }
        if (!parsed.hostname) return 'Invalid URL — no hostname';
        return null;
    } catch {
        return 'Invalid URL format';
    }
}

/**
 * Sanitize message body before sending or displaying.
 * Strips control characters, trims whitespace, enforces max length.
 */
function sanitizeMessageBody(body: string): string {
    if (!body) return '';
    // Strip control chars (keep newlines and tabs)
    const cleaned = body.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    // Collapse excessive newlines (>3 consecutive)
    const collapsed = cleaned.replace(/\n{4,}/g, '\n\n\n');
    // Trim and enforce max length
    return collapsed.trim().slice(0, MAX_MESSAGE_LENGTH);
}

/**
 * Strip sensitive data from error messages before logging.
 */
function sanitizeError(err: unknown): string {
    if (err instanceof Error) {
        // Never log tokens or passwords
        return err.message
            .replace(/access_token["\s:=]+[^\s,}"]*/gi, 'access_token=[REDACTED]')
            .replace(/password["\s:=]+[^\s,}"]*/gi, 'password=[REDACTED]');
    }
    return String(err);
}

// ─── Types ──────────────────────────────────────────────────────

export interface MatrixSession {
    accessToken: string;
    userId: string;
    deviceId: string;
    homeserverUrl: string;
}

export interface ChatRoom {
    roomId: string;
    name: string;
    avatarUrl?: string;
    lastMessage?: string;
    lastMessageTime?: number;
    lastMessageSender?: string;
    unreadCount: number;
    isDirect: boolean;
    members: string[];
}

export interface ChatMessage {
    eventId: string;
    roomId: string;
    sender: string;
    senderName?: string;
    body: string;
    timestamp: number;
    type: 'text' | 'image' | 'file' | 'notice';
    /** Translation metadata attached by sender */
    originalLang?: string;
    /** Whether this message was sent by the local user */
    isOwn: boolean;
    /** Whether this message is still pending (queued offline) */
    pending?: boolean;
}

export interface ChatContact {
    userId: string;
    displayName: string;
    avatarUrl?: string;
    presence: 'online' | 'offline' | 'unavailable';
    lastActiveAgo?: number;
}

interface PendingMessage {
    id: string;
    roomId: string;
    text: string;
    lang: string;
    timestamp: number;
}

export type SyncState = 'syncing' | 'reconnecting' | 'error' | 'stopped';

type MessageCallback = (message: ChatMessage) => void;
type TypingCallback = (roomId: string, userIds: string[]) => void;
type SyncStateCallback = (state: SyncState) => void;

interface AuthResult {
    success: boolean;
    userId?: string;
    error?: string;
    errorCode?: ChatErrorCode;
}

interface SendResult {
    success: boolean;
    error?: string;
    pending?: boolean;
}

// ─── Client ─────────────────────────────────────────────────────

class ChatClient {
    private sdk: any = null;
    private client: any = null;
    private session: MatrixSession | null = null;
    private messageListeners = new Set<MessageCallback>();
    private typingListeners = new Set<TypingCallback>();
    private syncStateListeners = new Set<SyncStateCallback>();
    private started = false;
    private cryptoEnabled = false;

    // Offline message queue
    private pendingMessages: PendingMessage[] = [];
    private currentSyncState: SyncState = 'stopped';

    // RC-AUDIT: Mutex to prevent concurrent initClient calls
    private initPromise: Promise<void> | null = null;

    // ML-1: Screen reference counter — sync stops when no chat screens are mounted
    private activeScreens = 0;

    // ML-2: Stored event handler refs for cleanup
    private timelineHandler: ((...args: any[]) => void) | null = null;
    private typingHandler: ((...args: any[]) => void) | null = null;
    private syncHandler: ((...args: any[]) => void) | null = null;

    // ─── SDK Loading ────────────────────────────────────────────

    /**
     * Load matrix-js-sdk (handles ESM/CJS via require).
     */
    private async loadSdk(): Promise<any> {
        if (this.sdk) return this.sdk;
        try {
            // Use require instead of dynamic import for CJS compat
            this.sdk = require('matrix-js-sdk');
            return this.sdk;
        } catch (err) {
            console.error('[Chat] Failed to load matrix-js-sdk:', sanitizeError(err));
            throw new Error('Chat SDK not available');
        }
    }

    // ─── Auth ───────────────────────────────────────────────────

    /**
     * Login to a Matrix homeserver.
     */
    async login(
        username: string,
        password: string,
        homeserverUrl: string = DEFAULT_HOMESERVER,
    ): Promise<AuthResult> {
        // Validate homeserver URL
        const urlError = validateHomeserverUrl(homeserverUrl);
        if (urlError) {
            return { success: false, error: urlError, errorCode: 'INVALID_HOMESERVER' };
        }

        try {
            const sdk = await this.loadSdk();
            const tempClient = sdk.createClient({ baseUrl: homeserverUrl.trim() });

            const response = await tempClient.login('m.login.password', {
                user: username,
                password,
                initial_device_display_name: 'Windy Pro Mobile',
            });

            this.session = {
                accessToken: response.access_token,
                userId: response.user_id,
                deviceId: response.device_id,
                homeserverUrl: homeserverUrl.trim(),
            };

            await this.persistSession();
            await this.initClient();

            return { success: true, userId: response.user_id };
        } catch (err: unknown) {
            log.warn('Login', 'Login failed', { error: sanitizeError(err) });
            const classified = classifyMatrixError(err);
            return { success: false, error: classified.message, errorCode: classified.code };
        }
    }

    /**
     * Register a new account on a Matrix homeserver.
     */
    async register(
        username: string,
        password: string,
        homeserverUrl: string = DEFAULT_HOMESERVER,
    ): Promise<AuthResult> {
        // Validate homeserver URL
        const urlError = validateHomeserverUrl(homeserverUrl);
        if (urlError) {
            return { success: false, error: urlError, errorCode: 'INVALID_HOMESERVER' };
        }

        try {
            const sdk = await this.loadSdk();
            const tempClient = sdk.createClient({ baseUrl: homeserverUrl.trim() });

            const response = await tempClient.register(
                username,
                password,
                null, // session ID
                { type: 'm.login.dummy' },
                undefined, undefined, undefined, undefined
            );

            this.session = {
                accessToken: response.access_token,
                userId: response.user_id,
                deviceId: response.device_id,
                homeserverUrl: homeserverUrl.trim(),
            };

            await this.persistSession();
            await this.initClient();

            return { success: true, userId: response.user_id };
        } catch (err: unknown) {
            log.warn('Register', 'Register failed', { error: sanitizeError(err) });

            // PC-3: Detect UIAA interactive auth (401 with flows)
            const errObj = err as Record<string, any> | undefined;
            const httpStatus = errObj?.httpStatus ?? errObj?.data?.httpStatus;
            const flows = errObj?.data?.flows;
            if (httpStatus === 401 && Array.isArray(flows)) {
                return {
                    success: false,
                    error: 'This server requires browser verification to register. Please register at the homeserver\'s web interface (e.g. element.io) and then sign in here.',
                    errorCode: 'UIAA_REQUIRED',
                };
            }

            const classified = classifyMatrixError(err);
            return { success: false, error: classified.message, errorCode: classified.code };
        }
    }

    /**
     * Restore session from secure store.
     */
    async restoreSession(): Promise<boolean> {
        try {
            const token = await SecureStore.getItemAsync(MATRIX_TOKEN_KEY);
            const userId = await SecureStore.getItemAsync(MATRIX_USER_KEY);
            const server = await SecureStore.getItemAsync(MATRIX_SERVER_KEY);
            const deviceId = await SecureStore.getItemAsync(MATRIX_DEVICE_KEY);

            if (token && userId && server) {
                this.session = {
                    accessToken: token,
                    userId,
                    deviceId: deviceId || 'unknown',
                    homeserverUrl: server,
                };
                await this.initClient();
                return true;
            }
            return false;
        } catch (err) {
            log.warn('restoreSession', 'restoreSession failed', { error: sanitizeError(err) });
            return false;
        }
    }

    /**
     * Logout and clear stored session.
     */
    async logout(): Promise<void> {
        try {
            if (this.client) {
                // ML-2: Remove stored event handlers before stopping
                this.removeClientListeners();
                await this.client.logout().catch((e: unknown) => {
                    log.warn('logout_API_call', 'logout API call failed', { error: sanitizeError(e) });
                });
                this.client.stopClient();
            }
        } catch (e) {
            log.warn('logout_cleanup', 'logout cleanup error', { error: sanitizeError(e) });
        }
        this.client = null;
        this.session = null;
        this.started = false;
        this.cryptoEnabled = false;
        this.pendingMessages = [];
        this.activeScreens = 0;
        this.setSyncState('stopped');
        await SecureStore.deleteItemAsync(MATRIX_TOKEN_KEY).catch(() => {});
        await SecureStore.deleteItemAsync(MATRIX_USER_KEY).catch(() => {});
        await SecureStore.deleteItemAsync(MATRIX_SERVER_KEY).catch(() => {});
        await SecureStore.deleteItemAsync(MATRIX_DEVICE_KEY).catch(() => {});
    }

    isLoggedIn(): boolean {
        return !!this.session && !!this.client;
    }

    getUserId(): string | null {
        return this.session?.userId || null;
    }

    getHomeserver(): string {
        return this.session?.homeserverUrl || DEFAULT_HOMESERVER;
    }

    getSyncState(): SyncState {
        return this.currentSyncState;
    }

    isCryptoEnabled(): boolean {
        return this.cryptoEnabled;
    }

    // ─── K2: Pre-provisioned Credentials Login ──────────────────

    /**
     * Login with pre-provisioned Matrix credentials from the Windy Chat
     * custom registration API. Unlike login(), this doesn't authenticate
     * against the homeserver — the token is already valid.
     */
    async loginWithCredentials(
        accessToken: string,
        userId: string,
        deviceId: string,
        homeserverUrl: string,
    ): Promise<AuthResult> {
        // SEC-AUDIT: Validate homeserver URL even for pre-provisioned credentials
        const urlError = validateHomeserverUrl(homeserverUrl);
        if (urlError) {
            return { success: false, error: urlError, errorCode: 'INVALID_HOMESERVER' };
        }

        try {
            this.session = { accessToken, userId, deviceId, homeserverUrl: homeserverUrl.trim() };
            await this.persistSession();
            await this.initClient();
            return { success: true, userId };
        } catch (err: unknown) {
            log.warn('loginWithCredentials', 'loginWithCredentials failed', { error: sanitizeError(err) });
            return {
                success: false,
                error: 'Failed to initialize chat connection',
                errorCode: 'UNKNOWN',
            };
        }
    }

    /**
     * Set user's display name on the Matrix homeserver.
     */
    async setDisplayName(name: string): Promise<{ success: boolean; error?: string }> {
        if (!this.client || !this.session) {
            return { success: false, error: 'Not connected to chat' };
        }
        try {
            await this.client.setDisplayName(name.trim());
            return { success: true };
        } catch (err: unknown) {
            log.warn('setDisplayName', 'setDisplayName failed', { error: sanitizeError(err) });
            return { success: false, error: 'Could not update display name' };
        }
    }

    /**
     * Upload and set avatar on the Matrix homeserver.
     */
    async setAvatar(uri: string): Promise<{ success: boolean; error?: string }> {
        if (!this.client || !this.session) {
            return { success: false, error: 'Not connected to chat' };
        }
        try {
            // ERR-AUDIT: Check fetch response before using blob
            const response = await fetch(uri);
            if (!response.ok) {
                return { success: false, error: 'Could not load avatar image' };
            }
            const blob = await response.blob();
            if (!blob.size || blob.size > 10 * 1024 * 1024) {
                return { success: false, error: blob.size ? 'Avatar too large (max 10 MB)' : 'Avatar file is empty' };
            }
            const uploadResult = await this.client.uploadContent(blob, {
                name: 'avatar.jpg',
                type: blob.type || 'image/jpeg',
            });
            // Set the uploaded MXC URI as avatar
            const mxcUri = uploadResult?.content_uri || uploadResult;
            if (mxcUri) {
                await this.client.setAvatarUrl(mxcUri);
            }
            return { success: true };
        } catch (err: unknown) {
            log.warn('setAvatar', 'setAvatar failed', { error: sanitizeError(err) });
            return { success: false, error: 'Could not update avatar' };
        }
    }

    // ─── Client Initialization ──────────────────────────────────

    private async initClient(): Promise<void> {
        // RC-AUDIT: Serialize concurrent init calls with a mutex
        if (this.initPromise) {
            await this.initPromise;
            return;
        }
        if (!this.session) return;
        this.initPromise = this._initClientInner();
        try {
            await this.initPromise;
        } finally {
            this.initPromise = null;
        }
    }

    private async _initClientInner(): Promise<void> {
        if (!this.session) return;
        const sdk = await this.loadSdk();

        this.client = sdk.createClient({
            baseUrl: this.session.homeserverUrl,
            accessToken: this.session.accessToken,
            userId: this.session.userId,
            deviceId: this.session.deviceId,
        });

        // ── Attempt E2E encryption initialization ───────────────
        try {
            if (typeof this.client.initCrypto === 'function') {
                await this.client.initCrypto();
                this.client.setCryptoTrustCrossSignedDevices?.(true);
                this.cryptoEnabled = true;
                log.info('E2E_encryption_enabled', 'E2E encryption enabled');
            }
        } catch (e) {
            log.warn('Crypto_init_not_available_Olm_', 'Crypto init not available (Olm not bundled)', { error: sanitizeError(e) });
            this.cryptoEnabled = false;
        }

        // ML-2: Remove any existing handlers before re-registering
        this.removeClientListeners();

        // PC-1/PC-2: Try SDK enum event names, fall back to deprecated strings
        let timelineEvent: string | any = 'Room.timeline';
        let typingEvent: string | any = 'RoomMember.typing';
        try {
            const { RoomEvent, RoomMemberEvent } = this.sdk;
            if (RoomEvent?.Timeline) timelineEvent = RoomEvent.Timeline;
            if (RoomMemberEvent?.Typing) typingEvent = RoomMemberEvent.Typing;
        } catch { /* SDK may not export enums — use string fallback */ }

        // ── Listen for messages ─────────────────────────────────
        this.timelineHandler = (event: any, room: any) => {
            if (event.getType() !== 'm.room.message') return;
            const content = event.getContent();
            const msg: ChatMessage = {
                eventId: event.getId(),
                roomId: room.roomId,
                sender: event.getSender(),
                senderName: room.getMember(event.getSender())?.name,
                body: sanitizeMessageBody(content.body || ''),
                timestamp: event.getTs(),
                type: this.mapMsgType(content.msgtype),
                originalLang: content['uk.windypro.lang'],
                isOwn: event.getSender() === this.session?.userId,
            };
            this.messageListeners.forEach(cb => {
                try { cb(msg); } catch (e) { console.warn('[Chat] Listener error:', sanitizeError(e)); }
            });
        };
        this.client.on(timelineEvent, this.timelineHandler);

        // ── Listen for typing ───────────────────────────────────
        this.typingHandler = (_event: any, member: any) => {
            const roomId = member.roomId;
            const room = this.client.getRoom(roomId);
            if (!room) return;
            const typingMembers = room.currentState?.getMembers()
                ?.filter((m: any) => m.typing && m.userId !== this.session?.userId)
                ?.map((m: any) => m.userId) || [];
            this.typingListeners.forEach(cb => {
                try { cb(roomId, typingMembers); } catch (e) { console.warn('[Chat] Typing listener error:', sanitizeError(e)); }
            });
        };
        this.client.on(typingEvent, this.typingHandler);

        // ── Listen for sync state changes ───────────────────────
        this.syncHandler = (state: string, _prevState: string, _data: any) => {
            switch (state) {
                case 'SYNCING':
                case 'PREPARED':
                    this.setSyncState('syncing');
                    // Flush pending messages when we reconnect
                    this.flushPendingMessages();
                    break;
                case 'RECONNECTING':
                    this.setSyncState('reconnecting');
                    break;
                case 'ERROR':
                    this.setSyncState('error');
                    break;
                case 'STOPPED':
                    this.setSyncState('stopped');
                    break;
            }
        };
        this.client.on('sync', this.syncHandler);

        // Start syncing
        if (!this.started) {
            await this.client.startClient({ initialSyncLimit: 20 });
            this.started = true;
        }
    }

    // ML-2: Remove stored event handlers from client
    private removeClientListeners(): void {
        if (!this.client) return;
        if (this.timelineHandler) {
            this.client.removeListener?.('Room.timeline', this.timelineHandler);
            // Also try removing from enum-based name
            try {
                const { RoomEvent } = this.sdk;
                if (RoomEvent?.Timeline) this.client.removeListener?.(RoomEvent.Timeline, this.timelineHandler);
            } catch {}
            this.timelineHandler = null;
        }
        if (this.typingHandler) {
            this.client.removeListener?.('RoomMember.typing', this.typingHandler);
            try {
                const { RoomMemberEvent } = this.sdk;
                if (RoomMemberEvent?.Typing) this.client.removeListener?.(RoomMemberEvent.Typing, this.typingHandler);
            } catch {}
            this.typingHandler = null;
        }
        if (this.syncHandler) {
            this.client.removeListener?.('sync', this.syncHandler);
            this.syncHandler = null;
        }
    }

    // ─── Sync Lifecycle ─────────────────────────────────────────

    /**
     * Pause sync (call when app goes to background).
     */
    pauseSync(): void {
        if (this.client && this.started) {
            this.client.stopClient();
            this.started = false;
            this.setSyncState('stopped');
            log.info('Sync_paused_app_backgrounded', 'Sync paused (app backgrounded)');
        }
    }

    /**
     * Resume sync (call when app comes to foreground).
     */
    async resumeSync(): Promise<void> {
        if (this.client && !this.started) {
            try {
                await this.client.startClient({ initialSyncLimit: 10 });
                this.started = true;
                log.info('Sync_resumed_app_foregrounded', 'Sync resumed (app foregrounded)');
            } catch (e) {
                log.warn('Resume_sync', 'Resume sync failed', { error: sanitizeError(e) });
                this.setSyncState('error');
            }
        }
    }

    // ML-1: Screen reference counter — auto-stop sync when no chat screens are active

    /**
     * Increment active screen count. Starts sync if needed.
     */
    incrementActiveScreens(): void {
        this.activeScreens++;
        if (this.activeScreens === 1 && this.client && !this.started) {
            this.resumeSync();
        }
    }

    /**
     * Decrement active screen count. Stops sync when 0 screens are active.
     */
    decrementActiveScreens(): void {
        this.activeScreens = Math.max(0, this.activeScreens - 1);
        if (this.activeScreens <= 0 && this.started) {
            this.pauseSync();
            log.info('All_chat_screens_unmounted__sy', 'All chat screens unmounted — sync stopped');
        }
    }

    private setSyncState(state: SyncState): void {
        if (this.currentSyncState === state) return;
        this.currentSyncState = state;
        this.syncStateListeners.forEach(cb => {
            try { cb(state); } catch (e) { console.warn('[Chat] Sync state listener error:', sanitizeError(e)); }
        });
    }

    /**
     * Subscribe to sync state changes.
     */
    onSyncStateChange(callback: SyncStateCallback): () => void {
        this.syncStateListeners.add(callback);
        return () => { this.syncStateListeners.delete(callback); };
    }

    // ─── Rooms / DMs ────────────────────────────────────────────

    /**
     * Get list of direct message rooms.
     */
    getDMs(): ChatRoom[] {
        if (!this.client) return [];

        const rooms = this.client.getRooms() || [];
        const directRooms = this.getDirectRoomIds();

        return rooms
            .filter((room: any) => directRooms.has(room.roomId) || this.isDirectRoom(room))
            .map((room: any) => this.mapRoom(room))
            .sort((a: ChatRoom, b: ChatRoom) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
    }

    /**
     * Get or create a DM room with a user.
     */
    async getOrCreateDM(userId: string): Promise<{ roomId: string | null; error?: string }> {
        if (!this.client) return { roomId: null, error: 'Not connected to chat' };

        // Check existing DMs
        const dms = this.getDMs();
        const existing = dms.find(dm => dm.members.includes(userId));
        if (existing) return { roomId: existing.roomId };

        // Create new DM room
        try {
            const createOpts: any = {
                is_direct: true,
                invite: [userId],
                preset: 'trusted_private_chat',
            };

            // Enable encryption if crypto is available
            if (this.cryptoEnabled) {
                createOpts.initial_state = [{
                    type: 'm.room.encryption',
                    state_key: '',
                    content: { algorithm: 'm.megolm.v1.aes-sha2' },
                }];
            }

            const result = await this.client.createRoom(createOpts);

            // Mark as direct message
            const directMap = this.client.getAccountData('m.direct')?.getContent() || {};
            if (!directMap[userId]) directMap[userId] = [];
            directMap[userId].push(result.room_id);
            await this.client.setAccountData('m.direct', directMap);

            return { roomId: result.room_id };
        } catch (err) {
            log.warn('createDM', 'createDM failed', { error: sanitizeError(err) });
            const classified = classifyMatrixError(err);
            return { roomId: null, error: classified.message };
        }
    }

    // ─── Messages ───────────────────────────────────────────────

    /**
     * Send a text message to a room.
     * Attaches language metadata for translation.
     * Queues message if offline.
     */
    async sendMessage(
        roomId: string,
        text: string,
        lang?: string,
    ): Promise<SendResult> {
        if (!this.client) return { success: false, error: 'Not connected to chat' };

        const sanitized = sanitizeMessageBody(text);
        if (!sanitized) return { success: false, error: 'Message is empty' };

        try {
            await this.client.sendEvent(roomId, 'm.room.message', {
                msgtype: 'm.text',
                body: sanitized,
                // Windy-specific metadata for translation
                'uk.windypro.lang': lang || 'en',
            });
            return { success: true };
        } catch (err) {
            log.warn('sendMessage', 'sendMessage failed', { error: sanitizeError(err) });

            // Queue for offline retry if it's a network error
            const classified = classifyMatrixError(err);
            if (classified.code === 'NETWORK_ERROR' || this.currentSyncState !== 'syncing') {
                this.queuePendingMessage(roomId, sanitized, lang || 'en');
                return { success: false, pending: true, error: 'Message queued — will send when connected' };
            }

            return { success: false, error: classified.message };
        }
    }

    /**
     * Get pending (queued) messages for a room.
     */
    getPendingMessages(roomId: string): ChatMessage[] {
        return this.pendingMessages
            .filter(m => m.roomId === roomId)
            .map(m => ({
                eventId: `pending-${m.id}`,
                roomId: m.roomId,
                sender: this.session?.userId || '',
                body: m.text,
                timestamp: m.timestamp,
                type: 'text' as const,
                originalLang: m.lang,
                isOwn: true,
                pending: true,
            }));
    }

    private queuePendingMessage(roomId: string, text: string, lang: string): void {
        if (this.pendingMessages.length >= MAX_PENDING_MESSAGES) {
            this.pendingMessages.shift(); // Drop oldest
        }
        this.pendingMessages.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            roomId,
            text,
            lang,
            timestamp: Date.now(),
        });
    }

    private async flushPendingMessages(): Promise<void> {
        if (this.pendingMessages.length === 0) return;
        const toSend = [...this.pendingMessages];
        this.pendingMessages = [];

        for (const msg of toSend) {
            // ERR-AUDIT: Track retry count — drop messages after 5 failed attempts
            const retries = ((msg as any)._retryCount || 0) as number;
            try {
                await this.client?.sendEvent(msg.roomId, 'm.room.message', {
                    msgtype: 'm.text',
                    body: msg.text,
                    'uk.windypro.lang': msg.lang,
                });
                log.info('Flushed_pending_message', 'Flushed pending message', { messageId: msg.id });
            } catch (err) {
                log.warn('Failed_to_flush_pending_messag', 'Failed to flush pending message', { error: sanitizeError(err) });
                if (retries < 5) {
                    (msg as any)._retryCount = retries + 1;
                    this.pendingMessages.push(msg);
                } else {
                    log.warn('Dropping_message_after_5_retri', 'Dropping message after 5 retries', { messageId: msg.id });
                }
            }
        }
    }

    /**
     * Get message history for a room.
     */
    getMessages(roomId: string, limit = 50): ChatMessage[] {
        if (!this.client) return [];

        const room = this.client.getRoom(roomId);
        if (!room) return [];

        const timeline = room.getLiveTimeline();
        const events = timeline.getEvents()
            .filter((e: any) => e.getType() === 'm.room.message')
            .slice(-limit);

        return events.map((event: any) => {
            const content = event.getContent();
            return {
                eventId: event.getId(),
                roomId,
                sender: event.getSender(),
                senderName: room.getMember(event.getSender())?.name,
                body: sanitizeMessageBody(content.body || ''),
                timestamp: event.getTs(),
                type: this.mapMsgType(content.msgtype),
                originalLang: content['uk.windypro.lang'],
                isOwn: event.getSender() === this.session?.userId,
            };
        });
    }

    /**
     * Subscribe to new messages.
     */
    onMessage(callback: MessageCallback): () => void {
        this.messageListeners.add(callback);
        return () => { this.messageListeners.delete(callback); };
    }

    /**
     * Subscribe to typing indicators.
     */
    onTyping(callback: TypingCallback): () => void {
        this.typingListeners.add(callback);
        return () => { this.typingListeners.delete(callback); };
    }

    /**
     * Send typing indicator.
     */
    async sendTyping(roomId: string, isTyping: boolean): Promise<void> {
        if (!this.client) return;
        try {
            await this.client.sendTyping(roomId, isTyping, isTyping ? 20000 : undefined);
        } catch (e) {
            log.warn('sendTyping', 'sendTyping failed', { error: sanitizeError(e) });
        }
    }

    // ─── Presence ───────────────────────────────────────────────

    /**
     * Set own presence (online/offline).
     */
    async setPresence(presence: 'online' | 'offline' | 'unavailable'): Promise<void> {
        if (!this.client) return;
        try {
            await this.client.setPresence({ presence });
        } catch (err) {
            log.warn('setPresence', 'setPresence failed', { error: sanitizeError(err) });
        }
    }

    // ─── Contacts ───────────────────────────────────────────────

    /**
     * Get contacts from joined rooms with presence info.
     */
    getContacts(): ChatContact[] {
        if (!this.client) return [];

        const seenUsers = new Map<string, ChatContact>();
        const rooms = this.client.getRooms() || [];

        for (const room of rooms) {
            const members = room.getJoinedMembers() || [];
            for (const member of members) {
                if (member.userId === this.session?.userId) continue;
                if (seenUsers.has(member.userId)) continue;

                let presence: 'online' | 'offline' | 'unavailable' = 'offline';
                let lastActiveAgo: number | undefined;
                try {
                    const user = this.client.getUser(member.userId);
                    if (user) {
                        presence = (user.presence as any) || 'offline';
                        lastActiveAgo = user.lastActiveAgo;
                    }
                } catch (e) {
                    log.warn('getUser_presence', 'getUser presence failed', { error: sanitizeError(e) });
                }

                seenUsers.set(member.userId, {
                    userId: member.userId,
                    displayName: member.name || member.userId,
                    avatarUrl: member.getAvatarUrl?.(this.session?.homeserverUrl || '', 48, 48, 'crop', false, false) || undefined,
                    presence,
                    lastActiveAgo,
                });
            }
        }

        return Array.from(seenUsers.values())
            .sort((a, b) => {
                // Online users first
                const presOrder = { online: 0, unavailable: 1, offline: 2 };
                return (presOrder[a.presence] || 2) - (presOrder[b.presence] || 2);
            });
    }

    /**
     * Search for users by display name or user ID.
     */
    async searchUsers(term: string): Promise<ChatContact[]> {
        if (!this.client || !term.trim()) return [];

        try {
            const result = await this.client.searchUserDirectory({ term, limit: 20 });
            return (result.results || []).map((u: any) => ({
                userId: u.user_id,
                displayName: u.display_name || u.user_id,
                avatarUrl: u.avatar_url || undefined,
                presence: 'offline' as const,
            }));
        } catch (err) {
            log.warn('searchUsers', 'searchUsers failed', { error: sanitizeError(err) });
            return [];
        }
    }

    // ─── Room Info ───────────────────────────────────────────────

    getRoomName(roomId: string): string {
        if (!this.client) return roomId;
        const room = this.client.getRoom(roomId);
        if (!room) return roomId;

        // For DMs, show the other person's name
        const members = room.getJoinedMembers() || [];
        const other = members.find((m: any) => m.userId !== this.session?.userId);
        return other?.name || room.name || roomId;
    }

    // ─── Helpers ────────────────────────────────────────────────

    private async persistSession(): Promise<void> {
        if (!this.session) return;
        await SecureStore.setItemAsync(MATRIX_TOKEN_KEY, this.session.accessToken).catch((e) => {
            log.warn('persistSession_token', 'persistSession token failed', { error: sanitizeError(e) });
        });
        await SecureStore.setItemAsync(MATRIX_USER_KEY, this.session.userId).catch((e) => {
            log.warn('persistSession_user', 'persistSession user failed', { error: sanitizeError(e) });
        });
        await SecureStore.setItemAsync(MATRIX_SERVER_KEY, this.session.homeserverUrl).catch((e) => {
            log.warn('persistSession_server', 'persistSession server failed', { error: sanitizeError(e) });
        });
        await SecureStore.setItemAsync(MATRIX_DEVICE_KEY, this.session.deviceId).catch((e) => {
            log.warn('persistSession_device', 'persistSession device failed', { error: sanitizeError(e) });
        });
    }

    private getDirectRoomIds(): Set<string> {
        if (!this.client) return new Set();
        const directMap = this.client.getAccountData('m.direct')?.getContent() || {};
        const ids = new Set<string>();
        for (const rooms of Object.values(directMap)) {
            if (Array.isArray(rooms)) {
                for (const id of rooms) ids.add(id as string);
            }
        }
        return ids;
    }

    private isDirectRoom(room: any): boolean {
        const members = room.getJoinedMembers?.() || [];
        return members.length <= 2;
    }

    private mapRoom(room: any): ChatRoom {
        const timeline = room.getLiveTimeline?.();
        const events = timeline?.getEvents?.() || [];
        const lastEvent = events
            .filter((e: any) => e.getType() === 'm.room.message')
            .pop();

        const members = (room.getJoinedMembers?.() || [])
            .map((m: any) => m.userId)
            .filter((id: string) => id !== this.session?.userId);

        const otherMember = room.getJoinedMembers?.()?.find(
            (m: any) => m.userId !== this.session?.userId
        );

        return {
            roomId: room.roomId,
            name: otherMember?.name || room.name || 'Chat',
            avatarUrl: otherMember?.getAvatarUrl?.(this.session?.homeserverUrl || '', 48, 48, 'crop', false, false) || undefined,
            lastMessage: lastEvent?.getContent()?.body,
            lastMessageTime: lastEvent?.getTs(),
            lastMessageSender: lastEvent?.getSender(),
            unreadCount: room.getUnreadNotificationCount?.('total') || 0,
            isDirect: true,
            members,
        };
    }

    private mapMsgType(msgtype: string): 'text' | 'image' | 'file' | 'notice' {
        switch (msgtype) {
            case 'm.image': return 'image';
            case 'm.file': return 'file';
            case 'm.notice': return 'notice';
            default: return 'text';
        }
    }
}

export const chatClient = new ChatClient();
