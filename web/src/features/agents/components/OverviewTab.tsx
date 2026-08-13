'use client';

import Link from 'next/link';
import { Ear, BrainCircuit, AudioLines, Wrench, MessageSquare, ArrowRight, Cpu, Waypoints } from 'lucide-react';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Section, Panel } from '@/components/ui/Section';
import type { Agent } from '@/lib/api/agents';
import type { AgentDraft } from '../useAgentConfig';
import {
  STT_PROVIDERS,
  LLM_PROVIDERS,
  TTS_PROVIDERS,
  PLATFORM_DEFAULTS,
  providerLabel,
  languageLabel,
} from '../providers';

/**
 * Identity plus an at-a-glance summary of the whole configuration, so the first
 * tab answers "what is this agent and is it ready?" without navigating.
 */
export function OverviewTab({
  agent,
  draft,
  setField,
  enabledCount,
  onGoToTab,
}: {
  agent: Agent;
  draft: AgentDraft;
  setField: <K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) => void;
  enabledCount: number;
  onGoToTab: (tab: 'prompt' | 'voice' | 'tools') => void;
}) {
  const hasPrompt = draft.systemPrompt.trim().length > 0;

  return (
    <div className="flex flex-col gap-8">
      <Section title="Identity" description="How this agent is labeled across the platform.">
        <Panel>
          <div className="flex flex-col gap-4">
            <Field label="Display name" hint="Shown in the agent picker and call history.">
              <Input
                value={draft.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="Support Bot"
              />
            </Field>
            <Field
              label="Greeting"
              hint="First words spoken when a call connects. Edit the full prompt under Prompt."
            >
              <Textarea
                value={draft.greeting}
                onChange={(e) => setField('greeting', e.target.value)}
                rows={2}
                placeholder="Hi, thanks for calling. How can I help?"
              />
            </Field>
          </div>
        </Panel>
      </Section>

      <Section
        title="Configuration"
        description="Resolved values for this agent. Blank stages fall back to the server default."
      >
        {/* Engine first (it decides whether the pipeline row even applies), then
            the signal pipeline, then what shapes behavior. */}
        <div className="flex flex-col gap-2.5">
          <SummaryTile
            icon={draft.engine === 'omni' ? Cpu : Waypoints}
            label="Engine"
            value={draft.engine === 'omni' ? 'PyAI Omni' : 'Custom Pipeline'}
            detail={
              draft.engine === 'omni'
                ? 'Fused realtime engine'
                : 'Swappable STT · LLM · TTS'
            }
            accent
            onClick={() => onGoToTab('voice')}
          />
          {draft.engine === 'pipeline' && (
            <div className="grid gap-2.5 sm:grid-cols-3">
              <SummaryTile
                icon={Ear}
                label="Speech to text"
                value={providerLabel(STT_PROVIDERS, draft.sttProvider || PLATFORM_DEFAULTS.stt)}
                inherited={!draft.sttProvider}
                onClick={() => onGoToTab('voice')}
              />
              <SummaryTile
                icon={BrainCircuit}
                label="Language model"
                value={providerLabel(LLM_PROVIDERS, draft.llmProvider || PLATFORM_DEFAULTS.llm)}
                inherited={!draft.llmProvider}
                onClick={() => onGoToTab('voice')}
              />
              <SummaryTile
                icon={AudioLines}
                label="Text to speech"
                value={providerLabel(TTS_PROVIDERS, draft.ttsProvider || PLATFORM_DEFAULTS.tts)}
                detail={[draft.voiceId || 'default voice', languageLabel(draft.language) || 'English']
                  .filter(Boolean)
                  .join(' · ')}
                inherited={!draft.ttsProvider}
                onClick={() => onGoToTab('voice')}
              />
            </div>
          )}
          <div className="grid gap-2.5 sm:grid-cols-2">
            <SummaryTile
              icon={MessageSquare}
              label="System prompt"
              value={
                hasPrompt
                  ? `${draft.systemPrompt.trim().length.toLocaleString()} chars`
                  : 'Not set'
              }
              detail={hasPrompt ? 'Defines role and tone' : 'Agent has no instructions'}
              warn={!hasPrompt}
              onClick={() => onGoToTab('prompt')}
            />
            <SummaryTile
              icon={Wrench}
              label="Tools"
              value={enabledCount === 0 ? 'None enabled' : `${enabledCount} enabled`}
              detail={
                enabledCount === 0
                  ? 'Agent cannot take actions'
                  : 'Available during calls'
              }
              warn={enabledCount === 0}
              onClick={() => onGoToTab('tools')}
            />
          </div>
        </div>
      </Section>

      <Section title="Try it" description="Open a live voice session using the saved configuration.">
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12.5px] leading-[1.55]" style={{ color: 'var(--color-text-muted)' }}>
              Unsaved edits are not used by the session. Save first, then start a call.
            </p>
            <Link
              href={`/?agentId=${encodeURIComponent(agent.agentId)}`}
              className="group flex flex-shrink-0 items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12.5px] font-[500] transition-colors duration-[140ms]"
              style={{
                background: 'var(--color-accent-subtle)',
                border: '1px solid var(--color-accent-border)',
                color: 'var(--color-accent)',
              }}
            >
              Start voice session
              <ArrowRight
                size={12}
                strokeWidth={2.2}
                className="transition-transform duration-[180ms] group-hover:translate-x-0.5"
              />
            </Link>
          </div>
        </Panel>
      </Section>
    </div>
  );
}

/** Compact metric tile. Clicking jumps to the tab that owns the setting. */
function SummaryTile({
  icon: Icon,
  label,
  value,
  detail,
  inherited = false,
  warn = false,
  accent = false,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  detail?: string;
  /** True when the value comes from the server default rather than this agent. */
  inherited?: boolean;
  warn?: boolean;
  /** Highlight the icon + value in accent — used for the engine tile. */
  accent?: boolean;
  onClick: () => void;
}) {
  const valueColor = warn
    ? 'var(--color-state-warning)'
    : accent
      ? 'var(--color-accent)'
      : 'var(--color-text)';
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex cursor-pointer flex-col items-start gap-2 rounded-[10px] px-3.5 py-3 text-left transition-all duration-[160ms]"
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-strong)';
        e.currentTarget.style.background = 'var(--color-surface-elevated)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border)';
        e.currentTarget.style.background = 'var(--color-surface-raised)';
      }}
    >
      <span className="flex w-full items-center gap-1.5">
        <Icon
          size={12}
          strokeWidth={2}
          style={{ color: accent ? 'var(--color-accent)' : 'var(--color-text-faint)' }}
        />
        <span
          className="text-[10.5px] font-[600] uppercase tracking-[0.08em]"
          style={{ color: 'var(--color-text-faint)' }}
        >
          {label}
        </span>
      </span>

      <span className="flex flex-col gap-0.5">
        <span
          className="text-[13.5px] font-[550] tracking-[-0.015em]"
          style={{ color: valueColor }}
        >
          {value}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--color-text-faint)' }}>
          {detail ?? (inherited ? 'Server default' : 'Set for this agent')}
        </span>
      </span>
    </button>
  );
}
