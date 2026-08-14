'use client';

import Link from 'next/link';
import { Ear, BrainCircuit, AudioLines, Wrench, MessageSquare, ArrowRight, Cpu, Waypoints, Phone } from 'lucide-react';
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
  onGoToTab: (tab: 'prompt' | 'voice' | 'tools' | 'advanced') => void;
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
        <div className="flex flex-col gap-3">
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
            <div className="grid gap-3 sm:grid-cols-3">
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
          <div className="grid gap-3 sm:grid-cols-2">
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
          <PhoneNumberTile phoneNumber={draft.phoneNumber} onGoToAdvanced={() => onGoToTab('advanced')} />
        </div>
      </Section>

      <Section title="Try it" description="Open a live voice session using the saved configuration.">
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-caption leading-body" style={{ color: 'var(--fg-muted)' }}>
              Unsaved edits are not used by the session. Save first, then start a call.
            </p>
            <Link
              href={`/?agentId=${encodeURIComponent(agent.agentId)}`}
              className="btn btn--secondary flex-shrink-0"
            >
              Start voice session
              <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
            </Link>
          </div>
        </Panel>
      </Section>
    </div>
  );
}

/** Read-only phone number pill shown in the Overview configuration grid. */
function PhoneNumberTile({
  phoneNumber,
  onGoToAdvanced,
}: {
  phoneNumber: string;
  onGoToAdvanced: () => void;
}) {
  const hasNumber = phoneNumber.trim().length > 0;
  return (
    <button
      type="button"
      onClick={onGoToAdvanced}
      className="card flex cursor-pointer items-center gap-3 text-left transition-colors duration-[var(--duration-hover)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-hover)]"
    >
      <Phone
        size={16}
        strokeWidth={1.8}
        aria-hidden="true"
        style={{ color: hasNumber ? 'var(--fg-ink)' : 'var(--fg-muted)', flexShrink: 0 }}
      />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-caption" style={{ color: 'var(--fg-muted)' }}>
          Inbound number
        </span>
        {hasNumber ? (
          <span className="font-mono text-nav font-medium" style={{ color: 'var(--fg-ink)' }}>
            {phoneNumber}
          </span>
        ) : (
          <span className="text-caption" style={{ color: 'var(--fg-muted)' }}>
            No number assigned · click to configure
          </span>
        )}
      </div>
    </button>
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
  /** Emphasise the icon — used for the engine tile. Monochrome, never a hue. */
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card flex cursor-pointer flex-col items-start gap-2 text-left transition-colors duration-[var(--duration-hover)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-hover)]"
    >
      <span className="flex w-full items-center gap-2">
        <Icon
          size={16}
          strokeWidth={2}
          aria-hidden="true"
          style={{ color: accent ? 'var(--fg-ink)' : 'var(--fg-muted)' }}
        />
        <span className="text-caption" style={{ color: 'var(--fg-muted)' }}>
          {label}
        </span>
      </span>

      <span className="flex flex-col gap-1">
        <span className="text-body font-medium" style={{ color: 'var(--fg-ink)' }}>
          {value}
        </span>
        {/* The value stays ink so the column scans; only the diagnosis below it
            takes a status colour, and only when something is actually wrong. */}
        <span
          className="text-caption"
          style={{ color: warn ? 'var(--status-warning)' : 'var(--fg-muted)' }}
        >
          {detail ?? (inherited ? 'Server default' : 'Set for this agent')}
        </span>
      </span>
    </button>
  );
}
