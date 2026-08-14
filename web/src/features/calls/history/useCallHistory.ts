'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAgents, type Agent } from '@/lib/api/agents';
import { fetchCalls, type CallSummary } from '@/lib/api/calls';
import {
  DEFAULT_FILTERS,
  datePresetToBounds,
  filterCallsClient,
  type CallHistoryFilters,
} from './utils';

export type PageSizeOption = 10 | 25 | 50 | 100;
const DEFAULT_PAGE_SIZE: PageSizeOption = 10;

export function useCallHistory() {
  const [calls, setCalls] = useState<CallSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState<CallHistoryFilters>(DEFAULT_FILTERS);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<PageSizeOption>(DEFAULT_PAGE_SIZE);

  const loadAgents = useCallback(async () => {
    try {
      setAgents(await fetchAgents());
    } catch {
      setAgents([]);
    }
  }, []);

  const load = useCallback(
    async (
      off = 0,
      nextFilters: CallHistoryFilters = filters,
      nextPageSize: number = pageSize,
    ) => {
      setLoading(true);
      setError(null);
      try {
        const bounds = datePresetToBounds(
          nextFilters.datePreset,
          nextFilters.customFrom,
          nextFilters.customTo,
        );
        const res = await fetchCalls({
          limit: nextPageSize,
          offset: off,
          agentId: nextFilters.agentId || undefined,
          status: nextFilters.status || undefined,
          startAfter: bounds.startAfter,
          startBefore: bounds.startBefore,
          sortBy: 'createdAt',
          order: 'desc',
        });
        setCalls(res.calls);
        setTotal(res.total);
        setOffset(off);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load call history');
      } finally {
        setLoading(false);
      }
    },
    [filters, pageSize],
  );

  useEffect(() => {
    void loadAgents();
    void load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateFilters = useCallback(
    (patch: Partial<CallHistoryFilters>) => {
      setFilters((prev) => {
        const next = { ...prev, ...patch };
        const serverKeys: (keyof CallHistoryFilters)[] = [
          'datePreset',
          'customFrom',
          'customTo',
          'agentId',
          'status',
        ];
        const needsRefetch = serverKeys.some(
          (k) => patch[k] !== undefined && patch[k] !== prev[k],
        );
        if (needsRefetch) {
          void load(0, next, pageSize);
        }
        return next;
      });
    },
    [load, pageSize],
  );

  const updatePageSize = useCallback(
    (size: PageSizeOption) => {
      setPageSize(size);
      void load(0, filters, size);
    },
    [load, filters],
  );

  const visibleCalls = useMemo(
    () => filterCallsClient(calls, filters),
    [calls, filters],
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.floor(offset / pageSize) + 1;

  return {
    calls: visibleCalls,
    rawCount: calls.length,
    total,
    visibleCount: visibleCalls.length,
    loading,
    error,
    offset,
    page,
    totalPages,
    pageSize,
    updatePageSize,
    filters,
    updateFilters,
    setFilters,
    agents,
    selectedId,
    setSelectedId,
    refresh: () => void load(offset, filters, pageSize),
    goPrev: () => void load(Math.max(0, offset - pageSize), filters, pageSize),
    goNext: () => {
      if (offset + pageSize < total) void load(offset + pageSize, filters, pageSize);
    },
    retry: () => void load(offset, filters, pageSize),
  };
}
