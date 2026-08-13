'use client';

import { useMemo } from 'react';
import { Braces, Info, Database } from 'lucide-react';
import { Section, Panel, EmptyState, DataRow } from '@/components/ui/Section';

/**
 * Variables the prompt interpolates at call time.
 *
 * The backend resolves `{{name}}` placeholders from the session's
 * `dynamicVariables` (see `ConversationState.dynamicVariables`), so this tab is
 * derived from the prompt rather than separately stored — no backend change
 * needed to make it accurate.
 */

/** Variables the platform always injects. */
const BUILT_IN_VARIABLES: { name: string; description: string }[] = [
  { name: 'current_datetime', description: 'Call start time in the agent’s locale' },
  { name: 'call_id', description: 'Unique identifier for the active call' },
  { name: 'agent_name', description: 'This agent’s display name' },
];

export function VariablesTab({ systemPrompt, greeting }: { systemPrompt: string; greeting: string }) {
  const referenced = useMemo(() => {
    const source = `${systemPrompt}\n${greeting}`;
    const matches = source.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g);
    return [...new Set([...matches].map((m) => m[1]))].sort();
  }, [systemPrompt, greeting]);

  const builtInNames = new Set(BUILT_IN_VARIABLES.map((v) => v.name));
  const custom = referenced.filter((v) => !builtInNames.has(v));

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Referenced in this agent"
        description="Detected from the system prompt and greeting. Each must be supplied when the session starts."
      >
        {referenced.length === 0 ? (
          <EmptyState
            icon={Braces}
            title="No variables referenced"
            description="Add a placeholder like {{customer_name}} to your prompt and it will appear here, ready to be supplied per call."
          />
        ) : (
          <Panel flush>
            <ul>
              {referenced.map((name, i) => {
                const builtIn = builtInNames.has(name);
                return (
                  <li
                    key={name}
                    className="flex items-center justify-between gap-4 px-3.5 py-2.5"
                    style={{ borderTop: i === 0 ? undefined : '1px solid var(--color-border)' }}
                  >
                    <code
                      className="font-mono text-[12px]"
                      style={{ color: 'var(--color-accent)' }}
                    >
                      {`{{${name}}}`}
                    </code>
                    <span
                      className="flex-shrink-0 rounded-[5px] px-1.5 py-0.5 text-[10.5px] font-[500]"
                      style={{
                        background: builtIn
                          ? 'var(--color-surface-elevated)'
                          : 'rgb(251 191 36 / 0.08)',
                        color: builtIn
                          ? 'var(--color-text-muted)'
                          : 'var(--color-state-warning)',
                      }}
                    >
                      {builtIn ? 'Provided automatically' : 'Must be supplied per call'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}
      </Section>

      <Section title="Built-in variables" description="Always available — no need to pass these in.">
        <Panel>
          {BUILT_IN_VARIABLES.map((v) => (
            <DataRow key={v.name} label={v.description} mono>
              {`{{${v.name}}}`}
            </DataRow>
          ))}
        </Panel>
      </Section>

      {custom.length > 0 && (
        <Section title="How to supply these" description="Pass values when creating the session.">
          <Panel>
            <div className="flex items-start gap-2.5">
              <Info
                size={13}
                strokeWidth={1.9}
                className="mt-0.5 flex-shrink-0"
                style={{ color: 'var(--color-text-faint)' }}
              />
              <div className="flex min-w-0 flex-col gap-2">
                <p className="text-[12.5px] leading-[1.6]" style={{ color: 'var(--color-text-muted)' }}>
                  Include a <code className="font-mono">dynamicVariables</code> object in the
                  session-start request. Any key not supplied is left as literal text in the prompt.
                </p>
                <pre
                  className="overflow-x-auto rounded-[8px] px-3 py-2.5 font-mono text-[11.5px] leading-[1.6]"
                  style={{
                    background: 'var(--color-abyss)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-muted)',
                  }}
                >
{`POST /session/start
{
  "agentConfig": { "agentId": "…" },
  "dynamicVariables": {
${custom.map((v) => `    "${v}": "…"`).join(',\n')}
  }
}`}
                </pre>
              </div>
            </div>
          </Panel>
        </Section>
      )}

      <Section title="Coming later" description="Variable sources beyond per-call values.">
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(212px, 1fr))' }}>
          <div
            className="flex flex-col gap-2 rounded-[10px] px-3.5 py-3"
            style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
          >
            <span className="flex items-center gap-2">
              <Database size={13} strokeWidth={1.9} style={{ color: 'var(--color-text-faint)' }} />
              <span className="text-[12.5px] font-[500]" style={{ color: 'var(--color-text)' }}>
                CRM lookup
              </span>
            </span>
            <p className="text-[11.5px] leading-[1.55]" style={{ color: 'var(--color-text-faint)' }}>
              Resolve caller details from your CRM by phone number before the greeting plays.
            </p>
          </div>
          <div
            className="flex flex-col gap-2 rounded-[10px] px-3.5 py-3"
            style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
          >
            <span className="flex items-center gap-2">
              <Braces size={13} strokeWidth={1.9} style={{ color: 'var(--color-text-faint)' }} />
              <span className="text-[12.5px] font-[500]" style={{ color: 'var(--color-text)' }}>
                Default values
              </span>
            </span>
            <p className="text-[11.5px] leading-[1.55]" style={{ color: 'var(--color-text-faint)' }}>
              Per-variable fallbacks so a missing value never leaks raw syntax into speech.
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}
