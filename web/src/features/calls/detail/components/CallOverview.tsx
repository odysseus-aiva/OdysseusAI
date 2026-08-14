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
              className="btn btn--ghost btn--sm"
              aria-label={copied ? 'Summary copied' : 'Copy summary'}
            >
              {copied ? (
                <Check
                  size={14}
                  strokeWidth={2}
                  aria-hidden="true"
                  style={{ color: 'var(--status-success)' }}
                />
              ) : (
                <Copy size={14} strokeWidth={2} aria-hidden="true" />
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
            className="text-body leading-body text-pretty"
            style={{ color: 'var(--fg-strong)', maxWidth: '68ch' }}
          >
            {analysis.summary}
          </p>
        </Panel>
      )}
    </Section>
  );
}
