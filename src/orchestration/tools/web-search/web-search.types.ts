export interface WebSearchQuery {
  query: string;
  maxResults: number;
  searchDepth: 'basic' | 'advanced';
  allowedDomains: string[];
  blockedDomains: string[];
  allowNews: boolean;
  maxContentLength: number;
}

export interface NormalizedSearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
}

export interface NormalizedWebSearchOutput {
  answer?: string;
  results: NormalizedSearchResult[];
}

export interface WebSearchProvider {
  readonly name: string;
  search(query: WebSearchQuery): Promise<NormalizedWebSearchOutput>;
}

export const WEB_SEARCH_PROVIDER = Symbol('WEB_SEARCH_PROVIDER');
