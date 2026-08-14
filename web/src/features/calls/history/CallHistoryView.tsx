'use client';

import { RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { useCallHistory } from './useCallHistory';
import { CallHistoryFiltersBar } from './components/CallHistoryFiltersBar';
import {
  CALL_TABLE_COLUMNS,
  CALL_TABLE_MIN_WIDTH,
} from './components/CallRow';
import {
  CallHistoryEmpty,
  CallHistoryError,
  CallHistorySkeleton,
  CallPagination,
  CallTable,
} from './components/CallTable';

/* Column tracks and row pitch are this screen's own geometry, so they ride on
   the page root rather than the shared listing primitive. */
const LISTING_GEOMETRY = {
  '--listing-columns': CALL_TABLE_COLUMNS,
  '--listing-min-width': CALL_TABLE_MIN_WIDTH,
  '--row-height': '56px',
} as React.CSSProperties;

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
    <div className="flex h-full min-h-0 flex-col" style={LISTING_GEOMETRY}>
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
              size={14}
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
          background: 'var(--bg-app)',
          borderBottom: '1px solid var(--line-hairline)',
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
          borderTop: '1px solid var(--line-hairline)',
          background: 'var(--bg-app)',
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
