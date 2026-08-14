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
                    className="flex items-center justify-between gap-4 px-4 py-3"
                    style={{ borderTop: i === 0 ? undefined : '1px solid var(--line-hairline)' }}
                  >
                    <code className="font-mono text-caption" style={{ color: 'var(--fg-ink)' }}>
                      {`{{${name}}}`}
                    </code>
                    {/* Both states are normal and expected, so neither is a status:
                        the label text carries the whole distinction. */}
                    <span className="badge flex-shrink-0">
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
            <div className="flex items-start gap-3">
              <Info
                size={16}
                strokeWidth={1.8}
                aria-hidden="true"
                className="mt-px flex-shrink-0"
                style={{ color: 'var(--fg-muted)' }}
              />
              <div className="flex min-w-0 flex-col gap-3">
                <p className="text-caption leading-body" style={{ color: 'var(--fg-body)' }}>
                  Include a <code className="font-mono">dynamicVariables</code> object in the
                  session-start request. Any key not supplied is left as literal text in the prompt.
                </p>
                <pre className="code-block">
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
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(212px, 1fr))' }}>
          <PlannedCard
            icon={Database}
            title="CRM lookup"
            body="Resolve caller details from your CRM by phone number before the greeting plays."
          />
          <PlannedCard
            icon={Braces}
            title="Default values"
            body="Per-variable fallbacks so a missing value never leaks raw syntax into speech."
          />
        </div>
      </Section>
    </div>
  );
}

function PlannedCard({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ElementType;
  title: string;
  body: string;
}) {
  return (
    <div className="card flex flex-col gap-2">
      <span className="flex items-center gap-2">
        <Icon size={16} strokeWidth={1.8} aria-hidden="true" style={{ color: 'var(--fg-muted)' }} />
        <span className="text-nav font-medium" style={{ color: 'var(--fg-ink)' }}>
          {title}
        </span>
      </span>
      <p className="text-caption leading-body" style={{ color: 'var(--fg-muted)' }}>
        {body}
      </p>
    </div>
  );
}
