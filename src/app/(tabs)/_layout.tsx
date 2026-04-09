/**
 * Tab Bar Configuration
 * 5 visible tabs: Word, Chat, Mail, Cloud, Settings
 * Dark theme, lime green active tint, comfortable tap targets
 * Hidden tabs: camera, history, clone-data, ecosystem, market
 */
import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { colors, fontSizes } from '@/theme';
import { useChatBadgeStore } from '@/stores/useChatBadgeStore';

export default function TabLayout() {
  const chatBadge = useChatBadgeStore(s => s.unreadCount);

  return (
    <Tabs
      screenOptions={{
        // Tab bar appearance
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },

        // Header appearance
        headerStyle: {
          backgroundColor: colors.background,
          shadowColor: 'transparent',
          elevation: 0,
        },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: {
          fontWeight: '600',
          fontSize: fontSizes.lg,
        },
      }}
    >
      {/* ── Visible tabs: Word, Chat, Mail, Cloud, Settings ── */}

      <Tabs.Screen
        name="index"
        options={{
          title: 'Word',
          headerShown: false,
          tabBarIcon: ({ focused }) => null,
          tabBarLabel: '🌪️ Word',
          tabBarAccessibilityLabel: 'Word tab — voice to text',
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          headerShown: false,
          tabBarIcon: ({ focused }) => null,
          tabBarLabel: '💬 Chat',
          tabBarBadge: chatBadge > 0 ? chatBadge : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.accent,
            color: colors.background,
            fontSize: 10,
            fontWeight: '700',
            minWidth: 18,
            height: 18,
            lineHeight: 18,
            borderRadius: 9,
          },
          tabBarAccessibilityLabel: chatBadge > 0
            ? `Chat tab — ${chatBadge} unread messages`
            : 'Chat tab',
        }}
      />
      <Tabs.Screen
        name="mail"
        options={{
          title: 'Mail',
          headerShown: false,
          tabBarIcon: ({ focused }) => null,
          tabBarLabel: '📧 Mail',
          tabBarAccessibilityLabel: 'Mail tab — Windy Mail inbox',
        }}
      />
      <Tabs.Screen
        name="cloud"
        options={{
          title: 'Cloud',
          headerShown: false,
          tabBarIcon: ({ focused }) => null,
          tabBarLabel: '☁️ Cloud',
          tabBarAccessibilityLabel: 'Cloud tab — sync and storage',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => null,
          tabBarLabel: '⚙️ More',
          tabBarAccessibilityLabel: 'Settings tab',
        }}
      />

      {/* ── Hidden tabs (still routable, not shown in tab bar) ── */}

      <Tabs.Screen
        name="camera"
        options={{
          title: 'Camera',
          headerShown: false,
          tabBarButton: () => null,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarButton: () => null,
        }}
      />
      <Tabs.Screen
        name="clone-data"
        options={{
          title: 'Clone Data',
          headerShown: false,
          tabBarButton: () => null,
        }}
      />
      <Tabs.Screen
        name="ecosystem"
        options={{
          title: 'Ecosystem',
          headerShown: false,
          tabBarButton: () => null,
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: 'Market',
          headerShown: false,
          tabBarButton: () => null,
        }}
      />
    </Tabs>
  );
}
