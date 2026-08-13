import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TtsRequest, TtsResult } from '../common/types/tts.types';
import { CartesiaTtsProvider } from './providers/cartesia-tts.provider';
import { ElevenLabsTtsProvider } from './providers/elevenlabs-tts.provider';
import { OpenAiTtsProvider } from './providers/openai-tts.provider';
import { PyAiSpeakProvider } from './providers/pyai-speak.provider';
import { TtsProvider } from './interfaces/tts-provider.interface';

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly providers: Map<string, TtsProvider>;

  constructor(
    private readonly configService: ConfigService,
    private readonly elevenLabsProvider: ElevenLabsTtsProvider,
    private readonly openAiTtsProvider: OpenAiTtsProvider,
    private readonly cartesiaProvider: CartesiaTtsProvider,
    private readonly pyAiSpeakProvider: PyAiSpeakProvider,
  ) {
    this.providers = new Map<string, TtsProvider>([
      [elevenLabsProvider.name, elevenLabsProvider],
      [openAiTtsProvider.name, openAiTtsProvider],
      [cartesiaProvider.name, cartesiaProvider],
      [pyAiSpeakProvider.name, pyAiSpeakProvider],
    ]);
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  getProvider(name?: string): TtsProvider {
    const providerName =
      name ?? this.configService.get<string>('providers.tts') ?? 'elevenlabs';
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new NotFoundException(`TTS provider "${providerName}" not found`);
    }
    return provider;
  }

  async synthesizeSpeech(
    request: TtsRequest,
    providerName?: string,
  ): Promise<TtsResult> {
    const provider = this.getProvider(providerName);
    this.logger.log(
      `Synthesizing speech (${request.text.length} chars) with provider: ${provider.name}`,
    );
    return provider.synthesizeSpeech(request);
  }
}
