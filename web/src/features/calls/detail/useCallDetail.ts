'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchCallDetail,
  fetchTranscript,
  type CallSummary,
  type TranscriptEntry,
  type ToolCallRecord,
} from '@/lib/api/calls';
import { buildTimeline, getAgentName } from './utils';

export function useCallDetail(callId: string) {
  const [call, setCall] = useState<CallSummary | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[] | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [callData, transcriptData] = await Promise.all([
        fetchCallDetail(callId),
        fetchTranscript(callId).catch(() => null),
      ]);
      setCall(callData);
      setTranscript(transcriptData?.transcript ?? null);
      setToolCalls(transcriptData?.toolCalls ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load call');
    } finally {
      setLoading(false);
    }
  }, [callId]);

  useEffect(() => {
    void load();
  }, [load]);

  const timeline = useMemo(
    () => buildTimeline(transcript ?? [], toolCalls),
    [transcript, toolCalls],
  );

  const messageCount = timeline.filter((i) => i.kind === 'message').length;
  const toolCount = timeline.length - messageCount;
  const agentName = call ? getAgentName(call) : 'Agent';

  return {
    call,
    transcript,
    toolCalls,
    timeline,
    messageCount,
    toolCount,
    agentName,
    loading,
    error,
    reload: load,
  };
}
