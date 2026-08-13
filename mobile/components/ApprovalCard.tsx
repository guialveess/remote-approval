import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Pressable, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, SOURCE_COLORS } from '@/constants/config';
import type { Approval, ApprovalStatus } from '@/constants/types';

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StatusPill({ status }: { status: ApprovalStatus }) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status !== 'pending') return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [status, opacity]);

  const color =
    status === 'approved' ? COLORS.approve :
    status === 'denied'   ? COLORS.deny :
    status === 'expired'  ? COLORS.mutedFg : '#f59e0b';

  const label =
    status === 'approved' ? '✓ Approved' :
    status === 'denied'   ? '✕ Denied' :
    status === 'expired'  ? '— Expired' : '● Pending';

  return (
    <Animated.View style={[
      styles.statusPill,
      { backgroundColor: `${color}18`, borderColor: `${color}35`, opacity: status === 'pending' ? opacity : 1 },
    ]}>
      <Text style={[styles.statusText, { color }]}>{label}</Text>
    </Animated.View>
  );
}

interface ApprovalCardProps {
  approval: Approval;
  animate?: boolean;
}

export function ApprovalCard({ approval, animate = true }: ApprovalCardProps) {
  const router = useRouter();
  const scale = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const sourceColor = SOURCE_COLORS[approval.source] ?? SOURCE_COLORS['default'];

  useEffect(() => {
    if (!animate) return;
    Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }, [animate, fadeAnim]);

  function handlePressIn() {
    Animated.spring(scale, { toValue: 0.975, damping: 20, stiffness: 400, useNativeDriver: true }).start();
  }
  function handlePressOut() {
    Animated.spring(scale, { toValue: 1, damping: 15, stiffness: 300, useNativeDriver: true }).start();
  }

  return (
    <Animated.View style={{ transform: [{ scale }], opacity: fadeAnim }}>
      <Pressable
        onPress={() => router.push(`/approval/${approval.id}`)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.card}
      >
        {/* Top row */}
        <View style={styles.topRow}>
          <View style={[styles.sourceDot, { backgroundColor: sourceColor }]} />
          <Text style={[styles.sourceLabel, { color: sourceColor }]}>{approval.source}</Text>
          {approval.session && (
            <Text style={styles.sessionLabel}>· {approval.session}</Text>
          )}
          <View style={{ flex: 1 }} />
          <Text style={styles.timeAgo}>{timeAgo(approval.createdAt)}</Text>
        </View>

        {/* Action */}
        <Text style={styles.action} numberOfLines={2}>{approval.action}</Text>

        {/* Details */}
        <Text style={styles.details} numberOfLines={2}>{approval.details}</Text>

        {/* Bottom row */}
        <View style={styles.bottomRow}>
          <StatusPill status={approval.status} />
          {approval.diff && (
            <View style={styles.diffBadge}>
              <Text style={styles.diffBadgeText}>DIFF</Text>
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111111',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sourceDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  sourceLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  sessionLabel: {
    fontSize: 12,
    color: COLORS.mutedFg,
  },
  timeAgo: {
    fontSize: 12,
    color: COLORS.mutedFg,
  },
  action: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    lineHeight: 20,
  },
  details: {
    fontSize: 12,
    color: COLORS.mutedFg,
    fontFamily: 'monospace',
    lineHeight: 17,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  statusPill: {
    borderRadius: 100,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  diffBadge: {
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  diffBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.mutedFg,
    letterSpacing: 0.8,
  },
});
