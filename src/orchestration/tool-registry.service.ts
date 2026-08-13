import { Injectable, Logger } from '@nestjs/common';
import { AgentTool } from './interfaces/agent-tool.interface';
import { LlmToolDefinition } from '../common/types/llm.types';

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

  listForPrompt(enabledTools?: string[]): LlmToolDefinition[] {
    return this.list(enabledTools).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.schema,
    }));
  }

  /**
   * Tool definitions in PyAI Omni's `configure`-frame shape. `execution:'client'`
   * tells Omni to emit a `tool_call` frame and wait for our `tool_result` — the
   * same tools then run through our own ToolExecutionService, so behavior is
   * identical across the pipeline and Omni engines.
   */
  listForOmni(enabledTools?: string[]): Array<{
    name: string;
    description: string;
    input_schema: unknown;
    execution: 'client';
  }> {
    return this.list(enabledTools).map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.schema,
      execution: 'client',
    }));
  }

  /**
   * Validates tool name is registered (and optionally enabled).
   * Returns null when valid; otherwise an error message.
   */
  validateToolCall(
    name: string,
    args: Record<string, unknown>,
    enabledTools?: string[],
  ): string | null {
    if (!name || typeof name !== 'string') {
      return 'Tool name is required';
    }

    if (!this.has(name)) {
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
