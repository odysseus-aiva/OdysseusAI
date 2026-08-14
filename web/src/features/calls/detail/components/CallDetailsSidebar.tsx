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
    <aside className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto p-4">
      <Section title="Call details">
        <Panel>
          <DataRow label="Agent">{agentName}</DataRow>
          <DataRow label="Status">
            <Badge variant={statusVariant(call.status)} dot>
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
              className="inline-flex max-w-full items-center gap-1 transition-opacity hover:opacity-80"
              title="Copy call ID"
              style={{ color: 'var(--color-text)' }}
            >
              <span className="truncate">{call.callId}</span>
              {copied ? (
                <Check size={11} strokeWidth={2.5} style={{ color: 'var(--color-state-speaking)' }} />
              ) : (
                <Copy size={11} strokeWidth={2} style={{ color: 'var(--color-text-faint)' }} />
              )}
            </button>
          </DataRow>
        </Panel>
      </Section>

      {techPills.length > 0 && (
        <Section title="Technology">
          <div className="flex flex-wrap gap-1.5">
            {techPills.map((p) => (
              <span
                key={p.label}
                className="inline-flex max-w-full items-center gap-1 truncate rounded-[6px] px-2 py-1 text-[11px] font-[450]"
                style={{
                  background: 'var(--color-surface-raised)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-muted)',
                }}
              >
                <span style={{ color: 'var(--color-text-faint)' }}>{p.label}</span>
                <span className="truncate" style={{ color: 'var(--color-text)' }}>
                  {p.value}
                </span>
              </span>
            ))}
          </div>
        </Section>
      )}

      {(call.errors?.length ?? 0) > 0 && (
        <Section title="Errors">
          <Panel>
            <ul className="flex flex-col gap-1.5">
              {call.errors.map((e, i) => (
                <li
                  key={i}
                  className="text-[12.5px] leading-[1.45]"
                  style={{ color: 'var(--color-state-error)' }}
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
