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
} from 'lucide-react';
import { PageBreadcrumb } from '@/components/layout/AppShell';
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
      <div className="flex h-full flex-col">
        <header
          className="flex flex-col gap-2 px-8 pb-5 pt-7"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <PageBreadcrumb items={[{ label: 'Agents', href: '/agents' }, { label: agentId }]} />
          <h1
            className="text-[21px] font-[600] tracking-[-0.035em]"
            style={{ color: 'var(--color-text)' }}
          >
            Agent not found
          </h1>
        </header>
        <div className="flex flex-col items-start gap-4 px-8 py-6">
          <p className="text-[13px]" style={{ color: 'var(--color-state-error)' }}>
            {error ?? 'This agent does not exist, or it was deleted.'}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => void reload()}>
              Try again
            </Button>
            <Link href="/agents">
              <Button variant="ghost" size="sm">
                Back to agents
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Sticky header: identity, actions, tabs ── */}
      <header
        className="flex flex-shrink-0 flex-col gap-4 px-8 pt-6"
        style={{
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-void)',
        }}
      >
        {/* Stacks below `md` so the title, ID, and actions never collide. */}
        <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-start md:gap-6">
          <div className="flex min-w-0 max-w-full flex-col gap-1.5">
            <PageBreadcrumb
              items={[{ label: 'Agents', href: '/agents' }, { label: agent.name }]}
            />
            <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1
                className="min-w-0 truncate text-[21px] font-[600] tracking-[-0.035em]"
                style={{ color: 'var(--color-text)' }}
              >
                {draft.name || agent.name}
              </h1>
              <code
                className="flex-shrink-0 rounded-[5px] px-1.5 py-0.5 font-mono text-[11px]"
                style={{
                  background: 'var(--color-surface-raised)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-faint)',
                }}
              >
                {agent.agentId}
              </code>
            </div>
          </div>

          <div className="flex w-full flex-shrink-0 flex-wrap items-center gap-2 md:w-auto md:pt-1">
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
            <Link href={`/?agentId=${encodeURIComponent(agentId)}`}>
              <Button variant="secondary" size="sm">
                <Mic2 size={13} strokeWidth={2.4} />
                Start voice
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete agent"
              style={{ color: 'var(--color-text-faint)' }}
            >
              <Trash2 size={13} strokeWidth={2} />
            </Button>
          </div>
        </div>

        <Tabs tabs={tabs} value={tab} onChange={goToTab} label="Agent configuration sections" />
      </header>

      {/* ── Tab body ── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-7">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            id={`panel-${tab}`}
            role="tabpanel"
            className="max-w-4xl pb-16"
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
              />
            )}
            {tab === 'knowledge' && <KnowledgeTab />}
            {tab === 'variables' && (
              <VariablesTab systemPrompt={draft.systemPrompt} greeting={draft.greeting} />
            )}
            {tab === 'advanced' && <AdvancedTab agent={agent} toolDrafts={toolDrafts} />}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 cursor-default"
            style={{ background: 'rgb(3 4 8 / 0.62)', backdropFilter: 'blur(2px)' }}
            onClick={() => !deleting && setConfirmDelete(false)}
          />
          <div
            className="relative flex w-full max-w-[380px] flex-col gap-4 rounded-[14px] p-6"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border-strong)',
              boxShadow: '0 24px 60px rgb(0 0 0 / 0.5)',
            }}
          >
            <div className="flex flex-col gap-1.5">
              <h2 className="text-[15px] font-[600] tracking-[-0.02em]" style={{ color: 'var(--color-text)' }}>
                Delete {agent.name}?
              </h2>
              <p className="text-[12.5px] leading-[1.55]" style={{ color: 'var(--color-text-muted)' }}>
                This will permanently remove the agent and all its configuration. This cannot be undone.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                loading={deleting}
                onClick={() => void handleDelete()}
                style={{ background: 'var(--color-state-error)', borderColor: 'var(--color-state-error)' }}
              >
                Delete agent
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Inline save status. Replaces the old floating success/error paragraphs. */
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
        className="flex items-center gap-1.5 text-[11.5px] font-[450]"
        style={{ color: 'var(--color-state-error)' }}
        role="status"
      >
        <AlertCircle size={11.5} strokeWidth={2.2} />
        {error}
      </span>
    );
  }

  if (saving) return null;

  if (dirty) {
    return (
      <span
        className="flex items-center gap-1.5 text-[11.5px] font-[450]"
        style={{ color: 'var(--color-state-warning)' }}
        role="status"
      >
        <span
          aria-hidden
          className="rounded-full"
          style={{ width: 5, height: 5, background: 'var(--color-state-warning)' }}
        />
        Unsaved changes
      </span>
    );
  }

  if (savedAt) {
    return (
      <span
        className="flex items-center gap-1.5 text-[11.5px] font-[450]"
        style={{ color: 'var(--color-state-speaking)' }}
        role="status"
      >
        <Check size={11.5} strokeWidth={2.4} />
        Saved
      </span>
    );
  }

  return null;
}

function AgentDetailSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div
        className="flex flex-col gap-5 px-8 pb-0 pt-7"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div className="flex items-start justify-between gap-6">
          <div className="flex flex-col gap-2">
            <div
              className="h-3 w-28 animate-pulse rounded-[4px]"
              style={{ background: 'var(--color-surface-raised)' }}
            />
            <div
              className="h-6 w-52 animate-pulse rounded-[6px]"
              style={{ background: 'var(--color-surface-raised)' }}
            />
          </div>
          <div className="flex gap-2">
            {[72, 96].map((w) => (
              <div
                key={w}
                className="h-7 animate-pulse rounded-[8px]"
                style={{ width: w, background: 'var(--color-surface-raised)' }}
              />
            ))}
          </div>
        </div>
        <div className="flex gap-4 pb-3">
          {[64, 56, 52, 50, 74, 68, 70].map((w, i) => (
            <div
              key={i}
              className="h-3.5 animate-pulse rounded-[4px]"
              style={{ width: w, background: 'var(--color-surface-raised)' }}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 px-8 py-7">
        <div className="flex max-w-4xl flex-col gap-6">
          <div
            className="h-4 w-32 animate-pulse rounded-[4px]"
            style={{ background: 'var(--color-surface-raised)' }}
          />
          <div
            className="h-[148px] animate-pulse rounded-[11px]"
            style={{
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
            }}
          />
          <div className="grid grid-cols-3 gap-2.5">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-[76px] animate-pulse rounded-[10px]"
                style={{
                  background: 'var(--color-surface-raised)',
                  border: '1px solid var(--color-border)',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
