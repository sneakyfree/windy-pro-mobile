/**
 * 🧬 M1.2.1 — Tab Bar Configuration
 * 3 tabs: Record (home), History, Settings
 * Dark theme, lime green active tint, comfortable tap targets
 */
import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { colors } from '@/theme';

// Simple text-based icons (will be replaced with proper icons later)
function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    index: '🎤',
    history: '📋',
    settings: '⚙️',
  };
  return null; // Icons handled by tabBarIcon option text
}

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
          fontSize: 11,
          fontWeight: '500',
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
          tabBarLabel: '🎤 Record',
          tabBarAccessibilityLabel: 'Record tab. Tap to record voice to text.',
        }}
      />
      <Tabs.Screen
        name="camera"
        options={{
          title: 'Camera',
          headerShown: false,
          tabBarIcon: ({ focused }) => null,
          tabBarLabel: '📷 Camera',
          tabBarAccessibilityLabel: 'Camera tab. Translate text using your camera.',
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ focused }) => null,
          tabBarLabel: '📋 History',
          tabBarAccessibilityLabel: 'History tab. View past recordings and translations.',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => null,
          tabBarLabel: '⚙️ Settings',
          tabBarAccessibilityLabel: 'Settings tab. Configure your preferences.',
        }}
      />
    </Tabs>
  );
}
