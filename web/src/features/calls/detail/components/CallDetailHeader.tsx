'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Badge } from '@/components/ui/Badge';
import type { CallSummary } from '@/lib/api/calls';
import {
  formatDuration,
  formatTime,
  getAgentName,
  shortCallId,
  statusLabel,
  statusVariant,
} from '../utils';

export function CallDetailHeader({ call }: { call: CallSummary }) {
  const [copied, setCopied] = useState(false);
  const agentName = getAgentName(call);

  const copyId = () => {
    void navigator.clipboard.writeText(call.callId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <PageHeader
      compact
      breadcrumb={[
        { label: 'Call History', href: '/calls' },
        { label: shortCallId(call.callId) },
      ]}
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>{agentName}</span>
          <Badge variant={statusVariant(call.status)}>
            {statusLabel(call.status, call.endedBy)}
          </Badge>
        </span>
      }
      description={
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span>{formatTime(call.createdAt)}</span>
          {call.durationMs != null && (
            <>
              <span aria-hidden>·</span>
              <span>{formatDuration(call.durationMs)}</span>
            </>
          )}
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={copyId}
            className="inline-flex items-center gap-1 font-mono text-[var(--fg-body)] transition-colors duration-[120ms] hover:text-[var(--fg-ink)]"
            title="Copy call ID"
            aria-label="Copy call ID"
          >
            <span>{shortCallId(call.callId)}</span>
            {copied ? (
              <Check size={12} strokeWidth={2} style={{ color: 'var(--status-success)' }} />
            ) : (
              <Copy size={12} strokeWidth={2} style={{ color: 'var(--fg-muted)' }} />
            )}
          </button>
        </span>
      }
    />
  );
}
