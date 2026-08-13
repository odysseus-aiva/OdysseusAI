'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  Clock,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { AreaChart } from '@/components/charts/AreaChart';
import { ChartCard, EmptyChart, SampleBadge } from '@/components/charts/ChartCard';
import { HeroKPI } from '@/components/charts/HeroKPI';
import { Donut } from '@/components/charts/Donut';
import {
  formatCount,
  formatDuration,
  formatMs,
  formatPct,
  formatUsd,
  latencyColor,
  OUTCOME_COLORS,
  OUTCOME_LABELS,
  SENTIMENT_COLORS,
  STAGE_COLORS,
} from '@/components/charts/format';
import { fetchAgents, type Agent } from '@/lib/api/agents';
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

const ENDED_BY_LABELS: Record<string, string> = {
  participant: 'User hung up',
  agent: 'Agent ended',
  timeout: 'Timed out',
  error: 'Error',
  unknown: 'Unknown',
};

const DISCONNECT_COLORS = [
  'var(--color-accent)',
  'var(--color-state-speaking)',
  'var(--color-state-warning)',
  'var(--color-state-error)',
  'var(--color-accent-2)',
];

interface AnalyticsData {
  stats: CallStats;
  latency: LatencyAnalytics;
  tools: ToolAnalytics;
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<7 | 30 | 90>(7);
  const [agentId, setAgentId] = useState<string>('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: number, agent: string) => {
    setLoading(true);
    setError(null);
    try {
      const opts = { period: p, agentId: agent || undefined };
      const [stats, latency, tools] = await Promise.all([
        fetchStats(opts),
        fetchLatencyAnalytics(opts),
        fetchToolAnalytics(opts),
      ]);
      setData({ stats, latency, tools });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(period, agentId);
  }, [load, period, agentId]);

  // The agent filter is a nicety — a failure here must not blank the page.
  useEffect(() => {
    void fetchAgents()
      .then(setAgents)
      .catch(() => setAgents([]));
  }, []);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Analytics"
        description="Conversation outcomes, latency decomposition, cost and tool usage."
        actions={
          <div className="flex items-center gap-2">
            {agents.length > 0 && (
              <AgentFilter agents={agents} value={agentId} onChange={setAgentId} />
            )}
            <PeriodSelector value={period} onChange={setPeriod} />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void load(period, agentId)}
              disabled={loading}
            >
              <RefreshCw size={13} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="flex max-w-5xl flex-col gap-5">
          {loading ? (
            <AnalyticsSkeleton />
          ) : error ? (
            <ErrorPanel message={error} onRetry={() => void load(period, agentId)} />
          ) : data ? (
            <AnalyticsContent data={data} period={period} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

function AnalyticsContent({ data, period }: { data: AnalyticsData; period: number }) {
  const { stats, latency, tools } = data;
  const window = `last ${period} days`;

  // ---- derived series ----
  const volumePoints = stats.series.points.map((p) => ({
    date: p.date,
    values: { total: p.engaged + p.noInteraction + p.failed },
  }));

  const engagementRatePoints = stats.series.points.map((p) => {
    const total = p.engaged + p.noInteraction + p.failed;
    return { date: p.date, values: { rate: total > 0 ? (p.engaged / total) * 100 : null } };
  });

  const errorRatePoints = stats.series.points.map((p) => {
    const total = p.engaged + p.noInteraction + p.failed;
    return { date: p.date, values: { rate: total > 0 ? (p.failed / total) * 100 : null } };
  });

  const latencySeries = [
    { key: 'p50', label: 'p50', color: 'var(--color-accent)' },
    { key: 'p95', label: 'p95', color: 'var(--color-state-warning)' },
  ];
  const latencyPoints = latency.overTime.map((p) => ({
    date: p.date,
    values: { p50: p.p50, p95: p.p95 },
  }));

  // ---- donut segments ----
  const outcomeMix = stats.outcomeMix.map((o) => ({
    label: OUTCOME_LABELS[o.outcome] ?? o.outcome,
    count: o.count,
    color: OUTCOME_COLORS[o.outcome] ?? 'var(--color-text-muted)',
  }));

  const endedBySegments = stats.endedByMix.map((m, i) => ({
    label: ENDED_BY_LABELS[m.key] ?? m.key,
    count: m.count,
    color: DISCONNECT_COLORS[i % DISCONNECT_COLORS.length],
  }));

  const sentimentSegments = stats.sentimentMix.map((m) => ({
    label: m.key.charAt(0).toUpperCase() + m.key.slice(1),
    count: m.count,
    color: SENTIMENT_COLORS[m.key] ?? 'var(--color-text-muted)',
  }));

  const costSegments = [
    { label: 'LLM', count: Math.round(stats.costBreakdown.llmUsd * 10000), color: STAGE_COLORS.llm },
    { label: 'TTS', count: Math.round(stats.costBreakdown.ttsUsd * 10000), color: STAGE_COLORS.tts },
    { label: 'STT', count: Math.round(stats.costBreakdown.sttUsd * 10000), color: STAGE_COLORS.stt },
  ].filter((s) => s.count > 0);

  return (
    <motion.div
      className="flex flex-col gap-5"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Row 1: Hero KPI tiles */}
      <div className="grid grid-cols-3 gap-4">
        <HeroKPI
          label="Total calls"
          value={stats.totalCalls}
          icon={TrendingUp}
          iconColor="var(--color-accent)"
          delta={stats.deltas.totalCalls}
          formatDeltaFn={(d) => `${d > 0 ? '+' : ''}${d}`}
        />
        <HeroKPI
          label="Avg duration"
          value={formatDuration(stats.avgDurationMs)}
          icon={Clock}
          iconColor="var(--color-text-faint)"
          delta={stats.deltas.avgDurationMs}
          lowerIsBetter
          formatDeltaFn={(d) => `${d > 0 ? '+' : ''}${Math.round(d)}ms`}
          sub={stats.avgTurnCount != null ? `Avg turns: ${stats.avgTurnCount.toFixed(1)}` : undefined}
        />
        <HeroKPI
          label="P50 latency"
          value={formatMs(stats.p50LatencyMs)}
          valueColor={latencyColor(stats.p50LatencyMs)}
          icon={Clock}
          iconColor={latencyColor(stats.p50LatencyMs)}
          delta={stats.deltas.p50LatencyMs}
          lowerIsBetter
          formatDeltaFn={(d) => `${d > 0 ? '+' : ''}${Math.round(d)}ms`}
          sub={stats.p95LatencyMs != null ? `p95: ${formatMs(stats.p95LatencyMs)}` : undefined}
        />
      </div>

      {/* Latency reliability warning */}
      {!stats.samples.latencyReliable && stats.samples.latencyTurns > 0 && (
        <Notice tone="warning">
          Latency percentiles are computed from{' '}
          <strong>
            {stats.samples.latencyTurns} turn{stats.samples.latencyTurns === 1 ? '' : 's'}
          </strong>
          , below the {stats.samples.minLatencySample}-turn threshold for a stable
          distribution. Treat p50 and p95 as indicative, not as a measured SLO.
        </Notice>
      )}

      {/* Row 2: Area chart + outcomes donut */}
      <div className="grid grid-cols-[2fr_1fr] gap-4">
        <ChartCard
          title="Call volume"
          sub={`Calls per ${stats.series.bucket} — ${window}`}
        >
          <AreaChart
            points={volumePoints}
            series={[{ key: 'total', label: 'Total calls', color: 'var(--color-accent)' }]}
            height={180}
          />
        </ChartCard>
        <ChartCard
          title="Outcomes"
          sub="Quality breakdown"
        >
          <Donut
            centerLabel="calls"
            segments={outcomeMix}
            stacked
            size={130}
          />
        </ChartCard>
      </div>

      {/* Row 3: Three stacked donuts */}
      <div className="grid grid-cols-3 gap-4">
        <ChartCard
          title="Disconnection reason"
          sub="How calls ended"
        >
          <Donut
            centerLabel="calls"
            segments={endedBySegments}
            stacked
            size={130}
          />
        </ChartCard>
        <ChartCard
          title="Sentiment"
          sub={`${stats.samples.analyzedCalls} of ${stats.samples.calls} calls analyzed`}
        >
          {sentimentSegments.length > 0 ? (
            <Donut
              centerLabel="analyzed"
              segments={sentimentSegments}
              stacked
              size={130}
            />
          ) : (
            <EmptyChart height={120} label="No calls have been scored yet" />
          )}
        </ChartCard>
        <ChartCard
          title="Cost composition"
          sub={`${formatUsd(stats.totalCostUsd)} total`}
        >
          {costSegments.length > 0 ? (
            <Donut
              centerLabel="cost"
              centerValue={formatUsd(stats.totalCostUsd)}
              segments={costSegments}
              stacked
              size={130}
            />
          ) : (
            <EmptyChart height={120} label="No cost data yet" />
          )}
        </ChartCard>
      </div>

      {/* Row 4: Three area/line charts */}
      <div className="grid grid-cols-3 gap-4">
        <ChartCard
          title="Response latency"
          sub={`p50 and p95 — ${window}`}
          trailing={<SampleBadge n={latency.samples.turns} reliable={latency.samples.reliable} />}
        >
          <AreaChart
            points={latencyPoints}
            series={latencySeries}
            height={160}
            format={formatMs}
          />
        </ChartCard>
        <ChartCard
          title="Engagement rate"
          sub={`% calls with agent response — ${window}`}
        >
          <AreaChart
            points={engagementRatePoints}
            series={[{ key: 'rate', label: 'Engagement %', color: 'var(--color-state-speaking)' }]}
            height={160}
            format={(v) => v == null ? '—' : `${v.toFixed(0)}%`}
          />
        </ChartCard>
        <ChartCard
          title="Error rate"
          sub={`% calls that failed — ${window}`}
        >
          <AreaChart
            points={errorRatePoints}
            series={[{ key: 'rate', label: 'Error %', color: 'var(--color-state-error)' }]}
            height={160}
            format={(v) => v == null ? '—' : `${v.toFixed(0)}%`}
          />
        </ChartCard>
      </div>

      {/* Row 5: Tool table + agent comparison */}
      <div className={`grid gap-4 ${tools.tools.length > 0 && stats.topAgents.length > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {tools.tools.length > 0 && (
          <ChartCard
            title="Tool usage"
            sub={
              tools.totals.invocations > 0
                ? `${formatCount(tools.totals.invocations)} invocations across ${tools.totals.callsWithTools} calls`
                : 'Actual executions, not enabled configuration'
            }
            trailing={
              tools.totals.adoptionRate != null && tools.totals.invocations > 0 ? (
                <span className="font-mono text-[11px]" style={{ color: 'var(--color-text-faint)' }}>
                  {formatPct(tools.totals.adoptionRate)} of calls used a tool
                </span>
              ) : undefined
            }
            footnote="Counts come from tool_call and tool_result events. Tool arguments and outputs are never aggregated here."
          >
            <ToolTable tools={tools} />
          </ChartCard>
        )}
        {stats.topAgents.length > 0 && (
          <ChartCard
            title="Agent comparison"
            sub={`Per-agent performance — ${window}`}
            footnote="Agents are identified from the snapshot taken at call start."
          >
            <AgentTable agents={stats.topAgents} />
          </ChartCard>
        )}
      </div>
    </motion.div>
  );
}

function ToolTable({ tools }: { tools: ToolAnalytics }) {
  return (
    <div className="flex flex-col">
      <div
        className="grid grid-cols-[1fr_70px_80px_80px] gap-2 border-b pb-2 text-[10.5px] font-[500] uppercase tracking-[0.07em]"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-faint)' }}
      >
        <span>Tool</span>
        <span className="text-right">Calls</span>
        <span className="text-right">Success</span>
        <span className="text-right">p95</span>
      </div>
      {tools.tools.map((tool) => (
        <div
          key={tool.name}
          className="grid grid-cols-[1fr_70px_80px_80px] items-center gap-2 border-b py-2.5 text-[12.5px] last:border-b-0"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <span className="truncate font-mono" style={{ color: 'var(--color-text)' }}>
            {tool.name}
          </span>
          <span className="text-right font-mono" style={{ color: 'var(--color-text-muted)' }}>
            {tool.invocations}
          </span>
          <span
            className="text-right font-mono font-[600]"
            style={{
              color:
                tool.successRate == null
                  ? 'var(--color-text-faint)'
                  : tool.successRate >= 0.95
                    ? 'var(--color-state-speaking)'
                    : tool.successRate >= 0.8
                      ? 'var(--color-state-warning)'
                      : 'var(--color-state-error)',
            }}
          >
            {formatPct(tool.successRate)}
          </span>
          <span
            className="text-right font-mono"
            style={{ color: latencyColor(tool.p95LatencyMs) }}
          >
            {formatMs(tool.p95LatencyMs)}
          </span>
        </div>
      ))}
    </div>
  );
}

function AgentTable({ agents }: { agents: CallStats['topAgents'] }) {
  return (
    <div className="flex flex-col">
      <div
        className="grid grid-cols-[1fr_60px_80px_80px_80px] gap-2 border-b pb-2 text-[10.5px] font-[500] uppercase tracking-[0.07em]"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-faint)' }}
      >
        <span>Agent</span>
        <span className="text-right">Calls</span>
        <span className="text-right">Engaged</span>
        <span className="text-right">Avg cost</span>
        <span className="text-right">Avg dur.</span>
      </div>
      {agents.map((agent) => (
        <div
          key={agent.agentId}
          className="grid grid-cols-[1fr_60px_80px_80px_80px] items-center gap-2 border-b py-2.5 text-[12.5px] last:border-b-0"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate" style={{ color: 'var(--color-text)' }}>
              {agent.name ?? agent.agentId}
            </span>
            {agent.llmModel && (
              <span className="truncate font-mono text-[10.5px]" style={{ color: 'var(--color-text-faint)' }}>
                {agent.llmModel}
              </span>
            )}
          </span>
          <span className="text-right font-mono" style={{ color: 'var(--color-text-muted)' }}>
            {agent.calls}
          </span>
          <span
            className="text-right font-mono font-[600]"
            style={{
              color:
                agent.engagementRate >= 0.5
                  ? 'var(--color-state-speaking)'
                  : 'var(--color-state-warning)',
            }}
          >
            {formatPct(agent.engagementRate)}
          </span>
          <span className="text-right font-mono" style={{ color: 'var(--color-text-muted)' }}>
            {formatUsd(agent.avgCostUsd)}
          </span>
          <span className="text-right font-mono" style={{ color: 'var(--color-text-muted)' }}>
            {formatMs(agent.avgDurationMs)}
          </span>
        </div>
      ))}
    </div>
  );
}

function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-[10.5px] font-[500] uppercase tracking-[0.06em]"
        style={{ color: 'var(--color-text-faint)' }}
      >
        {label}
      </span>
      <span className="font-mono text-[15px] font-[600]" style={{ color: 'var(--color-text)' }}>
        {value}
      </span>
    </div>
  );
}

function Notice({ tone, children }: { tone: 'warning'; children: React.ReactNode }) {
  const color = tone === 'warning' ? 'var(--color-state-warning)' : 'var(--color-accent)';
  return (
    <div
      className="flex items-start gap-2.5 rounded-[10px] px-4 py-3"
      style={{ background: 'color-mix(in srgb, var(--color-state-warning) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--color-state-warning) 20%, transparent)' }}
    >
      <AlertCircle size={14} strokeWidth={2} style={{ color, flexShrink: 0, marginTop: 1 }} />
      <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
        {children}
      </p>
    </div>
  );
}

function AgentFilter({
  agents,
  value,
  onChange,
}: {
  agents: Agent[];
  value: string;
  onChange: (agentId: string) => void;
}) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filter analytics by agent"
      className="!w-auto text-[12px] font-[500] !py-1.5 !px-2.5"
      style={{
        background: 'var(--color-surface-raised)',
      }}
    >
      <option value="">All agents</option>
      {agents.map((agent) => (
        <option key={agent.agentId} value={agent.agentId}>
          {agent.name}
        </option>
      ))}
    </Select>
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

function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-[110px] animate-pulse rounded-[12px]"
            style={{ background: 'var(--color-surface-raised)' }}
          />
        ))}
      </div>
      <div className="grid grid-cols-[2fr_1fr] gap-4">
        <div
          className="h-[240px] animate-pulse rounded-[12px]"
          style={{ background: 'var(--color-surface-raised)' }}
        />
        <div
          className="h-[240px] animate-pulse rounded-[12px]"
          style={{ background: 'var(--color-surface-raised)' }}
        />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-[200px] animate-pulse rounded-[12px]"
            style={{ background: 'var(--color-surface-raised)' }}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-[200px] animate-pulse rounded-[12px]"
            style={{ background: 'var(--color-surface-raised)' }}
          />
        ))}
      </div>
    </div>
  );
}

function countOutcome(stats: CallStats, outcome: string): number {
  return stats.outcomeMix.find((o) => o.outcome === outcome)?.count ?? 0;
}

