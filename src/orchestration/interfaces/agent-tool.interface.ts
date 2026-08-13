import { ToolExecutionContext } from './tool-execution-context.interface';

export interface AgentTool<TInput = Record<string, unknown>, TOutput = unknown> {
  name: string;
  description: string;
  /** JSON Schema for LLM function parameters */
  schema: Record<string, unknown>;
  execute(input: TInput, context: ToolExecutionContext): Promise<TOutput>;
}
