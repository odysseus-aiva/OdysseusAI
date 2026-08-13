import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ToolRegistryService } from './tool-registry.service';
import { ToolExecutionContext } from './interfaces/tool-execution-context.interface';
import { ToolExecutionResult } from './interfaces/orchestration.types';
import { EventLoggerService } from './event-logger.service';
import { CustomHttpToolService } from './tools/custom/custom-http-tool.service';
import { isCustomHttpDefinition } from './tools/custom/custom-tool.types';

@Injectable()
export class ToolExecutionService {
  private readonly logger = new Logger(ToolExecutionService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly eventLogger: EventLoggerService,
    private readonly customHttpTool: CustomHttpToolService,
  ) {}

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    // Dispatch is generic: a registered built-in AgentTool, otherwise a
    // user-defined HTTP tool whose definition lives in the per-agent
    // toolConfigs. No tool-specific branching beyond these two kinds.
    const builtin = this.toolRegistry.get(toolName);
    const customDef = builtin ? undefined : context.toolConfigs?.[toolName];
    const isCustom = !builtin && isCustomHttpDefinition(customDef);

    if (!builtin && !isCustom) {
      const error = `Unknown tool: ${toolName}`;
      await this.eventLogger.log(context.callId, 'tool_result', {
        roomName: context.roomName,
        data: { toolName, success: false, error },
      });
      return { success: false, toolName, error };
    }

    const timeoutMs =
      this.configService.get<number>('orchestration.toolTimeoutMs') ?? 5000;

    await this.eventLogger.log(context.callId, 'tool_call', {
      roomName: context.roomName,
      data: { toolName, args },
    });

    this.logger.log(
      `[${context.callId}] Executing tool ${toolName} (${isCustom ? 'custom-http' : 'built-in'})`,
    );

    const toolStart = Date.now();

    try {
      // Built-ins run under the shared tool timeout; custom HTTP tools enforce
      // their own per-definition timeout internally (via AbortController).
      const output = isCustom
        ? await this.customHttpTool.execute(
            customDef as Parameters<CustomHttpToolService['execute']>[0],
            args,
            context,
          )
        : await this.withTimeout(builtin!.execute(args, context), timeoutMs, toolName);
      const latencyMs = Date.now() - toolStart;

      await this.eventLogger.log(context.callId, 'tool_result', {
        roomName: context.roomName,
        data: { toolName, success: true, output },
        latencyMs,
      });

      return { success: true, toolName, output };
    } catch (err) {
      const error = (err as Error).message;
      const latencyMs = Date.now() - toolStart;
      this.logger.error(`[${context.callId}] Tool ${toolName} failed: ${error}`);

      await this.eventLogger.log(context.callId, 'tool_result', {
        roomName: context.roomName,
        data: { toolName, success: false, error },
        error,
        latencyMs,
      });

      return { success: false, toolName, error };
    }
  }

  private withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    toolName: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Tool "${toolName}" timed out after ${ms}ms`));
      }, ms);

      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((err: unknown) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}
