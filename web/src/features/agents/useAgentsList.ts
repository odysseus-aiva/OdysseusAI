'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAgents, fetchAgentTools, type Agent } from '@/lib/api/agents';

export type AgentSort = 'updated' | 'created' | 'name';

/** Per-agent enabled-tool count, resolved after the list paints. */
export type ToolCounts = Record<string, number | undefined>;

/**
 * Loads the agent list, then enriches each row with its enabled-tool count in
 * parallel — the list paints immediately and counts fill in, so the page stays
 * fast whether there is 1 agent or 50+.
 *
 * Search and sort are client-side: the backend exposes no query params, and the
 * whole list is already in memory.
 */
export function useAgentsList() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [toolCounts, setToolCounts] = useState<ToolCounts>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<AgentSort>('updated');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchAgents();
      setAgents(list);
      setLoading(false);

      // Enrich with tool counts without blocking the initial paint. Failures
      // per-agent are swallowed — the card simply omits the count.
      const entries = await Promise.all(
        list.map(async (agent) => {
          try {
            const tools = await fetchAgentTools(agent.agentId);
            return [agent.agentId, tools.filter((t) => t.enabled).length] as const;
          } catch {
            return [agent.agentId, undefined] as const;
          }
        }),
      );
      setToolCounts(Object.fromEntries(entries));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? agents.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            a.agentId.toLowerCase().includes(q) ||
            (a.systemPrompt?.toLowerCase().includes(q) ?? false),
        )
      : agents;

    const sorted = [...filtered].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'created') return b.createdAt - a.createdAt;
      return b.updatedAt - a.updatedAt;
    });
    return sorted;
  }, [agents, query, sort]);

  return {
    agents,
    visible,
    toolCounts,
    loading,
    error,
    query,
    setQuery,
    sort,
    setSort,
    reload: load,
  };
}
