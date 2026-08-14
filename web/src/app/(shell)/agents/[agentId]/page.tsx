'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Mic2,
  LayoutList,
  MessageSquare,
  AudioLines,
  Wrench,
  BookOpen,
  Braces,
  SlidersHorizontal,
  Check,
  AlertCircle,
  Trash2,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tabs, type TabDef } from '@/components/ui/Tabs';
import { useAgentConfig } from '@/features/agents/useAgentConfig';
import { deleteAgent } from '@/lib/api/agents';
import { OverviewTab } from '@/features/agents/components/OverviewTab';
import { PromptTab } from '@/features/agents/components/PromptTab';
import { VoiceTab } from '@/features/agents/components/VoiceTab';
import { ToolsTab } from '@/features/agents/components/ToolsTab';
import { KnowledgeTab } from '@/features/agents/components/KnowledgeTab';
import { VariablesTab } from '@/features/agents/components/VariablesTab';
import { AdvancedTab } from '@/features/agents/components/AdvancedTab';
import { ToolConfigDrawer } from '@/features/agents/components/ToolConfigDrawer';

type TabId =
  | 'overview'
  | 'prompt'
  | 'voice'
  | 'tools'
  | 'knowledge'
  | 'variables'
  | 'advanced';

const TAB_IDS: TabId[] = [
  'overview',
  'prompt',
  'voice',
  'tools',
  'knowledge',
  'variables',
  'advanced',
];

export default function AgentDetailPage() {
  const params = useParams<{ agentId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const agentId = decodeURIComponent(params.agentId);

  const config = useAgentConfig(agentId);
  const {
    agent,
    catalogue,
    draft,
    toolDrafts,
    customTools,
    loading,
    saving,
    error,
    savedAt,
    isDirty,
    enabledCount,
    testing,
    testResults,
    setField,
    setToolEnabled,
    setToolConfigValue,
    resetToolConfig,
    upsertCustomTool,
    setCustomToolEnabled,
    removeCustomTool,
    testCustomDefinition,
    save,
    discard,
    testTool,
    reload,
  } = config;

  // Tab lives in the URL so a specific section is linkable and survives reload.
  const tabFromUrl = searchParams.get('tab');
  const [tab, setTab] = useState<TabId>(
    TAB_IDS.includes(tabFromUrl as TabId) ? (tabFromUrl as TabId) : 'overview',
  );

  const goToTab = useCallback(
    (next: TabId) => {
      setTab(next);
      const qs = new URLSearchParams(searchParams.toString());
      qs.set('tab', next);
      router.replace(`?${qs.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await deleteAgent(agentId);
      router.push('/agents');
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }, [agentId, router]);

  const [openToolName, setOpenToolName] = useState<string | null>(null);
  const openTool = useMemo(
    () => catalogue.find((t) => t.name === openToolName) ?? null,
    [catalogue, openToolName],
  );

  // Cmd/Ctrl+S saves from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (isDirty && !saving) void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDirty, saving, save]);

  // Warn before losing unsaved edits on navigation away from the app.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  // Escape dismisses the delete confirmation, but never mid-request.
  useEffect(() => {
    if (!confirmDelete || deleting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirmDelete(false);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [confirmDelete, deleting]);

  const tabs: TabDef<TabId>[] = useMemo(
    () => [
      { id: 'overview', label: 'Overview', icon: LayoutList },
      { id: 'prompt', label: 'Prompt', icon: MessageSquare },
      { id: 'voice', label: 'Voice', icon: AudioLines },
      { id: 'tools', label: 'Tools', icon: Wrench, badge: enabledCount || undefined },
      { id: 'knowledge', label: 'Knowledge', icon: BookOpen },
      { id: 'variables', label: 'Variables', icon: Braces },
      { id: 'advanced', label: 'Advanced', icon: SlidersHorizontal },
    ],
    [enabledCount],
  );

  if (loading) return <AgentDetailSkeleton />;

  if (!agent) {
    return (
      <div>
        <header className="page__header">
          <div className="flex min-w-0 flex-col gap-2">
            <Crumbs current={agentId} />
            <h1 className="page__title">Agent not found</h1>
          </div>
        </header>
        <div className="page__body flex flex-col items-start gap-4">
          <p className="field__error">
            {error ?? 'This agent does not exist, or it was deleted.'}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => void reload()}>
              Try again
            </Button>
            <Link href="/agents" className="btn btn--ghost btn--sm">
              Back to agents
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* The tab strip closes this block with its own rule, so the header carries
          none: two hairlines 20px apart read as an empty form section. */}
      <div className="flex-shrink-0">
        <header className="page__header">
          <div className="flex min-w-0 flex-col gap-2">
            <Crumbs current={agent.name} />
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="page__title min-w-0 truncate">{draft.name || agent.name}</h1>
              <code className="badge font-mono">{agent.agentId}</code>
            </div>
          </div>
          <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
            <SaveState dirty={isDirty} saving={saving} savedAt={savedAt} error={error} />
            {isDirty && (
              <Button variant="ghost" size="sm" onClick={discard} disabled={saving}>
                Discard
              </Button>
            )}
            <Button
              variant={isDirty ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => void save()}
              loading={saving}
              disabled={!isDirty}
            >
              Save changes
            </Button>
            <Link
              href={`/?agentId=${encodeURIComponent(agentId)}`}
              className="btn btn--secondary btn--sm"
            >
              <Mic2 size={16} strokeWidth={2} aria-hidden="true" />
              Start voice
            </Link>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete agent"
            >
              <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="px-6">
          <Tabs tabs={tabs} value={tab} onChange={goToTab} label="Agent configuration sections" />
        </div>
      </div>

      {/* ── Tab body ── */}
      <div className="page__body min-h-0 flex-1 overflow-y-auto pt-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            id={`panel-${tab}`}
            role="tabpanel"
            className="max-w-4xl"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {tab === 'overview' && (
              <OverviewTab
                agent={agent}
                draft={draft}
                setField={setField}
                enabledCount={enabledCount}
                onGoToTab={goToTab}
              />
            )}
            {tab === 'prompt' && <PromptTab draft={draft} setField={setField} />}
            {tab === 'voice' && <VoiceTab draft={draft} setField={setField} />}
            {tab === 'tools' && (
              <ToolsTab
                catalogue={catalogue}
                toolDrafts={toolDrafts}
                enabledCount={enabledCount}
                onToggle={setToolEnabled}
                onOpenConfig={setOpenToolName}
                customTools={customTools}
                onCustomSave={upsertCustomTool}
                onCustomToggle={setCustomToolEnabled}
                onCustomRemove={removeCustomTool}
                onCustomTest={testCustomDefinition}
                testing={testing}
                testResults={testResults}
              />
            )}
            {tab === 'knowledge' && <KnowledgeTab />}
            {tab === 'variables' && (
              <VariablesTab systemPrompt={draft.systemPrompt} greeting={draft.greeting} />
            )}
            {tab === 'advanced' && (
              <AdvancedTab
                agent={agent}
                draft={draft}
                setField={setField}
                toolDrafts={toolDrafts}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Tool configuration drawer ── */}
      <ToolConfigDrawer
        tool={openTool}
        draft={openToolName ? toolDrafts[openToolName] : undefined}
        open={openToolName !== null}
        onClose={() => setOpenToolName(null)}
        onToggle={(enabled) => openToolName && setToolEnabled(openToolName, enabled)}
        onConfigChange={(key, value) =>
          openToolName && setToolConfigValue(openToolName, key, value)
        }
        onReset={() => openToolName && resetToolConfig(openToolName)}
        onTest={(args) => openToolName && void testTool(openToolName, args)}
        testing={testing === openToolName}
        testResult={openToolName ? testResults[openToolName] : undefined}
      />

      {/* ── Delete confirm modal ── */}
      {confirmDelete && (
        <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="delete-agent-title">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 cursor-default"
            onClick={() => !deleting && setConfirmDelete(false)}
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
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={deleting}
                onClick={() => void handleDelete()}
              >
                Delete agent
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Crumbs({ current }: { current: string }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <ol>
        <li>
          <Link href="/agents" className="crumbs__link">
            Agents
          </Link>
          <ChevronRight size={14} strokeWidth={2} className="crumbs__sep" aria-hidden="true" />
        </li>
        <li>
          <span className="crumbs__current" aria-current="page">
            {current}
          </span>
        </li>
      </ol>
    </nav>
  );
}

/**
 * Inline save status. The dirty and saved states are a coloured dot in a neutral
 * shell — the only shape status is allowed to take outside a pill. Only a real
 * failure gets coloured text, which is the `.field__error` idiom.
 */
function SaveState({
  dirty,
  saving,
  savedAt,
  error,
}: {
  dirty: boolean;
  saving: boolean;
  savedAt: number | null;
  error: string | null;
}) {
  if (error) {
    return (
      <span
        className="flex items-center gap-2"
        style={{ color: 'var(--status-error)', fontSize: 'var(--text-caption)' }}
        role="status"
      >
        <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />
        {error}
      </span>
    );
  }

  if (saving) return null;

  if (dirty) {
    return (
      <span className="chip" role="status">
        <span className="chip__dot chip__dot--warning" aria-hidden="true" />
        Unsaved changes
      </span>
    );
  }

  if (savedAt) {
    return (
      <span className="chip" role="status">
        <Check
          size={16}
          strokeWidth={2}
          aria-hidden="true"
          style={{ color: 'var(--status-success)' }}
        />
        Saved
      </span>
    );
  }

  return null;
}

/* Reserves the header and first band. No shimmer: nothing in this language
   animates a gradient. */
function AgentDetailSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-hidden="true">
      <div className="flex flex-col gap-5 px-6 pt-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex flex-col gap-2">
            <SkeletonBar width={112} height={14} />
            <SkeletonBar width={208} height={28} />
          </div>
          <div className="flex gap-2">
            <SkeletonBar width={72} height={28} />
            <SkeletonBar width={96} height={28} />
          </div>
        </div>
        <div
          className="flex gap-4 pb-3"
          style={{ borderBottom: '1px solid var(--line-hairline)' }}
        >
          {[64, 56, 52, 50, 74, 68, 70].map((w) => (
            <SkeletonBar key={w} width={w} height={14} />
          ))}
        </div>
      </div>

      <div className="page__body pt-6">
        <div className="flex max-w-4xl flex-col gap-6">
          <SkeletonBar width={128} height={16} />
          <div className="card" style={{ height: 148 }} />
          <div className="stat-row">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="stat" style={{ height: 88 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SkeletonBar({ width, height }: { width: number; height: number }) {
  return (
    <div
      style={{
        width,
        height,
        background: 'var(--surface-hover)',
        borderRadius: 'var(--radius-xs)',
      }}
    />
  );
}
