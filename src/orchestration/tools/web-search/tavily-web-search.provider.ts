import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NormalizedWebSearchOutput,
  WebSearchProvider,
  WebSearchQuery,
} from './web-search.types';

@Injectable()
export class TavilyWebSearchProvider implements WebSearchProvider {
  readonly name = 'tavily';
  private readonly logger = new Logger(TavilyWebSearchProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async search(query: WebSearchQuery): Promise<NormalizedWebSearchOutput> {
    const apiKey = this.configService.get<string>('tavily.apiKey')?.trim();
    if (!apiKey) {
      throw new Error('TAVILY_API_KEY is not configured');
    }

    const body: Record<string, unknown> = {
      query: query.query,
      search_depth: query.searchDepth,
      max_results: query.maxResults,
      include_answer: true,
      topic: query.allowNews ? 'general' : 'general',
    };

    if (query.allowedDomains.length > 0) {
      body.include_domains = query.allowedDomains;
    }
    if (query.blockedDomains.length > 0) {
      body.exclude_domains = query.blockedDomains;
    }
    if (query.allowNews === false) {
      // Tavily has topic=news; keep general when news disallowed
      body.topic = 'general';
    }

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.warn(`Tavily search failed: ${response.status} ${text.slice(0, 200)}`);
      throw new Error(`Web search failed (${response.status})`);
    }

    const data = (await response.json()) as {
      answer?: string;
      results?: Array<{
        title?: string;
        url?: string;
        content?: string;
        published_date?: string;
      }>;
    };

    return {
      answer: data.answer?.trim() || undefined,
      results: (data.results ?? []).map((r) => ({
        title: String(r.title ?? ''),
        url: String(r.url ?? ''),
        snippet: String(r.content ?? ''),
        publishedAt: r.published_date,
      })),
    };
  }
}
