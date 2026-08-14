'use client';

import { Clock, AlertCircle } from 'lucide-react';
import type { CallSummary } from '@/lib/api/calls';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { CallRow, CallTableHeader } from './CallRow';
import type { PageSizeOption } from '../useCallHistory';

const PAGE_SIZE_OPTIONS: PageSizeOption[] = [10, 25, 50, 100];

const SKELETON_ROWS = 5;

export function CallTable({
  calls,
  selectedId,
  onSelect,
}: {
  calls: CallSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="listing-scroll">
      <div className="listing" role="table" aria-label="Call history">
        <CallTableHeader />
        <div role="rowgroup">
          {calls.map((call) => (
            <CallRow
              key={call.callId}
              call={call}
              selected={selectedId === call.callId}
              onSelect={() => onSelect(call.callId)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function CallHistoryEmpty() {
  return (
    <div className="empty-state" aria-live="polite">
      <span className="empty-state__tile" aria-hidden="true">
        <Clock size={20} strokeWidth={1.7} />
      </span>
      <h2 className="empty-state__title">No calls match these filters</h2>
      <p className="empty-state__body">
        Try clearing search or widening the date range. New voice sessions appear here when they
        complete.
      </p>
    </div>
  );
}

export function CallHistoryError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__tile" aria-hidden="true">
        <AlertCircle size={20} strokeWidth={1.7} style={{ color: 'var(--status-error)' }} />
      </span>
      <h2 className="empty-state__title">Could not load call history</h2>
      <p className="empty-state__body">{message}</p>
      <div className="empty-state__actions">
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}

/* Bars at row height, no shimmer: a travelling highlight would be the only
   animated gradient in the app. The header stays live. */
export function CallHistorySkeleton() {
  return (
    <div className="listing-scroll">
      <div className="listing" aria-busy="true" aria-label="Loading calls">
        <CallTableHeader />
        <div className="flex flex-col gap-1 pt-1">
          {[...Array(SKELETON_ROWS)].map((_, i) => (
            <div
              key={i}
              className="rounded-sm"
              style={{ height: 'var(--row-height)', background: 'var(--surface-hover)' }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function CallPagination({
  page,
  totalPages,
  total,
  pageSize,
  offset,
  onPrev,
  onNext,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: PageSizeOption;
  offset: number;
  onPrev: () => void;
  onNext: () => void;
  onPageSizeChange: (size: PageSizeOption) => void;
}) {
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + pageSize, total);

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="whitespace-nowrap text-caption" style={{ color: 'var(--fg-muted)' }}>
          Rows per page
        </span>
        <Select
          aria-label="Rows per page"
          value={String(pageSize)}
          onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSizeOption)}
          style={{
            height: 'var(--icon-button-size)',
            minWidth: 84,
            width: 'auto',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <p className="text-caption tabular-nums" style={{ color: 'var(--fg-muted)' }}>
          {total === 0 ? 'No results' : `${from}–${to} of ${total}`}
          {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : null}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" disabled={offset === 0} onClick={onPrev}>
            Previous
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={offset + pageSize >= total}
            onClick={onNext}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
