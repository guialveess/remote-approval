import { useWebSocketContext } from '@/context/WebSocketContext';

/**
 * Lightweight hook that exposes the shared WebSocket state.
 * For subscribing to events, use context's `subscribe` directly.
 */
export function useWebSocket() {
  const { isConnected, lastEvent, subscribe } = useWebSocketContext();
  return { isConnected, lastEvent, subscribe };
}
