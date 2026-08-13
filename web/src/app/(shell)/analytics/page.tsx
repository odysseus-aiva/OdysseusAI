'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { RefreshCw, TrendingUp, Clock, CheckCircle2, AlertCircle, DollarSign } from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { fetchStats, type CallStats } from '@/lib/api/calls';

const PERIODS = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
] as const;

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<7 | 30 | 90>(7);
  const [stats, setStats] = useState<CallStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      setStats(await fetchStats({ period: p }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(period); }, [load, period]);

  const handlePeriod = (p: 7 | 30 | 90) => {
    setPeriod(p);
    void load(p);
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Analytics"
        description="Call trends, latency distribution, and tool usage."
        actions={
          <div className="flex items-center gap-2">
            <PeriodSelector value={period} onChange={handlePeriod} />
            <Button variant="ghost" size="sm" onClick={() => void load(period)} disabled={loading}>
              <RefreshCw size={13} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-5xl flex flex-col gap-5">
          {loading ? (
            <AnalyticsSkeleton />
          ) : error ? (
            <ErrorPanel message={error} onRetry={() => void load(period)} />
          ) : stats ? (
            <AnalyticsContent stats={stats} period={period} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Period selector ──────────────────────────────────────────────────────────

function PeriodSelector({ value, onChange }: { value: number; onChange: (p: 7 | 30 | 90) => void }) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-[8px] p-0.5"
      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
    >
      {PERIODS.map(({ label, value: v }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className="rounded-[6px] px-3 py-1.5 text-[12px] font-[500] transition-all duration-[140ms]"
          style={{
            background: value === v ? 'var(--color-surface-elevated)' : 'transparent',
            color: value === v ? 'var(--color-text)' : 'var(--color-text-faint)',
            border: value === v ? '1px solid var(--color-border-strong)' : '1px solid transparent',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function AnalyticsContent({ stats, period }: { stats: CallStats; period: number }) {
  return (
    <motion.div
      className="flex flex-col gap-5"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MiniStat
          label="Total calls"
          value={stats.totalCalls}
          icon={TrendingUp}
          iconColor="var(--color-accent)"
        />
        <MiniStat
          label="Completed"
          value={`${stats.totalCalls > 0 ? Math.round((stats.completedCalls / stats.totalCalls) * 100) : 0}%`}
          icon={CheckCircle2}
          iconColor="var(--color-state-speaking)"
          sub={`${stats.completedCalls} calls`}
        />
        <MiniStat
          label="Error rate"
          value={`${Math.round(stats.errorRate * 100)}%`}
          icon={AlertCircle}
          iconColor={stats.errorCalls > 0 ? 'var(--color-state-error)' : 'var(--color-text-faint)'}
          sub={`${stats.errorCalls} errors`}
        />
        <MiniStat
          label="p50 latency"
          value={stats.p50LatencyMs != null ? `${stats.p50LatencyMs}ms` : '—'}
          icon={Clock}
          iconColor={latencyColor(stats.p50LatencyMs)}
          sub={stats.p95LatencyMs != null ? `p95 ${stats.p95LatencyMs}ms` : undefined}
        />
        <MiniStat
          label="Total cost"
          value={formatUsd(stats.totalCostUsd)}
          icon={DollarSign}
          iconColor="var(--color-state-speaking)"
          sub={stats.avgCostUsd != null ? `${formatUsd(stats.avgCostUsd)} / call` : undefined}
        />
      </div>

      {/* Call volume chart */}
      <ChartCard
        title="Call volume"
        sub={`Calls per day — last ${period} days`}
      >
        <VolumeBarChart data={stats.callsPerDay} />
      </ChartCard>

      {/* Bottom row */}
      <div className="grid grid-cols-2 gap-4">
        <ChartCard title="Status breakdown" sub="Share of call outcomes">
          <StatusDonut
            completed={stats.completedCalls}
            errors={stats.errorCalls}
            inProgress={stats.inProgressCalls}
          />
        </ChartCard>

        <ChartCard title="Latency percentiles" sub="Response time distribution">
          <LatencyBars
            avg={stats.avgLatencyMs}
            p50={stats.p50LatencyMs}
            p95={stats.p95LatencyMs}
          />
        </ChartCard>
      </div>

      {/* Top tools */}
      {stats.topTools.length > 0 && (
        <ChartCard title="Tool usage" sub={`Top tools invoked — last ${period} days`}>
          <ToolsBarChart tools={stats.topTools} />
        </ChartCard>
      )}
    </motion.div>
  );
}

// ─── Chart card wrapper ───────────────────────────────────────────────────────

function ChartCard({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-[12px] p-5"
      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
    >
      <div className="mb-4">
        <p className="text-[13.5px] font-[500] tracking-[-0.01em]" style={{ color: 'var(--color-text)' }}>
          {title}
        </p>
        <p className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-faint)' }}>{sub}</p>
      </div>
      {children}
    </div>
  );
}

// ─── Mini stat ────────────────────────────────────────────────────────────────

function MiniStat({
  label,
  value,
  icon: Icon,
  iconColor,
  sub,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  iconColor: string;
  sub?: string;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-[10px] p-4"
      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-[500] uppercase tracking-[0.07em]" style={{ color: 'var(--color-text-faint)' }}>
          {label}
        </span>
        <Icon size={13} strokeWidth={1.75} style={{ color: iconColor }} />
      </div>
      <div>
        <span className="text-[24px] font-[600] tracking-[-0.04em] leading-none" style={{ color: 'var(--color-text)' }}>
          {value}
        </span>
        {sub && (
          <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-faint)' }}>{sub}</p>
        )}
      </div>
    </div>
  );
}

// ─── Volume bar chart ─────────────────────────────────────────────────────────

function VolumeBarChart({ data }: { data: { date: string; count: number }[] }) {
  const [tooltip, setTooltip] = useState<{ x: number; label: string; count: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (data.length === 0) {
    return <EmptyChart />;
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const vw = 800;
  const vh = 110;
  const padTop = 8;
  const padBottom = 20;
  const chartH = vh - padTop - padBottom;
  const labelEvery = data.length <= 7 ? 1 : data.length <= 14 ? 2 : data.length <= 31 ? 7 : 14;

  return (
    <div className="relative select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${vw} ${vh}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: 110, display: 'block', overflow: 'visible' }}
      >
        {[0.25, 0.5, 0.75, 1].map((frac) => (
          <line
            key={frac}
            x1={0} y1={padTop + chartH * (1 - frac)}
            x2={vw} y2={padTop + chartH * (1 - frac)}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={1}
          />
        ))}

        {data.map((d, i) => {
          const colW = vw / data.length;
          const barW = Math.max(Math.floor(colW * 0.7), 2);
          const barGapLeft = Math.floor((colW - barW) / 2);
          const barH = (d.count / maxCount) * chartH;
          const x = i * colW + barGapLeft;
          const y = padTop + chartH - barH;
          const isHov = tooltip !== null && formatShortDate(d.date) === tooltip.label;

          return (
            <g key={d.date}>
              <rect
                x={x - 2} y={padTop} width={barW + 4} height={chartH}
                fill="transparent"
                style={{ cursor: 'crosshair' }}
                onMouseEnter={() => {
                  const svg = svgRef.current;
                  if (svg) {
                    const svgRect = svg.getBoundingClientRect();
                    setTooltip({ x: ((x + barW / 2) / vw) * svgRect.width, label: formatShortDate(d.date), count: d.count });
                  }
                }}
                onMouseLeave={() => setTooltip(null)}
              />
              {barH > 0 && (
                <path
                  d={roundedTopRect(x, y, barW, Math.max(barH, 3), 2)}
                  fill={isHov ? 'var(--color-accent)' : 'rgba(56,232,255,0.4)'}
                  style={{ transition: 'fill 80ms' }}
                />
              )}
              {i % labelEvery === 0 && (
                <text
                  x={x + barW / 2} y={vh - 3}
                  textAnchor="middle"
                  fontSize={9}
                  fill="rgba(255,255,255,0.26)"
                  fontFamily="var(--font-mono-var, monospace)"
                >
                  {formatShortDate(d.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

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

// ─── Status donut ─────────────────────────────────────────────────────────────

function StatusDonut({ completed, errors, inProgress }: { completed: number; errors: number; inProgress: number }) {
  const total = completed + errors + inProgress;

  if (total === 0) {
    return <EmptyChart height={100} />;
  }

  const cx = 60;
  const cy = 60;
  const r = 44;
  const strokeW = 10;
  const circumference = 2 * Math.PI * r;

  const segments = [
    { label: 'Completed',   count: completed,  color: 'var(--color-state-speaking)' },
    { label: 'Errors',      count: errors,     color: 'var(--color-state-error)' },
    { label: 'In progress', count: inProgress, color: 'var(--color-accent)' },
  ].filter((s) => s.count > 0);

  let offset = 0;
  const arcs = segments.map((seg) => {
    const frac = seg.count / total;
    const dash = frac * circumference;
    const arc = { ...seg, dash, offset };
    offset += dash + 1;
    return arc;
  });

  return (
    <div className="flex items-center gap-6">
      <svg width={120} height={120} viewBox="0 0 120 120" style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={strokeW} />
        {arcs.map((arc) => (
          <circle
            key={arc.label}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={arc.color}
            strokeWidth={strokeW}
            strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
            strokeDashoffset={-arc.offset}
            strokeLinecap="butt"
            transform="rotate(-90 60 60)"
            style={{ opacity: 0.85 }}
          />
        ))}
        <text x={cx} y={cy - 5} textAnchor="middle" fontSize={18} fontWeight={600} fill="var(--color-text)" fontFamily="var(--font-display, sans-serif)">
          {total}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.35)" fontFamily="var(--font-mono-var, monospace)">
          CALLS
        </text>
      </svg>

      <div className="flex flex-col gap-2.5">
        {segments.map(({ label, count, color }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="rounded-full flex-shrink-0" style={{ width: 8, height: 8, background: color }} />
            <span className="text-[12.5px]" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
            <span className="text-[12.5px] font-[600] font-mono ml-auto pl-3" style={{ color: 'var(--color-text)' }}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Latency bars ─────────────────────────────────────────────────────────────

function LatencyBars({ avg, p50, p95 }: { avg: number | null; p50: number | null; p95: number | null }) {
  const items = [
    { label: 'Average', value: avg },
    { label: 'p50 (median)', value: p50 },
    { label: 'p95', value: p95 },
  ];

  const max = Math.max(...items.map((i) => i.value ?? 0), 1);

  if (items.every((i) => i.value == null)) {
    return <EmptyChart height={80} label="No latency data yet" />;
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map(({ label, value }) => (
        <div key={label} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
            <span className="text-[12.5px] font-[600] font-mono" style={{ color: latencyColor(value) }}>
              {value != null ? `${value}ms` : '—'}
            </span>
          </div>
          <div className="h-[5px] rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
            <div
              className="h-full w-full rounded-full origin-left"
              style={{
                transform: `scaleX(${value != null ? value / max : 0})`,
                background: latencyColor(value),
                opacity: 0.8,
                transition: 'transform 400ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          </div>
        </div>
      ))}
      <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-faint)' }}>
        &lt; 500ms good · 500–1000ms acceptable · &gt; 1000ms degraded
      </p>
    </div>
  );
}

// ─── Tools bar chart ──────────────────────────────────────────────────────────

function ToolsBarChart({ tools }: { tools: { name: string; count: number }[] }) {
  const max = tools[0]?.count ?? 1;

  return (
    <div className="flex flex-col gap-2">
      {tools.map(({ name, count }) => (
        <div key={name} className="flex items-center gap-3">
          <span
            className="text-[12px] font-mono flex-shrink-0"
            style={{
              color: 'var(--color-text-muted)',
              width: 160,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </span>
          <div className="flex-1 h-[5px] rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
            <div
              className="h-full w-full rounded-full origin-left"
              style={{
                transform: `scaleX(${count / max})`,
                background: 'rgba(56,232,255,0.55)',
                transition: 'transform 400ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          </div>
          <span
            className="text-[12px] font-[500] font-mono flex-shrink-0"
            style={{ color: 'var(--color-text-faint)', width: 32, textAlign: 'right' }}
          >
            {count}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Empty / skeleton / error ─────────────────────────────────────────────────

function EmptyChart({ height = 80, label = 'No data for this period' }: { height?: number; label?: string }) {
  return (
    <div className="flex items-center justify-center" style={{ height }}>
      <span className="text-[12px]" style={{ color: 'var(--color-text-faint)' }}>{label}</span>
    </div>
  );
}

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

function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-[88px] rounded-[10px] animate-pulse" style={{ background: 'var(--color-surface-raised)' }} />
        ))}
      </div>
      <div className="h-[172px] rounded-[12px] animate-pulse" style={{ background: 'var(--color-surface-raised)' }} />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-[180px] rounded-[12px] animate-pulse" style={{ background: 'var(--color-surface-raised)' }} />
        <div className="h-[180px] rounded-[12px] animate-pulse" style={{ background: 'var(--color-surface-raised)' }} />
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUsd(usd: number): string {
  if (!usd) return '$0';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  if (usd < 100) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd)}`;
}

function latencyColor(ms: number | null): string {
  if (ms == null) return 'var(--color-text-faint)';
  if (ms < 500) return 'var(--color-state-speaking)';
  if (ms < 1000) return 'var(--color-state-warning)';
  return 'var(--color-state-error)';
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
