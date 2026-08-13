'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Settings2, X, Wrench } from 'lucide-react';
import { Switch } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Section';
import type { CatalogueTool } from '@/lib/api/agents';
import type { ToolDraft } from '../useAgentConfig';
import { categoryMeta } from '../tool-categories';

type Filter = 'all' | 'enabled' | string;

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
}: {
  catalogue: CatalogueTool[];
  toolDrafts: Record<string, ToolDraft>;
  enabledCount: number;
  onToggle: (toolName: string, enabled: boolean) => void;
  onOpenConfig: (toolName: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const searchRef = useRef<HTMLInputElement>(null);

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
    <div className="flex flex-col gap-4">
      {/* Filter bar — search + category chips in one row */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            size={13}
            strokeWidth={2}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--color-text-faint)' }}
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
            className="w-full rounded-[9px] py-2 pl-9 pr-16 text-[13px] outline-none transition-colors duration-[140ms]"
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
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 flex -translate-y-1/2 cursor-pointer items-center justify-center rounded-[5px]"
              style={{ width: 20, height: 20, color: 'var(--color-text-faint)' }}
            >
              <X size={12} strokeWidth={2.2} />
            </button>
          ) : (
            <kbd
              aria-hidden
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-[5px] px-1.5 py-0.5 font-mono text-[10px]"
              style={{
                background: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-faint)',
              }}
            >
              /
            </kbd>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
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
            accent
          />
          <span
            aria-hidden
            className="mx-1 self-stretch"
            style={{ width: 1, background: 'var(--color-border)' }}
          />
          {categories.map((cat) => (
            <FilterChip
              key={cat.id}
              label={cat.label}
              count={cat.count}
              icon={cat.icon}
              iconColor={cat.color}
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
        <div className="flex flex-col gap-5">
          {grouped.map(({ meta, tools }) => (
            <div key={meta.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 px-0.5">
                <meta.icon size={12} strokeWidth={2} style={{ color: meta.color }} />
                <h3
                  className="text-[11px] font-[600] uppercase tracking-[0.09em]"
                  style={{ color: 'var(--color-text-faint)' }}
                >
                  {meta.label}
                </h3>
                <span
                  className="text-[11px] tabular-nums"
                  style={{ color: 'var(--color-text-faint)' }}
                >
                  {tools.length}
                </span>
              </div>

              <ul
                className="overflow-hidden rounded-[11px]"
                style={{
                  background: 'var(--color-surface-raised)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {tools.map((tool, i) => (
                  <li
                    key={tool.name}
                    style={{
                      borderTop: i === 0 ? undefined : '1px solid var(--color-border)',
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
    </div>
  );
}

/** Compact row: state, identity, and the two actions. Fixed height. */
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
    <div
      className="group flex items-center gap-3 px-3.5 py-2.5 transition-colors duration-[140ms]"
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--color-surface-elevated)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {/* Enabled rail — reads state before any text */}
      <span
        aria-hidden
        className="flex-shrink-0 rounded-full transition-all duration-[180ms]"
        style={{
          width: 2.5,
          height: 22,
          background: enabled ? 'var(--color-accent)' : 'var(--color-border-strong)',
          boxShadow: enabled ? '0 0 8px var(--color-accent-glow)' : 'none',
        }}
      />

      {/* Identity — name, then description on one clamped line */}
      <button
        type="button"
        onClick={onOpenConfig}
        className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 text-left"
      >
        <span className="flex items-center gap-2">
          <span
            className="text-[13px] font-[500] tracking-[-0.01em]"
            style={{ color: enabled ? 'var(--color-text)' : 'var(--color-text-muted)' }}
          >
            {tool.displayName}
          </span>
          {tool.requiredEnv.length > 0 && (
            <span
              title={`Requires ${tool.requiredEnv.join(', ')}`}
              className="rounded-[4px] px-1 py-px text-[9.5px] font-[600] uppercase tracking-[0.06em]"
              style={{
                background: 'rgb(251 191 36 / 0.08)',
                color: 'var(--color-state-warning)',
              }}
            >
              Key
            </span>
          )}
        </span>
        <span
          className="line-clamp-1 text-[11.5px] leading-[1.45]"
          style={{ color: 'var(--color-text-faint)' }}
        >
          {tool.description}
        </span>
      </button>

      {/* Configure — always mounted so layout never shifts on hover. Revealed on
          hover for pointer devices, always visible where hover doesn't exist. */}
      <button
        type="button"
        onClick={onOpenConfig}
        aria-label={`Configure ${tool.displayName}`}
        className="flex flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-[7px] px-2 py-1 text-[11.5px] font-[450] transition-all duration-[140ms] group-hover:opacity-100 focus-visible:opacity-100 max-[560px]:hidden [@media(hover:hover)]:opacity-0"
        style={{ color: 'var(--color-text-muted)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--color-surface)';
          e.currentTarget.style.color = 'var(--color-text)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--color-text-muted)';
        }}
      >
        <Settings2 size={11.5} strokeWidth={2} />
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

function FilterChip({
  label,
  count,
  icon: Icon,
  iconColor,
  active,
  accent = false,
  onClick,
}: {
  label: string;
  count: number;
  icon?: React.ElementType;
  iconColor?: string;
  active: boolean;
  accent?: boolean;
  onClick: () => void;
}) {
  const activeColor = accent ? 'var(--color-accent)' : 'var(--color-text)';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex cursor-pointer items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[12px] font-[450] transition-all duration-[140ms]"
      style={{
        background: active ? 'var(--color-surface-elevated)' : 'transparent',
        border: `1px solid ${active ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
        color: active ? activeColor : 'var(--color-text-muted)',
      }}
    >
      {Icon && <Icon size={11.5} strokeWidth={2} style={{ color: active ? iconColor : 'currentColor' }} />}
      {label}
      <span className="tabular-nums" style={{ color: 'var(--color-text-faint)' }}>
        {count}
      </span>
    </button>
  );
}
