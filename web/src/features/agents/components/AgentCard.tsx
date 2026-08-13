'use client';

import Link from 'next/link';
import { Bot, Wrench, ArrowUpRight, Ear, BrainCircuit, AudioLines, Cpu } from 'lucide-react';
import type { Agent } from '@/lib/api/agents';
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
}: {
  agent: Agent;
  /** undefined while the count is still resolving. */
  toolCount: number | undefined;
}) {
  const stt = providerLabel(STT_PROVIDERS, agent.defaultProviders?.stt || PLATFORM_DEFAULTS.stt);
  const llm = providerLabel(LLM_PROVIDERS, agent.defaultProviders?.llm || PLATFORM_DEFAULTS.llm);
  const tts = providerLabel(TTS_PROVIDERS, agent.defaultProviders?.tts || PLATFORM_DEFAULTS.tts);

  const summary = firstLine(agent.systemPrompt) ?? agent.agentId;
  const voiceBits = [agent.voiceId, languageLabel(agent.language)].filter(Boolean).join(' · ');
  const isOmni = agent.engine === 'omni';

  return (
    <Link
      href={`/agents/${encodeURIComponent(agent.agentId)}`}
      className="group relative flex flex-col overflow-hidden rounded-[13px] transition-colors duration-[160ms]"
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-accent-border)';
        e.currentTarget.style.background = 'var(--color-surface-elevated)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border)';
        e.currentTarget.style.background = 'var(--color-surface-raised)';
      }}
    >
      {/* Top accent hairline, revealed on hover */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-[220ms] group-hover:opacity-100"
        style={{
          background:
            'linear-gradient(90deg, transparent, var(--color-accent) 50%, transparent)',
        }}
      />

      {/* Header: glyph + identity + open affordance */}
      <div className="flex items-start gap-3 px-4 pt-4">
        <div
          className="flex flex-shrink-0 items-center justify-center rounded-[10px]"
          style={{
            width: 36,
            height: 36,
            background: 'var(--color-accent-subtle)',
            border: '1px solid var(--color-accent-hairline)',
          }}
        >
          <Bot size={16} strokeWidth={2} style={{ color: 'var(--color-accent)' }} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className="truncate text-[14px] font-[600] tracking-[-0.02em]"
            style={{ color: 'var(--color-text)' }}
          >
            {agent.name}
          </span>
          <span
            className="truncate font-mono text-[11px]"
            style={{ color: 'var(--color-text-faint)' }}
          >
            {agent.agentId}
          </span>
        </div>

        {isOmni ? (
          <span
            className="flex flex-shrink-0 items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[10.5px] font-[500]"
            style={{ background: 'var(--color-accent-subtle)', color: 'var(--color-accent)' }}
          >
            <Cpu size={10} strokeWidth={2.2} />
            Omni
          </span>
        ) : (
          <span
            className="flex flex-shrink-0 items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[10.5px] font-[500]"
            style={{ background: 'rgb(74 222 128 / 0.08)', color: 'var(--color-state-speaking)' }}
          >
            <span
              aria-hidden
              className="rounded-full"
              style={{ width: 4, height: 4, background: 'var(--color-state-speaking)' }}
            />
            Ready
          </span>
        )}
      </div>

      {/* One-line description / prompt preview */}
      <p
        className="line-clamp-2 min-h-[34px] px-4 pt-2.5 text-[12px] leading-[1.5]"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {summary}
      </p>

      {/* Pipeline chips — only meaningful for the pipeline engine. Omni fuses
          these stages, so we show a single engine chip instead. */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3">
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
        className="mt-3.5 flex items-center gap-3 px-4 py-2.5"
        style={{ borderTop: '1px solid var(--color-border)' }}
      >
        <span className="flex items-center gap-1.5" title="Enabled tools">
          <Wrench size={11.5} strokeWidth={2} style={{ color: 'var(--color-text-faint)' }} />
          <span className="text-[11.5px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
            {toolCount == null ? '—' : `${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}`}
          </span>
        </span>

        {voiceBits && (
          <>
            <Dot />
            <span className="truncate text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>
              {voiceBits}
            </span>
          </>
        )}

        <span className="flex-1" />

        <span className="flex-shrink-0 text-[11px]" style={{ color: 'var(--color-text-faint)' }}>
          {relativeTime(agent.updatedAt)}
        </span>
        <ArrowUpRight
          size={13}
          strokeWidth={2}
          className="flex-shrink-0 -translate-x-0.5 opacity-0 transition-all duration-[160ms] group-hover:translate-x-0 group-hover:opacity-100"
          style={{ color: 'var(--color-accent)' }}
        />
      </div>
    </Link>
  );
}

function PipeChip({ icon: Icon, value }: { icon: React.ElementType; value: string }) {
  return (
    <span
      className="flex items-center gap-1 rounded-[6px] px-1.5 py-1"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <Icon size={10.5} strokeWidth={2} style={{ color: 'var(--color-text-faint)' }} />
      <span className="text-[11px] font-[450]" style={{ color: 'var(--color-text-muted)' }}>
        {value}
      </span>
    </span>
  );
}

function Dot() {
  return (
    <span
      aria-hidden
      className="flex-shrink-0 rounded-full"
      style={{ width: 2.5, height: 2.5, background: 'var(--color-text-faint)' }}
    />
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
