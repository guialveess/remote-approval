import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { WS_URL, WS_TOKEN } from '@/constants/config';
import type { WSEvent } from '@/constants/types';

interface WebSocketContextValue {
  isConnected: boolean;
  lastEvent: WSEvent | null;
  subscribe: (handler: (event: WSEvent) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue>({
  isConnected: false,
  lastEvent: null,
  subscribe: () => () => {},
});

export function useWebSocketContext() {
  return useContext(WebSocketContext);
}

const BACKOFF_INITIAL = 1000;
const BACKOFF_MAX = 30_000;
const BACKOFF_MULTIPLIER = 2;

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WSEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(BACKOFF_INITIAL);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const subscribersRef = useRef<Set<(event: WSEvent) => void>>(new Set());

  const connect = useCallback(() => {
    if (!isMountedRef.current) return;
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    const url = WS_TOKEN ? `${WS_URL}?token=${WS_TOKEN}` : WS_URL;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMountedRef.current) return;
      setIsConnected(true);
      backoffRef.current = BACKOFF_INITIAL;
    };

    ws.onmessage = (event) => {
      if (!isMountedRef.current) return;
      try {
        const parsed = JSON.parse(event.data) as WSEvent;
        setLastEvent(parsed);
        subscribersRef.current.forEach((handler) => handler(parsed));
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror — handle reconnect there
    };

    ws.onclose = () => {
      if (!isMountedRef.current) return;
      setIsConnected(false);
      const delay = Math.min(backoffRef.current, BACKOFF_MAX);
      backoffRef.current = Math.min(backoffRef.current * BACKOFF_MULTIPLIER, BACKOFF_MAX);
      reconnectTimerRef.current = setTimeout(connect, delay);
    };
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    connect();
    return () => {
      isMountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  const subscribe = useCallback((handler: (event: WSEvent) => void) => {
    subscribersRef.current.add(handler);
    return () => {
      subscribersRef.current.delete(handler);
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{ isConnected, lastEvent, subscribe }}>
      {children}
    </WebSocketContext.Provider>
  );
}
