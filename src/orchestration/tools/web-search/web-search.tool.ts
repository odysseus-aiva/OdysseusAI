import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentTool } from '../../interfaces/agent-tool.interface';
import { ToolExecutionContext } from '../../interfaces/tool-execution-context.interface';
import { BraveWebSearchProvider } from './brave-web-search.provider';
import { TavilyWebSearchProvider } from './tavily-web-search.provider';
import {
  NormalizedWebSearchOutput,
  WebSearchProvider,
  WebSearchQuery,
} from './web-search.types';

@Injectable()
export class WebSearchTool
  implements AgentTool<Record<string, unknown>, NormalizedWebSearchOutput>
{
  readonly name = 'web_search';
  readonly description =
    'Search the web for up-to-date information. Return a brief spoken summary of findings. Do not read URLs aloud unless the user explicitly asks for sources.';
  readonly schema: Record<string, unknown> = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query',
      },
      topic: {
        type: 'string',
        enum: ['general', 'news'],
        description: 'Optional topic hint',
      },
    },
    required: ['query'],
    additionalProperties: false,
  };

  private readonly logger = new Logger(WebSearchTool.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly tavily: TavilyWebSearchProvider,
    private readonly brave: BraveWebSearchProvider,
  ) {}

  async execute(
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<NormalizedWebSearchOutput> {
    const queryText =
      typeof input.query === 'string' ? input.query.trim() : '';
    if (!queryText) {
      throw new Error('query is required');
    }
    const topic =
      input.topic === 'news' || input.topic === 'general'
        ? input.topic
        : undefined;

    const config = context.toolConfigs?.[this.name] ?? {};
    const maxResults = Math.min(
      10,
      Math.max(1, Number(config.maxResults ?? 3)),
    );
    const searchDepth =
      config.searchDepth === 'advanced' ? 'advanced' : 'basic';
    const allowedDomains = Array.isArray(config.allowedDomains)
      ? config.allowedDomains.map(String)
      : [];
    const blockedDomains = Array.isArray(config.blockedDomains)
      ? config.blockedDomains.map(String)
      : [];
    const maxContentLength = Math.min(
      2000,
      Math.max(80, Number(config.maxContentLength ?? 280)),
    );

    if (topic === 'news' && config.allowNews === false) {
      throw new Error('News search is disabled for this agent');
    }

    const provider = this.resolveProvider();
    const searchQuery: WebSearchQuery = {
      query: queryText,
      maxResults,
      searchDepth,
      allowedDomains,
      blockedDomains,
      allowNews: config.allowNews !== false,
      maxContentLength,
    };

    if (topic === 'news') {
      searchQuery.allowNews = true;
    } else if (topic === 'general') {
      searchQuery.allowNews = false;
    } else {
      searchQuery.allowNews = config.allowNews !== false;
    }

    this.logger.log(
      `[${context.callId}] web_search via ${provider.name}: "${queryText}"`,
    );

    const raw = await provider.search(searchQuery);
    return this.normalizeForVoice(raw, maxResults, maxContentLength);
  }

  private resolveProvider(): WebSearchProvider {
    const name = (
      this.configService.get<string>('webSearch.provider') ?? 'tavily'
    ).toLowerCase();
    if (name === 'brave') return this.brave;
    return this.tavily;
  }

  private normalizeForVoice(
    raw: NormalizedWebSearchOutput,
    maxResults: number,
    maxContentLength: number,
  ): NormalizedWebSearchOutput {
    const seen = new Set<string>();
    const results = [];
    let budget = maxContentLength;

    for (const item of raw.results) {
      if (results.length >= maxResults) break;
      const url = item.url?.trim();
      const title = item.title?.trim() || 'Untitled';
      if (!url) continue;
      const dedupeKey = `${url.toLowerCase()}|${title.toLowerCase()}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      let snippet = (item.snippet ?? '').replace(/\s+/g, ' ').trim();
      if (snippet.length > budget) {
        snippet = `${snippet.slice(0, Math.max(0, budget - 1))}…`;
      }
      budget = Math.max(40, budget - snippet.length);

      results.push({
        title,
        url,
        snippet,
        publishedAt: item.publishedAt,
      });
    }

    let answer = raw.answer?.replace(/\s+/g, ' ').trim();
    if (answer && answer.length > maxContentLength) {
      answer = `${answer.slice(0, maxContentLength - 1)}…`;
    }

    return { answer: answer || undefined, results };
  }
}
