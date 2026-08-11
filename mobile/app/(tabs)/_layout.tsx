import React from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants/config';
import { useWebSocket } from '@/hooks/useWebSocket';

function ConnectionDot() {
  const { isConnected } = useWebSocket();
  return (
    <View
      style={[
        styles.dot,
        { backgroundColor: isConnected ? COLORS.approve : COLORS.deny },
      ]}
    />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: '#0f0f0f',
          borderTopColor: COLORS.cardBorder,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: COLORS.approve,
        tabBarInactiveTintColor: COLORS.mutedFg,
        headerStyle: { backgroundColor: COLORS.background },
        headerTintColor: COLORS.foreground,
        headerShadowVisible: false,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: COLORS.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Pending',
          headerTitle: () => (
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitle}>Pending</Text>
              <ConnectionDot />
            </View>
          ),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.foreground,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
});
