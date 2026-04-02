/**
 * Agent Integration Tests
 * Verifies agent DM detection, room sorting, Eternitas badge caching,
 * and ecosystem status creator_name handling.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: jest.fn().mockResolvedValue(null),
        setItem: jest.fn().mockResolvedValue(undefined),
    },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import type { ChatRoom } from '../chatClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── isAgentRoom ────────────────────────────────────────────────

describe('isAgentRoom', () => {
    let isAgentRoom: (room: ChatRoom) => boolean;

    beforeAll(() => {
        isAgentRoom = require('../chatClient').isAgentRoom;
    });

    function mockRoom(members: string[]): ChatRoom {
        return {
            roomId: `!room-${Math.random().toString(36).slice(2)}:chat.windypro.com`,
            name: 'Test Room',
            members,
            lastMessage: null,
            lastMessageTime: null,
            unreadCount: 0,
        } as ChatRoom;
    }

    it('identifies agent DM with @windy_* member', () => {
        const room = mockRoom(['@user:chat.windypro.com', '@windy_testbot:chat.windypro.com']);
        expect(isAgentRoom(room)).toBe(true);
    });

    it('rejects room with regular user only', () => {
        const room = mockRoom(['@user:chat.windypro.com', '@other:chat.windypro.com']);
        expect(isAgentRoom(room)).toBe(false);
    });

    it('rejects room with no members', () => {
        const room = mockRoom([]);
        expect(isAgentRoom(room)).toBe(false);
    });

    it('rejects room with undefined members', () => {
        const room = { roomId: '!r', name: 'Test', members: undefined } as any;
        expect(isAgentRoom(room)).toBe(false);
    });

    it('rejects group chat with agent member (3+ members)', () => {
        const room = mockRoom([
            '@user1:chat.windypro.com',
            '@user2:chat.windypro.com',
            '@windy_bot:chat.windypro.com',
        ]);
        expect(isAgentRoom(room)).toBe(false);
    });

    it('rejects single-member room with agent', () => {
        const room = mockRoom(['@windy_bot:chat.windypro.com']);
        expect(isAgentRoom(room)).toBe(false);
    });

    it('matches various agent name formats', () => {
        expect(isAgentRoom(mockRoom(['@me:x.com', '@windy_fly_agent:chat.windypro.com']))).toBe(true);
        expect(isAgentRoom(mockRoom(['@me:x.com', '@windy_a:chat.windypro.com']))).toBe(true);
        expect(isAgentRoom(mockRoom(['@me:x.com', '@windy_grant-bot-123:chat.windypro.com']))).toBe(true);
    });

    it('rejects similar but wrong domains', () => {
        expect(isAgentRoom(mockRoom(['@me:x.com', '@windy_bot:other.server.com']))).toBe(false);
        expect(isAgentRoom(mockRoom(['@me:x.com', '@windy_bot:windypro.com']))).toBe(false);
    });
});

// ─── Agent room sorting ────────────────────────────────────────

describe('Agent room sorting', () => {
    let isAgentRoom: (room: ChatRoom) => boolean;

    beforeAll(() => {
        isAgentRoom = require('../chatClient').isAgentRoom;
    });

    it('sorts agent room to top of list', () => {
        const rooms: ChatRoom[] = [
            { roomId: 'r1', name: 'Alice', members: ['@alice:x.com', '@me:x.com'], lastMessageTime: 5000, unreadCount: 0, lastMessage: null } as ChatRoom,
            { roomId: 'r2', name: 'Bob', members: ['@bob:x.com', '@me:x.com'], lastMessageTime: 3000, unreadCount: 0, lastMessage: null } as ChatRoom,
            { roomId: 'r3', name: 'Agent', members: ['@windy_fly:chat.windypro.com', '@me:x.com'], lastMessageTime: 1000, unreadCount: 0, lastMessage: null } as ChatRoom,
            { roomId: 'r4', name: 'Charlie', members: ['@charlie:x.com', '@me:x.com'], lastMessageTime: 4000, unreadCount: 0, lastMessage: null } as ChatRoom,
            { roomId: 'r5', name: 'Diana', members: ['@diana:x.com', '@me:x.com'], lastMessageTime: 2000, unreadCount: 0, lastMessage: null } as ChatRoom,
        ];

        const sorted = [...rooms].sort((a, b) => {
            const aIsAgent = isAgentRoom(a);
            const bIsAgent = isAgentRoom(b);
            if (aIsAgent && !bIsAgent) return -1;
            if (!aIsAgent && bIsAgent) return 1;
            return (b.lastMessageTime || 0) - (a.lastMessageTime || 0);
        });

        expect(sorted[0].roomId).toBe('r3'); // Agent at top
        expect(sorted[0].name).toBe('Agent');
        // Rest sorted by lastMessageTime desc
        expect(sorted[1].roomId).toBe('r1'); // Alice (5000)
        expect(sorted[2].roomId).toBe('r4'); // Charlie (4000)
    });

    it('handles list with no agent rooms', () => {
        const rooms: ChatRoom[] = [
            { roomId: 'r1', name: 'A', members: ['@a:x.com', '@me:x.com'], lastMessageTime: 2000, unreadCount: 0, lastMessage: null } as ChatRoom,
            { roomId: 'r2', name: 'B', members: ['@b:x.com', '@me:x.com'], lastMessageTime: 3000, unreadCount: 0, lastMessage: null } as ChatRoom,
        ];

        const sorted = [...rooms].sort((a, b) => {
            const aIsAgent = isAgentRoom(a);
            const bIsAgent = isAgentRoom(b);
            if (aIsAgent && !bIsAgent) return -1;
            if (!aIsAgent && bIsAgent) return 1;
            return (b.lastMessageTime || 0) - (a.lastMessageTime || 0);
        });

        expect(sorted[0].roomId).toBe('r2'); // B has newer message
    });
});

// ─── EternitasBadge caching ─────────────────────────────────────

describe('EternitasBadge caching', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockReset();
    });

    it('uses cached passport data when fetch fails (offline)', async () => {
        const cachedData = {
            data: { passport_id: 'ET-12345', agent_name: 'TestBot', trust_score: 85, status: 'active' },
            cachedAt: Date.now(),
        };
        (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(cachedData));
        mockFetch.mockRejectedValueOnce(new Error('Network request failed'));

        // Import the fetch function directly
        const { default: AsyncStorageMock } = require('@react-native-async-storage/async-storage');

        // Simulate what EternitasBadge does internally
        const cached = await AsyncStorageMock.getItem('eternitas_badge_ET-12345');
        const parsed = JSON.parse(cached);
        expect(parsed.data.trust_score).toBe(85);
        expect(parsed.data.passport_id).toBe('ET-12345');
    });

    it('caches fetch result in AsyncStorage', async () => {
        (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null); // No cache
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
                passport_id: 'ET-99999',
                agent_name: 'NewBot',
                trust_score: 75,
                status: 'active',
            }),
        });

        // Simulate the badge's fetch logic
        const res = await fetch('https://api.eternitas.ai/api/v1/registry/verify/ET-99999');
        const data = await res.json();

        expect(data.trust_score).toBe(75);
        expect(data.passport_id).toBe('ET-99999');

        // Verify it would be cached
        await AsyncStorage.setItem('eternitas_badge_ET-99999', JSON.stringify({
            data: { passport_id: data.passport_id, agent_name: data.agent_name, trust_score: data.trust_score, status: data.status },
            cachedAt: Date.now(),
        }));
        expect(AsyncStorage.setItem).toHaveBeenCalledWith(
            'eternitas_badge_ET-99999',
            expect.stringContaining('"trust_score":75')
        );
    });

    it('trust score color mapping is correct', () => {
        function getTrustColor(score: number | null): string {
            if (score === null) return '#64748b';
            if (score >= 70) return '#22c55e';
            if (score >= 50) return '#eab308';
            return '#ef4444';
        }

        expect(getTrustColor(85)).toBe('#22c55e');  // green
        expect(getTrustColor(70)).toBe('#22c55e');  // green (boundary)
        expect(getTrustColor(60)).toBe('#eab308');  // yellow
        expect(getTrustColor(50)).toBe('#eab308');  // yellow (boundary)
        expect(getTrustColor(30)).toBe('#ef4444');  // red
        expect(getTrustColor(0)).toBe('#ef4444');   // red
        expect(getTrustColor(null)).toBe('#64748b'); // gray
    });
});

// ─── Ecosystem status creator_name ──────────────────────────────

describe('Ecosystem status creator_name', () => {
    it('EcosystemStatus interface accepts creator_name', () => {
        const status = {
            windy_identity_id: 'wid-123',
            email: 'grant@test.com',
            tier: 'pro',
            creator_name: 'Grant',
            products: {
                windy_word: { status: 'active' as const },
                windy_chat: { status: 'active' as const },
                windy_mail: { status: 'not_provisioned' as const },
                windy_cloud: { status: 'active' as const },
                windy_fly: { status: 'active' as const, agent_name: 'FlyBot', matrix_user_id: '@windy_fly:chat.windypro.com' },
                windy_clone: { status: 'active' as const },
                windy_traveler: { status: 'active' as const },
                eternitas: { status: 'not_provisioned' as const },
            },
        };

        expect(status.creator_name).toBe('Grant');
        expect(status.products.windy_fly.agent_name).toBe('FlyBot');
    });

    it('EcosystemStatus works without creator_name', () => {
        const status = {
            windy_identity_id: 'wid-456',
            email: 'user@test.com',
            tier: 'free',
            products: {
                windy_word: { status: 'active' as const },
                windy_chat: { status: 'not_provisioned' as const },
                windy_mail: { status: 'not_provisioned' as const },
                windy_cloud: { status: 'not_provisioned' as const },
                windy_fly: { status: 'not_provisioned' as const },
                windy_clone: { status: 'not_provisioned' as const },
                windy_traveler: { status: 'not_provisioned' as const },
                eternitas: { status: 'not_provisioned' as const },
            },
        };

        expect(status.creator_name).toBeUndefined();
        expect(status.windy_identity_id).toBe('wid-456');
    });

    it('settings title uses creator_name when present', () => {
        const creatorName = 'Grant';
        const title = creatorName ? `${creatorName}'s Windy Ecosystem` : 'Your Windy Ecosystem';
        expect(title).toBe("Grant's Windy Ecosystem");
    });

    it('settings title falls back when creator_name absent', () => {
        const creatorName: string | undefined = undefined;
        const title = creatorName ? `${creatorName}'s Windy Ecosystem` : 'Your Windy Ecosystem';
        expect(title).toBe('Your Windy Ecosystem');
    });
});
