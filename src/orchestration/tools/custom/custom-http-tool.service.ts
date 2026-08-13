import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ToolExecutionContext } from '../../interfaces/tool-execution-context.interface';
import {
  CustomHttpToolDefinition,
  HTTP_METHODS,
  MAX_RESPONSE_CHARS,
} from './custom-tool.types';
import {
  assertUrlAllowed,
  clampTimeout,
  dotGet,
  interpolate,
  interpolateDeep,
  validateArgs,
} from './custom-tool.util';

/**
 * Generic executor for user-defined HTTP tools. Given a stored definition + the
 * arguments the model produced, it builds and sends the request, normalizes the
 * response, and returns a compact result — with argument validation, SSRF
 * guarding, a hard timeout, and safe error messages. No per-tool code.
 */
@Injectable()
export class CustomHttpToolService {
  private readonly logger = new Logger(CustomHttpToolService.name);

  constructor(private readonly configService: ConfigService) {}

  /** Validate a definition's shape; throws BadRequest-style Error on problems. */
  static validateDefinition(def: CustomHttpToolDefinition): void {
    if (!def || typeof def !== 'object') throw new Error('Definition is required');
    if (!def.method || !HTTP_METHODS.includes(def.method)) {
      throw new Error(`method must be one of ${HTTP_METHODS.join(', ')}`);
    }
    if (typeof def.url !== 'string' || !/^https?:\/\//i.test(def.url)) {
      throw new Error('url must be an absolute http(s) URL');
    }
    if (typeof def.description !== 'string' || !def.description.trim()) {
      throw new Error('description is required (the LLM relies on it)');
    }
    if (def.inputSchema && typeof def.inputSchema !== 'object') {
      throw new Error('inputSchema must be a JSON Schema object');
    }
  }

  async execute(
    def: CustomHttpToolDefinition,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<Record<string, unknown>> {
    CustomHttpToolService.validateDefinition(def);

    const argError = validateArgs(args, def.inputSchema);
    if (argError) throw new Error(argError);

    // Templates can reference args plus call dynamic variables (args win).
    const vars: Record<string, unknown> = {
      ...(context.dynamicVariables ?? {}),
      ...args,
    };

    const url = this.buildUrl(def, vars);
    assertUrlAllowed(url.toString(), this.allowedHosts());

    const headers = this.buildHeaders(def, vars);
    const body = this.buildBody(def, vars, headers);
    const timeoutMs = clampTimeout(def.timeoutMs);

    this.logger.log(
      `[${context.callId}] custom tool → ${def.method} ${url.origin}${url.pathname} (timeout ${timeoutMs}ms)`,
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        method: def.method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch (err) {
      const aborted = (err as Error).name === 'AbortError';
      throw new Error(
        aborted
          ? `Request timed out after ${timeoutMs}ms`
          : `Request failed: ${(err as Error).message}`,
      );
    } finally {
      clearTimeout(timer);
    }

    const parsed = await this.parseResponse(response);

    if (!response.ok) {
      const detail =
        typeof parsed === 'string'
          ? parsed.slice(0, 300)
          : JSON.stringify(parsed).slice(0, 300);
      throw new Error(`HTTP ${response.status}: ${detail || response.statusText}`);
    }

    return this.normalizeResult(def, parsed, response.status);
  }

  // ── request building ──────────────────────────────────────────────────────

  private buildUrl(def: CustomHttpToolDefinition, vars: Record<string, unknown>): URL {
    const url = new URL(interpolate(def.url, vars));
    for (const [key, template] of Object.entries(def.queryParams ?? {})) {
      const value = interpolate(String(template), vars);
      if (value !== '') url.searchParams.set(key, value);
    }
    return url;
  }

  private buildHeaders(
    def: CustomHttpToolDefinition,
    vars: Record<string, unknown>,
  ): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const [key, template] of Object.entries(def.headers ?? {})) {
      const value = interpolate(String(template), vars);
      if (value !== '') headers[key] = value;
    }
    return headers;
  }

  private buildBody(
    def: CustomHttpToolDefinition,
    vars: Record<string, unknown>,
    headers: Record<string, string>,
  ): string | undefined {
    if (def.method === 'GET' || def.method === 'DELETE') return undefined;
    if (def.bodyTemplate == null) return undefined;

    if (typeof def.bodyTemplate === 'string') {
      const raw = interpolate(def.bodyTemplate, vars);
      return raw || undefined;
    }
    const interpolated = interpolateDeep(def.bodyTemplate, vars);
    if (!hasHeader(headers, 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }
    return JSON.stringify(interpolated);
  }

  // ── response handling ───────────────────────────────────────────────────────

  private async parseResponse(response: Response): Promise<unknown> {
    const text = await response.text();
    const type = response.headers.get('content-type') ?? '';
    if (type.includes('application/json') || looksLikeJson(text)) {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        /* fall through to raw text */
      }
    }
    return text;
  }

  private normalizeResult(
    def: CustomHttpToolDefinition,
    parsed: unknown,
    status: number,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = { status };

    if (def.responseMapping && Object.keys(def.responseMapping).length > 0) {
      const mapped: Record<string, unknown> = {};
      for (const [outKey, path] of Object.entries(def.responseMapping)) {
        mapped[outKey] = dotGet(parsed, path);
      }
      result.data = mapped;
    } else if (typeof parsed === 'string') {
      result.data =
        parsed.length > MAX_RESPONSE_CHARS
          ? `${parsed.slice(0, MAX_RESPONSE_CHARS)}…`
          : parsed;
    } else {
      const serialized = JSON.stringify(parsed);
      result.data =
        serialized.length > MAX_RESPONSE_CHARS
          ? { truncated: true, preview: serialized.slice(0, MAX_RESPONSE_CHARS) }
          : parsed;
    }

    if (def.resultInstruction?.trim()) {
      result.instruction = def.resultInstruction.trim();
    }
    return result;
  }

  private allowedHosts(): string[] {
    const raw = this.configService.get<string>('customTools.allowedHosts') ?? '';
    return raw
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
  }
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some((k) => k.toLowerCase() === name.toLowerCase());
}

function looksLikeJson(text: string): boolean {
  const t = text.trim();
  return t.startsWith('{') || t.startsWith('[');
}
