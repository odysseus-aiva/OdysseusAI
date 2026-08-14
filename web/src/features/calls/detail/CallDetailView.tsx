'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
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

export function CallDetailView({ callId }: { callId: string }) {
  const { call, timeline, agentName, loading, error } = useCallDetail(callId);
  const [mobileTab, setMobileTab] = useState<MobileTab>('overview');
  const [currentTime, setCurrentTime] = useState(0);
  const [syncEnabled, setSyncEnabled] = useState(true);
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
    <div className="flex flex-col gap-7 p-5">
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
      syncEnabled={syncEnabled}
      onSyncChange={setSyncEnabled}
      onSeek={onSeek}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CallDetailHeader call={call} />

      <div className="flex min-h-0 flex-1 flex-col px-8 py-5">
        {/* Mobile tabs — same control vocabulary as the rest of the app */}
        <div
          className="mb-3 flex flex-none gap-0.5 lg:hidden"
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
                aria-selected={on}
                onClick={() => setMobileTab(t.id)}
                className="rounded-[8px] px-3 py-1.5 text-[13px] font-[450] tracking-[-0.01em] transition-colors duration-[140ms]"
                style={{
                  color: on ? 'var(--color-accent)' : 'var(--color-text-muted)',
                  background: on ? 'var(--color-nav-active-bg)' : 'transparent',
                  border: `1px solid ${on ? 'var(--color-accent-hairline)' : 'transparent'}`,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Workspace — same bordered surface language as Call History table */}
        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[12px]"
          style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
        >
          <div className="hidden min-h-0 flex-1 lg:flex">
            <div
              className="min-h-0 w-[280px] flex-none overflow-hidden xl:w-[300px]"
              style={{ borderRight: '1px solid var(--color-border)' }}
            >
              <CallDetailsSidebar call={call} />
            </div>
            <div
              className="min-h-0 min-w-0 flex-1 overflow-y-auto"
              style={{ borderRight: '1px solid var(--color-border)' }}
            >
              {centerPanel}
            </div>
            <div className="flex min-h-0 w-[380px] flex-none flex-col overflow-hidden xl:w-[420px]">
              {transcript}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden lg:hidden">
            {mobileTab === 'details' && (
              <div className="h-full overflow-y-auto">
                <CallDetailsSidebar call={call} />
              </div>
            )}
            {mobileTab === 'overview' && (
              <div className="h-full overflow-y-auto">{centerPanel}</div>
            )}
            {mobileTab === 'transcript' && transcript}
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
        <div
          className="h-full animate-pulse rounded-[12px]"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
        />
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
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertCircle size={24} style={{ color: 'var(--color-state-error)' }} />
        <p className="text-[13.5px] font-[500]" style={{ color: 'var(--color-text)' }}>
          Could not load call
        </p>
        <p className="max-w-sm text-[12.5px]" style={{ color: 'var(--color-state-error)' }}>
          {message}
        </p>
        <Link href="/calls">
          <Button variant="ghost" size="sm">
            Back to Call History
          </Button>
        </Link>
      </div>
    </div>
  );
}
