import { LlmRequest, LlmResponse } from '../../common/types/llm.types';

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export interface LlmProvider {
  readonly name: string;
  generateResponse(request: LlmRequest): Promise<LlmResponse>;
}

export interface LlmProviderFactory {
  getProvider(name: string): LlmProvider;
  getAvailableProviders(): string[];
}
