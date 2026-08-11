import type { JSX } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GluestackUIProvider } from '@gluestack-ui/themed';
import { config } from '@gluestack-ui/config';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { WebSocketProvider } from '@/context/WebSocketContext';

export default function RootLayout(): JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GluestackUIProvider config={config} colorMode="dark">
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
      </GluestackUIProvider>
    </GestureHandlerRootView>
  );
}
