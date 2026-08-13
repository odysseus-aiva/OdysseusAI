import { z } from 'zod';

export const catalogueToolSchema = z.object({
  name: z.string(),
  displayName: z.string(),
  description: z.string(),
  category: z.string(),
  configSchema: z.record(z.string(), z.unknown()),
  defaultConfig: z.record(z.string(), z.unknown()),
  requiredEnv: z.array(z.string()),
  assignable: z.boolean(),
});

export const agentEngineSchema = z.enum(['pipeline', 'omni']);
export type AgentEngine = z.infer<typeof agentEngineSchema>;

export const agentSchema = z.object({
  agentId: z.string(),
  name: z.string(),
  engine: agentEngineSchema.nullish().transform((v) => v ?? 'pipeline'),
  systemPrompt: z.string().optional(),
  greeting: z.string().optional(),
  defaultProviders: z
    .object({
      stt: z.string().nullish().transform((v) => v ?? undefined),
      llm: z.string().nullish().transform((v) => v ?? undefined),
      tts: z.string().nullish().transform((v) => v ?? undefined),
    })
    .optional(),
  voiceId: z.string().optional(),
  language: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const agentToolAssignmentSchema = z.object({
  agentId: z.string(),
  toolName: z.string(),
  enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type CatalogueTool = z.infer<typeof catalogueToolSchema>;
export type Agent = z.infer<typeof agentSchema>;
export type AgentToolAssignment = z.infer<typeof agentToolAssignmentSchema>;

export async function fetchCatalogue(): Promise<CatalogueTool[]> {
  const res = await fetch('/api/tools/catalogue');
  if (!res.ok) throw new Error('Failed to load tool catalogue');
  const data = (await res.json()) as { tools?: unknown };
  return z.array(catalogueToolSchema).parse(data.tools ?? []);
}

export async function fetchAgents(): Promise<Agent[]> {
  const res = await fetch('/api/agents');
  if (!res.ok) throw new Error('Failed to load agents');
  return z.array(agentSchema).parse(await res.json());
}

export async function createAgent(body: {
  agentId: string;
  name: string;
  systemPrompt?: string;
}): Promise<Agent> {
  const res = await fetch('/api/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(err?.message)
      ? err.message.join(', ')
      : err?.message ?? 'Failed to create agent';
    throw new Error(message);
  }
  return agentSchema.parse(await res.json());
}

export async function fetchAgent(agentId: string): Promise<Agent> {
  const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}`);
  if (!res.ok) throw new Error('Agent not found');
  return agentSchema.parse(await res.json());
}

export async function updateAgent(
  agentId: string,
  body: {
    name?: string;
    engine?: AgentEngine;
    systemPrompt?: string;
    greeting?: string;
    defaultProviders?: { stt?: string; llm?: string; tts?: string };
    voiceId?: string;
    language?: string;
  },
): Promise<Agent> {
  const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to update agent');
  return agentSchema.parse(await res.json());
}

export async function deleteAgent(agentId: string): Promise<void> {
  const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete agent');
}

export async function fetchAgentTools(
  agentId: string,
): Promise<AgentToolAssignment[]> {
  const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/tools`);
  if (!res.ok) throw new Error('Failed to load agent tools');
  return z.array(agentToolAssignmentSchema).parse(await res.json());
}

export async function saveAgentTools(
  agentId: string,
  tools: Array<{
    toolName: string;
    enabled: boolean;
    config: Record<string, unknown>;
  }>,
): Promise<AgentToolAssignment[]> {
  const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/tools`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tools }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(err?.message)
      ? err.message.join(', ')
      : err?.message ?? 'Failed to save tools';
    throw new Error(message);
  }
  return z.array(agentToolAssignmentSchema).parse(await res.json());
}

export interface OmniVoice {
  voice_id: string;
  name: string;
  /** May be a bare code ('en') or a locale ('en-US', 'en-GB'). */
  language: string;
  gender: string;
  region: string;
  accent?: string;
  tone?: string;
  bio?: string;
  age?: string;
  age_band?: string;
  use_cases?: string[];
  search_tags?: string[];
  avatar_url?: string;
  source?: string;
}

export async function fetchOmniVoices(): Promise<OmniVoice[]> {
  const res = await fetch('/api/agents/omni/voices');
  if (!res.ok) throw new Error('Failed to load Omni voice catalog');
  const data = (await res.json()) as { voices?: unknown };
  return (data.voices ?? []) as OmniVoice[];
}

export async function testAgentTool(
  agentId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/tools/${encodeURIComponent(toolName)}/test`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args }),
    },
  );
  if (!res.ok) throw new Error('Tool test failed');
  return res.json();
}

// ─── Custom (HTTP) tools ────────────────────────────────────────────────────────

/** Marker + mask shared with the backend so the UI can detect/preserve secrets. */
export const CUSTOM_TOOL_KIND = 'custom_http';
export const SECRET_MASK = '••••••••';

export type CustomToolHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** The full definition of a user-configured HTTP tool (stored as tool config). */
export interface CustomToolDefinition {
  kind: typeof CUSTOM_TOOL_KIND;
  description: string;
  method: CustomToolHttpMethod;
  url: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  bodyTemplate?: unknown;
  inputSchema?: Record<string, unknown>;
  timeoutMs?: number;
  responseMapping?: Record<string, string>;
  resultInstruction?: string;
  speakDuringExecution?: boolean;
  executionMessage?: string;
}

export function isCustomToolConfig(
  config: Record<string, unknown> | undefined,
): config is CustomToolDefinition & Record<string, unknown> {
  return !!config && config.kind === CUSTOM_TOOL_KIND && typeof config.url === 'string';
}

/** Test a definition before assigning it. Returns { success, output? , error? }. */
export async function testCustomTool(
  definition: CustomToolDefinition,
  args: Record<string, unknown>,
): Promise<{ success: boolean; output?: unknown; error?: string }> {
  const res = await fetch('/api/agents/tools/custom/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ definition, args }),
  });
  return res.json() as Promise<{ success: boolean; output?: unknown; error?: string }>;
}

/** Delete a single tool assignment (built-in or custom) from an agent. */
export async function deleteAgentTool(agentId: string, toolName: string): Promise<void> {
  const res = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/tools/${encodeURIComponent(toolName)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error('Failed to delete tool');
}
