'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { Plus, Bot, Search, X, Sparkles, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { createAgent } from '@/lib/api/agents';
import { useAgentsList, type AgentSort } from '@/features/agents/useAgentsList';
import { AgentCard } from '@/features/agents/components/AgentCard';

const SORT_LABELS: Record<AgentSort, string> = {
  updated: 'Last updated',
  created: 'Newest',
  name: 'Name (A–Z)',
};

export default function AgentsPage() {
  const { agents, visible, toolCounts, loading, error, query, setQuery, sort, setSort, reload } =
    useAgentsList();
  const [showForm, setShowForm] = useState(false);

  const hasAgents = agents.length > 0;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Agents"
        description="Configure voice agents, assign tools, then launch a live session."
        actions={
          hasAgents ? (
            <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
              <Plus size={13} strokeWidth={2.6} />
              New agent
            </Button>
          ) : undefined
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-5">
          {/* Toolbar — only meaningful once there are agents to filter */}
          {hasAgents && (
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-[200px] flex-1">
                <Search
                  size={13}
                  strokeWidth={2}
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--color-text-faint)' }}
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
                  placeholder="Search by name, ID, or prompt"
                  aria-label="Search agents"
                  className="w-full rounded-[9px] py-2 pl-9 pr-8 text-[13px] outline-none transition-colors duration-[140ms]"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border-focus)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                  }}
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 flex -translate-y-1/2 cursor-pointer items-center justify-center rounded-[5px]"
                    style={{ width: 20, height: 20, color: 'var(--color-text-faint)' }}
                  >
                    <X size={12} strokeWidth={2.2} />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[12px]" style={{ color: 'var(--color-text-faint)' }}>
                  Sort
                </span>
                <Select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as AgentSort)}
                  aria-label="Sort agents"
                  className="!w-auto"
                >
                  {(Object.keys(SORT_LABELS) as AgentSort[]).map((key) => (
                    <option key={key} value={key}>
                      {SORT_LABELS[key]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )}

          {/* Body */}
          {loading ? (
            <AgentsSkeleton />
          ) : error ? (
            <ErrorPanel message={error} onRetry={() => void reload()} />
          ) : !hasAgents ? (
            <EmptyAgents onNew={() => setShowForm(true)} />
          ) : visible.length === 0 ? (
            <NoMatches query={query} onClear={() => setQuery('')} />
          ) : (
            <>
              <p className="text-[12px]" style={{ color: 'var(--color-text-faint)' }}>
                {visible.length} of {agents.length}{' '}
                {agents.length === 1 ? 'agent' : 'agents'}
              </p>
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(288px, 1fr))' }}
              >
                {visible.map((agent) => (
                  <AgentCard
                    key={agent.agentId}
                    agent={agent}
                    toolCount={toolCounts[agent.agentId]}
                  />
                ))}
                {/* Trailing add tile — keeps the CTA where you'd create one, so
                    a single-agent grid never looks half-empty. */}
                {!query && <NewAgentTile onClick={() => setShowForm(true)} />}
              </div>
            </>
          )}
        </div>
      </div>

      <CreateAgentDrawer
        open={showForm}
        onClose={() => setShowForm(false)}
        onCreated={() => {
          setShowForm(false);
          void reload();
        }}
      />
    </div>
  );
}

/** Dashed sibling to the cards — the CTA lives inside the grid. */
function NewAgentTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[188px] cursor-pointer flex-col items-center justify-center gap-2.5 rounded-[13px] transition-colors duration-[160ms]"
      style={{ border: '1px dashed var(--color-border-strong)' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-accent-border)';
        e.currentTarget.style.background = 'var(--color-accent-subtle)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-strong)';
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <span
        className="flex items-center justify-center rounded-full transition-transform duration-[180ms] group-hover:scale-110"
        style={{
          width: 34,
          height: 34,
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border-strong)',
        }}
      >
        <Plus size={15} strokeWidth={2.4} style={{ color: 'var(--color-accent)' }} />
      </span>
      <span className="text-[12.5px] font-[500]" style={{ color: 'var(--color-text-muted)' }}>
        New agent
      </span>
    </button>
  );
}

function EmptyAgents({ onNew }: { onNew: () => void }) {
  return (
    <div
      className="relative flex flex-col items-center gap-5 overflow-hidden rounded-[16px] px-6 py-16 text-center"
      style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface-raised)' }}
    >
      {/* Ambient bloom — a touch of the orb's energy, kept faint */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40"
        style={{
          background:
            'radial-gradient(ellipse 60% 100% at 50% 0%, var(--color-accent-subtle), transparent 70%)',
        }}
      />

      <div
        className="relative flex items-center justify-center rounded-[16px]"
        style={{
          width: 52,
          height: 52,
          background: 'var(--color-accent-subtle)',
          border: '1px solid var(--color-accent-hairline)',
        }}
      >
        <Bot size={22} strokeWidth={1.8} style={{ color: 'var(--color-accent)' }} />
      </div>

      <div className="relative flex flex-col items-center gap-1.5">
        <h2 className="text-[16px] font-[600] tracking-[-0.02em]" style={{ color: 'var(--color-text)' }}>
          Create your first agent
        </h2>
        <p className="max-w-[42ch] text-[13px] leading-[1.6]" style={{ color: 'var(--color-text-muted)' }}>
          An agent bundles a prompt, a voice pipeline, and a set of tools. Define one, then start
          talking to it in seconds.
        </p>
      </div>

      <div className="relative flex items-center gap-2.5">
        <Button variant="primary" size="md" onClick={onNew}>
          <Plus size={14} strokeWidth={2.6} />
          New agent
        </Button>
        <Link href="/">
          <Button variant="ghost" size="md">
            <Sparkles size={13} strokeWidth={2} />
            Try the demo voice
          </Button>
        </Link>
      </div>
    </div>
  );
}

function NoMatches({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-[13px] px-6 py-14 text-center"
      style={{ border: '1px dashed var(--color-border)' }}
    >
      <Search size={18} strokeWidth={1.8} style={{ color: 'var(--color-text-faint)' }} />
      <p className="text-[13.5px] font-[500]" style={{ color: 'var(--color-text)' }}>
        No agents match “{query}”
      </p>
      <Button variant="ghost" size="sm" onClick={onClear}>
        Clear search
      </Button>
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-[13px] px-6 py-12 text-center"
      style={{ border: '1px dashed var(--color-border)' }}
    >
      <p className="text-[13.5px] font-[500]" style={{ color: 'var(--color-text)' }}>
        Could not load agents
      </p>
      <p className="text-[13px]" style={{ color: 'var(--color-state-error)' }}>
        {message}
      </p>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function AgentsSkeleton() {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(288px, 1fr))' }}
    >
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="h-[188px] animate-pulse rounded-[13px]"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
        />
      ))}
    </div>
  );
}

/** Inline create form in a lightweight modal, kept close to the old flow. */
function CreateAgentDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [agentId, setAgentId] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await createAgent({
        agentId: agentId.trim().toLowerCase(),
        name: name.trim(),
        systemPrompt:
          'You are a helpful voice assistant. Keep answers short and natural for speech.',
      });
      setAgentId('');
      setName('');
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        style={{ background: 'rgb(3 4 8 / 0.62)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      <div
        className="relative flex w-full max-w-[420px] flex-col gap-5 rounded-[14px] p-6"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border-strong)',
          boxShadow: '0 24px 60px rgb(0 0 0 / 0.5)',
        }}
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-[600] tracking-[-0.02em]" style={{ color: 'var(--color-text)' }}>
            New agent
          </h2>
          <p className="text-[12.5px]" style={{ color: 'var(--color-text-muted)' }}>
            Give it an ID and a name. You can configure everything else next.
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Agent ID" hint="Lowercase letters, numbers, and hyphens.">
            <Input
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="support-bot"
              required
              pattern="[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]"
              autoFocus
            />
          </Field>
          <Field label="Display name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Support Bot"
              required
            />
          </Field>

          {error && (
            <p className="text-[12.5px]" style={{ color: 'var(--color-state-error)' }}>
              {error}
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" variant="primary" size="sm" loading={creating}>
              Create agent
              {!creating && <ArrowRight size={13} strokeWidth={2.4} />}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
