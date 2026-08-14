'use client';

import { Panel, Section } from '@/components/ui/Section';
import type { CallCost } from '@/lib/api/calls';
import { costRows, formatUsd } from '../utils';

export function CallCostBreakdown({ cost }: { cost: CallCost }) {
  return (
    <Section
      title="Cost"
      action={
        cost.estimated ? (
          <span
            className="rounded-[5px] px-1.5 py-0.5 text-[10.5px] font-[500]"
            style={{
              background: 'rgb(251 191 36 / 0.08)',
              color: 'var(--color-state-warning)',
            }}
          >
            Estimated
          </span>
        ) : undefined
      }
    >
      {cost.pricingModel === 'omni' ? <OmniCost cost={cost} /> : <PipelineCost cost={cost} />}
    </Section>
  );
}

function PipelineCost({ cost }: { cost: CallCost }) {
  const rows = costRows(cost);

  return (
    <Panel>
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
            Total
          </span>
          <span
            className="font-mono text-[18px] font-[600] tracking-[-0.02em] tabular-nums"
            style={{ color: 'var(--color-text)' }}
          >
            {formatUsd(cost.totalUsd)}
          </span>
        </div>

        <div
          className="flex h-1.5 overflow-hidden rounded-full"
          style={{ background: 'var(--color-surface-elevated)' }}
        >
          {rows.map((r) =>
            r.usd > 0 ? (
              <div
                key={r.label}
                style={{
                  width: `${(r.usd / (cost.totalUsd || 1)) * 100}%`,
                  background: r.color,
                  opacity: 0.8,
                }}
              />
            ) : null,
          )}
        </div>

        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-3">
              <span
                className="flex w-10 shrink-0 items-center gap-1.5 text-[11.5px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <span
                  aria-hidden
                  className="rounded-full"
                  style={{ width: 6, height: 6, background: r.color }}
                />
                {r.label}
              </span>
              <span
                className="min-w-0 flex-1 truncate text-[11px]"
                style={{ color: 'var(--color-text-faint)' }}
              >
                {r.detail || '—'}
              </span>
              <span
                className="w-20 shrink-0 text-right font-mono text-[11.5px] tabular-nums"
                style={{ color: 'var(--color-text)' }}
              >
                {formatUsd(r.usd)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function OmniCost({ cost }: { cost: CallCost }) {
  const durationSec = cost.breakdown.stt.seconds;
  return (
    <Panel>
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
            Total
          </span>
          <span
            className="font-mono text-[18px] font-[600] tracking-[-0.02em] tabular-nums"
            style={{ color: 'var(--color-text)' }}
          >
            {formatUsd(cost.totalUsd)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="flex w-16 shrink-0 items-center gap-1.5 text-[11.5px]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <span
              aria-hidden
              className="rounded-full"
              style={{ width: 6, height: 6, background: 'var(--color-accent)' }}
            />
            Omni
          </span>
          <span className="min-w-0 flex-1 text-[11px]" style={{ color: 'var(--color-text-faint)' }}>
            PyAI Omni · {durationSec}s · $0.05/min flat rate
          </span>
          <span
            className="w-20 shrink-0 text-right font-mono text-[11.5px] tabular-nums"
            style={{ color: 'var(--color-text)' }}
          >
            {formatUsd(cost.totalUsd)}
          </span>
        </div>
        <p
          className="pt-2 text-[10.5px] leading-[1.4]"
          style={{
            color: 'var(--color-text-faint)',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          Single all-in rate covering hearing, reasoning, retrieval, and speech. No separate
          STT/LLM/TTS billing.
        </p>
      </div>
    </Panel>
  );
}
