'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bot, Wrench, ArrowUpRight, Ear, BrainCircuit, AudioLines, Cpu, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Agent } from '@/lib/api/agents';
import { deleteAgent } from '@/lib/api/agents';
import {
  STT_PROVIDERS,
  LLM_PROVIDERS,
  TTS_PROVIDERS,
  PLATFORM_DEFAULTS,
  providerLabel,
  languageLabel,
} from '../providers';

/**
 * Compact, informative agent card. Surfaces identity, the resolved voice
 * pipeline, enabled-tool count, and freshness so the list is scannable at any
 * size. The whole card is a link to the agent's config.
 */
export function AgentCard({
  agent,
  toolCount,
  onDeleted,
}: {
  agent: Agent;
  /** undefined while the count is still resolving. */
  toolCount: number | undefined;
  onDeleted?: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleting(true);
    try {
      await deleteAgent(agent.agentId);
      onDeleted?.();
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };
  const stt = providerLabel(STT_PROVIDERS, agent.defaultProviders?.stt || PLATFORM_DEFAULTS.stt);
  const llm = providerLabel(LLM_PROVIDERS, agent.defaultProviders?.llm || PLATFORM_DEFAULTS.llm);
  const tts = providerLabel(TTS_PROVIDERS, agent.defaultProviders?.tts || PLATFORM_DEFAULTS.tts);

  const summary = firstLine(agent.systemPrompt) ?? agent.agentId;
  const voiceBits = [agent.voiceId, languageLabel(agent.language)].filter(Boolean).join(' · ');
  const isOmni = agent.engine === 'omni';

  return (
    <Link
      href={`/agents/${encodeURIComponent(agent.agentId)}`}
      className="group flex flex-col overflow-hidden rounded-md border border-[var(--line-hairline)] bg-[var(--surface-card)] transition-colors duration-[var(--duration-hover)] hover:border-[var(--line-strong)]"
    >
      {/* Header: glyph + identity + engine state */}
      <div className="flex items-start gap-3 px-4 pt-4">
        <span
          className="flex flex-shrink-0 items-center justify-center rounded-sm"
          style={{
            width: 32,
            height: 32,
            background: 'var(--surface-recessed)',
            border: '1px solid var(--line-hairline)',
            color: 'var(--fg-body)',
          }}
        >
          <Bot size={16} strokeWidth={2} aria-hidden="true" />
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            className="truncate text-nav font-medium"
            style={{ color: 'var(--fg-ink)' }}
          >
            {agent.name}
          </span>
          <span className="truncate font-mono text-micro" style={{ color: 'var(--fg-muted)' }}>
            {agent.agentId}
          </span>
        </div>

        {isOmni ? (
          <Badge>
            <Cpu size={12} strokeWidth={2} aria-hidden="true" />
            Omni
          </Badge>
        ) : (
          <Badge variant="success">Ready</Badge>
        )}
      </div>

      {/* One-line description / prompt preview */}
      <p
        className="line-clamp-2 min-h-[40px] px-4 pt-3 text-caption leading-body"
        style={{ color: 'var(--fg-body)' }}
      >
        {summary}
      </p>

      {/* Pipeline chips — only meaningful for the pipeline engine. Omni fuses
          these stages, so we show a single engine chip instead. */}
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        {isOmni ? (
          <PipeChip icon={Cpu} value="Fused realtime engine" />
        ) : (
          <>
            <PipeChip icon={Ear} value={stt} />
            <PipeChip icon={BrainCircuit} value={llm} />
            <PipeChip icon={AudioLines} value={tts} />
          </>
        )}
      </div>

      {/* Footer: tools + voice + updated + open */}
      <div
        className="mt-4 flex items-center gap-2 px-4 py-3"
        style={{ borderTop: '1px solid var(--line-hairline)' }}
      >
        <span className="flex items-center gap-2" title="Enabled tools">
          <Wrench size={14} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--fg-muted)' }} />
          <span className="text-caption tabular-nums" style={{ color: 'var(--fg-body)' }}>
            {toolCount == null ? '—' : `${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}`}
          </span>
        </span>

        {voiceBits && (
          <>
            <Dot />
            <span className="truncate text-caption" style={{ color: 'var(--fg-body)' }}>
              {voiceBits}
            </span>
          </>
        )}

        <span className="flex-1" />

        {confirmDelete ? (
          <span className="flex items-center gap-2" onClick={(e) => e.preventDefault()}>
            <span className="text-caption" style={{ color: 'var(--fg-muted)' }}>
              Delete?
            </span>
            <Button variant="secondary" size="sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDelete(false); }}>
              No
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Yes'}
            </Button>
          </span>
        ) : (
          <>
            <span className="flex-shrink-0 text-caption" style={{ color: 'var(--fg-muted)' }}>
              {relativeTime(agent.updatedAt)}
            </span>
            <button
              type="button"
              aria-label={`Delete ${agent.name}`}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDelete(true); }}
              className="icon-btn opacity-0 transition-opacity duration-[var(--duration-hover)] group-hover:opacity-100 focus-visible:opacity-100"
            >
              <Trash2 size={16} strokeWidth={2} />
            </button>
            <ArrowUpRight
              size={16}
              strokeWidth={2}
              aria-hidden="true"
              className="flex-shrink-0 opacity-0 transition-opacity duration-[var(--duration-hover)] group-hover:opacity-100"
              style={{ color: 'var(--fg-muted)' }}
            />
          </>
        )}
      </div>
    </Link>
  );
}

function PipeChip({ icon: Icon, value }: { icon: React.ElementType; value: string }) {
  return (
    <span className="chip chip--sm">
      <Icon size={12} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--fg-muted)' }} />
      {value}
    </span>
  );
}

function Dot() {
  return (
    <span aria-hidden className="flex-shrink-0 text-caption" style={{ color: 'var(--fg-muted)' }}>
      ·
    </span>
  );
}

/** First non-empty line of the prompt, trimmed for a card preview. */
function firstLine(text: string | undefined): string | null {
  if (!text) return null;
  const line = text.split('\n').map((l) => l.trim()).find(Boolean);
  return line ?? null;
}

function relativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs;
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(epochMs).toLocaleDateString();
}
