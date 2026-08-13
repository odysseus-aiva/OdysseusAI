import { Injectable } from '@nestjs/common';
import { AgentTool } from '../interfaces/agent-tool.interface';
import { ToolExecutionContext } from '../interfaces/tool-execution-context.interface';

export interface EndCallInput {
  reason?: string;
}

export interface EndCallOutput {
  action: 'end_call';
  reason?: string;
  message: string;
}

@Injectable()
export class EndCallTool implements AgentTool<EndCallInput, EndCallOutput> {
  readonly name = 'end_call';
  readonly description =
    'End the voice call when the user wants to hang up, says goodbye, or the conversation is complete. Give a brief farewell in your spoken reply; do not call this mid-task.';
  readonly schema: Record<string, unknown> = {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'Optional short reason for ending the call',
      },
    },
    additionalProperties: false,
  };

  async execute(
    input: EndCallInput,
    _context: ToolExecutionContext,
  ): Promise<EndCallOutput> {
    return {
      action: 'end_call',
      reason: input.reason?.trim() || undefined,
      message: 'Call ending.',
    };
  }
}
