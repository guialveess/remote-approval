import { useCallback, useEffect, useRef, useState } from 'react';
import { SERVER_URL } from '@/constants/config';
import type { Approval } from '@/constants/types';
import { useWebSocket } from './useWebSocket';

const PAGE_SIZE = 20;

interface UseApprovalsOptions {
  status?: 'pending' | 'history';
}

export function useApprovals(options: UseApprovalsOptions = {}) {
  const { status = 'pending' } = options;
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(0);
  const { subscribe } = useWebSocket();

  const buildUrl = useCallback(
    (page: number) => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (status === 'pending') {
        params.set('status', 'pending');
      } else {
        params.set('status', 'resolved');
      }
      return `${SERVER_URL}/approvals?${params}`;
    },
    [status]
  );

  const fetchPage = useCallback(
    async (page: number, replace: boolean) => {
      try {
        const res = await fetch(buildUrl(page));
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const json = await res.json();
        const data: Approval[] = json.approvals ?? json;
        setApprovals((prev) => (replace ? data : [...prev, ...data]));
        setHasMore(data.length === PAGE_SIZE);
        pageRef.current = page;
        setError(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      }
    },
    [buildUrl]
  );

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchPage(0, true);
    setIsRefreshing(false);
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore) return;
    await fetchPage(pageRef.current + 1, false);
  }, [fetchPage, hasMore]);

  // Initial load
  useEffect(() => {
    setIsLoading(true);
    fetchPage(0, true).finally(() => setIsLoading(false));
  }, [fetchPage]);

  // Real-time updates via WebSocket
  useEffect(() => {
    return subscribe((event) => {
      if (event.type === 'approval:new' && status === 'pending') {
        setApprovals((prev) => {
          // Avoid duplicates
          if (prev.some((a) => a.id === event.data.id)) return prev;
          return [event.data, ...prev];
        });
      }
      if (event.type === 'approval:resolved') {
        if (status === 'pending') {
          // Remove from pending list
          setApprovals((prev) => prev.filter((a) => a.id !== event.data.id));
        } else {
          // Prepend to history list
          setApprovals((prev) => {
            if (prev.some((a) => a.id === event.data.id)) return prev;
            return [event.data, ...prev];
          });
        }
      }
    });
  }, [subscribe, status]);

  const approve = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`${SERVER_URL}/approvals/${id}/approve`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`Failed to approve: ${res.status}`);
  }, []);

  const deny = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`${SERVER_URL}/approvals/${id}/deny`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`Failed to deny: ${res.status}`);
  }, []);

  return {
    approvals,
    isLoading,
    isRefreshing,
    error,
    hasMore,
    refresh,
    loadMore,
    approve,
    deny,
  };
}
