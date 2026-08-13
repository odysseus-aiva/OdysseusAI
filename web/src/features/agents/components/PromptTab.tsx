'use client';

import { useMemo, useState } from 'react';
import { FileText, Sparkles, History } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Field';
import { Section, Panel, Collapsible } from '@/components/ui/Section';
import type { AgentDraft } from '../useAgentConfig';

/** Starting points for common voice-agent roles. */
const TEMPLATES: { id: string; label: string; description: string; prompt: string }[] = [
  {
    id: 'support',
    label: 'Customer support',
    description: 'Resolves issues, escalates when stuck',
    prompt: `You are a customer support agent for {{company_name}}.

Speak naturally and keep replies to one or two sentences — this is a phone call, not a chat.

Your job:
- Understand the caller's problem before proposing a fix.
- Ask one question at a time.
- Use your tools to look up real information instead of guessing.
- If you cannot resolve the issue, say so plainly and offer to escalate.

Never invent account details, prices, or policies.`,
  },
  {
    id: 'receptionist',
    label: 'Receptionist',
    description: 'Routes calls, books appointments',
    prompt: `You are the receptionist for {{company_name}}.

Greet the caller warmly, then find out what they need in as few words as possible.

Your job:
- Determine whether the caller wants to book, reschedule, or ask a question.
- Collect only the details you actually need.
- Confirm dates and times by repeating them back.
- End the call once the caller's request is handled.

Keep every reply short. This is a voice call.`,
  },
  {
    id: 'qualifier',
    label: 'Lead qualifier',
    description: 'Qualifies inbound interest',
    prompt: `You are a sales development representative for {{company_name}}.

Your goal is to find out whether the caller is a good fit, without interrogating them.

Ask about:
- What problem they are trying to solve.
- Their timeline.
- Whether they are the decision maker.

Keep it conversational — one question per turn. If they are a strong fit, offer to book a call with the team. If not, thank them and end politely.`,
  },
  {
    id: 'minimal',
    label: 'Minimal assistant',
    description: 'Bare, general-purpose baseline',
    prompt: `You are a helpful voice assistant.

Keep answers short and natural for speech. Avoid lists, markdown, and long explanations. If you are unsure, say so.`,
  },
];

/** `{{variable}}` occurrences the prompt expects to be interpolated. */
function extractVariables(prompt: string): string[] {
  const matches = prompt.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g);
  return [...new Set([...matches].map((m) => m[1]))];
}

export function PromptTab({
  draft,
  setField,
}: {
  draft: AgentDraft;
  setField: <K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) => void;
}) {
  const [confirmTemplate, setConfirmTemplate] = useState<string | null>(null);

  const variables = useMemo(() => extractVariables(draft.systemPrompt), [draft.systemPrompt]);
  const charCount = draft.systemPrompt.length;
  // Rough token estimate — 4 chars/token is the standard approximation.
  const tokenEstimate = Math.ceil(charCount / 4);

  const applyTemplate = (id: string) => {
    const template = TEMPLATES.find((t) => t.id === id);
    if (!template) return;
    // Only warn when there is real content that would be lost.
    if (draft.systemPrompt.trim().length > 0 && confirmTemplate !== id) {
      setConfirmTemplate(id);
      return;
    }
    setField('systemPrompt', template.prompt);
    setConfirmTemplate(null);
  };

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="System prompt"
        description="Defines the agent's role, tone, and boundaries. Written for speech — short sentences, no markdown."
        action={
          <span
            className="text-[11px] tabular-nums"
            style={{ color: 'var(--color-text-faint)' }}
          >
            {charCount.toLocaleString()} chars · ~{tokenEstimate.toLocaleString()} tokens
          </span>
        }
      >
        <Textarea
          value={draft.systemPrompt}
          onChange={(e) => setField('systemPrompt', e.target.value)}
          rows={16}
          mono
          placeholder="You are a helpful voice assistant…"
          aria-label="System prompt"
        />

        {/* Variables the prompt references */}
        {variables.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11.5px]" style={{ color: 'var(--color-text-faint)' }}>
              Expects {variables.length === 1 ? 'variable' : 'variables'}:
            </span>
            {variables.map((v) => (
              <code
                key={v}
                className="rounded-[5px] px-1.5 py-0.5 font-mono text-[11px]"
                style={{
                  background: 'var(--color-accent-subtle)',
                  border: '1px solid var(--color-accent-hairline)',
                  color: 'var(--color-accent)',
                }}
              >
                {v}
              </code>
            ))}
            <span className="text-[11px]" style={{ color: 'var(--color-text-faint)' }}>
              — supplied per call as dynamic variables.
            </span>
          </div>
        )}
      </Section>

      <Section
        title="Templates"
        description="Replace the prompt with a proven starting point, then edit."
      >
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(196px, 1fr))' }}>
          {TEMPLATES.map((template) => {
            const pendingConfirm = confirmTemplate === template.id;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => applyTemplate(template.id)}
                onBlur={() => pendingConfirm && setConfirmTemplate(null)}
                className="group flex cursor-pointer flex-col items-start gap-1 rounded-[10px] px-3.5 py-3 text-left transition-all duration-[160ms]"
                style={{
                  background: pendingConfirm
                    ? 'rgb(251 191 36 / 0.06)'
                    : 'var(--color-surface-raised)',
                  border: `1px solid ${
                    pendingConfirm ? 'rgb(251 191 36 / 0.28)' : 'var(--color-border)'
                  }`,
                }}
                onMouseEnter={(e) => {
                  if (!pendingConfirm) {
                    e.currentTarget.style.borderColor = 'var(--color-border-strong)';
                    e.currentTarget.style.background = 'var(--color-surface-elevated)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!pendingConfirm) {
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                    e.currentTarget.style.background = 'var(--color-surface-raised)';
                  }
                }}
              >
                <span className="flex items-center gap-1.5">
                  <FileText
                    size={11.5}
                    strokeWidth={2}
                    style={{
                      color: pendingConfirm
                        ? 'var(--color-state-warning)'
                        : 'var(--color-text-faint)',
                    }}
                  />
                  <span
                    className="text-[12.5px] font-[500]"
                    style={{
                      color: pendingConfirm
                        ? 'var(--color-state-warning)'
                        : 'var(--color-text)',
                    }}
                  >
                    {template.label}
                  </span>
                </span>
                <span
                  className="text-[11px] leading-[1.45]"
                  style={{ color: 'var(--color-text-faint)' }}
                >
                  {pendingConfirm
                    ? 'Click again to replace your prompt'
                    : template.description}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Greeting" description="The first thing the agent says when a call connects.">
        <Panel>
          <Field
            label="Opening line"
            hint='Leave empty for the platform default. Enter a single space to connect silently and let the caller speak first.'
          >
            <Textarea
              value={draft.greeting}
              onChange={(e) => setField('greeting', e.target.value)}
              rows={2}
              placeholder="Hi, thanks for calling. How can I help?"
            />
          </Field>
        </Panel>
      </Section>

      {/* Reserved capability — declared so its absence reads as planned. */}
      <Collapsible
        title="Prompt versions"
        description="History, diffing, and rollback"
      >
        <div className="flex items-start gap-2.5">
          <History
            size={13}
            strokeWidth={1.9}
            className="mt-0.5 flex-shrink-0"
            style={{ color: 'var(--color-text-faint)' }}
          />
          <div className="flex flex-col gap-1.5">
            <p className="text-[12.5px] leading-[1.6]" style={{ color: 'var(--color-text-muted)' }}>
              Every save will create a version you can compare and roll back to, with A/B testing
              across live calls.
            </p>
            <p className="text-[11.5px]" style={{ color: 'var(--color-text-faint)' }}>
              Needs a <code className="font-mono">prompt_versions</code> collection and a revision
              endpoint. The current prompt saves directly to the agent record.
            </p>
          </div>
        </div>
      </Collapsible>

      <Collapsible title="Test this prompt" description="Run a scripted conversation without placing a call">
        <div className="flex items-start gap-2.5">
          <Sparkles
            size={13}
            strokeWidth={1.9}
            className="mt-0.5 flex-shrink-0"
            style={{ color: 'var(--color-text-faint)' }}
          />
          <div className="flex flex-col items-start gap-2.5">
            <p className="text-[12.5px] leading-[1.6]" style={{ color: 'var(--color-text-muted)' }}>
              Text-based prompt evaluation is not wired up yet. To verify behavior now, save your
              changes and start a voice session.
            </p>
            <Button variant="ghost" size="sm" disabled>
              Run conversation test
            </Button>
          </div>
        </div>
      </Collapsible>
    </div>
  );
}
