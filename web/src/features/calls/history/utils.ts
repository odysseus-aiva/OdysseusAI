import type { CallStatus } from '@/lib/types/call-log';
import type { CallSummary } from '@/lib/api/calls';

export type DateRangePreset = 'all' | 'today' | '7d' | '30d' | 'custom';

export interface CallHistoryFilters {
  query: string;
  datePreset: DateRangePreset;
  customFrom?: string; // yyyy-mm-dd
  customTo?: string;
  agentId: string; // '' = all
  numberQuery: string;
  status: '' | CallStatus;
}

export const DEFAULT_FILTERS: CallHistoryFilters = {
  query: '',
  datePreset: 'all',
  agentId: '',
  numberQuery: '',
  status: '',
};

export function metaString(
  call: CallSummary,
  key: string,
): string | undefined {
  const v = call.metadata?.[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export function getCallerPhone(call: CallSummary): string | undefined {
  return (
    metaString(call, 'from') ??
    metaString(call, 'caller') ??
    metaString(call, 'phoneNumber')
  );
}

export function getDestinationPhone(call: CallSummary): string | undefined {
  return metaString(call, 'to') ?? metaString(call, 'called');
}

export function getContactLabel(call: CallSummary): string {
  const name =
    metaString(call, 'callerName') ??
    metaString(call, 'contactName') ??
    metaString(call, 'name');
  if (name) return name;
  const phone = getCallerPhone(call);
  if (phone) return phone;
  return call.participantId?.slice(0, 12) ?? 'Caller';
}

export function getAgentLabel(call: CallSummary): string {
  return (
    call.agentSnapshot?.name ??
    (call.agentId ? call.agentId : 'Unassigned')
  );
}

export function matchesSearch(call: CallSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    call.callId,
    call.roomName,
    call.participantId,
    call.agentId,
    call.agentSnapshot?.name,
    call.analysis?.summary,
    getContactLabel(call),
    getCallerPhone(call),
    getDestinationPhone(call),
    metaString(call, 'channel'),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

export function matchesNumber(call: CallSummary, numberQuery: string): boolean {
  const q = numberQuery.trim().toLowerCase().replace(/[\s()-]/g, '');
  if (!q) return true;
  const phones = [getCallerPhone(call), getDestinationPhone(call)]
    .filter(Boolean)
    .map((p) => (p as string).toLowerCase().replace(/[\s()-]/g, ''));
  return phones.some((p) => p.includes(q));
}

/** Inclusive local-date range → epoch bounds for the list API. */
export function datePresetToBounds(
  preset: DateRangePreset,
  customFrom?: string,
  customTo?: string,
): { startAfter?: number; startBefore?: number } {
  const now = Date.now();
  if (preset === 'all') return {};
  if (preset === 'today') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { startAfter: start.getTime(), startBefore: now };
  }
  if (preset === '7d') return { startAfter: now - 7 * 86_400_000, startBefore: now };
  if (preset === '30d') return { startAfter: now - 30 * 86_400_000, startBefore: now };
  const out: { startAfter?: number; startBefore?: number } = {};
  if (customFrom) {
    const d = new Date(`${customFrom}T00:00:00`);
    if (!Number.isNaN(d.getTime())) out.startAfter = d.getTime();
  }
  if (customTo) {
    const d = new Date(`${customTo}T23:59:59.999`);
    if (!Number.isNaN(d.getTime())) out.startBefore = d.getTime();
  }
  return out;
}

export function formatDuration(ms: number | undefined): string {
  if (ms == null) return '—';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem.toString().padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${(m % 60).toString().padStart(2, '0')}m`;
}

export function formatDateTime(epochMs: number): { date: string; time: string } {
  const d = new Date(epochMs);
  return {
    date: d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    time: d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }),
  };
}

export function formatPhone(phone: string | undefined): string {
  if (!phone) return '—';
  return phone;
}

export function filterCallsClient(
  calls: CallSummary[],
  filters: CallHistoryFilters,
): CallSummary[] {
  return calls.filter(
    (c) =>
      matchesSearch(c, filters.query) &&
      matchesNumber(c, filters.numberQuery),
  );
}

export function initialsFromLabel(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
