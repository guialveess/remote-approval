import type { JSX } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { WebSocketProvider } from '@/context/WebSocketContext';

export default function RootLayout(): JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#080808' }}>
      <WebSocketProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: '#080808' },
            headerTintColor: '#ffffff',
            headerShadowVisible: false,
            contentStyle: { backgroundColor: '#080808' },
            animation: 'default',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="approval/[id]"
            options={{ title: 'Review', headerBackTitle: 'Back' }}
          />
        </Stack>
      </WebSocketProvider>
    </GestureHandlerRootView>
  );
}
