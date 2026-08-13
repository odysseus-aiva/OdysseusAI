'use client';

import { useState } from 'react';
import { Copy, Check, Webhook, FlaskConical, BarChart3, Phone, ShoppingCart } from 'lucide-react';
import { Section, Panel, Collapsible, DataRow } from '@/components/ui/Section';
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
                <button
                  type="button"
                  onClick={() => setShowBuyModal(true)}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-[8px] px-3 py-2 text-[12.5px] font-[500] transition-colors duration-[140ms]"
                  style={{
                    background: 'var(--color-surface-raised)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-muted)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-accent-border)';
                    e.currentTarget.style.color = 'var(--color-accent)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                    e.currentTarget.style.color = 'var(--color-text-muted)';
                  }}
                >
                  <ShoppingCart size={12} strokeWidth={2} />
                  Buy a number
                </button>
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
          <div style={{ borderTop: '1px solid var(--color-border)' }}>
            <DataRow label="Created" >
              {new Date(agent.createdAt).toLocaleString()}
            </DataRow>
          </div>
          <div style={{ borderTop: '1px solid var(--color-border)' }}>
            <DataRow label="Last updated">
              {new Date(agent.updatedAt).toLocaleString()}
            </DataRow>
          </div>
        </Panel>
      </Section>

      <Section title="Start a session via API" description="Equivalent request for the current configuration.">
        <Panel>
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
          <p className="text-[12.5px]" style={{ color: 'var(--color-text-faint)' }}>
            No tools enabled. The agent will rely entirely on its prompt.
          </p>
        ) : (
          <pre
            className="max-h-[320px] overflow-auto rounded-[8px] px-3 py-2.5 font-mono text-[11.5px] leading-[1.6]"
            style={{
              background: 'var(--color-abyss)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)',
            }}
          >
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
        <div className="flex flex-col gap-2.5">
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
    <div
      className="flex items-start gap-3 rounded-[10px] px-3.5 py-3"
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
      }}
    >
      <Icon
        size={13.5}
        strokeWidth={1.9}
        className="mt-0.5 flex-shrink-0"
        style={{ color: 'var(--color-text-faint)' }}
      />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[12.5px] font-[500]" style={{ color: 'var(--color-text)' }}>
          {title}
        </span>
        <p className="text-[11.5px] leading-[1.55]" style={{ color: 'var(--color-text-faint)' }}>
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
      className="group inline-flex cursor-pointer items-center gap-1.5 rounded-[5px] px-1 py-0.5 transition-colors duration-[140ms]"
      style={{ color: 'var(--color-text)' }}
      aria-label={copied ? 'Copied' : `Copy ${value}`}
    >
      <span className="font-mono">{value}</span>
      {copied ? (
        <Check size={11} strokeWidth={2.5} style={{ color: 'var(--color-state-speaking)' }} />
      ) : (
        <Copy
          size={11}
          strokeWidth={2}
          className="opacity-0 transition-opacity duration-[140ms] group-hover:opacity-100"
          style={{ color: 'var(--color-text-faint)' }}
        />
      )}
    </button>
  );
}
