'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  Clock,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SegmentedControl, Select } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Section';
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
  LINE_COMPARE,
  LINE_STROKE,
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

type PeriodKey = '7' | '30' | '90';

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: '7', label: '7d' },
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
];

const ENDED_BY_LABELS: Record<string, string> = {
  participant: 'User hung up',
  agent: 'Agent ended',
  timeout: 'Timed out',
  error: 'Error',
  unknown: 'Unknown',
};

/**
 * Disconnection reasons are categories, not statuses, so they run the ink ladder
 * rather than a hue per slice. A multi-hue categorical palette would be a second
 * colour system with nothing tying it to the product accent.
 */
const NEUTRAL_RAMP = [
  'var(--fg-ink)',
  'var(--fg-strong)',
  'var(--fg-body)',
  'var(--fg-muted)',
  'var(--line-strong)',
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
    <div>
      <header className="page__header">
        <div className="min-w-0">
          <h1 className="page__title">Analytics</h1>
          <p className="page__meta mt-1">
            Conversation outcomes, latency decomposition, cost and tool usage.
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
          {agents.length > 0 && (
            <AgentFilter agents={agents} value={agentId} onChange={setAgentId} />
          )}
          <SegmentedControl
            value={String(period) as PeriodKey}
            options={PERIOD_OPTIONS}
            onChange={(next) => setPeriod(Number(next) as 7 | 30 | 90)}
            label="Time period"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void load(period, agentId)}
            disabled={loading}
            aria-label="Reload analytics"
          >
            <RefreshCw
              size={16}
              strokeWidth={2}
              aria-hidden="true"
              className={loading ? 'animate-spin' : ''}
            />
          </Button>
        </div>
      </header>

      <div className="page__body">
        <div className="flex max-w-5xl flex-col gap-6" aria-live="polite" aria-busy={loading}>
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

  // p95 is the comparison series, so it is a neutral ghost behind the accent.
  const latencySeries = [
    { key: 'p50', label: 'p50', color: LINE_STROKE },
    { key: 'p95', label: 'p95', color: LINE_COMPARE },
  ];
  const latencyPoints = latency.overTime.map((p) => ({
    date: p.date,
    values: { p50: p.p50, p95: p.p95 },
  }));

  // ---- donut segments ----
  const outcomeMix = stats.outcomeMix.map((o) => ({
    label: OUTCOME_LABELS[o.outcome] ?? o.outcome,
    count: o.count,
    color: OUTCOME_COLORS[o.outcome] ?? 'var(--fg-muted)',
  }));

  const endedBySegments = stats.endedByMix.map((m, i) => ({
    label: ENDED_BY_LABELS[m.key] ?? m.key,
    count: m.count,
    color: NEUTRAL_RAMP[i % NEUTRAL_RAMP.length],
  }));

  const sentimentSegments = stats.sentimentMix.map((m) => ({
    label: m.key.charAt(0).toUpperCase() + m.key.slice(1),
    count: m.count,
    color: SENTIMENT_COLORS[m.key] ?? 'var(--fg-muted)',
  }));

  const costSegments = [
    { label: 'LLM', count: Math.round(stats.costBreakdown.llmUsd * 10000), color: STAGE_COLORS.llm },
    { label: 'TTS', count: Math.round(stats.costBreakdown.ttsUsd * 10000), color: STAGE_COLORS.tts },
    { label: 'STT', count: Math.round(stats.costBreakdown.sttUsd * 10000), color: STAGE_COLORS.stt },
  ].filter((s) => s.count > 0);

  return (
    <motion.div
      className="flex flex-col gap-6"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Row 1: KPI tiles */}
      <div className="stat-row">
        <HeroKPI
          label="Total calls"
          value={stats.totalCalls}
          icon={TrendingUp}
          iconColor="var(--fg-muted)"
          delta={stats.deltas.totalCalls}
          formatDeltaFn={(d) => `${d > 0 ? '+' : ''}${d}`}
        />
        <HeroKPI
          label="Avg duration"
          value={formatDuration(stats.avgDurationMs)}
          icon={Clock}
          iconColor="var(--fg-muted)"
          delta={stats.deltas.avgDurationMs}
          lowerIsBetter
          formatDeltaFn={(d) => `${d > 0 ? '+' : ''}${Math.round(d)}ms`}
          sub={stats.avgTurnCount != null ? `Avg turns: ${stats.avgTurnCount.toFixed(1)}` : undefined}
        />
        <HeroKPI
          label="P50 latency"
          value={formatMs(stats.p50LatencyMs)}
          icon={Clock}
          iconColor="var(--fg-muted)"
          delta={stats.deltas.p50LatencyMs}
          lowerIsBetter
          formatDeltaFn={(d) => `${d > 0 ? '+' : ''}${Math.round(d)}ms`}
          sub={stats.p95LatencyMs != null ? `p95: ${formatMs(stats.p95LatencyMs)}` : undefined}
        />
      </div>

      {/* Latency reliability warning */}
      {!stats.samples.latencyReliable && stats.samples.latencyTurns > 0 && (
        <Notice>
          Latency percentiles are computed from{' '}
          <strong>
            {stats.samples.latencyTurns} turn{stats.samples.latencyTurns === 1 ? '' : 's'}
          </strong>
          , below the {stats.samples.minLatencySample}-turn threshold for a stable
          distribution. Treat p50 and p95 as indicative, not as a measured SLO.
        </Notice>
      )}

      {/* Row 2: Area chart + outcomes donut */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <ChartCard
          title="Call volume"
          sub={`Calls per ${stats.series.bucket} — ${window}`}
        >
          <AreaChart
            points={volumePoints}
            series={[{ key: 'total', label: 'Total calls', color: LINE_STROKE }]}
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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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

      {/* Row 4: Three trend charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
            series={[{ key: 'rate', label: 'Engagement %', color: LINE_STROKE }]}
            height={160}
            format={(v) => v == null ? '—' : `${v.toFixed(0)}%`}
          />
        </ChartCard>
        <ChartCard
          title="Error rate"
          sub={`% calls that failed — ${window}`}
        >
          {/* The only series on this page allowed a status hue: a failure rate is
              a number the reader is expected to act on. Its neighbour, the
              engagement rate, is just a trend and stays on the accent. */}
          <AreaChart
            points={errorRatePoints}
            series={[{ key: 'rate', label: 'Error %', color: 'var(--status-error)' }]}
            height={160}
            format={(v) => v == null ? '—' : `${v.toFixed(0)}%`}
          />
        </ChartCard>
      </div>

      {/* Row 5: Tool table + agent comparison */}
      <div
        className={`grid gap-4 ${
          tools.tools.length > 0 && stats.topAgents.length > 0 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
        }`}
      >
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
                /* A sentence is not a badge — .badge is for one-word markers. */
                <span className="page__meta whitespace-nowrap">
                  <span className="num">{formatPct(tools.totals.adoptionRate)}</span> of calls used
                  a tool
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
    <div className="listing-scroll">
      <table className="data-table" aria-label="Tool usage">
        <thead>
          <tr>
            <th scope="col">Tool</th>
            <th scope="col" className="data-table__right">Calls</th>
            <th scope="col" className="data-table__right">Success</th>
            <th scope="col" className="data-table__right">p95</th>
          </tr>
        </thead>
        <tbody>
          {tools.tools.map((tool) => (
            <tr key={tool.name}>
              {/* Mono marks this as an API identifier rather than a display name. */}
              <td className="data-table__strong font-mono">{tool.name}</td>
              <td className="data-table__right num">{tool.invocations}</td>
              <td className="data-table__right num">{formatPct(tool.successRate)}</td>
              <td className="data-table__right num">{formatMs(tool.p95LatencyMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgentTable({ agents }: { agents: CallStats['topAgents'] }) {
  return (
    <div className="listing-scroll">
      <table className="data-table" aria-label="Agent comparison">
        <thead>
          <tr>
            <th scope="col">Agent</th>
            <th scope="col" className="data-table__right">Calls</th>
            <th scope="col" className="data-table__right">Engaged</th>
            <th scope="col" className="data-table__right">Avg cost</th>
            <th scope="col" className="data-table__right">Avg dur.</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => (
            <tr key={agent.agentId}>
              <td className="data-table__strong">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{agent.name ?? agent.agentId}</span>
                  {agent.llmModel && (
                    <span
                      className="truncate font-mono"
                      style={{
                        color: 'var(--fg-muted)',
                        fontSize: 'var(--text-caption)',
                        fontWeight: 'var(--weight-regular)',
                      }}
                    >
                      {agent.llmModel}
                    </span>
                  )}
                </span>
              </td>
              <td className="data-table__right num">{agent.calls}</td>
              <td className="data-table__right num">{formatPct(agent.engagementRate)}</td>
              <td className="data-table__right num">{formatUsd(agent.avgCostUsd)}</td>
              <td className="data-table__right num">{formatMs(agent.avgDurationMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Caveat about a statistic the reader must discount. Colour is confined to the
 * glyph: a tinted fill or border here would be exactly the move rule 3 forbids.
 */
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="card flex items-start gap-3" role="note">
      <AlertCircle
        size={16}
        strokeWidth={2}
        aria-hidden="true"
        style={{ color: 'var(--status-warning)', flexShrink: 0, marginTop: 1 }}
      />
      <p
        className="m-0"
        style={{
          color: 'var(--fg-body)',
          fontSize: 'var(--text-caption)',
          lineHeight: 'var(--leading-body)',
        }}
      >
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
      className="!w-auto"
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

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <EmptyState
      icon={AlertCircle}
      title="Could not load analytics"
      description={message}
      action={
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}

/* Heights are reserved with flat fills — no shimmer anywhere in this language. */
function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <div className="stat-row">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="stat" style={{ height: 108 }} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <SkeletonCard height={260} />
        <SkeletonCard height={260} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <SkeletonCard key={i} height={220} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <SkeletonCard key={i} height={220} />
        ))}
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
