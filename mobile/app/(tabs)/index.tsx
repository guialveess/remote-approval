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
  const translateY = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, { toValue: -6, duration: 1800, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    ).start();
  }, [translateY, fadeAnim]);

  return (
    <Animated.View style={[styles.emptyContainer, { opacity: fadeAnim }]}>
      <Animated.View style={[styles.emptyIconWrap, { transform: [{ translateY }] }]}>
        <Ionicons name="checkmark-circle-outline" size={56} color={COLORS.approve} />
      </Animated.View>
      <Text style={styles.emptyTitle}>All clear</Text>
      <Text style={styles.emptySubtitle}>No pending approvals</Text>
    </Animated.View>
  );
}

export default function PendingScreen() {
  const { approvals, isLoading, isRefreshing, refresh, error } = useApprovals({
    status: 'pending',
  });

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
      renderItem={({ item }) => (
        <ApprovalCard approval={item} animate />
      )}
      style={styles.flatList}
      contentContainerStyle={[
        styles.list,
        approvals.length === 0 && styles.listEmpty,
      ]}
      ListEmptyComponent={<EmptyState />}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={refresh}
          tintColor={COLORS.approve}
          colors={[COLORS.approve]}
        />
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  flatList: {
    backgroundColor: COLORS.background,
  },
  list: {
    padding: 16,
    paddingBottom: 32,
  },
  listEmpty: {
    flex: 1,
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
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
