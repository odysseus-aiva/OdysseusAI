'use client';

import { Panel, Section } from '@/components/ui/Section';
import type { CallSummary } from '@/lib/api/calls';
import {
  formatLatencyMs,
  latencyBarPct,
  latencyColor,
  latencyState,
  latencyStateLabel,
} from '../utils';

type MetricDef = {
  label: string;
  value: number | undefined;
  max: number;
  tip: string;
};

export function CallPerformance({
  metrics,
}: {
  metrics: CallSummary['latencyMetrics'];
}) {
  const bars: MetricDef[] = [
    {
      label: 'STT',
      value: metrics.sttLatencyMs,
      max: 1000,
      tip: 'Speech-to-text finalization after user speech end',
    },
    {
      label: 'LLM',
      value: metrics.llmLatencyMs,
      max: 3000,
      tip: 'Model time from request start to completion',
    },
    {
      label: 'TTS',
      value: metrics.ttsLatencyMs,
      max: 1000,
      tip: 'Text-to-speech synthesis duration',
    },
    {
      label: 'Total',
      value: metrics.totalResponseLatencyMs,
      max: 4000,
      tip: 'End-to-end response latency for the turn',
    },
  ].filter((b) => b.value != null);

  if (bars.length === 0) return null;

  return (
    <Section title="Performance">
      <Panel>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {bars.map((bar) => {
            const state = latencyState(bar.value);
            const tint = latencyColor(bar.value ?? 0);
            const pct = latencyBarPct(bar.value, bar.max);
            return (
              <div key={bar.label} className="flex flex-col gap-1.5" title={bar.tip}>
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="text-[11.5px] font-[500]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {bar.label}
                  </span>
                  {state && (
                    <span className="text-[10.5px]" style={{ color: tint }}>
                      {latencyStateLabel(state)}
                    </span>
                  )}
                </div>
                <p
                  className="font-mono text-[15px] font-[500] tracking-[-0.02em] tabular-nums"
                  style={{ color: 'var(--color-text)' }}
                >
                  {bar.value != null ? formatLatencyMs(bar.value) : '—'}
                </p>
                <div
                  className="h-1 overflow-hidden rounded-full"
                  style={{ background: 'var(--color-surface-elevated)' }}
                  role="meter"
                  aria-label={`${bar.label} latency`}
                  aria-valuenow={bar.value ?? 0}
                  aria-valuemin={0}
                  aria-valuemax={bar.max}
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: tint, opacity: 0.8 }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {(metrics.p50ResponseLatencyMs != null ||
          metrics.p95ResponseLatencyMs != null ||
          metrics.turnsWithLatency != null) && (
          <div
            className="mt-4 flex flex-wrap gap-x-4 gap-y-1 pt-3 text-[11.5px]"
            style={{
              borderTop: '1px solid var(--color-border)',
              color: 'var(--color-text-faint)',
            }}
          >
            {metrics.p50ResponseLatencyMs != null && (
              <span>
                p50{' '}
                <span className="font-mono" style={{ color: 'var(--color-text-muted)' }}>
                  {formatLatencyMs(metrics.p50ResponseLatencyMs)}
                </span>
              </span>
            )}
            {metrics.p95ResponseLatencyMs != null && (
              <span>
                p95{' '}
                <span className="font-mono" style={{ color: 'var(--color-text-muted)' }}>
                  {formatLatencyMs(metrics.p95ResponseLatencyMs)}
                </span>
              </span>
            )}
            {metrics.turnsWithLatency != null && (
              <span>
                across {metrics.turnsWithLatency}{' '}
                {metrics.turnsWithLatency === 1 ? 'turn' : 'turns'}
              </span>
            )}
          </div>
        )}
      </Panel>
    </Section>
  );
}
