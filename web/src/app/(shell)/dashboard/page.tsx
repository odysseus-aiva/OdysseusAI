'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import {
  RefreshCw,
  Phone,
  CheckCircle2,
  AlertCircle,
  Clock,
  Zap,
  DollarSign,
  ArrowRight,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { fetchStats, type CallStats } from '@/lib/api/calls';

export default function DashboardPage() {
  const [stats, setStats] = useState<CallStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await fetchStats({ period: 7 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Dashboard"
        description="Platform health at a glance — last 7 days."
        actions={
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={13} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-5xl flex flex-col gap-5">
          {loading ? (
            <DashboardSkeleton />
          ) : error ? (
            <ErrorPanel message={error} onRetry={load} />
          ) : stats ? (
            <DashboardContent stats={stats} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function DashboardContent({ stats }: { stats: CallStats }) {
  const successRate = stats.totalCalls > 0
    ? Math.round((stats.completedCalls / stats.totalCalls) * 100)
    : 0;

  return (
    <motion.div
      className="flex flex-col gap-5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Period label */}
      <p className="text-[11.5px] font-[500] uppercase tracking-[0.08em]" style={{ color: 'var(--color-text-faint)' }}>
        Last 7 days
      </p>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Total calls" value={stats.totalCalls} icon={Phone} iconColor="var(--color-accent)" />
        <StatTile
          label="Completed"
          value={stats.completedCalls}
          icon={CheckCircle2}
          iconColor="var(--color-state-speaking)"
          sub={stats.totalCalls > 0 ? `${successRate}% success rate` : undefined}
          subColor="var(--color-state-speaking)"
        />
        <StatTile
          label="Errors"
          value={stats.errorCalls}
          icon={AlertCircle}
          iconColor={stats.errorCalls > 0 ? 'var(--color-state-error)' : 'var(--color-text-faint)'}
          sub={stats.totalCalls > 0 ? `${Math.round(stats.errorRate * 100)}% error rate` : undefined}
          subColor={stats.errorCalls > 0 ? 'var(--color-state-error)' : 'var(--color-text-faint)'}
        />
        <StatTile
          label="Avg latency"
          value={stats.avgLatencyMs != null ? `${stats.avgLatencyMs}ms` : '—'}
          icon={Zap}
          iconColor="var(--color-text-faint)"
          sub={stats.p50LatencyMs != null ? `p50 ${stats.p50LatencyMs}ms` : undefined}
        />
        <StatTile
          label="Total cost"
          value={formatUsd(stats.totalCostUsd)}
          icon={DollarSign}
          iconColor="var(--color-state-speaking)"
          sub={stats.avgCostUsd != null ? `${formatUsd(stats.avgCostUsd)} / call` : undefined}
        />
      </div>

      {/* Call volume chart */}
      <div
        className="rounded-[12px] p-5"
        style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[13.5px] font-[500] tracking-[-0.01em]" style={{ color: 'var(--color-text)' }}>
              Call volume
            </p>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-faint)' }}>
              Calls per day, last 7 days
            </p>
          </div>
          <Link href="/analytics" className="flex items-center gap-1 group">
            <span
              className="text-[12px] font-[450] group-hover:opacity-80 transition-opacity"
              style={{ color: 'var(--color-accent)' }}
            >
              Full analytics
            </span>
            <ArrowRight size={11} strokeWidth={2} style={{ color: 'var(--color-accent)' }} />
          </Link>
        </div>
        <CallVolumeChart data={stats.callsPerDay} height={96} />
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-2 gap-4">
        <LatencyPanel p50={stats.p50LatencyMs} p95={stats.p95LatencyMs} avg={stats.avgLatencyMs} />
        <TopToolsPanel tools={stats.topTools} />
      </div>
    </motion.div>
  );
}

// ─── Stat tile ────────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  icon: Icon,
  iconColor,
  sub,
  subColor,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  iconColor: string;
  sub?: string;
  subColor?: string;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-[10px] p-4"
      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-[500] uppercase tracking-[0.07em]" style={{ color: 'var(--color-text-faint)' }}>
          {label}
        </span>
        <Icon size={14} strokeWidth={1.75} style={{ color: iconColor }} />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[26px] font-[600] tracking-[-0.04em] leading-none" style={{ color: 'var(--color-text)' }}>
          {value}
        </span>
        {sub && (
          <span className="text-[11.5px] font-[450]" style={{ color: subColor ?? 'var(--color-text-faint)' }}>
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Call volume bar chart ────────────────────────────────────────────────────

function CallVolumeChart({ data, height }: { data: { date: string; count: number }[]; height: number }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; count: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <span className="text-[12px]" style={{ color: 'var(--color-text-faint)' }}>No data</span>
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const vw = 700;
  const vh = height;
  const padTop = 8;
  const padBottom = 20;
  const chartH = vh - padTop - padBottom;
  const barW = Math.floor((vw / data.length) * 0.72);
  const barGap = (vw / data.length) * 0.28;

  return (
    <div className="relative select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${vw} ${vh}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height, display: 'block', overflow: 'visible' }}
      >
        {/* Gridlines — 2 horizontal at 50% and 100% */}
        {[0.5, 1].map((frac) => (
          <line
            key={frac}
            x1={0} y1={padTop + chartH * (1 - frac)}
            x2={vw} y2={padTop + chartH * (1 - frac)}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={1}
          />
        ))}

        {/* Bars */}
        {data.map((d, i) => {
          const barH = maxCount > 0 ? Math.max((d.count / maxCount) * chartH, d.count > 0 ? 3 : 0) : 0;
          const x = i * (vw / data.length) + barGap / 2;
          const y = padTop + chartH - barH;
          const isHov = hovered === i;

          return (
            <g key={d.date}>
              {/* Hit target (invisible, full height) */}
              <rect
                x={x - 2} y={padTop} width={barW + 4} height={chartH}
                fill="transparent"
                style={{ cursor: 'crosshair' }}
                onMouseEnter={(e) => {
                  setHovered(i);
                  const svg = svgRef.current;
                  if (svg) {
                    const rect = svg.getBoundingClientRect();
                    const relX = ((x + barW / 2) / vw) * rect.width;
                    setTooltip({ x: relX, y: 0, label: formatShortDate(d.date), count: d.count });
                  }
                }}
                onMouseLeave={() => { setHovered(null); setTooltip(null); }}
              />
              {/* Bar fill */}
              {barH > 0 && (
                <path
                  d={roundedTopRect(x, y, barW, barH, 2)}
                  fill={isHov ? 'var(--color-accent)' : 'rgba(56,232,255,0.45)'}
                  style={{ transition: 'fill 80ms' }}
                />
              )}
            </g>
          );
        })}

        {/* x-axis date labels — first, middle, last */}
        {[0, Math.floor(data.length / 2), data.length - 1].map((i) => {
          const d = data[i];
          if (!d) return null;
          const x = i * (vw / data.length) + barGap / 2 + barW / 2;
          return (
            <text
              key={`lbl-${i}`}
              x={x} y={vh - 2}
              textAnchor="middle"
              fontSize={10}
              fill="rgba(255,255,255,0.28)"
              fontFamily="var(--font-mono-var, monospace)"
            >
              {formatShortDate(d.date)}
            </text>
          );
        })}
      </svg>

      {/* Floating tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 px-2.5 py-1.5 rounded-[6px] text-[11.5px] font-[500] whitespace-nowrap"
          style={{
            left: tooltip.x,
            top: -36,
            transform: 'translateX(-50%)',
            background: 'var(--color-surface-elevated)',
            border: '1px solid var(--color-border-strong)',
            color: 'var(--color-text)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          {tooltip.label} — {tooltip.count} {tooltip.count === 1 ? 'call' : 'calls'}
        </div>
      )}
    </div>
  );
}

// ─── Latency panel ────────────────────────────────────────────────────────────

function LatencyPanel({ p50, p95, avg }: { p50: number | null; p95: number | null; avg: number | null }) {
  const latencyColor = (ms: number | null) => {
    if (ms == null) return 'var(--color-text-faint)';
    if (ms < 500) return 'var(--color-state-speaking)';
    if (ms < 1000) return 'var(--color-state-warning)';
    return 'var(--color-state-error)';
  };

  return (
    <div
      className="rounded-[10px] p-4 flex flex-col gap-3"
      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
    >
      <p className="text-[12px] font-[500] uppercase tracking-[0.07em]" style={{ color: 'var(--color-text-faint)' }}>
        Response latency
      </p>
      <div className="flex flex-col gap-2">
        {[
          { label: 'Average', value: avg },
          { label: 'p50', value: p50 },
          { label: 'p95', value: p95 },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-[12.5px]" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
            <span className="text-[13px] font-[600] font-mono tracking-[-0.02em]" style={{ color: latencyColor(value) }}>
              {value != null ? `${value}ms` : '—'}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[11px]" style={{ color: 'var(--color-text-faint)' }}>
        End-to-end response time (STT + LLM + TTS)
      </p>
    </div>
  );
}

// ─── Top tools panel ──────────────────────────────────────────────────────────

function TopToolsPanel({ tools }: { tools: { name: string; count: number }[] }) {
  const max = tools[0]?.count ?? 1;

  return (
    <div
      className="rounded-[10px] p-4 flex flex-col gap-3"
      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
    >
      <p className="text-[12px] font-[500] uppercase tracking-[0.07em]" style={{ color: 'var(--color-text-faint)' }}>
        Top tools used
      </p>
      {tools.length === 0 ? (
        <p className="text-[12.5px]" style={{ color: 'var(--color-text-faint)' }}>No tool calls recorded yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {tools.slice(0, 5).map(({ name, count }) => (
            <div key={name} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-mono truncate" style={{ color: 'var(--color-text-muted)', maxWidth: '75%' }}>
                  {name}
                </span>
                <span className="text-[11.5px] font-[500] font-mono" style={{ color: 'var(--color-text-faint)' }}>
                  {count}
                </span>
              </div>
              <div className="h-[3px] rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round((count / max) * 100)}%`,
                    background: 'var(--color-accent)',
                    opacity: 0.65,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Error / skeleton ─────────────────────────────────────────────────────────

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="flex flex-col items-center gap-3 py-12 rounded-[12px] text-center"
      style={{ border: '1px dashed var(--color-border)' }}
    >
      <p className="text-[13px] font-[500]" style={{ color: 'var(--color-state-error)' }}>{message}</p>
      <Button variant="ghost" size="sm" onClick={onRetry}>Try again</Button>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-[96px] rounded-[10px] animate-pulse" style={{ background: 'var(--color-surface-raised)' }} />
        ))}
      </div>
      <div className="h-[160px] rounded-[12px] animate-pulse" style={{ background: 'var(--color-surface-raised)' }} />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-[140px] rounded-[10px] animate-pulse" style={{ background: 'var(--color-surface-raised)' }} />
        <div className="h-[140px] rounded-[10px] animate-pulse" style={{ background: 'var(--color-surface-raised)' }} />
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Sub-cent totals need more precision than a plain currency format. */
function formatUsd(usd: number): string {
  if (!usd) return '$0';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  if (usd < 100) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd)}`;
}

function roundedTopRect(x: number, y: number, w: number, h: number, r: number): string {
  const safe = Math.min(r, w / 2, h);
  return [
    `M ${x + safe} ${y}`,
    `H ${x + w - safe}`,
    `Q ${x + w} ${y} ${x + w} ${y + safe}`,
    `V ${y + h}`,
    `H ${x}`,
    `V ${y + safe}`,
    `Q ${x} ${y} ${x + safe} ${y}`,
    'Z',
  ].join(' ');
}

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}
