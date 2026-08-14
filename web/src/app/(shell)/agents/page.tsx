'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import {
  Plus,
  Search,
  X,
  Sparkles,
  ArrowRight,
  Ear,
  BrainCircuit,
  AudioLines,
  Trash2,
  Bot,
  Zap,
  GitBranch,
  Wrench,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { createAgent, deleteAgent } from '@/lib/api/agents';
import type { Agent } from '@/lib/api/agents';
import { useAgentsList, type AgentSort } from '@/features/agents/useAgentsList';
import {
  STT_PROVIDERS,
  LLM_PROVIDERS,
  TTS_PROVIDERS,
  PLATFORM_DEFAULTS,
  providerLabel,
} from '@/features/agents/providers';

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
          {/* Toolbar */}
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
                  placeholder="Search by name or ID"
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
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(272px, 1fr))' }}
            >
              {visible.map((agent) => (
                <AgentCard
                  key={agent.agentId}
                  agent={agent}
                  toolCount={toolCounts[agent.agentId]}
                  onDeleted={() => void reload()}
                />
              ))}
              {!query && <AddAgentCard onClick={() => setShowForm(true)} />}
            </div>
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

// ─── Agent card ───────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  toolCount,
  onDeleted,
}: {
  agent: Agent;
  toolCount: number | undefined;
  onDeleted?: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const stt = providerLabel(STT_PROVIDERS, agent.defaultProviders?.stt || PLATFORM_DEFAULTS.stt);
  const llm = providerLabel(LLM_PROVIDERS, agent.defaultProviders?.llm || PLATFORM_DEFAULTS.llm);
  const tts = providerLabel(TTS_PROVIDERS, agent.defaultProviders?.tts || PLATFORM_DEFAULTS.tts);
  const isOmni = agent.engine === 'omni';

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleting(true);
    try {
      await deleteAgent(agent.agentId);
      onDeleted?.();
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <Link href={`/agents/${encodeURIComponent(agent.agentId)}`} className="group block">
      <div
        className="relative flex h-full flex-col rounded-[14px] p-5 transition-all duration-[180ms]"
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLDivElement;
          el.style.background = 'var(--color-surface-elevated)';
          el.style.borderColor = 'var(--color-border-strong)';
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLDivElement;
          el.style.background = 'var(--color-surface-raised)';
          el.style.borderColor = 'var(--color-border)';
        }}
      >
        {/* Omni accent glow — only for Omni agents */}
        {isOmni && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-20 rounded-t-[14px]"
            style={{
              background:
                'radial-gradient(ellipse 70% 100% at 50% 0%, var(--color-accent-subtle), transparent)',
            }}
          />
        )}

        {/* Header row: engine badge + delete */}
        <div className="relative mb-4 flex items-start justify-between">
          {isOmni ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[11px] font-[600] tracking-[0.01em]"
              style={{
                background: 'var(--color-accent-subtle)',
                color: 'var(--color-accent)',
                border: '1px solid var(--color-accent-hairline)',
              }}
            >
              <Zap size={10} strokeWidth={2.5} />
              Omni
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[11px] font-[600] tracking-[0.01em]"
              style={{
                background: 'var(--color-surface-elevated)',
                color: 'var(--color-text-muted)',
                border: '1px solid var(--color-border)',
              }}
            >
              <GitBranch size={10} strokeWidth={2} />
              Pipeline
            </span>
          )}

          {/* Delete control */}
          <div onClick={(e) => e.preventDefault()}>
            {confirmDelete ? (
              <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={(e) => void handleDelete(e)}
                  disabled={deleting}
                  className="rounded-[4px] px-1.5 py-0.5 text-[10px] font-[500]"
                  style={{
                    background: 'rgb(251 113 133 / 0.15)',
                    color: 'var(--color-state-error)',
                  }}
                >
                  {deleting ? '…' : 'Delete'}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete(false);
                  }}
                  className="rounded-[4px] px-1.5 py-0.5 text-[10px]"
                  style={{ color: 'var(--color-text-faint)' }}
                >
                  No
                </button>
              </span>
            ) : (
              <button
                type="button"
                aria-label={`Delete ${agent.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(true);
                }}
                className="flex items-center justify-center rounded-[6px] opacity-0 transition-opacity duration-[140ms] group-hover:opacity-100"
                style={{ width: 24, height: 24, color: 'var(--color-text-faint)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--color-state-error)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--color-text-faint)';
                }}
              >
                <Trash2 size={12} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>

        {/* Name + ID */}
        <div className="mb-4 flex flex-col gap-1">
          <span
            className="text-[15px] font-[600] leading-snug tracking-[-0.02em]"
            style={{ color: 'var(--color-text)' }}
          >
            {agent.name}
          </span>
          <span
            className="font-mono text-[10.5px] truncate"
            style={{ color: 'var(--color-text-faint)' }}
          >
            {agent.agentId}
          </span>
        </div>

        {/* Providers */}
        <div className="mb-auto flex flex-wrap gap-1.5">
          {isOmni ? (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
              style={{
                background: 'var(--color-accent-subtle)',
                color: 'var(--color-accent)',
                border: '1px solid var(--color-accent-hairline)',
              }}
            >
              Fused realtime
            </span>
          ) : (
            <>
              <ProviderPill icon={Ear} label={stt} />
              <ProviderPill icon={BrainCircuit} label={llm} />
              <ProviderPill icon={AudioLines} label={tts} />
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="mt-4 flex items-center justify-between pt-3.5"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <span
            className="inline-flex items-center gap-1 text-[11px]"
            style={{ color: toolCount ? 'var(--color-text-muted)' : 'var(--color-text-faint)' }}
          >
            <Wrench size={10} strokeWidth={2} />
            {toolCount ? `${toolCount} tool${toolCount === 1 ? '' : 's'}` : 'No tools'}
          </span>
          <span className="text-[11px]" style={{ color: 'var(--color-text-faint)' }}>
            {relativeTime(agent.updatedAt)}
          </span>
        </div>
      </div>
    </Link>
  );
}

function ProviderPill({
  icon: Icon,
  label,
}: {
  icon: React.ElementType;
  label: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
      style={{
        background: 'var(--color-surface-elevated)',
        color: 'var(--color-text-muted)',
        border: '1px solid var(--color-border)',
      }}
    >
      <Icon size={9} strokeWidth={2} style={{ color: 'var(--color-text-faint)', flexShrink: 0 }} />
      {label}
    </span>
  );
}

function AddAgentCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[168px] w-full flex-col items-center justify-center gap-2.5 rounded-[14px] p-5 transition-all duration-[180ms]"
      style={{
        border: '1.5px dashed var(--color-border-strong)',
        background: 'transparent',
        color: 'var(--color-text-faint)',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.background = 'var(--color-accent-subtle)';
        el.style.color = 'var(--color-accent)';
        el.style.borderColor = 'var(--color-accent-border)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.background = 'transparent';
        el.style.color = 'var(--color-text-faint)';
        el.style.borderColor = 'var(--color-border-strong)';
      }}
    >
      <span
        className="flex items-center justify-center rounded-full transition-colors duration-[140ms]"
        style={{
          width: 32,
          height: 32,
          border: '1px dashed currentColor',
        }}
      >
        <Plus size={14} strokeWidth={2.2} />
      </span>
      <span className="text-[12.5px] font-[500]">New agent</span>
    </button>
  );
}

// ─── Empty / error / skeleton ─────────────────────────────────────────────────

function EmptyAgents({ onNew }: { onNew: () => void }) {
  return (
    <div
      className="relative flex flex-col items-center gap-5 overflow-hidden rounded-[16px] px-6 py-16 text-center"
      style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface-raised)' }}
    >
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
        <h2
          className="text-[16px] font-[600] tracking-[-0.02em]"
          style={{ color: 'var(--color-text)' }}
        >
          Create your first agent
        </h2>
        <p
          className="max-w-[42ch] text-[13px] leading-[1.6]"
          style={{ color: 'var(--color-text-muted)' }}
        >
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
        No agents match &ldquo;{query}&rdquo;
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
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(272px, 1fr))' }}
    >
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-[14px]"
          style={{
            height: 168,
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
          }}
        />
      ))}
    </div>
  );
}

// ─── Create agent drawer ──────────────────────────────────────────────────────

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
    >
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
          <h2
            className="text-[15px] font-[600] tracking-[-0.02em]"
            style={{ color: 'var(--color-text)' }}
          >
            New agent
          </h2>
          <p className="text-[12.5px]" style={{ color: 'var(--color-text-muted)' }}>
            Give it an ID and a name. You can configure everything else next.
          </p>
        </div>

        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs;
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(epochMs).toLocaleDateString();
}
