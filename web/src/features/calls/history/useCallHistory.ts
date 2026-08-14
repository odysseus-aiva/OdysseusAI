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

const PAGE_SIZE = 50;

export function useCallHistory() {
  const [calls, setCalls] = useState<CallSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState<CallHistoryFilters>(DEFAULT_FILTERS);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    try {
      setAgents(await fetchAgents());
    } catch {
      // Agent filter degrades to empty options; list still works.
      setAgents([]);
    }
  }, []);

  const load = useCallback(
    async (off = 0, nextFilters: CallHistoryFilters = filters) => {
      setLoading(true);
      setError(null);
      try {
        const bounds = datePresetToBounds(
          nextFilters.datePreset,
          nextFilters.customFrom,
          nextFilters.customTo,
        );
        const res = await fetchCalls({
          limit: PAGE_SIZE,
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
    [filters],
  );

  useEffect(() => {
    void loadAgents();
    void load(0);
    // Initial load only — subsequent loads go through explicit handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateFilters = useCallback(
    (patch: Partial<CallHistoryFilters>) => {
      setFilters((prev) => {
        const next = { ...prev, ...patch };
        // Server-backed filters refetch from page 0.
        const serverKeys: (keyof CallHistoryFilters)[] = [
          'datePreset',
          'customFrom',
          'customTo',
          'agentId',
          'status',
        ];
        const needsRefetch = serverKeys.some((k) => patch[k] !== undefined && patch[k] !== prev[k]);
        if (needsRefetch) {
          void load(0, next);
        }
        return next;
      });
    },
    [load],
  );

  const visibleCalls = useMemo(
    () => filterCallsClient(calls, filters),
    [calls, filters],
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.floor(offset / PAGE_SIZE) + 1;

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
    pageSize: PAGE_SIZE,
    filters,
    updateFilters,
    setFilters,
    agents,
    selectedId,
    setSelectedId,
    refresh: () => void load(offset, filters),
    goPrev: () => void load(Math.max(0, offset - PAGE_SIZE), filters),
    goNext: () => {
      if (offset + PAGE_SIZE < total) void load(offset + PAGE_SIZE, filters);
    },
    retry: () => void load(offset, filters),
  };
}
