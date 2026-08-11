export const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://localhost:3000';
export const WS_TOKEN = process.env.EXPO_PUBLIC_WS_TOKEN ?? '';
export const WS_URL = SERVER_URL.replace(/^http/, 'ws') + '/ws';

export const COLORS = {
  background: '#0a0a0a',
  card: '#111111',
  cardBorder: '#1a1a1a',
  approve: '#00ff88',
  approveDim: '#00ff8822',
  deny: '#ff4444',
  denyDim: '#ff444422',
  muted: '#555555',
  mutedFg: '#888888',
  foreground: '#ffffff',
  foregroundDim: '#cccccc',
} as const;

export const SOURCE_COLORS: Record<string, string> = {
  'claude-code': '#d97706',
  'copilot-cli': '#6366f1',
  'cursor': '#0ea5e9',
  'default': '#6b7280',
};
