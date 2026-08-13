import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PyAiHearProvider } from './providers/pyai-hear.provider';
import { DeepgramSttProvider } from './providers/deepgram-stt.provider';
import { SttProvider } from './interfaces/stt-provider.interface';
import { SttStreamHandle, SttStreamOptions } from '../common/types/stt.types';

@Injectable()
export class SttService {
  private readonly logger = new Logger(SttService.name);
  private readonly providers: Map<string, SttProvider>;

  constructor(
    private readonly configService: ConfigService,
    private readonly deepgramProvider: DeepgramSttProvider,
    private readonly pyAiHearProvider: PyAiHearProvider,
  ) {
    this.providers = new Map<string, SttProvider>([
      [deepgramProvider.name, deepgramProvider],
      [pyAiHearProvider.name, pyAiHearProvider],
    ]);
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  getProvider(name?: string): SttProvider {
    const providerName =
      name ?? this.configService.get<string>('providers.stt') ?? 'deepgram';
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new NotFoundException(`STT provider "${providerName}" not found`);
    }
    return provider;
  }

  transcribeStream(
    options: SttStreamOptions,
    providerName?: string,
  ): SttStreamHandle {
    const provider = this.getProvider(providerName);
    this.logger.log(
      `Starting STT stream [${options.callId}] with provider: ${provider.name}`,
    );
    return provider.transcribeStream(options);
  }
}
