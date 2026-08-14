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

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-5">
        <div className="flex w-full flex-col gap-4">
          <CallHistoryFiltersBar
            filters={filters}
            agents={agents}
            onChange={updateFilters}
          />

          {loading ? (
            <CallHistorySkeleton />
          ) : error ? (
            <CallHistoryError message={error} onRetry={retry} />
          ) : calls.length === 0 ? (
            <CallHistoryEmpty />
          ) : (
            <>
              <CallTable
                calls={calls}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
              <CallPagination
                page={page}
                totalPages={totalPages}
                total={total}
                pageSize={pageSize}
                offset={offset}
                onPrev={goPrev}
                onNext={goNext}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
