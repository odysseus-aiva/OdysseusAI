import { Injectable } from '@nestjs/common';

export interface GuardrailResult {
  allowed: boolean;
  text: string;
  reason?: string;
}

const MAX_VOICE_CHARS = 500;
const FALLBACK =
  "I'm sorry, I couldn't put that into words clearly. Could you ask again?";

@Injectable()
export class GuardrailService {
  check(text: string): GuardrailResult {
    const trimmed = (text ?? '').trim();

    if (!trimmed) {
      return { allowed: false, text: FALLBACK, reason: 'empty_response' };
    }

    if (this.looksLikeJson(trimmed)) {
      return { allowed: false, text: FALLBACK, reason: 'raw_json' };
    }

    if (trimmed.length > MAX_VOICE_CHARS) {
      const shortened = this.shortenForVoice(trimmed);
      return {
        allowed: true,
        text: shortened,
        reason: 'truncated_for_voice',
      };
    }

    return { allowed: true, text: trimmed };
  }

  private looksLikeJson(text: string): boolean {
    if (
      (text.startsWith('{') && text.endsWith('}')) ||
      (text.startsWith('[') && text.endsWith(']'))
    ) {
      try {
        JSON.parse(text);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  private shortenForVoice(text: string): string {
    if (text.length <= MAX_VOICE_CHARS) return text;
    const cut = text.slice(0, MAX_VOICE_CHARS);
    const lastSentence = Math.max(
      cut.lastIndexOf('.'),
      cut.lastIndexOf('!'),
      cut.lastIndexOf('?'),
    );
    if (lastSentence > MAX_VOICE_CHARS * 0.4) {
      return cut.slice(0, lastSentence + 1).trim();
    }
    return `${cut.trim()}...`;
  }
}
