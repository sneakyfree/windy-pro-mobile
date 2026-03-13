/**
 * 🧬 M1.2.1 — Tab Bar Configuration
 * 3 tabs: Record (home), History, Settings
 * Dark theme, lime green active tint, comfortable tap targets
 */
import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { colors } from '@/theme';

export default function TabLayout() {
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
          fontSize: 18,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Record',
          headerShown: false,
          tabBarIcon: ({ focused }) => null,
          tabBarLabel: '🎤 Rec',
          tabBarAccessibilityLabel: 'Record tab',
        }}
      />
      <Tabs.Screen
        name="camera"
        options={{
          title: 'Camera',
          headerShown: false,
          tabBarIcon: ({ focused }) => null,
          tabBarLabel: '📷 Cam',
          tabBarAccessibilityLabel: 'Camera translate tab',
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ focused }) => null,
          tabBarLabel: '📋 Hist',
          tabBarAccessibilityLabel: 'Recording history tab',
        }}
      />
      <Tabs.Screen
        name="clone-data"
        options={{
          title: 'Clone Data',
          headerShown: false,
          tabBarIcon: ({ focused }) => null,
          tabBarLabel: '🧬 Clone',
          tabBarAccessibilityLabel: 'Voice clone data tab',
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          headerShown: false,
          tabBarIcon: ({ focused }) => null,
          tabBarLabel: '💬 Chat',
          tabBarAccessibilityLabel: 'Chat tab',
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: 'Market',
          headerShown: false,
          tabBarIcon: ({ focused }) => null,
          tabBarLabel: '🛒 Market',
          tabBarAccessibilityLabel: 'Market tab',
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
    </Tabs>
  );
}
