'use client';

import { Panel, Section } from '@/components/ui/Section';
import type { CallCost } from '@/lib/api/calls';
import { costRows, formatUsd } from '../utils';

export function CallCostBreakdown({ cost }: { cost: CallCost }) {
  return (
    <Section
      title="Cost"
      action={
        /* "Estimated" qualifies a number; it is not a state the user has to act
           on, so it stays a neutral badge rather than a warning pill. */
        cost.estimated ? <span className="badge">Estimated</span> : undefined
      }
    >
      {cost.pricingModel === 'omni' ? <OmniCost cost={cost} /> : <PipelineCost cost={cost} />}
    </Section>
  );
}

function CostTotal({ usd }: { usd: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-caption" style={{ color: 'var(--fg-muted)' }}>
        Total
      </span>
      <span
        className="num text-title-md font-medium tracking-wordmark"
        style={{ color: 'var(--fg-ink)' }}
      >
        {formatUsd(usd)}
      </span>
    </div>
  );
}

function PipelineCost({ cost }: { cost: CallCost }) {
  const rows = costRows(cost);

  return (
    <Panel>
      <div className="flex flex-col gap-3">
        <CostTotal usd={cost.totalUsd} />

        <div
          aria-hidden
          className="flex h-1.5 overflow-hidden rounded-pill"
          style={{ background: 'var(--surface-recessed)' }}
        >
          {rows.map((r) =>
            r.usd > 0 ? (
              <div
                key={r.label}
                style={{
                  width: `${(r.usd / (cost.totalUsd || 1)) * 100}%`,
                  background: r.color,
                }}
              />
            ) : null,
          )}
        </div>

        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-3">
              <span
                className="flex w-10 shrink-0 items-center gap-2 text-caption"
                style={{ color: 'var(--fg-body)' }}
              >
                <span
                  aria-hidden
                  className="rounded-pill"
                  style={{
                    width: 'var(--dot-size)',
                    height: 'var(--dot-size)',
                    background: r.color,
                  }}
                />
                {r.label}
              </span>
              <span
                className="min-w-0 flex-1 truncate text-micro"
                style={{ color: 'var(--fg-muted)' }}
              >
                {r.detail || '—'}
              </span>
              <span
                className="w-20 shrink-0 text-right text-caption tabular-nums"
                style={{ color: 'var(--fg-ink)' }}
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
        <CostTotal usd={cost.totalUsd} />
        <div className="flex items-center gap-3">
          <span
            className="flex w-16 shrink-0 items-center gap-2 text-caption"
            style={{ color: 'var(--fg-body)' }}
          >
            <span
              aria-hidden
              className="rounded-pill"
              style={{
                width: 'var(--dot-size)',
                height: 'var(--dot-size)',
                background: 'var(--fg-ink)',
              }}
            />
            Omni
          </span>
          <span className="min-w-0 flex-1 text-micro" style={{ color: 'var(--fg-muted)' }}>
            PyAI Omni · {durationSec}s · $0.05/min flat rate
          </span>
          <span
            className="w-20 shrink-0 text-right text-caption tabular-nums"
            style={{ color: 'var(--fg-ink)' }}
          >
            {formatUsd(cost.totalUsd)}
          </span>
        </div>
        <p
          className="pt-3 text-micro leading-body"
          style={{
            color: 'var(--fg-muted)',
            borderTop: '1px solid var(--line-hairline)',
          }}
        >
          Single all-in rate covering hearing, reasoning, retrieval, and speech. No separate
          STT/LLM/TTS billing.
        </p>
      </div>
    </Panel>
  );
}
