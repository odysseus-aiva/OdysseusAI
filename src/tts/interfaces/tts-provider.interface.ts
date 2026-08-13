import { TtsRequest, TtsResult } from '../../common/types/tts.types';

export const TTS_PROVIDER = Symbol('TTS_PROVIDER');

export interface TtsProvider {
  readonly name: string;
  synthesizeSpeech(request: TtsRequest): Promise<TtsResult>;
}

export interface TtsProviderFactory {
  getProvider(name: string): TtsProvider;
  getAvailableProviders(): string[];
}
