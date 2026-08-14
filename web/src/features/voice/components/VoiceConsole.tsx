'use client';

import { ChevronDown, Mic } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Agent } from '@/lib/api/agents';

interface VoiceConsoleProps {
  agents: Agent[];
  selectedAgentId: string;
  onSelectAgent: (agentId: string) => void;
  onTalk: () => void;
  loading?: boolean;
  /** Overrides the action label — e.g. "Try again" after an error. */
  actionLabel?: string;
  disabled?: boolean;
}

/**
 * One control surface: agent selection and the talk action share a single shell,
 * so the interaction reads as a single instrument centered on the orb rather
 * than two detached widgets.
 *
 * The selector collapses out of the layout when only the default agent exists —
 * no empty affordance.
 */
export function VoiceConsole({
  agents,
  selectedAgentId,
  onSelectAgent,
  onTalk,
  loading = false,
  actionLabel = 'Start talking',
  disabled = false,
}: VoiceConsoleProps) {
  const hasAgents = agents.length > 0;
  const activeAgent = agents.find((a) => a.agentId === selectedAgentId);
  const agentLabel = activeAgent?.name ?? 'Default agent';

  return (
    /* The composer genuinely floats over the stage, which is what licenses the
       shadow — it and the orb are the only two things here that cast one. The
       4px of padding is load bearing: nested radii have to differ by their
       inset, so 12px outside and 8px controls inside only line up at 4px. */
    <div
      className="flex max-w-full items-center"
      style={{
        gap: 'var(--space-1)',
        padding: 'var(--space-1)',
        background: 'var(--surface-card)',
        border: '1px solid var(--line-hairline)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-soft)',
      }}
    >
      {/* ── Agent selector half ── */}
      {hasAgents && (
        <>
          <span className="select-wrap">
            <select
              value={selectedAgentId}
              onChange={(e) => onSelectAgent(e.target.value)}
              aria-label="Choose which agent to talk to"
              className="select focus-inset"
              style={{
                width: 168,
                minWidth: 0,
                /* Ghost: the shell already supplies the fill and the edge, so the
                   control contributes only its hover wash. The focus ring is
                   drawn inward so the shell never clips it. */
                border: 0,
                color: 'var(--fg-strong)',
              }}
            >
              <option value="">Default agent</option>
              {agents.map((agent) => (
                <option key={agent.agentId} value={agent.agentId}>
                  {agent.name}
                </option>
              ))}
            </select>
            <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
          </span>

          {/* Hairline seam between the halves */}
          <span
            aria-hidden="true"
            className="self-stretch"
            style={{ width: 1, flex: '0 0 auto', background: 'var(--line-hairline)' }}
          />
        </>
      )}

      {/* ── Action half ── */}
      <Button
        variant="primary"
        loading={loading}
        disabled={disabled}
        onClick={onTalk}
        aria-label={hasAgents ? `${actionLabel} with ${agentLabel}` : actionLabel}
      >
        {!loading && <Mic size={16} strokeWidth={2} aria-hidden="true" />}
        {loading ? 'Connecting' : actionLabel}
      </Button>
    </div>
  );
}
