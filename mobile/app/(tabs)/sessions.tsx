import type { JSX } from 'react';
import React, { useEffect, useState, useCallback } from 'react';
import {
  ScrollView, View, Text, StyleSheet,
  Switch, ActivityIndicator, RefreshControl,
} from 'react-native';
import { COLORS, SERVER_URL, SOURCE_COLORS } from '@/constants/config';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { Session } from '@/constants/types';

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function OnlineDot({ online }: { online: boolean }) {
  return (
    <View style={[styles.onlineDot, { backgroundColor: online ? COLORS.approve : COLORS.mutedFg }]} />
  );
}

function SessionCard({ session, onSkipToggle }: {
  session: Session;
  onSkipToggle: (id: string, enabled: boolean) => void;
}) {
  const sourceColor = SOURCE_COLORS[session.source] ?? SOURCE_COLORS['default'];

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.nameRow}>
          <OnlineDot online={session.online} />
          <Text style={styles.sessionName}>{session.name}</Text>
        </View>
        <View style={[styles.sourceBadge, { backgroundColor: `${sourceColor}22`, borderColor: `${sourceColor}44` }]}>
          <Text style={[styles.sourceBadgeText, { color: sourceColor }]}>{session.source}</Text>
        </View>
      </View>

      <Text style={styles.lastSeen}>
        {session.online ? 'Active' : 'Last seen'} · {timeAgo(session.lastSeen)}
      </Text>

      <View style={styles.divider} />

      <View style={styles.skipRow}>
        <View>
          <Text style={styles.skipLabel}>Skip approvals</Text>
          <Text style={styles.skipDesc}>Auto-approve all actions from this session</Text>
        </View>
        <Switch
          value={session.skipMode}
          onValueChange={(v) => onSkipToggle(session.id, v)}
          trackColor={{ false: COLORS.cardBorder, true: COLORS.approve + '88' }}
          thumbColor={session.skipMode ? COLORS.approve : COLORS.mutedFg}
        />
      </View>

      {session.skipMode && (
        <Text style={styles.skipWarning}>Auto-approving all actions from {session.name}</Text>
      )}
    </View>
  );
}

export default function SessionsScreen(): JSX.Element {
  const { subscribe } = useWebSocket();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchSessions() {
    try {
      const res = await fetch(`${SERVER_URL}/sessions`);
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch {
      // keep whatever we have
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchSessions();
  }, []);

  // Real-time session updates via WebSocket
  useEffect(() => {
    return subscribe((event) => {
      if (event.type === 'session:updated') {
        setSessions((prev) => {
          const idx = prev.findIndex((s) => s.id === event.data.id);
          if (idx === -1) return [event.data, ...prev];
          const next = [...prev];
          next[idx] = event.data;
          return next;
        });
      }
    });
  }, [subscribe]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSessions();
  }, []);

  async function handleSkipToggle(id: string, enabled: boolean) {
    // Optimistic update
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, skipMode: enabled } : s))
    );
    try {
      await fetch(`${SERVER_URL}/sessions/${encodeURIComponent(id)}/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
    } catch {
      // revert on error
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, skipMode: !enabled } : s))
      );
    }
  }

  const online = sessions.filter((s) => s.online);
  const offline = sessions.filter((s) => !s.online);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={COLORS.mutedFg}
        />
      }
    >
      {loading ? (
        <ActivityIndicator color={COLORS.mutedFg} style={{ marginTop: 40 }} />
      ) : sessions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No sessions yet</Text>
          <Text style={styles.emptyDesc}>
            Sessions appear here automatically when an adapter (Claude Code or Copilot CLI) makes its first request.
          </Text>
        </View>
      ) : (
        <>
          {online.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>ACTIVE</Text>
              {online.map((s) => (
                <SessionCard key={s.id} session={s} onSkipToggle={handleSkipToggle} />
              ))}
            </>
          )}
          {offline.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>INACTIVE</Text>
              {offline.map((s) => (
                <SessionCard key={s.id} session={s} onSkipToggle={handleSkipToggle} />
              ))}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.mutedFg,
    letterSpacing: 1.2, marginBottom: 8, marginTop: 16, marginLeft: 4,
  },
  card: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sessionName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.foreground,
    flex: 1,
  },
  sourceBadge: {
    borderRadius: 100,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sourceBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  lastSeen: {
    fontSize: 12,
    color: COLORS.mutedFg,
    marginBottom: 12,
    marginLeft: 16,
  },
  divider: { height: 1, backgroundColor: COLORS.cardBorder, marginBottom: 12 },
  skipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skipLabel: {
    fontSize: 14,
    color: COLORS.foreground,
    fontWeight: '500',
  },
  skipDesc: {
    fontSize: 12,
    color: COLORS.mutedFg,
    marginTop: 2,
  },
  skipWarning: {
    fontSize: 12,
    color: COLORS.deny,
    marginTop: 8,
    lineHeight: 17,
  },
  empty: {
    alignItems: 'center',
    marginTop: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.foreground,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 13,
    color: COLORS.mutedFg,
    textAlign: 'center',
    lineHeight: 19,
  },
});
