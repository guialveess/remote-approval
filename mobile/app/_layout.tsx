import type { JSX } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { HeroUINativeProvider } from 'heroui-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { WebSocketProvider } from '@/context/WebSocketContext';
import '../global.css';

export default function RootLayout(): JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HeroUINativeProvider>
        <WebSocketProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: '#0a0a0a' },
              headerTintColor: '#ffffff',
              headerShadowVisible: false,
              contentStyle: { backgroundColor: '#0a0a0a' },
              animation: 'default',
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="approval/[id]"
              options={{ title: 'Approval Detail', headerBackTitle: 'Back' }}
            />
          </Stack>
        </WebSocketProvider>
      </HeroUINativeProvider>
    </GestureHandlerRootView>
  );
}
