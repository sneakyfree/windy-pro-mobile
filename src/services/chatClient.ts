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
 */
import * as SecureStore from 'expo-secure-store';

// ─── Secure Store Keys ──────────────────────────────────────────
const MATRIX_TOKEN_KEY = 'windy_matrix_token';
const MATRIX_USER_KEY = 'windy_matrix_user';
const MATRIX_SERVER_KEY = 'windy_matrix_server';
const MATRIX_DEVICE_KEY = 'windy_matrix_device';

// ─── Default Homeserver ─────────────────────────────────────────
const DEFAULT_HOMESERVER = 'https://matrix.org';

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
}

export interface ChatContact {
    userId: string;
    displayName: string;
    avatarUrl?: string;
    presence: 'online' | 'offline' | 'unavailable';
    lastActiveAgo?: number;
}

type MessageCallback = (message: ChatMessage) => void;
type TypingCallback = (roomId: string, userIds: string[]) => void;

// ─── Client ─────────────────────────────────────────────────────

class ChatClient {
    private sdk: any = null;
    private client: any = null;
    private session: MatrixSession | null = null;
    private messageListeners = new Set<MessageCallback>();
    private typingListeners = new Set<TypingCallback>();
    private started = false;

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
            console.error('[Chat] Failed to load matrix-js-sdk:', err);
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
    ): Promise<{ success: boolean; userId?: string; error?: string }> {
        try {
            const sdk = await this.loadSdk();
            const tempClient = sdk.createClient({ baseUrl: homeserverUrl });

            const response = await tempClient.login('m.login.password', {
                user: username,
                password,
                initial_device_display_name: 'Windy Pro Mobile',
            });

            this.session = {
                accessToken: response.access_token,
                userId: response.user_id,
                deviceId: response.device_id,
                homeserverUrl,
            };

            await this.persistSession();
            await this.initClient();

            return { success: true, userId: response.user_id };
        } catch (err: any) {
            console.error('[Chat] Login failed:', err);
            return {
                success: false,
                error: err.data?.error || err.message || 'Login failed',
            };
        }
    }

    /**
     * Register a new account on a Matrix homeserver.
     */
    async register(
        username: string,
        password: string,
        homeserverUrl: string = DEFAULT_HOMESERVER,
    ): Promise<{ success: boolean; userId?: string; error?: string }> {
        try {
            const sdk = await this.loadSdk();
            const tempClient = sdk.createClient({ baseUrl: homeserverUrl });

            const response = await tempClient.register(
                username,
                password,
                null, // session ID
                {
                    type: 'm.login.dummy',
                },
                undefined, // bind_email
                undefined, // bind_msisdn
                undefined, // guest_access_token
                undefined  // inhibit_login
            );

            this.session = {
                accessToken: response.access_token,
                userId: response.user_id,
                deviceId: response.device_id,
                homeserverUrl,
            };

            await this.persistSession();
            await this.initClient();

            return { success: true, userId: response.user_id };
        } catch (err: any) {
            console.error('[Chat] Register failed:', err);
            return {
                success: false,
                error: err.data?.error || err.message || 'Registration failed',
            };
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
        } catch {
            return false;
        }
    }

    /**
     * Logout and clear stored session.
     */
    async logout(): Promise<void> {
        try {
            if (this.client) {
                await this.client.logout().catch(() => {});
                this.client.stopClient();
            }
        } catch {}
        this.client = null;
        this.session = null;
        this.started = false;
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

    // ─── Client Initialization ──────────────────────────────────

    private async initClient(): Promise<void> {
        if (!this.session) return;
        const sdk = await this.loadSdk();

        this.client = sdk.createClient({
            baseUrl: this.session.homeserverUrl,
            accessToken: this.session.accessToken,
            userId: this.session.userId,
            deviceId: this.session.deviceId,
        });

        // Listen for messages
        this.client.on('Room.timeline', (event: any, room: any) => {
            if (event.getType() !== 'm.room.message') return;
            const content = event.getContent();
            const msg: ChatMessage = {
                eventId: event.getId(),
                roomId: room.roomId,
                sender: event.getSender(),
                senderName: room.getMember(event.getSender())?.name,
                body: content.body || '',
                timestamp: event.getTs(),
                type: this.mapMsgType(content.msgtype),
                originalLang: content['uk.windypro.lang'],
                isOwn: event.getSender() === this.session?.userId,
            };
            this.messageListeners.forEach(cb => {
                try { cb(msg); } catch (e) { console.warn('[Chat] Listener error:', e); }
            });
        });

        // Listen for typing
        this.client.on('RoomMember.typing', (event: any, member: any) => {
            const roomId = member.roomId;
            const room = this.client.getRoom(roomId);
            if (!room) return;
            const typingMembers = room.currentState?.getMembers()
                ?.filter((m: any) => m.typing && m.userId !== this.session?.userId)
                ?.map((m: any) => m.userId) || [];
            this.typingListeners.forEach(cb => {
                try { cb(roomId, typingMembers); } catch (e) { console.warn('[Chat] Typing listener error:', e); }
            });
        });

        // Start syncing
        if (!this.started) {
            await this.client.startClient({ initialSyncLimit: 20 });
            this.started = true;
        }
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
    async getOrCreateDM(userId: string): Promise<string | null> {
        if (!this.client) return null;

        // Check existing DMs
        const dms = this.getDMs();
        const existing = dms.find(dm => dm.members.includes(userId));
        if (existing) return existing.roomId;

        // Create new DM room
        try {
            const result = await this.client.createRoom({
                is_direct: true,
                invite: [userId],
                preset: 'trusted_private_chat',
            });

            // Mark as direct message
            const directMap = this.client.getAccountData('m.direct')?.getContent() || {};
            if (!directMap[userId]) directMap[userId] = [];
            directMap[userId].push(result.room_id);
            await this.client.setAccountData('m.direct', directMap);

            return result.room_id;
        } catch (err) {
            console.error('[Chat] createDM failed:', err);
            return null;
        }
    }

    // ─── Messages ───────────────────────────────────────────────

    /**
     * Send a text message to a room.
     * Attaches language metadata for translation.
     */
    async sendMessage(
        roomId: string,
        text: string,
        lang?: string,
    ): Promise<boolean> {
        if (!this.client) return false;

        try {
            await this.client.sendEvent(roomId, 'm.room.message', {
                msgtype: 'm.text',
                body: text,
                // Windy-specific metadata for translation
                'uk.windypro.lang': lang || 'en',
            });
            return true;
        } catch (err) {
            console.error('[Chat] sendMessage failed:', err);
            return false;
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
                body: content.body || '',
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
        } catch {}
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
            console.warn('[Chat] setPresence failed:', err);
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
                } catch {}

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
            console.warn('[Chat] searchUsers failed:', err);
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
        await SecureStore.setItemAsync(MATRIX_TOKEN_KEY, this.session.accessToken).catch(() => {});
        await SecureStore.setItemAsync(MATRIX_USER_KEY, this.session.userId).catch(() => {});
        await SecureStore.setItemAsync(MATRIX_SERVER_KEY, this.session.homeserverUrl).catch(() => {});
        await SecureStore.setItemAsync(MATRIX_DEVICE_KEY, this.session.deviceId).catch(() => {});
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
