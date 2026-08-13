import { randomUUID } from 'crypto';
import {
  AgentSnapshot,
  CallLogEntry,
  CallRecord,
} from '../common/types/call-log.types';

export function createCallRecord(
  callId: string,
  roomName: string,
  participantId?: string,
  agentId?: string,
  agentSnapshot?: AgentSnapshot,
  metadata?: Record<string, string | number | boolean>,
): CallRecord {
  const now = Date.now();
  return {
    callId,
    roomName,
    participantId,
    agentId,
    agentSnapshot,
    metadata,
    status: 'in_progress',
    turnCount: 0,
    createdAt: now,
    updatedAt: now,
    logs: [],
    latencyMetrics: {},
    errors: [],
  };
}

export function createLogEntry(
  partial: Omit<CallLogEntry, 'id' | 'timestamp'> & { timestamp?: number },
): CallLogEntry {
  return {
    id: randomUUID(),
    timestamp: partial.timestamp ?? Date.now(),
    ...partial,
  };
}

/** @deprecated Use createLogEntry with roomName instead. */
export function createLogEntryCompat(
  partial: Omit<CallLogEntry, 'id' | 'timestamp' | 'roomName'> & {
    roomId?: string;
    roomName?: string;
    timestamp?: number;
  },
): CallLogEntry {
  return createLogEntry({
    ...partial,
    roomName: partial.roomName ?? partial.roomId ?? '',
  });
}
