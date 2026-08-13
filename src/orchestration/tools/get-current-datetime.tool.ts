import { Injectable } from '@nestjs/common';
import { AgentTool } from '../interfaces/agent-tool.interface';
import { ToolExecutionContext } from '../interfaces/tool-execution-context.interface';

export interface DateTimeInput {
  timezone?: string;
}

export interface DateTimeOutput {
  iso: string;
  timezone: string;
  formatted: string;
  unixMs: number;
  weekday: string;
}

@Injectable()
export class GetCurrentDatetimeTool
  implements AgentTool<DateTimeInput, DateTimeOutput>
{
  readonly name = 'get_current_datetime';
  readonly description =
    'Get the current date and time. Optionally pass an IANA timezone (e.g. Asia/Kolkata, America/New_York). Use when the user asks what time or day it is.';
  readonly schema: Record<string, unknown> = {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'IANA timezone name, e.g. Asia/Kolkata',
      },
    },
    additionalProperties: false,
  };

  async execute(
    input: DateTimeInput,
    context: ToolExecutionContext,
  ): Promise<DateTimeOutput> {
    const config = context.toolConfigs?.[this.name] ?? {};
    const timezone =
      (typeof input.timezone === 'string' && input.timezone.trim()) ||
      (typeof config.defaultTimezone === 'string' && config.defaultTimezone) ||
      'UTC';

    const now = new Date();
    let formatted: string;
    let weekday: string;
    try {
      formatted = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      }).format(now);
      weekday = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'long',
      }).format(now);
    } catch {
      throw new Error(`Invalid timezone: ${timezone}`);
    }

    return {
      iso: now.toISOString(),
      timezone,
      formatted,
      unixMs: now.getTime(),
      weekday,
    };
  }
}
