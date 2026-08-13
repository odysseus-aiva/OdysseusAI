import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NormalizedWebSearchOutput,
  WebSearchProvider,
  WebSearchQuery,
} from './web-search.types';

@Injectable()
export class BraveWebSearchProvider implements WebSearchProvider {
  readonly name = 'brave';
  private readonly logger = new Logger(BraveWebSearchProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async search(query: WebSearchQuery): Promise<NormalizedWebSearchOutput> {
    const apiKey = this.configService
      .get<string>('braveSearch.apiKey')
      ?.trim();
    if (!apiKey) {
      throw new Error('BRAVE_SEARCH_API_KEY is not configured');
    }

    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query.query);
    url.searchParams.set('count', String(query.maxResults));
    if (query.allowNews) {
      url.searchParams.set('result_filter', 'web,news');
    }

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.warn(
        `Brave search failed: ${response.status} ${text.slice(0, 200)}`,
      );
      throw new Error(`Web search failed (${response.status})`);
    }

    const data = (await response.json()) as {
      web?: {
        results?: Array<{
          title?: string;
          url?: string;
          description?: string;
          age?: string;
        }>;
      };
      news?: {
        results?: Array<{
          title?: string;
          url?: string;
          description?: string;
          age?: string;
        }>;
      };
    };

    const raw = [
      ...(data.web?.results ?? []),
      ...(query.allowNews ? (data.news?.results ?? []) : []),
    ];

    let results = raw.map((r) => ({
      title: String(r.title ?? ''),
      url: String(r.url ?? ''),
      snippet: String(r.description ?? ''),
      publishedAt: r.age,
    }));

    if (query.allowedDomains.length > 0) {
      const allowed = new Set(
        query.allowedDomains.map((d) => d.toLowerCase()),
      );
      results = results.filter((r) =>
        [...allowed].some((d) => this.hostname(r.url).includes(d)),
      );
    }
    if (query.blockedDomains.length > 0) {
      const blocked = query.blockedDomains.map((d) => d.toLowerCase());
      results = results.filter(
        (r) => !blocked.some((d) => this.hostname(r.url).includes(d)),
      );
    }

    return { results };
  }

  private hostname(url: string): string {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return '';
    }
  }
}
