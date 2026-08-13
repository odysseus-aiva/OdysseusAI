import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ToolRegistryService } from './tool-registry.service';
import { ToolExecutionContext } from './interfaces/tool-execution-context.interface';
import { ToolExecutionResult } from './interfaces/orchestration.types';
import { EventLoggerService } from './event-logger.service';

@Injectable()
export class ToolExecutionService {
  private readonly logger = new Logger(ToolExecutionService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly eventLogger: EventLoggerService,
  ) {}

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const tool = this.toolRegistry.get(toolName);
    if (!tool) {
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
      `[${context.callId}] Executing tool ${toolName} (timeout=${timeoutMs}ms)`,
    );

    const toolStart = Date.now();

    try {
      const output = await this.withTimeout(
        tool.execute(args, context),
        timeoutMs,
        toolName,
      );
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
