'use client';

import { useEffect, useState } from 'react';
import { Ear, BrainCircuit, AudioLines, Languages, Check, Cpu, Waypoints } from 'lucide-react';
import { Field, Input, Select } from '@/components/ui/Field';
import { Section, Panel } from '@/components/ui/Section';
import type { AgentEngine, OmniVoice } from '@/lib/api/agents';
import { fetchOmniVoices } from '@/lib/api/agents';
import type { AgentDraft } from '../useAgentConfig';
import {
  STT_PROVIDERS,
  LLM_PROVIDERS,
  TTS_PROVIDERS,
  PRESET_VOICES,
  PLATFORM_DEFAULTS,
  LANGUAGES,
  OMNI_LANGUAGES,
  type ProviderOption,
} from '../providers';

/** Base language code, dropping any locale suffix ('en-US' → 'en'). */
function baseLang(lang: string): string {
  return (lang || '').split('-')[0].toLowerCase();
}

/**
 * Voice pipeline configuration, ordered to match the actual signal path:
 * speech in (STT) → reasoning (LLM) → speech out (TTS) → voice + language.
 */
export function VoiceTab({
  draft,
  setField,
}: {
  draft: AgentDraft;
  setField: <K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) => void;
}) {
  const presets = PRESET_VOICES[draft.ttsProvider || PLATFORM_DEFAULTS.tts];
  const isOmni = draft.engine === 'omni';
  const isPipeline = !isOmni;

  const [omniVoices, setOmniVoices] = useState<OmniVoice[]>([]);
  const [omniVoicesLoading, setOmniVoicesLoading] = useState(false);

  useEffect(() => {
    if (!isOmni) return;
    setOmniVoicesLoading(true);
    fetchOmniVoices()
      .then(setOmniVoices)
      .catch(() => setOmniVoices([]))
      .finally(() => setOmniVoicesLoading(false));
  }, [isOmni]);

  // Omni supported languages are hardcoded — no API for this list
  const omniLanguages = OMNI_LANGUAGES;
  // Voices filtered to selected language (or all if none selected). Match on the
  // base language code so locale variants (en-US, en-GB, en-CA…) surface under
  // their base language ('en') instead of being filtered out.
  const omniVoicesForLang = isOmni && draft.language
    ? omniVoices.filter((v) => baseLang(v.language) === baseLang(draft.language))
    : omniVoices;

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Engine"
        description="How this agent runs. The pipeline chains swappable STT, LLM, and TTS providers. Omni is a single fused realtime engine that hears, reasons, and speaks over one connection."
      >
        <div role="radiogroup" aria-label="Engine" className="grid gap-3 sm:grid-cols-2">
          <EngineCard
            engine="pipeline"
            icon={Waypoints}
            title="Custom Pipeline"
            note="STT → LLM → TTS · fully swappable, fully traced"
            selected={draft.engine === 'pipeline'}
            onSelect={() => setField('engine', 'pipeline')}
          />
          <EngineCard
            engine="omni"
            icon={Cpu}
            title="PyAI Omni"
            note="Fused realtime engine · native turn-taking & interruption"
            selected={draft.engine === 'omni'}
            onSelect={() => setField('engine', 'omni')}
          />
        </div>
      </Section>

      {isPipeline ? (
        <Section
          title="Pipeline"
          description="Each stage falls back to the server default when left unset. Changes apply to this agent only."
        >
          <div className="flex flex-col gap-3">
            <ProviderPicker
              stage="Speech to text"
              icon={Ear}
              options={STT_PROVIDERS}
              value={draft.sttProvider}
              defaultId={PLATFORM_DEFAULTS.stt}
              onChange={(v) => setField('sttProvider', v)}
            />
            <ProviderPicker
              stage="Language model"
              icon={BrainCircuit}
              options={LLM_PROVIDERS}
              value={draft.llmProvider}
              defaultId={PLATFORM_DEFAULTS.llm}
              onChange={(v) => setField('llmProvider', v)}
            />
            <ProviderPicker
              stage="Text to speech"
              icon={AudioLines}
              options={TTS_PROVIDERS}
              value={draft.ttsProvider}
              defaultId={PLATFORM_DEFAULTS.tts}
              onChange={(v) => setField('ttsProvider', v)}
            />
          </div>
        </Section>
      ) : (
        <Section
          title="Omni runtime"
          description="Omni manages transcription, reasoning, and speech internally — the individual STT/LLM/TTS providers below do not apply. Your prompt and enabled tools still drive its behavior."
        >
          {/* An informational callout is chrome, so it is grey with a hairline —
              never a tinted panel. */}
          <div
            className="flex items-start gap-3 rounded-md p-4"
            style={{
              background: 'var(--surface-recessed)',
              border: '1px solid var(--line-hairline)',
            }}
          >
            <Cpu
              size={16}
              strokeWidth={2}
              aria-hidden="true"
              className="mt-px flex-shrink-0"
              style={{ color: 'var(--fg-muted)' }}
            />
            <p className="text-caption leading-body" style={{ color: 'var(--fg-body)' }}>
              This agent runs on PyAI Omni. Voice selection below is passed through to Omni; STT
              and LLM provider choices are ignored. Tools configured under the Tools tab are
              exposed to Omni and executed by this platform.
            </p>
          </div>
        </Section>
      )}

      <Section title="Voice & language" description="How the agent sounds and which language it speaks.">
        <Panel>
          {isOmni ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Language"
                hint="Filters voices to the selected language."
              >
                <Select
                  value={draft.language}
                  onChange={(e) => {
                    setField('language', e.target.value);
                    // Clear voice when language changes so stale IDs don't persist
                    setField('voiceId', '');
                  }}
                  disabled={omniVoicesLoading}
                >
                  <option value="">All languages</option>
                  {omniLanguages.map((lang) => (
                    <option key={lang.id} value={lang.id}>
                      {lang.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Voice"
                hint={omniVoicesLoading ? 'Loading voices…' : `${omniVoicesForLang.length} voices available`}
              >
                <Select
                  value={draft.voiceId}
                  onChange={(e) => setField('voiceId', e.target.value)}
                  disabled={omniVoicesLoading}
                >
                  <option value="">
                    {omniVoicesLoading ? 'Loading…' : 'Default (stock_sarah_style2)'}
                  </option>
                  {omniVoicesForLang.map((v) => (
                    <option key={v.voice_id} value={v.voice_id}>
                      {v.name}
                      {v.gender ? ` · ${v.gender === 'F' ? 'Female' : v.gender === 'M' ? 'Male' : v.gender}` : ''}
                      {v.region && v.region !== v.language ? ` · ${v.region}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Voice"
                hint={
                  presets
                    ? 'Preset voices for the selected provider.'
                    : 'Paste a voice ID from your provider dashboard.'
                }
              >
                {presets ? (
                  <Select
                    value={draft.voiceId}
                    onChange={(e) => setField('voiceId', e.target.value)}
                  >
                    <option value="">Default ({presets[0]?.id})</option>
                    {presets.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    value={draft.voiceId}
                    onChange={(e) => setField('voiceId', e.target.value)}
                    placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
                  />
                )}
              </Field>

              <Field label="Language" hint="Sets the STT model and TTS locale.">
                <Select
                  value={draft.language}
                  onChange={(e) => setField('language', e.target.value)}
                >
                  <option value="">Default (English)</option>
                  {LANGUAGES.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}

          <div
            className="mt-4 flex items-center gap-2 pt-4"
            style={{ borderTop: '1px solid var(--line-hairline)' }}
          >
            <Languages
              size={16}
              strokeWidth={2}
              aria-hidden="true"
              className="flex-shrink-0"
              style={{ color: 'var(--fg-muted)' }}
            />
            <p className="text-caption leading-body" style={{ color: 'var(--fg-muted)' }}>
              {isOmni
                ? 'Voice catalog fetched live from PyAI. Select a language first to filter by locale.'
                : 'Voice preview and cloning arrive with the audio-sample endpoint. Start a voice session to hear the current configuration.'}
            </p>
          </div>
        </Panel>
      </Section>
    </div>
  );
}

/**
 * One pipeline stage as a row of selectable cards. Cards beat a select here:
 * the option count is small and each option carries a differentiator worth
 * showing without a click.
 */
function ProviderPicker({
  stage,
  icon: Icon,
  options,
  value,
  defaultId,
  onChange,
}: {
  stage: string;
  icon: React.ElementType;
  options: ProviderOption[];
  value: string;
  defaultId: string;
  onChange: (value: string) => void;
}) {
  const defaultLabel = options.find((o) => o.id === defaultId)?.label ?? defaultId;

  return (
    <Panel>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Icon size={16} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--fg-muted)' }} />
          <span className="text-caption font-medium" style={{ color: 'var(--fg-strong)' }}>
            {stage}
          </span>
        </div>

        <div
          role="radiogroup"
          aria-label={stage}
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(auto-fit, minmax(148px, 1fr))` }}
        >
          <ProviderCard
            label="Server default"
            note={defaultLabel}
            selected={value === ''}
            onSelect={() => onChange('')}
          />
          {options.map((opt) => (
            <ProviderCard
              key={opt.id}
              label={opt.label}
              note={opt.note}
              requiresKey={opt.requiresKey}
              selected={value === opt.id}
              onSelect={() => onChange(opt.id)}
            />
          ))}
        </div>
      </div>
    </Panel>
  );
}

/**
 * Selected state on an option card is an ink border, a stepped grey fill, and an
 * ink check badge — three monochrome signals. An accent border here is the most
 * tempting colour-as-chrome move in the language; selection is chrome.
 */
const PICKER_BASE =
  'flex cursor-pointer text-left transition-colors duration-[var(--duration-hover)] rounded-md border';

function pickerStyle(selected: boolean): React.CSSProperties {
  return {
    borderColor: selected ? 'var(--fg-ink)' : 'var(--line-hairline)',
    background: selected ? 'var(--surface-selected)' : 'var(--surface-card)',
  };
}

/** 18px ink pill with an inverted glyph. Never a status colour — this is not "healthy". */
function CheckBadge() {
  return (
    <span
      aria-hidden="true"
      className="flex flex-shrink-0 items-center justify-center rounded-full"
      style={{
        width: 18,
        height: 18,
        background: 'var(--fg-ink)',
        color: 'var(--fg-on-ink)',
      }}
    >
      <Check size={12} strokeWidth={2.4} />
    </span>
  );
}

/** Larger sibling of ProviderCard for the top-level engine choice. */
function EngineCard({
  engine: _engine,
  icon: Icon,
  title,
  note,
  selected,
  onSelect,
}: {
  engine: AgentEngine;
  icon: React.ElementType;
  title: string;
  note: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`${PICKER_BASE} items-start gap-3 p-4 ${
        selected ? '' : 'hover:border-[var(--line-strong)]'
      }`}
      style={pickerStyle(selected)}
    >
      <span
        className="flex flex-shrink-0 items-center justify-center rounded-sm"
        style={{
          width: 32,
          height: 32,
          background: 'var(--surface-recessed)',
          border: '1px solid var(--line-hairline)',
          color: selected ? 'var(--fg-ink)' : 'var(--fg-muted)',
        }}
      >
        <Icon size={16} strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center justify-between gap-2">
          <span className="text-nav font-medium" style={{ color: 'var(--fg-ink)' }}>
            {title}
          </span>
          {selected && <CheckBadge />}
        </span>
        <span className="text-caption leading-body" style={{ color: 'var(--fg-muted)' }}>
          {note}
        </span>
      </span>
    </button>
  );
}

function ProviderCard({
  label,
  note,
  requiresKey,
  selected,
  onSelect,
}: {
  label: string;
  note: string;
  requiresKey?: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`${PICKER_BASE} flex-col items-start gap-1 px-3 py-3 ${
        selected ? '' : 'hover:border-[var(--line-strong)]'
      }`}
      style={pickerStyle(selected)}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="text-nav font-medium" style={{ color: 'var(--fg-ink)' }}>
          {label}
        </span>
        {selected && <CheckBadge />}
      </span>
      <span className="text-caption leading-body" style={{ color: 'var(--fg-muted)' }}>
        {note}
        {requiresKey && ' · needs key'}
      </span>
    </button>
  );
}
