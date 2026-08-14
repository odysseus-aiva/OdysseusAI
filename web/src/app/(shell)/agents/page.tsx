'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState, type CSSProperties } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Section';
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

/** Escape dismisses an overlay. Only overlays — never the rail, never a route. */
function useEscapeToClose(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onEscape();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [active, onEscape]);
}

/* Column tracks and row pitch are this screen's own geometry, so they ride on
   the page root rather than the shared listing primitive. Two-line rows measure
   60px in the reference, not 56. */
const LISTING_GEOMETRY = {
  '--listing-columns':
    'minmax(0, 1.3fr) 92px minmax(0, 1.3fr) 76px 96px 96px var(--icon-button-size)',
  '--listing-min-width': '940px',
  '--row-height': '60px',
} as CSSProperties;

/* The hook sorts each key in one fixed direction, so a header reports that
   direction rather than toggling. */
const SORT_DIRECTION: Record<AgentSort, 'asc' | 'desc'> = {
  name: 'asc',
  created: 'desc',
  updated: 'desc',
};

export default function AgentsPage() {
  const { agents, visible, toolCounts, loading, error, query, setQuery, sort, setSort, reload } =
    useAgentsList();
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Agent | null>(null);

  const hasAgents = agents.length > 0;

  return (
    <div style={LISTING_GEOMETRY}>
      <header className="page__header">
        <div className="min-w-0">
          <h1 className="page__title">Agents</h1>
          <p className="page__meta mt-1">
            Configure voice agents, assign tools, then launch a live session.
          </p>
        </div>
        {hasAgents && (
          <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
            <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
            New agent
          </Button>
        )}
      </header>

      <div className="page__body">
        <div className="mx-auto flex max-w-5xl flex-col gap-5">
          {/* Toolbar */}
          {hasAgents && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[200px] max-w-[360px] flex-1">
                <Search
                  size={16}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--fg-muted)' }}
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
                  placeholder="Search by name or ID"
                  aria-label="Search agents"
                  className="pl-9 pr-9"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="Clear search"
                    className="icon-btn absolute right-1 top-1/2 -translate-y-1/2"
                  >
                    <X size={16} strokeWidth={2} aria-hidden="true" />
                  </button>
                )}
              </div>

              {/* Filter results are announced from here, never from the table. */}
              <span className="page__meta ml-auto" role="status" aria-live="polite">
                {visible.length} of {agents.length} agent{agents.length === 1 ? '' : 's'}
              </span>
            </div>
          )}

          {/* Body */}
          {loading ? (
            <AgentsSkeleton />
          ) : error ? (
            <ErrorPanel message={error} onRetry={() => void reload()} />
          ) : !hasAgents ? (
            <EmptyAgents onNew={() => setShowForm(true)} />
          ) : (
            <AgentListing
              agents={visible}
              toolCounts={toolCounts}
              query={query}
              sort={sort}
              onSort={setSort}
              onClearQuery={() => setQuery('')}
              onRequestDelete={setConfirmDelete}
            />
          )}
        </div>
      </div>

      <CreateAgentModal
        open={showForm}
        onClose={() => setShowForm(false)}
        onCreated={() => {
          setShowForm(false);
          void reload();
        }}
      />

      <DeleteAgentModal
        agent={confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onDeleted={() => {
          setConfirmDelete(null);
          void reload();
        }}
      />
    </div>
  );
}

// ─── Listing ──────────────────────────────────────────────────────────────────

function AgentListing({
  agents,
  toolCounts,
  query,
  sort,
  onSort,
  onClearQuery,
  onRequestDelete,
}: {
  agents: Agent[];
  toolCounts: Record<string, number | undefined>;
  query: string;
  sort: AgentSort;
  onSort: (next: AgentSort) => void;
  onClearQuery: () => void;
  onRequestDelete: (agent: Agent) => void;
}) {
  return (
    <div className="listing-scroll">
      <div className="listing" role="table" aria-label="Agents">
        <div className="listing__head" role="row">
          <SortHeader label="Agent" sortKey="name" sort={sort} onSort={onSort} />
          <span role="columnheader">Engine</span>
          <span role="columnheader">Pipeline</span>
          <span role="columnheader">Tools</span>
          <SortHeader label="Created" sortKey="created" sort={sort} onSort={onSort} align="right" />
          <SortHeader label="Updated" sortKey="updated" sort={sort} onSort={onSort} align="right" />
          <span role="columnheader">
            <span className="sr-only">Actions</span>
          </span>
        </div>

        {agents.length === 0 ? (
          /* A row may contain only cells, so the empty copy is wrapped rather
             than left as a bare text node. */
          <div role="row">
            <div role="cell" aria-colspan={7} className="flex flex-col items-start">
              <p className="listing__empty">No agents match &ldquo;{query}&rdquo;.</p>
              <Button variant="ghost" size="sm" onClick={onClearQuery}>
                Clear search
              </Button>
            </div>
          </div>
        ) : (
          agents.map((agent) => (
            <AgentRow
              key={agent.agentId}
              agent={agent}
              toolCount={toolCounts[agent.agentId]}
              onRequestDelete={onRequestDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Sorting affordance. `aria-sort` belongs on the columnheader, not the button;
 * the caret is decorative and appears on the active column only.
 */
function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align,
}: {
  label: string;
  sortKey: AgentSort;
  sort: AgentSort;
  onSort: (next: AgentSort) => void;
  align?: 'right';
}) {
  const active = sort === sortKey;
  const direction = SORT_DIRECTION[sortKey];

  return (
    <span
      role="columnheader"
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={align === 'right' ? 'listing__right' : undefined}
    >
      <button
        type="button"
        className="listing__sort"
        data-active={active || undefined}
        onClick={() => onSort(sortKey)}
      >
        <span>{label}</span>
        {active && (
          <svg
            className="listing__caret"
            data-direction={direction}
            viewBox="0 0 12 12"
            width={12}
            height={12}
            aria-hidden="true"
          >
            <path
              d="M3 5l3 3 3-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
    </span>
  );
}

function AgentRow({
  agent,
  toolCount,
  onRequestDelete,
}: {
  agent: Agent;
  toolCount: number | undefined;
  onRequestDelete: (agent: Agent) => void;
}) {
  const isOmni = agent.engine === 'omni';
  const stt = providerLabel(STT_PROVIDERS, agent.defaultProviders?.stt || PLATFORM_DEFAULTS.stt);
  const llm = providerLabel(LLM_PROVIDERS, agent.defaultProviders?.llm || PLATFORM_DEFAULTS.llm);
  const tts = providerLabel(TTS_PROVIDERS, agent.defaultProviders?.tts || PLATFORM_DEFAULTS.tts);
  const pipeline = isOmni ? 'Fused realtime' : `${stt} · ${llm} · ${tts}`;

  return (
    <div className="listing__row" role="row">
      <span className="flex min-w-0 flex-col justify-center" role="cell">
        <Link
          href={`/agents/${encodeURIComponent(agent.agentId)}`}
          className="listing__strong truncate"
        >
          {agent.name}
        </Link>
        <span
          className="listing__muted truncate font-mono"
          style={{ fontSize: 'var(--text-caption)' }}
        >
          {agent.agentId}
        </span>
      </span>

      <span role="cell">
        <Badge>{isOmni ? 'Omni' : 'Pipeline'}</Badge>
      </span>

      <span className="listing__muted truncate" role="cell" title={pipeline}>
        {pipeline}
      </span>

      <span className="listing__muted" role="cell">
        {toolCount ? `${toolCount} tool${toolCount === 1 ? '' : 's'}` : '—'}
      </span>

      <span className="listing__right listing__muted num" role="cell">
        {shortDate(agent.createdAt)}
      </span>

      <span className="listing__right listing__muted num" role="cell">
        {relativeTime(agent.updatedAt)}
      </span>

      <span role="cell">
        <button
          type="button"
          className="icon-btn"
          aria-label={`Delete ${agent.name}`}
          onClick={() => onRequestDelete(agent)}
        >
          <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}

// ─── Empty / error / skeleton ─────────────────────────────────────────────────

function EmptyAgents({ onNew }: { onNew: () => void }) {
  return (
    <EmptyState
      icon={Bot}
      title="Create your first agent"
      description="An agent bundles a prompt, a voice pipeline, and a set of tools. Define one, then start talking to it in seconds."
      action={
        <>
          <Button variant="primary" size="md" onClick={onNew}>
            <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
            New agent
          </Button>
          <Link href="/" className="btn btn--ghost">
            <Sparkles size={16} strokeWidth={2} aria-hidden="true" />
            Try the demo voice
          </Link>
        </>
      }
    />
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <EmptyState
      icon={AlertCircle}
      title="Could not load agents"
      description={message}
      action={
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}

/* Bars at the row pitch on a flat fill — the header stays live, and nothing
   shimmers. */
function AgentsSkeleton() {
  return (
    <div className="listing" aria-hidden="true">
      <div className="listing__head" />
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-center px-3" style={{ height: 'var(--row-height)' }}>
          <div
            className="w-full"
            style={{
              height: 36,
              background: 'var(--surface-hover)',
              borderRadius: 'var(--radius-sm)',
            }}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Create agent ─────────────────────────────────────────────────────────────

function CreateAgentModal({
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

  useEscapeToClose(open && !creating, onClose);

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
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="create-agent-title">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div className="modal relative">
        <div className="modal__head">
          <h2 className="modal__title" id="create-agent-title">
            New agent
          </h2>
        </div>
        <p className="modal__hint">
          Give it an ID and a name. You can configure everything else next.
        </p>

        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          <Field label="Agent ID" hint="Lowercase letters, numbers, and hyphens." htmlFor="new-agent-id">
            <Input
              id="new-agent-id"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="support-bot"
              required
              pattern="[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]"
              autoFocus
            />
          </Field>
          <Field label="Display name" htmlFor="new-agent-name">
            <Input
              id="new-agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Support Bot"
              required
            />
          </Field>

          {error && <span className="field__error">{error}</span>}

          <div className="modal__actions">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={creating}>
              Create agent
              {!creating && <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete agent ─────────────────────────────────────────────────────────────

function DeleteAgentModal({
  agent,
  onClose,
  onDeleted,
}: {
  agent: Agent | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  useEscapeToClose(agent !== null && !deleting, onClose);

  if (!agent) return null;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteAgent(agent.agentId);
      onDeleted();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="delete-agent-title">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onClick={() => !deleting && onClose()}
      />
      <div className="modal relative">
        <div className="modal__head">
          <h2 className="modal__title" id="delete-agent-title">
            Delete {agent.name}?
          </h2>
        </div>
        <p className="modal__hint">
          This permanently removes the agent and all its configuration. This cannot be undone.
        </p>
        <div className="modal__actions">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" loading={deleting} onClick={() => void handleDelete()}>
            Delete agent
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

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
