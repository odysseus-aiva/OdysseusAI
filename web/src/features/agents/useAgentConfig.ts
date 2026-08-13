'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteAgentTool,
  fetchAgent,
  fetchAgentTools,
  fetchCatalogue,
  isCustomToolConfig,
  saveAgentTools,
  testAgentTool,
  testCustomTool,
  updateAgent,
  type Agent,
  type AgentEngine,
  type AgentToolAssignment,
  type CatalogueTool,
  type CustomToolDefinition,
} from '@/lib/api/agents';

export interface ToolDraft {
  enabled: boolean;
  config: Record<string, unknown>;
}

/** A user-configured HTTP tool assigned to this agent. */
export interface CustomToolEntry {
  toolName: string;
  enabled: boolean;
  def: CustomToolDefinition;
}

export interface AgentDraft {
  name: string;
  engine: AgentEngine;
  systemPrompt: string;
  greeting: string;
  sttProvider: string;
  llmProvider: string;
  ttsProvider: string;
  voiceId: string;
  language: string;
}

const EMPTY_DRAFT: AgentDraft = {
  name: '',
  engine: 'pipeline',
  systemPrompt: '',
  greeting: '',
  sttProvider: '',
  llmProvider: '',
  ttsProvider: '',
  voiceId: '',
  language: '',
};

function draftFromAgent(agent: Agent): AgentDraft {
  return {
    name: agent.name,
    engine: agent.engine ?? 'pipeline',
    systemPrompt: agent.systemPrompt ?? '',
    greeting: agent.greeting ?? '',
    sttProvider: agent.defaultProviders?.stt ?? '',
    llmProvider: agent.defaultProviders?.llm ?? '',
    ttsProvider: agent.defaultProviders?.tts ?? '',
    voiceId: agent.voiceId ?? '',
    language: agent.language ?? '',
  };
}

/**
 * Owns all agent-configuration state: loading, drafts, dirty tracking, saving,
 * and tool testing. Presentation components read this and stay stateless, so
 * new tabs can consume the same hook without duplicating logic.
 */
export function useAgentConfig(agentId: string) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [catalogue, setCatalogue] = useState<CatalogueTool[]>([]);
  const [draft, setDraft] = useState<AgentDraft>(EMPTY_DRAFT);
  const [toolDrafts, setToolDrafts] = useState<Record<string, ToolDraft>>({});
  const [customTools, setCustomTools] = useState<CustomToolEntry[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, string>>({});

  // Baselines for dirty comparison — the last known server state.
  const baseline = useRef<AgentDraft>(EMPTY_DRAFT);
  const toolBaseline = useRef<Record<string, ToolDraft>>({});
  const customBaseline = useRef<CustomToolEntry[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [agentData, toolsData, catalogueData] = await Promise.all([
        fetchAgent(agentId),
        fetchAgentTools(agentId),
        fetchCatalogue(),
      ]);

      const nextDraft = draftFromAgent(agentData);
      setAgent(agentData);
      setDraft(nextDraft);
      baseline.current = nextDraft;
      setCatalogue(catalogueData);

      const assignments = new Map(
        toolsData.map((t: AgentToolAssignment) => [t.toolName, t]),
      );
      const nextTools: Record<string, ToolDraft> = {};
      for (const tool of catalogueData) {
        const existing = assignments.get(tool.name);
        nextTools[tool.name] = {
          enabled: existing?.enabled ?? false,
          config: { ...tool.defaultConfig, ...(existing?.config ?? {}) },
        };
      }
      setToolDrafts(nextTools);
      toolBaseline.current = structuredClone(nextTools);

      // Custom HTTP tools have no catalogue entry — their config IS the
      // definition. Secret header values arrive masked from the server.
      const customEntries: CustomToolEntry[] = toolsData
        .filter((t: AgentToolAssignment) => isCustomToolConfig(t.config))
        .map((t: AgentToolAssignment) => ({
          toolName: t.toolName,
          enabled: t.enabled,
          def: t.config as unknown as CustomToolDefinition,
        }));
      setCustomTools(customEntries);
      customBaseline.current = structuredClone(customEntries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agent');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = useCallback(<K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setToolEnabled = useCallback((toolName: string, enabled: boolean) => {
    setToolDrafts((prev) => ({
      ...prev,
      [toolName]: { ...prev[toolName], enabled },
    }));
  }, []);

  const setToolConfigValue = useCallback((toolName: string, key: string, value: unknown) => {
    setToolDrafts((prev) => ({
      ...prev,
      [toolName]: {
        ...prev[toolName],
        config: { ...prev[toolName]?.config, [key]: value },
      },
    }));
  }, []);

  /** Restore a tool's config to the catalogue defaults, keeping enabled state. */
  const resetToolConfig = useCallback(
    (toolName: string) => {
      const tool = catalogue.find((t) => t.name === toolName);
      if (!tool) return;
      setToolDrafts((prev) => ({
        ...prev,
        [toolName]: { ...prev[toolName], config: { ...tool.defaultConfig } },
      }));
    },
    [catalogue],
  );

  const isDirty = useMemo(() => {
    const agentChanged = (Object.keys(draft) as (keyof AgentDraft)[]).some(
      (k) => draft[k] !== baseline.current[k],
    );
    if (agentChanged) return true;
    if (JSON.stringify(toolDrafts) !== JSON.stringify(toolBaseline.current)) return true;
    return JSON.stringify(customTools) !== JSON.stringify(customBaseline.current);
  }, [draft, toolDrafts, customTools]);

  const enabledCount = useMemo(
    () =>
      Object.values(toolDrafts).filter((d) => d.enabled).length +
      customTools.filter((c) => c.enabled).length,
    [toolDrafts, customTools],
  );

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await updateAgent(agentId, {
        name: draft.name.trim(),
        engine: draft.engine,
        systemPrompt: draft.systemPrompt,
        greeting: draft.greeting,
        defaultProviders: {
          stt: draft.sttProvider || undefined,
          llm: draft.llmProvider || undefined,
          tts: draft.ttsProvider || undefined,
        },
        voiceId: draft.voiceId || undefined,
        language: draft.language || undefined,
      });
      await saveAgentTools(agentId, [
        ...Object.entries(toolDrafts).map(([toolName, d]) => ({
          toolName,
          enabled: d.enabled,
          config: d.config,
        })),
        ...customTools.map((c) => ({
          toolName: c.toolName,
          enabled: c.enabled,
          config: c.def as unknown as Record<string, unknown>,
        })),
      ]);
      setSavedAt(Date.now());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [agentId, draft, toolDrafts, customTools, load]);

  /**
   * Persist and invoke one tool. Enables it first — the backend only executes
   * assigned tools, so testing a disabled tool would always fail.
   */
  const testTool = useCallback(
    async (toolName: string, args: Record<string, unknown>) => {
      setTesting(toolName);
      setTestResults((prev) => ({ ...prev, [toolName]: '' }));
      try {
        // The backend only executes assigned tools, so enable it server-side for
        // the duration of the test. The local draft is deliberately NOT changed:
        // if the user has just disabled this tool, that intent must survive and
        // stay dirty so the next save reasserts it.
        await saveAgentTools(agentId, [
          { toolName, enabled: true, config: toolDrafts[toolName]?.config ?? {} },
        ]);
        const result = await testAgentTool(agentId, toolName, args);
        setTestResults((prev) => ({
          ...prev,
          [toolName]: JSON.stringify(result, null, 2),
        }));
      } catch (err) {
        setTestResults((prev) => ({
          ...prev,
          [toolName]: err instanceof Error ? err.message : 'Test failed',
        }));
      } finally {
        setTesting(null);
      }
    },
    [agentId, toolDrafts],
  );

  // ── Custom tools ────────────────────────────────────────────────────────────

  /** Create or replace a custom tool by name (edit reuses the same name). */
  const upsertCustomTool = useCallback((entry: CustomToolEntry) => {
    setCustomTools((prev) => {
      const idx = prev.findIndex((c) => c.toolName === entry.toolName);
      if (idx === -1) return [...prev, entry];
      const next = [...prev];
      next[idx] = entry;
      return next;
    });
  }, []);

  const setCustomToolEnabled = useCallback((toolName: string, enabled: boolean) => {
    setCustomTools((prev) =>
      prev.map((c) => (c.toolName === toolName ? { ...c, enabled } : c)),
    );
  }, []);

  /** Remove a custom tool. Persisted ones are deleted server-side immediately. */
  const removeCustomTool = useCallback(
    async (toolName: string) => {
      const persisted = customBaseline.current.some((c) => c.toolName === toolName);
      if (persisted) {
        await deleteAgentTool(agentId, toolName);
        await load();
        return;
      }
      setCustomTools((prev) => prev.filter((c) => c.toolName !== toolName));
    },
    [agentId, load],
  );

  /** Test a custom definition without assigning it (pre-assign preview). */
  const testCustomDefinition = useCallback(
    async (key: string, def: CustomToolDefinition, args: Record<string, unknown>) => {
      setTesting(key);
      setTestResults((prev) => ({ ...prev, [key]: '' }));
      try {
        const result = await testCustomTool(def, args);
        setTestResults((prev) => ({
          ...prev,
          [key]: JSON.stringify(result, null, 2),
        }));
      } catch (err) {
        setTestResults((prev) => ({
          ...prev,
          [key]: err instanceof Error ? err.message : 'Test failed',
        }));
      } finally {
        setTesting(null);
      }
    },
    [],
  );

  const discard = useCallback(() => {
    setDraft(baseline.current);
    setToolDrafts(structuredClone(toolBaseline.current));
    setCustomTools(structuredClone(customBaseline.current));
  }, []);

  return {
    agent,
    catalogue,
    draft,
    toolDrafts,
    customTools,
    loading,
    saving,
    error,
    savedAt,
    isDirty,
    enabledCount,
    testing,
    testResults,
    setField,
    setToolEnabled,
    setToolConfigValue,
    resetToolConfig,
    upsertCustomTool,
    setCustomToolEnabled,
    removeCustomTool,
    testCustomDefinition,
    save,
    discard,
    testTool,
    reload: load,
  };
}
