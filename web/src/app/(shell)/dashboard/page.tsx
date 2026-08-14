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
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Section';
import { AreaChart } from '@/components/charts/AreaChart';
import { ChartCard, EmptyChart, SampleBadge } from '@/components/charts/ChartCard';
import { CompositionBar, HBarList } from '@/components/charts/HBarList';
import { HeroKPI } from '@/components/charts/HeroKPI';
import {
  formatMs,
  formatPct,
  formatUsd,
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

type PeriodKey = '7' | '30' | '90';

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: '7', label: '7d' },
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
];

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
    <div>
      {/* No divider under the header: the title runs straight into the content. */}
      <header className="page__header">
        <div className="min-w-0">
          <h1 className="page__title">Dashboard</h1>
          <p className="page__meta mt-1">Platform health at a glance.</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <SegmentedControl
            value={String(period) as PeriodKey}
            options={PERIOD_OPTIONS}
            onChange={(next) => setPeriod(Number(next) as 7 | 30 | 90)}
            label="Time period"
          />
          <Button variant="ghost" size="sm" onClick={() => void load(period)} disabled={loading}>
            <RefreshCw
              size={16}
              strokeWidth={2}
              aria-hidden="true"
              className={loading ? 'animate-spin' : ''}
            />
            Refresh
          </Button>
        </div>
      </header>

      <div className="page__body">
        <div className="flex max-w-5xl flex-col gap-6" aria-live="polite" aria-busy={loading}>
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
      className="flex flex-col gap-6"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Row 1: KPI tiles */}
      <div className="stat-row">
        <HeroKPI
          label="Total calls"
          value={stats.totalCalls}
          icon={Phone}
          iconColor="var(--fg-muted)"
          delta={stats.deltas.totalCalls}
          formatDeltaFn={(d) => `${d > 0 ? '+' : ''}${d}`}
        />
        <HeroKPI
          label="Engaged"
          value={formatPct(stats.engagementRate)}
          sub={`${engaged} conversed`}
          icon={MessageSquare}
          iconColor="var(--fg-muted)"
          delta={stats.deltas.engagementRate}
          formatDeltaFn={(d) => `${d > 0 ? '+' : ''}${(d * 100).toFixed(1)}pp`}
        />
        <HeroKPI
          label="No interaction"
          value={noInteraction}
          sub="connected, never spoke"
          icon={AlertCircle}
          iconColor="var(--fg-muted)"
        />
        <HeroKPI
          label="p50 latency"
          value={formatMs(stats.p50LatencyMs)}
          sub={stats.p95LatencyMs != null ? `p95 ${formatMs(stats.p95LatencyMs)}` : undefined}
          icon={Clock}
          iconColor="var(--fg-muted)"
          delta={stats.deltas.p50LatencyMs}
          lowerIsBetter
          formatDeltaFn={(d) => `${d > 0 ? '+' : ''}${Math.round(d)}ms`}
        />
        <HeroKPI
          label="Cost / call"
          value={formatUsd(stats.avgCostUsd)}
          sub={`${formatUsd(stats.totalCostUsd)} total`}
          icon={DollarSign}
          iconColor="var(--fg-muted)"
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
          <Link href="/analytics" className="btn btn--ghost btn--sm">
            Full analytics
            <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
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
          trailing={
            <Wrench size={16} strokeWidth={1.75} aria-hidden="true" style={{ color: 'var(--fg-muted)' }} />
          }
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

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <EmptyState
      icon={AlertCircle}
      title="Could not load the dashboard"
      description={message}
      action={
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}

/* Reserves each band's height with a flat fill. No shimmer: a moving highlight
   would be the only animated gradient anywhere outside the orb. */
function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <div className="stat-row">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="stat" style={{ height: 108 }} />
        ))}
      </div>
      <SkeletonCard height={240} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SkeletonCard height={200} />
        <SkeletonCard height={200} />
      </div>
    </div>
  );
}

function SkeletonCard({ height }: { height: number }) {
  return (
    <div
      style={{
        height,
        background: 'var(--surface-card)',
        border: '1px solid var(--line-hairline)',
        borderRadius: 'var(--radius-md)',
      }}
    />
  );
}
