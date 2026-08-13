import { Observable } from 'rxjs';
import {
  SttEvent,
  SttStreamHandle,
  SttStreamOptions,
} from '../../common/types/stt.types';

export const STT_PROVIDER = Symbol('STT_PROVIDER');

export interface SttProvider {
  readonly name: string;
  transcribeStream(options: SttStreamOptions): SttStreamHandle;
}

export type SttEventCallback = (event: SttEvent) => void;

export interface SttProviderFactory {
  getProvider(name: string): SttProvider;
  getAvailableProviders(): string[];
}

export type SttEventStream = Observable<SttEvent>;
