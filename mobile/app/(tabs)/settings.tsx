import type { JSX } from 'react';
import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Switch, ActivityIndicator } from 'react-native';
import { COLORS, SERVER_URL } from '@/constants/config';
import { useWebSocket } from '@/hooks/useWebSocket';

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function ToggleRow({ label, description, value, onValueChange, disabled }: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.toggleDesc}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: COLORS.cardBorder, true: COLORS.approve + '88' }}
        thumbColor={value ? COLORS.approve : COLORS.mutedFg}
      />
    </View>
  );
}

export default function SettingsScreen(): JSX.Element {
  const { isConnected, subscribe } = useWebSocket();
  const [skipMode, setSkipMode] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [isToggling, setIsToggling] = useState(false);

  // Load current skip mode from server
  useEffect(() => {
    fetch(`${SERVER_URL}/approvals/skip`)
      .then((r) => r.json())
      .then((data) => setSkipMode(data.skipMode ?? false))
      .catch(() => {})
      .finally(() => setIsFetching(false));
  }, []);

  // Sync skip mode changes from other clients via WebSocket
  useEffect(() => {
    return subscribe((event) => {
      if (event.type === 'skip:changed') {
        setSkipMode(event.data.skipMode);
      }
    });
  }, [subscribe]);

  async function handleSkipToggle(enabled: boolean) {
    setIsToggling(true);
    try {
      const res = await fetch(`${SERVER_URL}/approvals/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      setSkipMode(data.skipMode);
    } catch {
      // revert on error
      setSkipMode((prev) => !prev);
    } finally {
      setIsToggling(false);
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

      <Text style={styles.sectionLabel}>APPROVAL GATE</Text>
      <Card>
        {isFetching ? (
          <View style={styles.row}>
            <ActivityIndicator color={COLORS.mutedFg} size="small" />
          </View>
        ) : (
          <ToggleRow
            label="Skip all approvals"
            description="Master switch — auto-approves every action from every session. Use the Sessions tab to skip per machine."
            value={skipMode}
            onValueChange={handleSkipToggle}
            disabled={isToggling}
          />
        )}
      </Card>
      {skipMode && (
        <Text style={styles.skipWarning}>
          All agent actions are being auto-approved. Disable when done.
        </Text>
      )}

      <Text style={styles.sectionLabel}>CONNECTION</Text>
      <Card>
        <Row label="Server" value={SERVER_URL} />
        <View style={styles.divider} />
        <Row label="WebSocket" value={isConnected ? '● Connected' : '○ Disconnected'} />
      </Card>

      <Text style={styles.sectionLabel}>ABOUT</Text>
      <Card>
        <Row label="App" value="Remote Approval" />
        <View style={styles.divider} />
        <Row label="Deep link" value="remoteapproval://" />
        <View style={styles.divider} />
        <Row label="Version" value="1.0.0" />
      </Card>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.mutedFg,
    letterSpacing: 1.2, marginBottom: 8, marginTop: 20, marginLeft: 4,
  },
  card: {
    backgroundColor: COLORS.card, borderColor: COLORS.cardBorder,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  rowLabel: { fontSize: 14, color: COLORS.foreground, fontWeight: '500' },
  rowValue: { fontSize: 13, color: COLORS.mutedFg, maxWidth: '55%', textAlign: 'right' },
  divider: { height: 1, backgroundColor: COLORS.cardBorder },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  toggleText: { flex: 1, paddingRight: 12 },
  toggleDesc: { fontSize: 12, color: COLORS.mutedFg, marginTop: 2, lineHeight: 16 },
  skipWarning: {
    fontSize: 12, color: COLORS.deny, marginTop: 8, marginLeft: 4,
    lineHeight: 17,
  },
});
