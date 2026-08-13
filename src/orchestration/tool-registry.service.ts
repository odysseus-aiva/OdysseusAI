import { Injectable, Logger } from '@nestjs/common';
import { AgentTool } from './interfaces/agent-tool.interface';
import { LlmToolDefinition } from '../common/types/llm.types';
import { isCustomHttpDefinition } from './tools/custom/custom-tool.types';

type ToolConfigs = Record<string, Record<string, unknown>>;

interface ResolvedToolDef {
  name: string;
  description: string;
  schema: Record<string, unknown>;
}

@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);
  private readonly tools = new Map<string, AgentTool>();

  register(tool: AgentTool): void {
    if (this.tools.has(tool.name)) {
      this.logger.warn(`Overwriting existing tool registration: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    this.logger.log(`Registered tool: ${tool.name}`);
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * @param enabledTools
   *   - undefined → all registered tools (legacy ad-hoc sessions)
   *   - [] → no tools (deny-by-default for agent sessions)
   *   - non-empty → allowlist
   */
  list(enabledTools?: string[]): AgentTool[] {
    const all = Array.from(this.tools.values());
    if (enabledTools === undefined) {
      return all;
    }
    if (enabledTools.length === 0) {
      return [];
    }
    const allowed = new Set(enabledTools);
    return all.filter((tool) => allowed.has(tool.name));
  }

  /**
   * Resolve the enabled tools into name/description/schema triples, drawing
   * built-in tools from the registry and user-defined HTTP tools from the
   * per-agent `toolConfigs`. One code path feeds both the LLM prompt and the
   * Omni configure frame, so the two engines always see the same tool set.
   */
  private resolveDefs(
    enabledTools?: string[],
    toolConfigs?: ToolConfigs,
  ): ResolvedToolDef[] {
    const defs: ResolvedToolDef[] = this.list(enabledTools).map((tool) => ({
      name: tool.name,
      description: tool.description,
      schema: tool.schema,
    }));

    // Custom tools: names in the allowlist not backed by a registered tool but
    // carrying an HTTP definition in toolConfigs.
    if (enabledTools && toolConfigs) {
      const known = new Set(defs.map((d) => d.name));
      for (const name of enabledTools) {
        if (known.has(name) || this.tools.has(name)) continue;
        const def = toolConfigs[name];
        if (isCustomHttpDefinition(def)) {
          defs.push({
            name,
            description: def.description || name,
            schema:
              (def.inputSchema as Record<string, unknown>) ?? {
                type: 'object',
                properties: {},
              },
          });
        }
      }
    }

    return defs;
  }

  listForPrompt(
    enabledTools?: string[],
    toolConfigs?: ToolConfigs,
  ): LlmToolDefinition[] {
    return this.resolveDefs(enabledTools, toolConfigs).map((d) => ({
      name: d.name,
      description: d.description,
      parameters: d.schema,
    }));
  }

  /**
   * Tool definitions in PyAI Omni's `configure`-frame shape. `execution:'client'`
   * tells Omni to emit a `tool_call` frame and wait for our `tool_result` — the
   * same tools then run through our own ToolExecutionService, so behavior is
   * identical across the pipeline and Omni engines.
   */
  listForOmni(
    enabledTools?: string[],
    toolConfigs?: ToolConfigs,
  ): Array<{
    name: string;
    description: string;
    input_schema: unknown;
    execution: 'client';
  }> {
    return this.resolveDefs(enabledTools, toolConfigs).map((d) => ({
      name: d.name,
      description: d.description,
      input_schema: d.schema,
      execution: 'client',
    }));
  }

  /**
   * Validates a tool name is available for this session — registered built-in
   * OR a custom HTTP tool defined in the per-agent toolConfigs — and enabled.
   * Returns null when valid; otherwise an error message.
   */
  validateToolCall(
    name: string,
    args: Record<string, unknown>,
    enabledTools?: string[],
    toolConfigs?: ToolConfigs,
  ): string | null {
    if (!name || typeof name !== 'string') {
      return 'Tool name is required';
    }

    const isCustom = isCustomHttpDefinition(toolConfigs?.[name]);
    if (!this.has(name) && !isCustom) {
      return `Unknown tool: ${name}`;
    }

    if (enabledTools !== undefined && !enabledTools.includes(name)) {
      return `Tool "${name}" is not enabled for this agent`;
    }

    if (args !== null && typeof args !== 'object') {
      return `Tool "${name}" arguments must be an object`;
    }

    return null;
  }
}
