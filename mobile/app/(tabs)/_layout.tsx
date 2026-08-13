import React from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet, View, Text, Pressable, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants/config';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const TAB_CONFIG: Record<string, { icon: string; label: string }> = {
  index:    { icon: 'time',    label: 'Pending'  },
  history:  { icon: 'list',    label: 'History'  },
  sessions: { icon: 'laptop',  label: 'Sessions' },
  settings: { icon: 'settings', label: 'Settings' },
};

function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const { isConnected } = useWebSocket();

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <BlurView intensity={70} tint="dark" style={styles.blur}>
        <View style={styles.inner}>
          {state.routes.map((route, index) => {
            const cfg = TAB_CONFIG[route.name];
            if (!cfg) return null;
            const focused = state.index === index;
            const iconName = (focused ? cfg.icon : `${cfg.icon}-outline`) as any;

            return (
              <Pressable
                key={route.key}
                onPress={() => navigation.navigate(route.name)}
                style={styles.tab}
                android_ripple={{ color: 'rgba(255,255,255,0.08)', borderless: true }}
              >
                <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
                  <Ionicons name={iconName} size={21} color={focused ? '#fff' : COLORS.mutedFg} />
                  {route.name === 'index' && !isConnected && (
                    <View style={styles.offlineDot} />
                  )}
                </View>
                <Text style={[styles.label, focused && styles.labelActive]}>
                  {cfg.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: '#080808' },
        headerTintColor: COLORS.foreground,
        headerShadowVisible: false,
        headerTitleStyle: { fontSize: 17, fontWeight: '600' },
        sceneStyle: { backgroundColor: '#080808' },
      }}
    >
      <Tabs.Screen name="index"    options={{ title: 'Pending'  }} />
      <Tabs.Screen name="history"  options={{ title: 'History'  }} />
      <Tabs.Screen name="sessions" options={{ title: 'Sessions' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 28,
    left: 16,
    right: 16,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  blur: {
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  inner: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 4,
    backgroundColor: 'rgba(14,14,14,0.55)',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  iconWrap: {
    width: 40,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    color: COLORS.mutedFg,
    letterSpacing: 0.1,
  },
  labelActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  offlineDot: {
    position: 'absolute',
    top: 4,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.deny,
    borderWidth: 1,
    borderColor: '#080808',
  },
});
