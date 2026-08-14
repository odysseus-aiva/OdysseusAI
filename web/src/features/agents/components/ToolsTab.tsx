'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Settings2, X, Wrench, Plus, Globe, Pencil, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Section';
import type { CatalogueTool, CustomToolDefinition } from '@/lib/api/agents';
import type { ToolDraft, CustomToolEntry } from '../useAgentConfig';
import { categoryMeta } from '../tool-categories';
import { CustomToolBuilder } from './CustomToolBuilder';

type Filter = 'all' | 'enabled' | string;

/** One bordered card per group, hairlines between rows, no rule on the last row. */
const ROW_LIST = 'overflow-hidden rounded-md border border-[var(--line-hairline)] bg-[var(--surface-card)]';

/**
 * Tool library. Compact rows + search + category filters so the surface scales
 * to a large catalogue; configuration opens in a drawer rather than expanding
 * the page.
 */
export function ToolsTab({
  catalogue,
  toolDrafts,
  enabledCount,
  onToggle,
  onOpenConfig,
  customTools,
  onCustomSave,
  onCustomToggle,
  onCustomRemove,
  onCustomTest,
  testing,
  testResults,
}: {
  catalogue: CatalogueTool[];
  toolDrafts: Record<string, ToolDraft>;
  enabledCount: number;
  onToggle: (toolName: string, enabled: boolean) => void;
  onOpenConfig: (toolName: string) => void;
  customTools: CustomToolEntry[];
  onCustomSave: (entry: CustomToolEntry) => void;
  onCustomToggle: (toolName: string, enabled: boolean) => void;
  onCustomRemove: (toolName: string) => void | Promise<void>;
  onCustomTest: (key: string, def: CustomToolDefinition, args: Record<string, unknown>) => void;
  testing: string | null;
  testResults: Record<string, string>;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const searchRef = useRef<HTMLInputElement>(null);

  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<CustomToolEntry | undefined>();

  const reservedNames = useMemo(
    () => [...catalogue.map((t) => t.name), ...customTools.map((c) => c.toolName)],
    [catalogue, customTools],
  );

  // "/" focuses search, Escape clears it — Raycast-style, no visible chrome.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Categories actually present in the catalogue, with counts. */
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tool of catalogue) {
      counts.set(tool.category, (counts.get(tool.category) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([id, count]) => ({ ...categoryMeta(id), count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [catalogue]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalogue.filter((tool) => {
      if (filter === 'enabled' && !toolDrafts[tool.name]?.enabled) return false;
      if (filter !== 'all' && filter !== 'enabled' && tool.category !== filter) return false;
      if (!q) return true;
      return (
        tool.displayName.toLowerCase().includes(q) ||
        tool.name.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q) ||
        categoryMeta(tool.category).label.toLowerCase().includes(q)
      );
    });
  }, [catalogue, toolDrafts, filter, query]);

  /** Grouped by category so scanning stays possible at scale. */
  const grouped = useMemo(() => {
    const groups = new Map<string, CatalogueTool[]>();
    for (const tool of visible) {
      const list = groups.get(tool.category) ?? [];
      list.push(tool);
      groups.set(tool.category, list);
    }
    return [...groups.entries()]
      .map(([id, tools]) => ({
        meta: categoryMeta(id),
        tools: tools.sort((a, b) => a.displayName.localeCompare(b.displayName)),
      }))
      .sort((a, b) => a.meta.label.localeCompare(b.meta.label));
  }, [visible]);

  return (
    <div className="flex flex-col gap-6">
      {/* ── Custom functions ── */}
      <CustomFunctions
        customTools={customTools}
        onToggle={onCustomToggle}
        onEdit={(entry) => {
          setEditingTool(entry);
          setBuilderOpen(true);
        }}
        onRemove={onCustomRemove}
        onNew={() => {
          setEditingTool(undefined);
          setBuilderOpen(true);
        }}
      />

      {/* Filter bar — search + category chips in one row */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            size={16}
            strokeWidth={2}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--fg-muted)' }}
          />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQuery('');
                e.currentTarget.blur();
              }
            }}
            placeholder="Search tools by name, description, or category"
            aria-label="Search tools"
            className="input pl-10 pr-16"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="icon-btn absolute right-1 top-1/2 -translate-y-1/2"
            >
              <X size={16} strokeWidth={2} />
            </button>
          ) : (
            <kbd
              aria-hidden
              className="badge absolute right-3 top-1/2 -translate-y-1/2 font-mono"
            >
              /
            </kbd>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            label="All"
            count={catalogue.length}
            active={filter === 'all'}
            onClick={() => setFilter('all')}
          />
          <FilterChip
            label="Enabled"
            count={enabledCount}
            active={filter === 'enabled'}
            onClick={() => setFilter('enabled')}
          />
          <span
            aria-hidden
            className="mx-1 self-stretch"
            style={{ width: 1, background: 'var(--line-hairline)' }}
          />
          {categories.map((cat) => (
            <FilterChip
              key={cat.id}
              label={cat.label}
              count={cat.count}
              icon={cat.icon}
              active={filter === cat.id}
              onClick={() => setFilter(cat.id)}
            />
          ))}
        </div>
      </div>

      {/* Results */}
      {visible.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No tools match"
          description={
            query
              ? `Nothing matches “${query}”. Try a different term or clear the filters.`
              : 'No tools in this category yet.'
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map(({ meta, tools }) => (
            <div key={meta.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <meta.icon size={16} strokeWidth={2} aria-hidden="true" style={{ color: meta.color }} />
                <h3 className="text-caption font-medium" style={{ color: 'var(--fg-strong)' }}>
                  {meta.label}
                </h3>
                <span className="text-caption tabular-nums" style={{ color: 'var(--fg-muted)' }}>
                  {tools.length}
                </span>
              </div>

              <ul className={ROW_LIST}>
                {tools.map((tool, i) => (
                  <li
                    key={tool.name}
                    style={{
                      borderTop: i === 0 ? undefined : '1px solid var(--line-hairline)',
                    }}
                  >
                    <ToolRow
                      tool={tool}
                      enabled={toolDrafts[tool.name]?.enabled ?? false}
                      onToggle={(next) => onToggle(tool.name, next)}
                      onOpenConfig={() => onOpenConfig(tool.name)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <CustomToolBuilder
        open={builderOpen}
        initial={editingTool}
        existingNames={reservedNames}
        onClose={() => setBuilderOpen(false)}
        onSave={onCustomSave}
        onTest={onCustomTest}
        testing={testing}
        testResults={testResults}
      />
    </div>
  );
}

/** Custom HTTP function tools — create, enable, edit, delete. */
function CustomFunctions({
  customTools,
  onToggle,
  onEdit,
  onRemove,
  onNew,
}: {
  customTools: CustomToolEntry[];
  onToggle: (toolName: string, enabled: boolean) => void;
  onEdit: (entry: CustomToolEntry) => void;
  onRemove: (toolName: string) => void | Promise<void>;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Globe size={16} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--fg-muted)' }} />
          <h3 className="text-caption font-medium" style={{ color: 'var(--fg-strong)' }}>
            Custom functions
          </h3>
          <span className="text-caption tabular-nums" style={{ color: 'var(--fg-muted)' }}>
            {customTools.length}
          </span>
        </div>
        <Button variant="secondary" size="sm" onClick={onNew}>
          <Plus size={16} strokeWidth={2} aria-hidden="true" />
          New function
        </Button>
      </div>

      {customTools.length === 0 ? (
        <p
          className="rounded-md px-4 py-3 text-caption leading-body"
          style={{
            border: '1px solid var(--line-hairline)',
            background: 'var(--surface-recessed)',
            color: 'var(--fg-muted)',
          }}
        >
          Connect any HTTP API as a tool the agent can call during a conversation — no code required.
        </p>
      ) : (
        <ul className={ROW_LIST}>
          {customTools.map((entry, i) => (
            <li
              key={entry.toolName}
              className="group flex items-center gap-2 px-3 py-2"
              style={{ borderTop: i === 0 ? undefined : '1px solid var(--line-hairline)' }}
            >
              <button
                type="button"
                onClick={() => onEdit(entry)}
                className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-1 text-left"
              >
                <span
                  className="font-mono text-caption"
                  style={{ color: entry.enabled ? 'var(--fg-ink)' : 'var(--fg-body)' }}
                >
                  {entry.toolName}
                </span>
                <span className="line-clamp-1 text-caption" style={{ color: 'var(--fg-muted)' }}>
                  <span className="font-medium" style={{ color: 'var(--fg-body)' }}>
                    {entry.def.method}
                  </span>{' '}
                  {entry.def.url}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Edit ${entry.toolName}`}
                onClick={() => onEdit(entry)}
                className="icon-btn transition-opacity [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Pencil size={16} strokeWidth={2} />
              </button>
              <button
                type="button"
                aria-label={`Delete ${entry.toolName}`}
                onClick={() => void onRemove(entry.toolName)}
                className="icon-btn transition-opacity [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Trash2 size={16} strokeWidth={2} />
              </button>
              <div className="flex-shrink-0">
                <Switch
                  checked={entry.enabled}
                  onChange={(next) => onToggle(entry.toolName, next)}
                  label={`${entry.enabled ? 'Disable' : 'Enable'} ${entry.toolName}`}
                  size="sm"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Compact row: identity, then the two actions. Fixed height. */
function ToolRow({
  tool,
  enabled,
  onToggle,
  onOpenConfig,
}: {
  tool: CatalogueTool;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onOpenConfig: () => void;
}) {
  const configurable = Object.keys(
    (tool.configSchema.properties ?? {}) as Record<string, unknown>,
  ).length;

  return (
    <div className="group flex items-center gap-2 px-3 py-2 transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-hover)]">
      {/* Identity — name, then description on one clamped line */}
      <button
        type="button"
        onClick={onOpenConfig}
        className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-1 text-left"
      >
        <span className="flex items-center gap-2">
          <span
            className="text-nav font-medium"
            style={{ color: enabled ? 'var(--fg-ink)' : 'var(--fg-body)' }}
          >
            {tool.displayName}
          </span>
          {/* A missing key is a prerequisite, not a status — so it is a neutral
              label, not an amber one. */}
          {tool.requiredEnv.length > 0 && (
            <span className="badge" title={`Requires ${tool.requiredEnv.join(', ')}`}>
              Key
            </span>
          )}
        </span>
        <span className="line-clamp-1 text-caption" style={{ color: 'var(--fg-muted)' }}>
          {tool.description}
        </span>
      </button>

      {/* Configure — always mounted so layout never shifts on hover. Revealed on
          hover for pointer devices, always visible where hover doesn't exist. */}
      <button
        type="button"
        onClick={onOpenConfig}
        aria-label={`Configure ${tool.displayName}`}
        className="btn btn--ghost btn--sm flex-shrink-0 transition-opacity duration-[var(--duration-hover)] group-hover:opacity-100 focus-visible:opacity-100 max-[560px]:hidden [@media(hover:hover)]:opacity-0"
      >
        <Settings2 size={16} strokeWidth={2} aria-hidden="true" />
        {configurable > 0 ? `Configure` : 'Details'}
      </button>

      <div className="flex-shrink-0">
        <Switch
          checked={enabled}
          onChange={onToggle}
          label={`${enabled ? 'Disable' : 'Enable'} ${tool.displayName}`}
          size="sm"
        />
      </div>
    </div>
  );
}

/**
 * Active filter is an ink fill with an inverted label — the same inversion
 * `.btn--primary` uses, so it flips in light mode for free.
 */
function FilterChip({
  label,
  count,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  count: number;
  icon?: React.ElementType;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`chip cursor-pointer transition-colors duration-[var(--duration-hover)] ${
        active ? '' : 'hover:bg-[var(--surface-hover)]'
      }`}
      style={
        active
          ? {
              background: 'var(--fg-ink)',
              borderColor: 'var(--fg-ink)',
              color: 'var(--fg-on-ink)',
            }
          : undefined
      }
    >
      {Icon && <Icon size={16} strokeWidth={2} aria-hidden="true" />}
      {label}
      <span
        className="num"
        style={{ color: active ? 'var(--fg-on-ink-muted)' : 'var(--fg-muted)' }}
      >
        {count}
      </span>
    </button>
  );
}
