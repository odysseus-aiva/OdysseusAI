'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Panel, Section } from '@/components/ui/Section';
import type { CallAnalysis } from '@/lib/api/calls';

const SENTIMENT: Record<
  NonNullable<CallAnalysis['sentiment']>,
  { label: string; variant: 'success' | 'error' | 'muted' }
> = {
  positive: { label: 'Positive', variant: 'success' },
  negative: { label: 'Negative', variant: 'error' },
  neutral: { label: 'Neutral', variant: 'muted' },
};

export function CallOverview({ analysis }: { analysis: CallAnalysis }) {
  const [copied, setCopied] = useState(false);
  const sentiment = analysis.sentiment ? SENTIMENT[analysis.sentiment] : null;
  const hasSummary = Boolean(analysis.summary?.trim());

  if (!hasSummary && !sentiment) return null;

  const copySummary = () => {
    if (!analysis.summary) return;
    void navigator.clipboard.writeText(analysis.summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Section
      title="Overview"
      action={
        <div className="flex items-center gap-2">
          {sentiment && (
            <Badge variant={sentiment.variant}>{sentiment.label}</Badge>
          )}
          {hasSummary && (
            <button
              type="button"
              onClick={copySummary}
              className="inline-flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[11.5px] transition-colors hover:bg-[var(--color-glass-hover)]"
              style={{ color: 'var(--color-text-faint)' }}
              aria-label="Copy summary"
            >
              {copied ? (
                <Check size={12} strokeWidth={2.5} style={{ color: 'var(--color-state-speaking)' }} />
              ) : (
                <Copy size={12} strokeWidth={2} />
              )}
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>
      }
    >
      {hasSummary && (
        <Panel>
          <p
            className="text-[13.5px] leading-[1.6] text-pretty"
            style={{ color: 'var(--color-text)', maxWidth: '68ch' }}
          >
            {analysis.summary}
          </p>
        </Panel>
      )}
    </Section>
  );
}
