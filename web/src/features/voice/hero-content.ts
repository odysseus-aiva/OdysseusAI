import type { Agent } from '@/lib/api/agents';
import type { ConnectionPhase, VoiceState } from './types';

/**
 * The hero is derived, not authored. Everything it renders is a function of the
 * current context, so new inputs (recent conversations, activity counts, agent
 * health) extend HeroContext and resolveHero without touching the view.
 */
export interface HeroContext {
  phase: ConnectionPhase;
  voiceState: VoiceState;
  agent: Agent | null;
  /** Total agents configured — distinguishes "no agents yet" from "pick one". */
  agentCount: number;
  error?: string | null;
  /** Reserved: last conversation summary, for a "pick up where you left off" line. */
  lastCallSummary?: string | null;
}

export interface HeroContent {
  /** Small uppercase line above the headline. */
  eyebrow: string;
  /** The headline, split into words for staggered entry. */
  headline: string[];
  /** One supporting sentence. Kept to a readable measure. */
  subline: string;
  /** Provider chips (LLM / STT / TTS) — omitted when no agent is resolved. */
  providers: { label: string; value: string }[];
}

const DEFAULTS = { llm: 'openai', stt: 'deepgram', tts: 'openai' };

/** Provider ids are lowercase api slugs; present them as product names. */
const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  claude: 'Claude',
  anthropic: 'Claude',
  deepgram: 'Deepgram',
  elevenlabs: 'ElevenLabs',
  cartesia: 'Cartesia',
};

function providerName(id: string | undefined, fallback: string): string {
  const key = (id ?? fallback).toLowerCase();
  return PROVIDER_LABELS[key] ?? (id ?? fallback);
}

export function resolveHero(ctx: HeroContext): HeroContent {
  const { phase, agent, agentCount, error } = ctx;

  const pipelineProviders = (dp?: { llm?: string; stt?: string; tts?: string }) => [
    { label: 'LLM', value: providerName(dp?.llm, DEFAULTS.llm) },
    { label: 'STT', value: providerName(dp?.stt, DEFAULTS.stt) },
    { label: 'TTS', value: providerName(dp?.tts, DEFAULTS.tts) },
  ];

  const providers = agent
    ? agent.engine === 'omni'
      ? [{ label: 'Powered by', value: 'PyAI Omni' }]
      : pipelineProviders(agent.defaultProviders)
    : agentCount > 0
      ? pipelineProviders()
      : [];

  if (phase === 'error') {
    return {
      eyebrow: 'Session failed',
      headline: ['Could', 'not', 'reach', 'the', 'agent'],
      subline:
        error ??
        'The session could not be established. Check the agent configuration and try again.',
      providers,
    };
  }

  if (phase === 'requesting') {
    return {
      eyebrow: 'Opening session',
      headline: agent
        ? ['Connecting', 'to', agent.name]
        : ['Opening', 'a', 'session'],
      subline: 'Negotiating the room and warming the speech pipeline.',
      providers,
    };
  }

  // Idle — the resting hero, contextual to what's configured.
  if (agentCount === 0) {
    return {
      eyebrow: 'No agents yet',
      headline: ['Create', 'your', 'first', 'agent'],
      subline:
        'Define a prompt, pick a voice, and this page becomes its live console.',
      providers,
    };
  }

  if (agent) {
    return {
      eyebrow: 'Ready',
      headline: [agent.name, 'is', 'listening'],
      subline: agent.greeting
        ? `Opens with: “${truncate(agent.greeting, 84)}”`
        : 'Speak naturally — the agent responds in real time, and interrupts cleanly.',
      providers,
    };
  }

  return {
    eyebrow: 'Ready',
    headline: ['Your', 'agent', 'is', 'listening'],
    subline:
      'Pick an agent and start speaking. Responses stream back in real time.',
    providers,
  };
}

function truncate(text: string, max: number): string {
  const clean = text.trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}
