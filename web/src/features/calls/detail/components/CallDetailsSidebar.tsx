'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { DataRow, Panel, Section } from '@/components/ui/Section';
import type { CallSummary } from '@/lib/api/calls';
import {
  formatDuration,
  formatEndedBy,
  formatTime,
  getAgentName,
  statusLabel,
  statusVariant,
} from '../utils';

export function CallDetailsSidebar({ call }: { call: CallSummary }) {
  const [copied, setCopied] = useState(false);
  const agentName = getAgentName(call);
  const snap = call.agentSnapshot;

  const copyId = () => {
    void navigator.clipboard.writeText(call.callId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const techPills = [
    snap?.llmProvider || snap?.llmModel
      ? {
          label: 'LLM',
          value: [snap?.llmProvider, snap?.llmModel].filter(Boolean).join(' / '),
        }
      : null,
    snap?.ttsProvider ? { label: 'TTS', value: snap.ttsProvider } : null,
    snap?.sttProvider ? { label: 'STT', value: snap.sttProvider } : null,
    snap?.language ? { label: 'Lang', value: snap.language } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <aside className="flex h-full min-h-0 flex-col gap-6 overflow-y-auto p-4">
      <Section title="Call details">
        <Panel>
          <DataRow label="Agent">{agentName}</DataRow>
          <DataRow label="Status">
            <Badge variant={statusVariant(call.status)}>
              {statusLabel(call.status, call.endedBy)}
            </Badge>
          </DataRow>
          <DataRow label="Duration">
            {call.durationMs != null ? formatDuration(call.durationMs) : '—'}
          </DataRow>
          <DataRow label="Turns">
            {call.turnCount != null ? String(call.turnCount) : '—'}
          </DataRow>
          <DataRow label="Started">{formatTime(call.createdAt)}</DataRow>
          <DataRow label="Ended by">{formatEndedBy(call.endedBy)}</DataRow>
          <DataRow label="Call ID" mono>
            <button
              type="button"
              onClick={copyId}
              className="focus-inset inline-flex max-w-full items-center gap-1 rounded-xs transition-colors duration-[120ms] hover:text-[var(--fg-ink-hover)]"
              aria-label={copied ? 'Call ID copied' : `Copy call ID ${call.callId}`}
              title="Copy call ID"
            >
              <span className="truncate">{call.callId}</span>
              {copied ? (
                <Check
                  size={12}
                  strokeWidth={2}
                  aria-hidden="true"
                  style={{ color: 'var(--status-success)' }}
                />
              ) : (
                <Copy
                  size={12}
                  strokeWidth={2}
                  aria-hidden="true"
                  style={{ color: 'var(--fg-muted)' }}
                />
              )}
            </button>
          </DataRow>
        </Panel>
      </Section>

      {techPills.length > 0 && (
        <Section title="Technology">
          <Panel>
            {techPills.map((p) => (
              <DataRow key={p.label} label={p.label}>
                {p.value}
              </DataRow>
            ))}
          </Panel>
        </Section>
      )}

      {(call.errors?.length ?? 0) > 0 && (
        <Section title="Errors">
          <Panel>
            <ul className="flex flex-col gap-2">
              {call.errors.map((e, i) => (
                <li
                  key={i}
                  className="text-caption leading-normal"
                  style={{ color: 'var(--status-error)' }}
                >
                  {e}
                </li>
              ))}
            </ul>
          </Panel>
        </Section>
      )}
    </aside>
  );
}
