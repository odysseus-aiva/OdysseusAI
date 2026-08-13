import { Injectable } from '@nestjs/common';
import { ToolExecutionResult } from './interfaces/orchestration.types';
import { GuardrailService } from './guardrail.service';
import { UserDetailsOutput } from './tools/get-user-details.tool';
import { DateTimeOutput } from './tools/get-current-datetime.tool';
import { WeatherOutput } from './tools/get-weather.tool';
import { NormalizedWebSearchOutput } from './tools/web-search/web-search.types';
import { EndCallOutput } from './tools/end-call.tool';

type SpeechFormatter = (output: unknown) => string | null;

@Injectable()
export class ResponsePlannerService {
  private readonly formatters: Record<string, SpeechFormatter> = {
    get_user_details: (output) =>
      this.formatUserDetails(output as UserDetailsOutput),
    get_current_datetime: (output) =>
      this.formatDateTime(output as DateTimeOutput),
    get_weather: (output) => this.formatWeather(output as WeatherOutput),
    web_search: (output) =>
      this.formatWebSearch(output as NormalizedWebSearchOutput),
    end_call: (output) => this.formatEndCall(output as EndCallOutput),
  };

  constructor(private readonly guardrailService: GuardrailService) {}

  plan(params: {
    llmText: string;
    toolResults: ToolExecutionResult[];
    fallbackResponse: string;
  }): { speakableText: string; source: string } {
    let candidate = params.llmText?.trim() ?? '';
    let source = 'llm';

    if (this.shouldPreferToolSpeech(candidate, params.toolResults)) {
      const fromTools = this.buildFromToolResults(params.toolResults);
      if (fromTools) {
        candidate = fromTools;
        source = 'tool_fallback';
      }
    }

    if (!candidate) {
      candidate = params.fallbackResponse;
      source = 'fallback';
    }

    const guarded = this.guardrailService.check(candidate);
    return {
      speakableText: guarded.text,
      source: guarded.allowed ? source : 'guardrail_fallback',
    };
  }

  private shouldPreferToolSpeech(
    llmText: string,
    toolResults: ToolExecutionResult[],
  ): boolean {
    if (!llmText || this.isRawJson(llmText)) {
      return toolResults.some((r) => r.success);
    }

    const successful = toolResults.filter((r) => r.success && r.output);
    if (successful.length === 0) return false;

    // If LLM text does not appear to reference any tool payload markers, prefer formatter
    return successful.some((result) => {
      const formatted = this.formatters[result.toolName]?.(result.output);
      if (!formatted) return false;
      const tokens = formatted
        .split(/\s+/)
        .map((t) => t.replace(/[^a-zA-Z0-9]/g, ''))
        .filter((t) => t.length > 4)
        .slice(0, 4);
      if (tokens.length === 0) return false;
      const lower = llmText.toLowerCase();
      return !tokens.some((t) => lower.includes(t.toLowerCase()));
    });
  }

  private buildFromToolResults(
    toolResults: ToolExecutionResult[],
  ): string | null {
    for (const result of toolResults) {
      if (!result.success || !result.output) continue;
      const formatted = this.formatters[result.toolName]?.(result.output);
      if (formatted) return formatted;
    }

    const failure = toolResults.find((r) => !r.success);
    if (failure) {
      return "I couldn't retrieve that information right now. Please try again in a moment.";
    }

    return null;
  }

  private formatUserDetails(user: UserDetailsOutput): string {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
    const parts: string[] = ['I found your user details.'];
    if (name) parts.push(`Your name is ${name}.`);
    if (user.username) parts.push(`Your username is ${user.username}.`);
    if (user.email) parts.push(`Your email is ${user.email}.`);
    return parts.join(' ');
  }

  private formatDateTime(output: DateTimeOutput): string {
    return `It is currently ${output.formatted}.`;
  }

  private formatWeather(output: WeatherOutput): string {
    return output.summary;
  }

  private formatWebSearch(output: NormalizedWebSearchOutput): string {
    if (output.answer?.trim()) {
      return output.answer.trim();
    }
    const first = output.results[0];
    if (!first) {
      return "I couldn't find reliable information on that right now.";
    }
    return `${first.title}. ${first.snippet}`.trim();
  }

  private formatEndCall(output: EndCallOutput): string {
    return output.reason
      ? `Alright, I'll end the call now. ${output.reason}`
      : 'Alright, goodbye!';
  }

  private isRawJson(text: string): boolean {
    if (
      (text.startsWith('{') && text.endsWith('}')) ||
      (text.startsWith('[') && text.endsWith(']'))
    ) {
      try {
        JSON.parse(text);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}
