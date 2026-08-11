import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, SOURCE_COLORS } from '@/constants/config';
import type { Approval, ApprovalStatus } from '@/constants/types';

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StatusDot({ status }: { status: ApprovalStatus }) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status === 'pending') {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.2, duration: 800, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }
  }, [status, opacity]);

  const color =
    status === 'approved'
      ? COLORS.approve
      : status === 'denied'
      ? COLORS.deny
      : status === 'expired'
      ? COLORS.mutedFg
      : '#facc15';

  if (status === 'approved') {
    return <Text style={[styles.statusSymbol, { color }]}>✓</Text>;
  }
  if (status === 'denied') {
    return <Text style={[styles.statusSymbol, { color }]}>✕</Text>;
  }
  if (status === 'expired') {
    return <Text style={[styles.statusSymbol, { color }]}>—</Text>;
  }

  return (
    <Animated.View style={[styles.dot, { backgroundColor: color, opacity }]} />
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
    if (animate) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }
  }, [animate, fadeAnim]);

  function handlePress() {
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
    ]).start();
    router.push(`/approval/${approval.id}`);
  }

  return (
    <Animated.View style={{ transform: [{ scale }], opacity: fadeAnim }}>
      <Pressable onPress={handlePress} style={styles.card}>
        <View style={styles.topRow}>
          <View style={[styles.sourceBadge, { backgroundColor: `${sourceColor}22`, borderColor: `${sourceColor}44` }]}>
            <Text style={[styles.sourceBadgeText, { color: sourceColor }]}>
              {approval.source}
            </Text>
          </View>
          <View style={styles.rightMeta}>
            <Text style={styles.timeAgo}>{timeAgo(approval.createdAt)}</Text>
            <StatusDot status={approval.status} />
          </View>
        </View>

        <Text style={styles.action} numberOfLines={1}>{approval.action}</Text>

        <Text style={styles.details} numberOfLines={2}>
          {approval.details}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
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
  rightMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeAgo: {
    fontSize: 11,
    color: COLORS.mutedFg,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusSymbol: {
    fontSize: 13,
    fontWeight: '700',
  },
  action: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.foreground,
    marginBottom: 5,
  },
  details: {
    fontSize: 12,
    color: COLORS.mutedFg,
    fontFamily: 'monospace',
    lineHeight: 17,
  },
});
