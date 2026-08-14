/**
 * Focused pure-function checks for Call History filtering helpers.
 * Run: npx --yes tsx src/features/calls/history/utils.selftest.ts
 */
import type { CallSummary } from '@/lib/api/calls';
import { filterCallsClient, getContactLabel } from './utils';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const base = {
  callId: 'c1',
  roomName: 'room-1',
  turnCount: 0,
  status: 'completed' as const,
  createdAt: 1,
  updatedAt: 1,
  latencyMetrics: {},
  errors: [] as string[],
};

const withPhone: CallSummary = {
  ...base,
  metadata: { from: '+15551212', to: '+15559999' },
};

const engaged: CallSummary = {
  ...base,
  callId: 'c2',
  turnCount: 3,
  analysis: { summary: 'hello world' },
};

assert(getContactLabel(withPhone) === '+15551212', 'contact from phone');
assert(getContactLabel(engaged) === 'Caller', 'fallback contact label');

const filtered = filterCallsClient([withPhone, engaged], {
  query: 'hello',
  datePreset: 'all',
  agentId: '',
  numberQuery: '',
  status: '',
});
assert(filtered.length === 1 && filtered[0].callId === 'c2', 'search filter');

const byNumber = filterCallsClient([withPhone, engaged], {
  query: '',
  datePreset: 'all',
  agentId: '',
  numberQuery: '5551212',
  status: '',
});
assert(byNumber.length === 1 && byNumber[0].callId === 'c1', 'number filter');

console.log('call-history utils.selftest: ok');
