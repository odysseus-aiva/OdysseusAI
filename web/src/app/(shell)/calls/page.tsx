'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PhoneCall, PhoneOff, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { fetchCalls, type CallSummary, type CallAnalysis } from '@/lib/api/calls';
import type { CallStatus } from '@/lib/types/call-log';

const PAGE_SIZE = 50;

export default function CallHistoryPage() {
  const [calls, setCalls]   = useState<CallSummary[]>([]);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  const load = useCallback(async (off = 0) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCalls({ limit: PAGE_SIZE, offset: off });
      setCalls(res.calls);
      setTotal(res.total);
      setOffset(off);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load call history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(0); }, [load]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const page       = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Call History"
        description="Every completed voice session, with latency metrics and status."
        actions={
          <Button variant="ghost" size="sm" onClick={() => void load(offset)} disabled={loading}>
            <RefreshCw size={13} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-4xl flex flex-col gap-4">

          {/* Summary strip */}
          {!loading && !error && total > 0 && (
            <p className="text-[12px]" style={{ color: 'var(--color-text-faint)' }}>
              {total} {total === 1 ? 'call' : 'calls'} total
            </p>
          )}

          {loading ? (
            <CallsSkeleton />
          ) : error ? (
            <ErrorPanel message={error} onRetry={() => void load(offset)} />
          ) : calls.length === 0 ? (
            <EmptyCalls />
          ) : (
            <>
              <div
                className="rounded-[12px] overflow-hidden"
                style={{ border: '1px solid var(--color-border)' }}
              >
                {/* Table header */}
                <div
                  className="grid gap-4 px-4 py-2.5"
                  style={{
                    gridTemplateColumns: '1fr 140px 110px 70px 80px 70px 80px',
                    background: 'var(--color-surface)',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
                  {['Call', 'Agent', 'Status', 'Turns', 'Duration', 'Cost', 'Started'].map((h) => (
                    <span key={h} className="text-[11px] font-[500] uppercase tracking-[0.08em]" style={{ color: 'var(--color-text-faint)' }}>
                      {h}
                    </span>
                  ))}
                </div>

                {/* Rows */}
                <ul>
                  {calls.map((call, i) => (
                    <li key={call.callId} style={{ borderTop: i === 0 ? undefined : '1px solid var(--color-border)' }}>
                      <Link href={`/calls/${encodeURIComponent(call.callId)}`}>
                        <CallRow call={call} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[12px]" style={{ color: 'var(--color-text-faint)' }}>
                    Page {page} of {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost" size="sm"
                      disabled={offset === 0}
                      onClick={() => void load(Math.max(0, offset - PAGE_SIZE))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      disabled={offset + PAGE_SIZE >= total}
                      onClick={() => void load(offset + PAGE_SIZE)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function CallRow({ call }: { call: CallSummary }) {
  const agentName = call.agentSnapshot?.name ?? (call.agentId ? call.agentId.slice(0, 8) + '…' : '—');

  return (
    <div
      className="group grid gap-4 px-4 py-3 transition-colors duration-[140ms] cursor-pointer"
      style={{
        gridTemplateColumns: '1fr 140px 110px 70px 80px 70px 80px',
        background: 'var(--color-surface-raised)',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--color-surface-elevated)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--color-surface-raised)'; }}
    >
      {/* Call ID + summary */}
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[12px] font-mono truncate" style={{ color: 'var(--color-text)' }}>
          {call.callId.slice(0, 8)}…
        </span>
        {call.analysis?.summary ? (
          <span className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>
            {call.analysis.summary}
          </span>
        ) : (
          <span className="text-[11px] truncate" style={{ color: 'var(--color-text-faint)' }}>
            {call.roomName}
          </span>
        )}
      </div>

      {/* Agent */}
      <div className="flex items-center min-w-0">
        <span className="text-[12.5px] truncate" style={{ color: 'var(--color-text-muted)' }}>
          {agentName}
        </span>
      </div>

      {/* Status */}
      <div className="flex items-center">
        <StatusBadge status={call.status} endedBy={call.endedBy} />
      </div>

      {/* Turns */}
      <div className="flex items-center">
        <span className="text-[12.5px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
          {call.turnCount > 0 ? call.turnCount : '—'}
        </span>
      </div>

      {/* Duration */}
      <div className="flex items-center">
        <span className="text-[12.5px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
          {call.durationMs != null ? formatDuration(call.durationMs) : '—'}
        </span>
      </div>

      {/* Cost */}
      <div className="flex items-center">
        <span className="text-[12.5px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
          {call.cost?.totalUsd != null ? formatCost(call.cost.totalUsd) : '—'}
        </span>
      </div>

      {/* Started */}
      <div className="flex items-center">
        <span className="text-[12px]" style={{ color: 'var(--color-text-faint)' }}>
          {formatRelative(call.createdAt)}
        </span>
      </div>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<CallStatus, { label: string; color: string; icon: React.ElementType }> = {
  completed:   { label: 'Completed',   color: 'var(--color-state-speaking)', icon: PhoneOff },
  in_progress: { label: 'In progress', color: 'var(--color-accent)',         icon: PhoneCall },
  error:       { label: 'Error',       color: 'var(--color-state-error)',     icon: AlertCircle },
};

function StatusBadge({ status, endedBy }: { status: CallStatus; endedBy?: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.error;
  const Icon = cfg.icon;
  const label = endedBy === 'agent' ? 'Agent ended' : cfg.label;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-[500]" style={{ color: cfg.color }}>
      <Icon size={11} strokeWidth={2.2} />
      {label}
    </span>
  );
}

// ─── Empty / error / skeleton ─────────────────────────────────────────────────

function EmptyCalls() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 py-16 rounded-[12px] text-center"
      style={{ border: '1px dashed var(--color-border)' }}
    >
      <div
        className="flex items-center justify-center rounded-full"
        style={{ width: 44, height: 44, background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
      >
        <Clock size={18} style={{ color: 'var(--color-text-faint)' }} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[14px] font-[500]" style={{ color: 'var(--color-text)' }}>No calls yet</p>
        <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
          Completed voice sessions will appear here.
        </p>
      </div>
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-12 rounded-[12px] text-center"
      style={{ border: '1px dashed var(--color-border)' }}
    >
      <p className="text-[13.5px] font-[500]" style={{ color: 'var(--color-text)' }}>Could not load call history</p>
      <p className="text-[13px]" style={{ color: 'var(--color-state-error)' }}>{message}</p>
      <Button variant="ghost" size="sm" onClick={onRetry}>Try again</Button>
    </div>
  );
}

function CallsSkeleton() {
  return (
    <div
      className="rounded-[12px] overflow-hidden"
      style={{ border: '1px solid var(--color-border)' }}
    >
      <div style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', height: 38 }} />
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="animate-pulse"
          style={{
            height: 52,
            background: 'var(--color-surface-raised)',
            borderTop: i > 0 ? '1px solid var(--color-border)' : undefined,
          }}
        />
      ))}
    </div>
  );
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatCost(usd: number): string {
  if (usd === 0) return '$0';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), rem = s % 60;
  return `${m}m ${rem}s`;
}

function formatRelative(epochMs: number): string {
  const diff = Date.now() - epochMs;
  const s = Math.round(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(epochMs).toLocaleDateString();
}

