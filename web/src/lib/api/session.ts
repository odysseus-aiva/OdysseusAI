import { z } from 'zod';

/**
 * Shape of the connection envelope returned by the backend's POST /session/start.
 * Validated at runtime so a backend contract change surfaces immediately.
 */
export const sessionConnectionSchema = z.object({
  serverUrl: z.string().url(),
  token: z.string().min(1),
  roomName: z.string().min(1),
  callId: z.string().min(1),
  participantIdentity: z.string().min(1),
  agentIdentity: z.string().min(1),
});

export type SessionConnection = z.infer<typeof sessionConnectionSchema>;

/** Optional per-session agent configuration (forward-compatible). */
export interface StartSessionOptions {
  agentConfig?: {
    systemPrompt?: string;
    agentId?: string;
    voiceId?: string;
    language?: string;
    enabledTools?: string[];
  };
}
