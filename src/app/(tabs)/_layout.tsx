/**
 * Tab Bar Configuration
 * 6 visible tabs: Word, Chat, Fly, Mail, Cloud, More(Settings)
 * Dark theme, lime green active tint, comfortable tap targets
 * Hidden tabs: camera, history, clone-data, ecosystem, market
 */
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { colors, fontSizes } from '@/theme';
import { useChatBadgeStore } from '@/stores/useChatBadgeStore';
import { useSettingsStore } from '@/stores/useSettingsStore';

// Tabs use emoji-as-icon (rendered above the label) so the icon stays
// readable at the larger tap-target sizes Grant asked for after build 16.
const tabIcon = (emoji: string, showProBadge?: boolean) => ({ focused }: { focused: boolean }) => (
  <View style={{ position: 'relative' }}>
    <Text
      style={{
        fontSize: 22,
        lineHeight: 26,
        opacity: focused ? 1 : 0.85,
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {emoji}
    </Text>
    {showProBadge && (
      <View style={{
        position: 'absolute', top: -4, right: -14,
        backgroundColor: colors.accent, borderRadius: 4,
        paddingHorizontal: 3, paddingVertical: 1,
      }}>
        <Text style={{ fontSize: 8, fontWeight: '800', color: colors.background }}>PRO</Text>
      </View>
    )}
  </View>
);

export default function TabLayout() {
  const chatBadge = useChatBadgeStore(s => s.unreadCount);
  const isFree = useSettingsStore(s => s.licenseTier) === 'free';

  return (
    <Tabs
      screenOptions={{
        // Tab bar appearance — heights/sizes bumped after Grant's build 16
        // feedback: "the nav buttons on the bottom are very, very small."
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: Platform.OS === 'ios' ? 96 : 72,
          paddingBottom: Platform.OS === 'ios' ? 30 : 10,
          paddingTop: 10,
        },
        // Each tab flexes to an equal share of the full bar width.
        // React Navigation v7 derives an item's flex from tabBarItemStyle;
        // without this the items size to their content and pack to the
        // left, starving even short labels ("Word"/"Cloud" → "W…"/"Cl…").
        tabBarItemStyle: {
          flex: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginBottom: 0,
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
          tabBarIcon: tabIcon('🌪️'),
          tabBarLabel: 'Word',
          tabBarAccessibilityLabel: 'Word tab — voice to text',
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          headerShown: false,
          tabBarIcon: tabIcon('💬'),
          tabBarLabel: 'Chat',
          tabBarBadge: chatBadge > 0 ? chatBadge : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.accent,
            color: colors.background,
            fontSize: 11,
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
        name="fly"
        options={{
          title: 'Fly',
          headerShown: false,
          tabBarIcon: tabIcon('🪰', isFree),
          tabBarLabel: 'Fly',
          tabBarAccessibilityLabel: isFree ? 'Fly tab — PRO feature' : 'Fly tab — your Windy Fly agent',
        }}
      />
      <Tabs.Screen
        name="mail"
        options={{
          title: 'Mail',
          headerShown: false,
          tabBarIcon: tabIcon('📧'),
          tabBarLabel: 'Mail',
          tabBarAccessibilityLabel: 'Mail tab — Windy Mail inbox',
        }}
      />
      <Tabs.Screen
        name="cloud"
        options={{
          title: 'Cloud',
          headerShown: false,
          tabBarIcon: tabIcon('☁️', isFree),
          tabBarLabel: 'Cloud',
          tabBarAccessibilityLabel: isFree ? 'Cloud tab — PRO feature' : 'Cloud tab — sync and storage',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: tabIcon('⚙️'),
          tabBarLabel: 'More',
          tabBarAccessibilityLabel: 'Settings tab',
        }}
      />

      {/* ── Hidden tabs: routable but removed from the bar. `href: null`
           (Expo Router) drops the tab ENTIRELY — `tabBarButton: () => null`
           only nulls the button content but leaves an empty flex slot in
           React Navigation v7, which was stealing width from the 6 real
           tabs and squishing/truncating their labels. ── */}

      <Tabs.Screen
        name="camera"
        options={{
          title: 'Camera',
          headerShown: false,
          href: null,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          href: null,
        }}
      />
      <Tabs.Screen
        name="clone-data"
        options={{
          title: 'Clone Data',
          headerShown: false,
          href: null,
        }}
      />
      <Tabs.Screen
        name="ecosystem"
        options={{
          title: 'Ecosystem',
          headerShown: false,
          href: null,
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: 'Market',
          headerShown: false,
          href: null,
        }}
      />
    </Tabs>
  );
}
