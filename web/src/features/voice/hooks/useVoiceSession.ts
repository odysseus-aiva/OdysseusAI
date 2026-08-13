'use client';

import { useCallback } from 'react';
import {
  sessionConnectionSchema,
  type StartSessionOptions,
} from '@/lib/api/session';
import { useVoiceStore } from '../state/voice.store';

/**
 * Owns the connection lifecycle: request a session from the BFF, expose the
 * resulting connection envelope, and reset on disconnect. Pure business logic —
 * no UI. Components call `start()` / `stop()` and read state from the store.
 */
export function useVoiceSession() {
  const { phase, connection, error, startRequest, setConnected, setError, signalAgentError, reset } =
    useVoiceStore();

  const start = useCallback(
    async (options?: StartSessionOptions) => {
      startRequest();
      try {
        const res = await fetch('/api/session/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options ?? {}),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error ?? 'Failed to start session.');
        }

        const parsed = sessionConnectionSchema.safeParse(await res.json());
        if (!parsed.success) {
          throw new Error('Received an invalid session from the server.');
        }

        setConnected(parsed.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    },
    [startRequest, setConnected, setError],
  );

  const stop = useCallback(() => {
    reset();
  }, [reset]);

  return { phase, connection, error, start, stop, signalAgentError };
}
