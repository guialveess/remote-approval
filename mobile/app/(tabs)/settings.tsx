import type { JSX } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { COLORS, SERVER_URL } from '@/constants/config';
import { useWebSocket } from '@/hooks/useWebSocket';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export default function SettingsScreen(): JSX.Element {
  const { isConnected } = useWebSocket();

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
});
