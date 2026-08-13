'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import {
  AlertCircle,
  ArrowRight,
  Clock,
  DollarSign,
  MessageSquare,
  Phone,
  RefreshCw,
  Wrench,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { AreaChart } from '@/components/charts/AreaChart';
import { ChartCard, EmptyChart, SampleBadge } from '@/components/charts/ChartCard';
import { CompositionBar, HBarList } from '@/components/charts/HBarList';
import { HeroKPI } from '@/components/charts/HeroKPI';
import {
  formatMs,
  formatPct,
  formatUsd,
  latencyColor,
  OUTCOME_COLORS,
  STAGE_COLORS,
} from '@/components/charts/format';
import {
  fetchLatencyAnalytics,
  fetchStats,
  fetchToolAnalytics,
  type CallStats,
  type LatencyAnalytics,
  type ToolAnalytics,
} from '@/lib/api/calls';

const PERIODS = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
] as const;

interface DashboardData {
  stats: CallStats;
  latency: LatencyAnalytics;
  tools: ToolAnalytics;
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<7 | 30 | 90>(7);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const [stats, latency, tools] = await Promise.all([
        fetchStats({ period: p }),
        fetchLatencyAnalytics({ period: p }),
        fetchToolAnalytics({ period: p }),
      ]);
      setData({ stats, latency, tools });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [load, period]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Dashboard"
        description="Platform health at a glance."
        actions={
          <div className="flex items-center gap-2">
            <PeriodSelector value={period} onChange={setPeriod} />
            <Button variant="ghost" size="sm" onClick={() => void load(period)} disabled={loading}>
              <RefreshCw size={13} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="flex max-w-5xl flex-col gap-5">
          {loading ? (
            <DashboardSkeleton />
          ) : error ? (
            <ErrorPanel message={error} onRetry={() => void load(period)} />
          ) : data ? (
            <DashboardContent data={data} period={period} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DashboardContent({ data, period }: { data: DashboardData; period: number }) {
  const { stats, latency, tools } = data;
  const engaged = stats.outcomeMix.find((o) => o.outcome === 'engaged')?.count ?? 0;
  const noInteraction = stats.outcomeMix.find((o) => o.outcome === 'no_interaction')?.count ?? 0;

  const volumePoints = stats.series.points.map((p) => ({
    date: p.date,
    values: { engaged: p.engaged, noInteraction: p.noInteraction, failed: p.failed },
  }));

  return (
    <motion.div
      className="flex flex-col gap-5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Row 1: KPI tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <HeroKPI
          label="Total calls"
          value={stats.totalCalls}
          icon={Phone}
          iconColor="var(--color-accent)"
          delta={stats.deltas.totalCalls}
          formatDeltaFn={(d) => `${d > 0 ? '+' : ''}${d}`}
        />
        <HeroKPI
          label="Engaged"
          value={formatPct(stats.engagementRate)}
          sub={`${engaged} conversed`}
          icon={MessageSquare}
          iconColor="var(--color-state-speaking)"
          delta={stats.deltas.engagementRate}
          formatDeltaFn={(d) => `${d > 0 ? '+' : ''}${(d * 100).toFixed(1)}pp`}
        />
        <HeroKPI
          label="No interaction"
          value={noInteraction}
          sub="connected, never spoke"
          icon={AlertCircle}
          iconColor={noInteraction > 0 ? 'var(--color-state-warning)' : 'var(--color-text-faint)'}
        />
        <HeroKPI
          label="p50 latency"
          value={formatMs(stats.p50LatencyMs)}
          valueColor={latencyColor(stats.p50LatencyMs)}
          sub={stats.p95LatencyMs != null ? `p95 ${formatMs(stats.p95LatencyMs)}` : undefined}
          icon={Clock}
          iconColor={latencyColor(stats.p50LatencyMs)}
          delta={stats.deltas.p50LatencyMs}
          lowerIsBetter
          formatDeltaFn={(d) => `${d > 0 ? '+' : ''}${Math.round(d)}ms`}
        />
        <HeroKPI
          label="Cost / call"
          value={formatUsd(stats.avgCostUsd)}
          sub={`${formatUsd(stats.totalCostUsd)} total`}
          icon={DollarSign}
          iconColor="var(--color-state-speaking)"
          delta={stats.deltas.avgCostUsd}
          lowerIsBetter
          formatDeltaFn={(d) => `${d > 0 ? '+' : ''}${(d * 1000).toFixed(2)}m$`}
        />
      </div>

      {/* Row 2: Call volume area chart */}
      <ChartCard
        title="Call volume by outcome"
        sub={`Calls per ${stats.series.bucket} — last ${period} days`}
        trailing={
          <Link href="/analytics" className="group flex items-center gap-1">
            <span
              className="text-[12px] font-[450] transition-opacity group-hover:opacity-80"
              style={{ color: 'var(--color-accent)' }}
            >
              Full analytics
            </span>
            <ArrowRight size={11} strokeWidth={2} style={{ color: 'var(--color-accent)' }} />
          </Link>
        }
        footnote="Engaged means the call produced at least one agent response turn."
      >
        <AreaChart
          height={140}
          points={volumePoints}
          series={[
            { key: 'engaged', label: 'Engaged', color: OUTCOME_COLORS.engaged },
            { key: 'noInteraction', label: 'No interaction', color: OUTCOME_COLORS.no_interaction },
            { key: 'failed', label: 'Failed', color: OUTCOME_COLORS.failed },
          ]}
        />
      </ChartCard>

      {/* Row 3: Latency decomposition + tool usage */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Latency decomposition"
          sub="Average time per stage"
          trailing={<SampleBadge n={latency.samples.turns} reliable={latency.samples.reliable} />}
          footnote="Unaccounted is end-to-end response time minus the three measured stages."
        >
          {latency.samples.turns > 0 ? (
            <CompositionBar
              segments={[
                {
                  label: 'STT',
                  value: latency.stages.stt.avg ?? 0,
                  color: STAGE_COLORS.stt,
                  display: formatMs(latency.stages.stt.avg),
                },
                {
                  label: 'LLM',
                  value: latency.stages.llm.avg ?? 0,
                  color: STAGE_COLORS.llm,
                  display: formatMs(latency.stages.llm.avg),
                },
                {
                  label: 'TTS',
                  value: latency.stages.tts.avg ?? 0,
                  color: STAGE_COLORS.tts,
                  display: formatMs(latency.stages.tts.avg),
                },
                {
                  label: 'Unaccounted',
                  value: Math.max(latency.stages.unaccounted.avg ?? 0, 0),
                  color: STAGE_COLORS.unaccounted,
                  display: formatMs(latency.stages.unaccounted.avg),
                },
              ]}
            />
          ) : (
            <EmptyChart height={120} label="No instrumented turns in this period" />
          )}
        </ChartCard>

        <ChartCard
          title="Tool usage"
          sub={
            tools.totals.invocations > 0
              ? `${tools.totals.invocations} invocations · ${formatPct(tools.totals.successRate)} success`
              : 'Executions, not enabled configuration'
          }
          trailing={<Wrench size={13} strokeWidth={1.75} style={{ color: 'var(--color-text-faint)' }} />}
          footnote="Sourced from tool_call and tool_result events."
        >
          <HBarList
            labelWidth={140}
            emptyLabel="No tools invoked in this period"
            rows={tools.tools.slice(0, 5).map((tool) => ({
              label: tool.name,
              value: tool.invocations,
              display: String(tool.invocations),
              note: tool.successRate != null ? formatPct(tool.successRate) : undefined,
            }))}
          />
        </ChartCard>
      </div>
    </motion.div>
  );
}

function PeriodSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (p: 7 | 30 | 90) => void;
}) {
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

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-[12px] py-12 text-center"
      style={{ border: '1px dashed var(--color-border)' }}
    >
      <p className="text-[13px] font-[500]" style={{ color: 'var(--color-state-error)' }}>
        {message}
      </p>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="h-[110px] animate-pulse rounded-[12px]"
            style={{ background: 'var(--color-surface-raised)' }}
          />
        ))}
      </div>
      <div
        className="h-[220px] animate-pulse rounded-[12px]"
        style={{ background: 'var(--color-surface-raised)' }}
      />
      <div className="grid grid-cols-2 gap-4">
        <div
          className="h-[180px] animate-pulse rounded-[12px]"
          style={{ background: 'var(--color-surface-raised)' }}
        />
        <div
          className="h-[180px] animate-pulse rounded-[12px]"
          style={{ background: 'var(--color-surface-raised)' }}
        />
      </div>
    </div>
  );
}
