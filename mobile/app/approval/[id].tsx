import type { JSX } from 'react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Pressable, Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COLORS, SERVER_URL, SOURCE_COLORS } from '@/constants/config';
import { DiffViewer } from '@/components/DiffViewer';
import type { Approval } from '@/constants/types';

function timeFormatted(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function ActionButton({ label, color, onPress, isLoading, isDisabled }: {
  label: string; color: string; onPress: () => void; isLoading: boolean; isDisabled: boolean;
}): JSX.Element {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  return (
    <AnimatedPressable
      onPress={isDisabled ? undefined : onPress}
      onPressIn={() => {
        Animated.parallel([
          Animated.spring(scale, { toValue: 0.94, damping: 12, stiffness: 500, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.88, duration: 80, useNativeDriver: true }),
        ]).start();
      }}
      onPressOut={() => {
        Animated.parallel([
          Animated.sequence([
            Animated.spring(scale, { toValue: 1.03, damping: 10, stiffness: 400, useNativeDriver: true }),
            Animated.spring(scale, { toValue: 1, damping: 15, stiffness: 300, useNativeDriver: true }),
          ]),
          Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
        ]).start();
      }}
      style={[{ transform: [{ scale }], opacity, flex: 1 }, styles.actionButton, { backgroundColor: color }]}
      disabled={isDisabled}
    >
      {isLoading
        ? <ActivityIndicator size="small" color={COLORS.foreground} />
        : <Text style={styles.actionButtonLabel}>{label}</Text>}
    </AnimatedPressable>
  );
}

function SuccessOverlay({ action }: { action: 'approved' | 'denied' }): JSX.Element {
  const scale = useRef(new Animated.Value(0.5)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, damping: 12, stiffness: 200, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [scale, opacity]);

  const color = action === 'approved' ? COLORS.approve : COLORS.deny;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.overlayBg}>
        <Animated.View style={[styles.overlayCircle, { borderColor: color, transform: [{ scale }], opacity }]}>
          <Text style={[styles.overlaySymbol, { color }]}>{action === 'approved' ? '✓' : '✕'}</Text>
        </Animated.View>
      </View>
    </View>
  );
}

export default function ApprovalDetailScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [approval, setApproval] = useState<Approval | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingState, setApprovingState] = useState<'idle' | 'approving' | 'denying'>('idle');
  const [successAction, setSuccessAction] = useState<'approved' | 'denied' | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const sourceColor = SOURCE_COLORS[approval?.source ?? ''] ?? SOURCE_COLORS['default'];

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${SERVER_URL}/approvals/${id}`);
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        setApproval(await res.json());
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setIsLoading(false);
        Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
      }
    }
    if (id) load();
  }, [id, fadeAnim]);

  const handleAction = useCallback(async (action: 'approve' | 'deny') => {
    if (!approval) return;
    setApprovingState(action === 'approve' ? 'approving' : 'denying');
    try {
      const res = await fetch(`${SERVER_URL}/approvals/${approval.id}/${action}`, { method: 'POST' });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setSuccessAction(action === 'approve' ? 'approved' : 'denied');
      setTimeout(() => router.back(), 900);
    } catch (e: unknown) {
      setApprovingState('idle');
      Alert.alert('Error', e instanceof Error ? e.message : 'Action failed');
    }
  }, [approval, router]);

  if (isLoading) return <View style={styles.centered}><ActivityIndicator color={COLORS.approve} size="large" /></View>;
  if (error || !approval) return <View style={styles.centered}><Text style={styles.errorText}>⚠️ {error ?? 'Not found'}</Text></View>;

  const isPending = approval.status === 'pending';
  const isActing = approvingState !== 'idle';
  const statusColor = approval.status === 'approved' ? COLORS.approve : approval.status === 'denied' ? COLORS.deny : COLORS.mutedFg;

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        style={[styles.scroll, { opacity: fadeAnim }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={[styles.sourceBadge, { backgroundColor: `${sourceColor}22`, borderColor: `${sourceColor}44` }]}>
            <Text style={[styles.sourceBadgeText, { color: sourceColor }]}>{approval.source}</Text>
          </View>
          <Text style={styles.timestamp}>{timeFormatted(approval.createdAt)}</Text>
        </View>

        {!isPending && (
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: `${statusColor}22`, borderColor: `${statusColor}55` }]}>
              <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                {approval.status.charAt(0).toUpperCase() + approval.status.slice(1)}
              </Text>
            </View>
            {approval.resolvedAt && <Text style={styles.resolvedAt}>{timeFormatted(approval.resolvedAt)}</Text>}
          </View>
        )}

        <Text style={styles.actionTitle}>{approval.action}</Text>

        <View>
          <Text style={styles.sectionLabel}>DETAILS</Text>
          <View style={styles.detailsBox}>
            <Text style={styles.detailsText} selectable>{approval.details}</Text>
          </View>
        </View>

        {approval.diff && (
          <View style={styles.diffSection}>
            <Text style={styles.sectionLabel}>DIFF</Text>
            <DiffViewer diff={approval.diff} />
          </View>
        )}

        <View style={{ height: isPending ? 120 : 20 }} />
      </Animated.ScrollView>

      {isPending && (
        <Animated.View style={[styles.actionsContainer, { opacity: fadeAnim }]}>
          <View style={styles.actionsRow}>
            <ActionButton label="Deny" color={COLORS.deny} onPress={() => handleAction('deny')} isLoading={approvingState === 'denying'} isDisabled={isActing} />
            <ActionButton label="Approve" color={COLORS.approve} onPress={() => handleAction('approve')} isLoading={approvingState === 'approving'} isDisabled={isActing} />
          </View>
        </Animated.View>
      )}

      {successAction && <SuccessOverlay action={successAction} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sourceBadge: { borderRadius: 100, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  sourceBadgeText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  timestamp: { fontSize: 12, color: COLORS.mutedFg },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  resolvedAt: { fontSize: 12, color: COLORS.mutedFg },
  actionTitle: { fontSize: 22, fontWeight: '700', color: COLORS.foreground, marginBottom: 20, lineHeight: 28 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: COLORS.mutedFg, letterSpacing: 1.2, marginBottom: 8 },
  detailsBox: { backgroundColor: '#0d0d0d', borderRadius: 8, borderWidth: 1, borderColor: COLORS.cardBorder, padding: 12, marginBottom: 20 },
  detailsText: { fontFamily: 'monospace', fontSize: 13, lineHeight: 20, color: COLORS.foregroundDim },
  diffSection: { marginBottom: 8 },
  actionsContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.background, borderTopWidth: 1, borderTopColor: COLORS.cardBorder, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 30 },
  actionsRow: { flexDirection: 'row', gap: 12 },
  actionButton: { borderRadius: 14, height: 54, alignItems: 'center', justifyContent: 'center' },
  actionButtonLabel: { fontSize: 16, fontWeight: '700', color: COLORS.foreground },
  overlayBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  overlayCircle: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.7)' },
  overlaySymbol: { fontSize: 52, fontWeight: '700', lineHeight: 60 },
  errorText: { color: COLORS.deny, fontSize: 15 },
  statusBadge: { borderRadius: 100, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  statusBadgeText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
});
