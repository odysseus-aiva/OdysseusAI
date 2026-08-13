'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchAgent,
  fetchAgentTools,
  fetchCatalogue,
  saveAgentTools,
  testAgentTool,
  updateAgent,
  type Agent,
  type AgentEngine,
  type AgentToolAssignment,
  type CatalogueTool,
} from '@/lib/api/agents';

export interface ToolDraft {
  enabled: boolean;
  config: Record<string, unknown>;
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

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, string>>({});

  // Baselines for dirty comparison — the last known server state.
  const baseline = useRef<AgentDraft>(EMPTY_DRAFT);
  const toolBaseline = useRef<Record<string, ToolDraft>>({});

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
    return JSON.stringify(toolDrafts) !== JSON.stringify(toolBaseline.current);
  }, [draft, toolDrafts]);

  const enabledCount = useMemo(
    () => Object.values(toolDrafts).filter((d) => d.enabled).length,
    [toolDrafts],
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
      await saveAgentTools(
        agentId,
        Object.entries(toolDrafts).map(([toolName, d]) => ({
          toolName,
          enabled: d.enabled,
          config: d.config,
        })),
      );
      setSavedAt(Date.now());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [agentId, draft, toolDrafts, load]);

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

  const discard = useCallback(() => {
    setDraft(baseline.current);
    setToolDrafts(structuredClone(toolBaseline.current));
  }, []);

  return {
    agent,
    catalogue,
    draft,
    toolDrafts,
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
    save,
    discard,
    testTool,
    reload: load,
  };
}
