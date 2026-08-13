/**
 * User-defined HTTP tools ("Custom Function / Custom API"), configured entirely
 * from the UI and stored as an agent_tools assignment `config`. A single generic
 * executor runs any such definition, so new APIs need no backend code.
 *
 * The definition lives in the per-agent `toolConfigs[toolName]` blob that is
 * already threaded through the session, so custom tools ride the exact same
 * enable/allowlist/logging machinery as built-in tools.
 */
export const CUSTOM_TOOL_KIND = 'custom_http';

/** Placeholder returned in place of stored secret header values on read. */
export const SECRET_MASK = '••••••••';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export const DEFAULT_TOOL_TIMEOUT_MS = 10_000;
export const MAX_TOOL_TIMEOUT_MS = 30_000;
/** Cap on the size of a response body handed back to the model. */
export const MAX_RESPONSE_CHARS = 8_000;

export interface CustomHttpToolDefinition {
  kind: typeof CUSTOM_TOOL_KIND;
  /** Description shown to the LLM/Omni engine — what the tool does + when to use it. */
  description: string;
  method: HttpMethod;
  /** May contain `{{arg}}` placeholders resolved from the tool's input args. */
  url: string;
  /** Header values may contain `{{arg}}` and hold secrets (masked on read). */
  headers?: Record<string, string>;
  /** Query params appended to the URL; values may contain `{{arg}}`. */
  queryParams?: Record<string, string>;
  /** JSON body template (string or object); string values interpolate `{{arg}}`. */
  bodyTemplate?: unknown;
  /** JSON Schema for the tool arguments the model must produce. */
  inputSchema?: Record<string, unknown>;
  /** Per-tool request timeout; clamped to MAX_TOOL_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Map of output key → dot-path into the JSON response (e.g. `data.0.temp`). */
  responseMapping?: Record<string, string>;
  /** Free-text guidance appended to the result telling the agent how to use it. */
  resultInstruction?: string;
  /** Reuse the shared "speak while running" fields (execution filler). */
  speakDuringExecution?: boolean;
  executionMessage?: string;
}

export function isCustomHttpDefinition(
  value: unknown,
): value is CustomHttpToolDefinition {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.kind === CUSTOM_TOOL_KIND && typeof v.url === 'string';
}
