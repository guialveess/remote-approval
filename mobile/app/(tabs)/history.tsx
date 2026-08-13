import React, { useEffect, useRef } from 'react';
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ApprovalCard } from '@/components/ApprovalCard';
import { useApprovals } from '@/hooks/useApprovals';
import { COLORS } from '@/constants/config';
import type { Approval } from '@/constants/types';

function EmptyState() {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, [fadeAnim]);

  return (
    <Animated.View style={[styles.emptyContainer, { opacity: fadeAnim }]}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="time-outline" size={56} color={COLORS.mutedFg} />
      </View>
      <Text style={styles.emptyTitle}>No history yet</Text>
      <Text style={styles.emptySubtitle}>Resolved approvals will appear here</Text>
    </Animated.View>
  );
}

function FooterLoader({ hasMore }: { hasMore: boolean }) {
  if (!hasMore) return null;
  return (
    <View style={styles.footerLoader}>
      <ActivityIndicator color={COLORS.mutedFg} size="small" />
    </View>
  );
}

export default function HistoryScreen() {
  const { approvals, isLoading, isRefreshing, hasMore, refresh, loadMore, error } =
    useApprovals({ status: 'history' });

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.approve} size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>⚠️ {error}</Text>
        <Text style={styles.errorHint} onPress={refresh}>
          Tap to retry
        </Text>
      </View>
    );
  }

  return (
    <FlatList<Approval>
      data={approvals}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <ApprovalCard approval={item} animate={false} />}
      style={styles.flatList}
      contentContainerStyle={[
        styles.list,
        approvals.length === 0 && styles.listEmpty,
      ]}
      ListEmptyComponent={<EmptyState />}
      ListFooterComponent={<FooterLoader hasMore={hasMore} />}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={refresh}
          tintColor={COLORS.approve}
          colors={[COLORS.approve]}
        />
      }
      onEndReached={loadMore}
      onEndReachedThreshold={0.3}
      showsVerticalScrollIndicator={false}
    />
  );
}

const TAB_BAR_HEIGHT = 110;

const styles = StyleSheet.create({
  flatList: {
    backgroundColor: '#080808',
  },
  list: {
    padding: 16,
    paddingBottom: TAB_BAR_HEIGHT,
  },
  listEmpty: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: TAB_BAR_HEIGHT,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#080808',
    paddingBottom: TAB_BAR_HEIGHT,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyIconWrap: {
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.foreground,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.mutedFg,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.deny,
    fontSize: 15,
    marginBottom: 12,
  },
  errorHint: {
    color: COLORS.approve,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
