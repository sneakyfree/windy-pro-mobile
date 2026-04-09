/**
 * Lightweight store for the Chat tab unread badge count.
 * Updated by the Chat WebView bridge, read by the tab layout.
 */
import { create } from 'zustand';

interface ChatBadgeState {
    unreadCount: number;
    setUnreadCount: (count: number) => void;
}

export const useChatBadgeStore = create<ChatBadgeState>((set) => ({
    unreadCount: 0,
    setUnreadCount: (count) => set({ unreadCount: count }),
}));
