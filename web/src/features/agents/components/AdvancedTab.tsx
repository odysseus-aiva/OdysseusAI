'use client';

import { useState } from 'react';
import { Copy, Check, Webhook, FlaskConical, BarChart3, ShoppingCart } from 'lucide-react';
import { Section, Panel, Collapsible, DataRow } from '@/components/ui/Section';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import type { Agent } from '@/lib/api/agents';
import type { AgentDraft, ToolDraft } from '../useAgentConfig';
import { BuyNumberModal } from './BuyNumberModal';

/**
 * Internal identifiers, raw state inspection, and reserved capabilities. Kept
 * last and mostly collapsed — nothing here is needed on the common path.
 */
export function AdvancedTab({
  agent,
  draft,
  setField,
  toolDrafts,
}: {
  agent: Agent;
  draft: AgentDraft;
  setField: <K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) => void;
  toolDrafts: Record<string, ToolDraft>;
}) {
  const [showBuyModal, setShowBuyModal] = useState(false);

  const enabledTools = Object.entries(toolDrafts)
    .filter(([, d]) => d.enabled)
    .map(([name]) => name);

  return (
    <>
    {showBuyModal && (
      <BuyNumberModal
        onClose={() => setShowBuyModal(false)}
        onPurchased={(phoneNumber) => {
          setField('phoneNumber', phoneNumber);
          setShowBuyModal(false);
        }}
      />
    )}
    <div className="flex flex-col gap-8">
      <Section
        title="Telephony"
        description="Assign a Twilio number so inbound calls route directly to this agent."
      >
        <Panel>
          <div className="flex flex-col gap-3">
            <Field
              label="Phone Number"
              hint="E.164 format, e.g. +15551234567. Inbound calls to this number will start this agent."
            >
              <div className="flex gap-2">
                <Input
                  value={draft.phoneNumber}
                  onChange={(e) => setField('phoneNumber', e.target.value)}
                  placeholder="+15551234567"
                  className="flex-1 font-mono"
                />
                <Button
                  variant="secondary"
                  className="flex-shrink-0"
                  onClick={() => setShowBuyModal(true)}
                >
                  <ShoppingCart size={16} strokeWidth={2} aria-hidden="true" />
                  Buy a number
                </Button>
              </div>
            </Field>
          </div>
        </Panel>
      </Section>

      <Section title="Identifiers" description="Use these when calling the API directly.">
        <Panel>
          <DataRow label="Agent ID" mono>
            <CopyableValue value={agent.agentId} />
          </DataRow>
          <div style={{ borderTop: '1px solid var(--line-hairline)' }}>
            <DataRow label="Created" >
              {new Date(agent.createdAt).toLocaleString()}
            </DataRow>
          </div>
          <div style={{ borderTop: '1px solid var(--line-hairline)' }}>
            <DataRow label="Last updated">
              {new Date(agent.updatedAt).toLocaleString()}
            </DataRow>
          </div>
        </Panel>
      </Section>

      <Section title="Start a session via API" description="Equivalent request for the current configuration.">
        <Panel>
          <pre className="code-block">
{`POST /session/start
{
  "agentConfig": { "agentId": "${agent.agentId}" }
}`}
          </pre>
        </Panel>
      </Section>

      <Collapsible
        title="Resolved tool assignments"
        description={`${enabledTools.length} enabled — the exact payload sent on save`}
      >
        {enabledTools.length === 0 ? (
          <p className="text-caption" style={{ color: 'var(--fg-muted)' }}>
            No tools enabled. The agent will rely entirely on its prompt.
          </p>
        ) : (
          <pre className="code-block max-h-[320px]">
            {JSON.stringify(
              enabledTools.map((name) => ({
                toolName: name,
                enabled: true,
                config: toolDrafts[name]?.config ?? {},
              })),
              null,
              2,
            )}
          </pre>
        )}
      </Collapsible>

      <Section title="Reserved" description="Planned capabilities that will live in this tab.">
        <div className="flex flex-col gap-3">
          <ReservedRow
            icon={Webhook}
            title="Webhooks"
            body="Post call lifecycle events — started, ended, analyzed — to your endpoint with signature verification."
          />
          <ReservedRow
            icon={FlaskConical}
            title="Experimental flags"
            body="Per-agent overrides for barge-in sensitivity, interruption backoff, and turn-detection thresholds."
          />
          <ReservedRow
            icon={BarChart3}
            title="Evaluations"
            body="Scored test suites that replay recorded conversations against a new prompt before you ship it."
          />
        </div>
      </Section>
    </div>
    </>
  );
}

function ReservedRow({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ElementType;
  title: string;
  body: string;
}) {
  return (
    <div className="card flex items-start gap-3">
      <Icon
        size={16}
        strokeWidth={1.8}
        aria-hidden="true"
        className="mt-px flex-shrink-0"
        style={{ color: 'var(--fg-muted)' }}
      />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-nav font-medium" style={{ color: 'var(--fg-ink)' }}>
          {title}
        </span>
        <p className="text-caption leading-body" style={{ color: 'var(--fg-muted)' }}>
          {body}
        </p>
      </div>
    </div>
  );
}

function CopyableValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked (insecure context or denied permission) — leave the
      // value selectable so it can still be copied manually.
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="group focus-inset inline-flex max-w-full cursor-pointer items-center gap-2 rounded-xs transition-colors duration-[var(--duration-hover)] hover:text-[var(--fg-ink-hover)]"
      style={{ color: 'var(--fg-ink)' }}
      aria-label={copied ? 'Copied' : `Copy ${value}`}
    >
      <span className="truncate font-mono">{value}</span>
      {copied ? (
        <Check size={14} strokeWidth={2.2} aria-hidden="true" style={{ color: 'var(--status-success)' }} />
      ) : (
        <Copy
          size={14}
          strokeWidth={2}
          aria-hidden="true"
          className="opacity-0 transition-opacity duration-[var(--duration-hover)] group-hover:opacity-100 group-focus-visible:opacity-100"
          style={{ color: 'var(--fg-muted)' }}
        />
      )}
    </button>
  );
}
