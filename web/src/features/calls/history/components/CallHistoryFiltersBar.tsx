'use client';

import type { Agent } from '@/lib/api/agents';
import type { CallStatus } from '@/lib/types/call-log';
import type { CallHistoryFilters, DateRangePreset } from '../utils';
import { FilterSelect } from './FilterSelect';
import { SearchInput } from './SearchInput';

export function CallHistoryFiltersBar({
  filters,
  agents,
  onChange,
}: {
  filters: CallHistoryFilters;
  agents: Agent[];
  onChange: (patch: Partial<CallHistoryFilters>) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={filters.query}
          onChange={(query) => onChange({ query })}
        />

        <FilterSelect
          aria-label="Date range"
          value={filters.datePreset}
          onChange={(e) =>
            onChange({ datePreset: e.target.value as DateRangePreset })
          }
        >
          <option value="all">All time</option>
          <option value="today">Today</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="custom">Custom range</option>
        </FilterSelect>

        <FilterSelect
          aria-label="Agent"
          value={filters.agentId}
          onChange={(e) => onChange({ agentId: e.target.value })}
        >
          <option value="">All agents</option>
          {agents.map((a) => (
            <option key={a.agentId} value={a.agentId}>
              {a.name}
            </option>
          ))}
        </FilterSelect>

        <input
          type="search"
          value={filters.numberQuery}
          onChange={(e) => onChange({ numberQuery: e.target.value })}
          placeholder="Number"
          aria-label="Filter by phone number"
          className="input"
          style={{ width: 140 }}
        />

        <FilterSelect
          aria-label="Status"
          value={filters.status}
          onChange={(e) =>
            onChange({ status: e.target.value as '' | CallStatus })
          }
        >
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="in_progress">In progress</option>
          <option value="error">Error</option>
        </FilterSelect>
      </div>

      {filters.datePreset === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <label
            className="flex items-center gap-2 text-caption"
            style={{ color: 'var(--fg-muted)' }}
          >
            From
            <input
              type="date"
              value={filters.customFrom ?? ''}
              onChange={(e) => onChange({ customFrom: e.target.value })}
              className="input"
              style={{ width: 'auto' }}
            />
          </label>
          <label
            className="flex items-center gap-2 text-caption"
            style={{ color: 'var(--fg-muted)' }}
          >
            To
            <input
              type="date"
              value={filters.customTo ?? ''}
              onChange={(e) => onChange({ customTo: e.target.value })}
              className="input"
              style={{ width: 'auto' }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
