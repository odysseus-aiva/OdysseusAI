'use client';

import { RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { useCallHistory } from './useCallHistory';
import { CallHistoryFiltersBar } from './components/CallHistoryFiltersBar';
import {
  CallHistoryEmpty,
  CallHistoryError,
  CallHistorySkeleton,
  CallPagination,
  CallTable,
} from './components/CallTable';

export function CallHistoryView() {
  const {
    calls,
    total,
    rawCount,
    visibleCount,
    loading,
    error,
    page,
    totalPages,
    pageSize,
    updatePageSize,
    offset,
    filters,
    updateFilters,
    agents,
    selectedId,
    setSelectedId,
    refresh,
    goPrev,
    goNext,
    retry,
  } = useCallHistory();

  const clientFiltered =
    filters.query.trim() !== '' || filters.numberQuery.trim() !== '';

  const description = loading
    ? 'Loading calls…'
    : error
      ? 'Unable to load calls'
      : clientFiltered
        ? `${visibleCount} of ${rawCount} on this page · ${total} total`
        : `${total} ${total === 1 ? 'call' : 'calls'} total`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Call History"
        description={description}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={loading}
            aria-label="Refresh call list"
          >
            <RefreshCw
              size={13}
              strokeWidth={2}
              className={loading ? 'animate-spin' : undefined}
            />
            Refresh
          </Button>
        }
      />

      {/* Sticky filter strip — outside the scroll container */}
      <div
        className="flex-shrink-0 px-8 py-3"
        style={{
          background: 'var(--color-void)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <CallHistoryFiltersBar
          filters={filters}
          agents={agents}
          onChange={updateFilters}
        />
      </div>

      {/* Scrollable table area — pagination lives outside this container */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-8 py-4">
          {loading ? (
            <CallHistorySkeleton />
          ) : error ? (
            <CallHistoryError message={error} onRetry={retry} />
          ) : calls.length === 0 ? (
            <CallHistoryEmpty />
          ) : (
            <CallTable
              calls={calls}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </div>
      </div>

      {/* Pagination footer — height matches sidebar Settings footer so both border-tops align */}
      <div
        className="flex-shrink-0 flex items-center px-8"
        style={{
          height: 48,
          boxSizing: 'border-box',
          borderTop: '1px solid var(--color-border)',
          background: 'var(--color-void)',
        }}
      >
        <CallPagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          offset={offset}
          onPrev={goPrev}
          onNext={goNext}
          onPageSizeChange={updatePageSize}
        />
      </div>
    </div>
  );
}
