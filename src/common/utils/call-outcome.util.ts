import { CallOutcome, CallStatus } from '../types/call-log.types';

/**
 * Classify conversation quality from fields already stored on the call.
 *
 * Kept as a pure derivation rather than a persisted column so it applies to
 * historical calls without a migration, and so the definition has exactly one
 * home as the taxonomy evolves.
 */
export function classifyOutcome(call: {
  status: CallStatus;
  turnCount?: number;
}): CallOutcome {
  if (call.status === 'in_progress') return 'in_progress';
  if (call.status === 'error') return 'failed';
  return (call.turnCount ?? 0) > 0 ? 'engaged' : 'no_interaction';
}
