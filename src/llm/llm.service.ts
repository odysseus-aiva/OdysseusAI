import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmRequest, LlmResponse } from '../common/types/llm.types';
import { ClaudeLlmProvider } from './providers/claude-llm.provider';
import { OpenAiLlmProvider } from './providers/openai-llm.provider';
import { LlmProvider } from './interfaces/llm-provider.interface';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly providers: Map<string, LlmProvider>;

  constructor(
    private readonly configService: ConfigService,
    private readonly openAiProvider: OpenAiLlmProvider,
    private readonly claudeProvider: ClaudeLlmProvider,
  ) {
    this.providers = new Map<string, LlmProvider>([
      [openAiProvider.name, openAiProvider],
      [claudeProvider.name, claudeProvider],
    ]);
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  getProvider(name?: string): LlmProvider {
    const providerName =
      name ?? this.configService.get<string>('providers.llm') ?? 'openai';
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new NotFoundException(`LLM provider "${providerName}" not found`);
    }
    return provider;
  }

  async generateResponse(
    request: LlmRequest,
    providerName?: string,
  ): Promise<LlmResponse> {
    const provider = this.getProvider(providerName);
    this.logger.log(`Generating LLM response with provider: ${provider.name}`);
    return provider.generateResponse(request);
  }
}
