'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { useCallDetail } from './useCallDetail';
import { hasLatency, shortCallId } from './utils';
import { CallDetailHeader } from './components/CallDetailHeader';
import { CallDetailsSidebar } from './components/CallDetailsSidebar';
import { CallOverview } from './components/CallOverview';
import { CallPerformance } from './components/CallPerformance';
import { CallCostBreakdown } from './components/CallCostBreakdown';
import { CallTranscriptPanel } from './components/CallTranscriptPanel';
import { CallAudioPlayer } from './components/CallAudioPlayer';

type MobileTab = 'details' | 'overview' | 'transcript';

const HAIRLINE = '1px solid var(--line-hairline)';

export function CallDetailView({ callId }: { callId: string }) {
  const { call, timeline, agentName, loading, error } = useCallDetail(callId);
  const [mobileTab, setMobileTab] = useState<MobileTab>('overview');
  const [currentTime, setCurrentTime] = useState(0);
  const [seekRequest, setSeekRequest] = useState<number | null>(null);

  const onSeek = useCallback((seconds: number) => {
    setSeekRequest(seconds);
    setCurrentTime(seconds);
  }, []);

  const onSeekHandled = useCallback(() => setSeekRequest(null), []);

  if (loading) return <DetailSkeleton callId={callId} />;
  if (error || !call) {
    return <ErrorState message={error ?? 'Call not found'} callId={callId} />;
  }

  const analysisVisible =
    call.analysis && (call.analysis.summary || call.analysis.sentiment);
  const showPerf = hasLatency(call.latencyMetrics);

  const centerPanel = (
    <div className="flex flex-col gap-8 p-5">
      {analysisVisible && call.analysis && <CallOverview analysis={call.analysis} />}
      {showPerf && <CallPerformance metrics={call.latencyMetrics} />}
      {call.cost && <CallCostBreakdown cost={call.cost} />}
    </div>
  );

  const transcript = (
    <CallTranscriptPanel
      timeline={timeline}
      agentName={agentName}
      callStartMs={call.createdAt}
      status={call.status}
      language={call.agentSnapshot?.language}
      currentTimeSec={currentTime}
      onSeek={onSeek}
      callId={callId}
      agentId={call.agentId}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CallDetailHeader call={call} />

      <div className="flex min-h-0 flex-1 flex-col px-8 py-5">
        {/* Mobile tabs — same control vocabulary as the rest of the app */}
        <div
          className="tabs mb-4 flex-none lg:hidden"
          role="tablist"
          aria-label="Call sections"
        >
          {(
            [
              { id: 'details' as const, label: 'Details' },
              { id: 'overview' as const, label: 'Overview' },
              { id: 'transcript' as const, label: 'Transcript' },
            ] as const
          ).map((t) => {
            const on = mobileTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`call-tab-${t.id}`}
                aria-selected={on}
                aria-controls={`call-panel-${t.id}`}
                onClick={() => setMobileTab(t.id)}
                className="tab"
                data-active={on || undefined}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Workspace — hairline and radius, never a shadow */}
        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg"
          style={{ border: HAIRLINE, background: 'var(--surface-card)' }}
        >
          <div className="hidden min-h-0 flex-1 lg:flex">
            <div
              className="min-h-0 w-[280px] flex-none overflow-hidden xl:w-[300px]"
              style={{ borderRight: HAIRLINE }}
            >
              <CallDetailsSidebar call={call} />
            </div>
            <div
              className="min-h-0 min-w-0 flex-1 overflow-y-auto"
              style={{ borderRight: HAIRLINE }}
            >
              {centerPanel}
            </div>
            <div className="flex min-h-0 w-[380px] flex-none flex-col overflow-hidden xl:w-[420px]">
              {transcript}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden lg:hidden">
            {mobileTab === 'details' && (
              <div
                role="tabpanel"
                id="call-panel-details"
                aria-labelledby="call-tab-details"
                className="h-full overflow-y-auto"
              >
                <CallDetailsSidebar call={call} />
              </div>
            )}
            {mobileTab === 'overview' && (
              <div
                role="tabpanel"
                id="call-panel-overview"
                aria-labelledby="call-tab-overview"
                className="h-full overflow-y-auto"
              >
                {centerPanel}
              </div>
            )}
            {mobileTab === 'transcript' && (
              <div
                role="tabpanel"
                id="call-panel-transcript"
                aria-labelledby="call-tab-transcript"
                className="h-full"
              >
                {transcript}
              </div>
            )}
          </div>

          <CallAudioPlayer
            callId={callId}
            hasRecording={Boolean(call.recordingUrl)}
            currentTime={currentTime}
            onTimeUpdate={setCurrentTime}
            seekRequest={seekRequest}
            onSeekHandled={onSeekHandled}
          />
        </div>
      </div>
    </div>
  );
}

function DetailSkeleton({ callId }: { callId: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        compact
        breadcrumb={[
          { label: 'Call History', href: '/calls' },
          { label: shortCallId(callId) },
        ]}
        title="Loading call…"
        description={shortCallId(callId)}
      />
      <div className="min-h-0 flex-1 px-8 py-5">
        {/* Bars, not a shimmer — nothing in this language animates a gradient. */}
        <div
          className="flex h-full flex-col gap-2 overflow-hidden rounded-lg p-4"
          style={{ border: HAIRLINE, background: 'var(--surface-card)' }}
          aria-busy="true"
          aria-label="Loading call"
        >
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="flex-none rounded-sm"
              style={{ height: 'var(--row-height, 56px)', background: 'var(--surface-hover)' }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ErrorState({ message, callId }: { message: string; callId: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        compact
        breadcrumb={[
          { label: 'Call History', href: '/calls' },
          { label: shortCallId(callId) },
        ]}
        title="Call"
        description={shortCallId(callId)}
      />
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="empty-state empty-state--bare">
          <span className="empty-state__tile" aria-hidden="true">
            <AlertCircle size={20} strokeWidth={1.7} style={{ color: 'var(--status-error)' }} />
          </span>
          <h2 className="empty-state__title">Could not load call</h2>
          <p className="empty-state__body">{message}</p>
          <div className="empty-state__actions">
            <Link href="/calls" className="btn btn--secondary">
              Back to Call History
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
