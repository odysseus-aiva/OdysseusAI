'use client';

import { Clock, AlertCircle } from 'lucide-react';
import type { CallSummary } from '@/lib/api/calls';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { CallRow, CallTableHeader } from './CallRow';
import type { PageSizeOption } from '../useCallHistory';

const PAGE_SIZE_OPTIONS: PageSizeOption[] = [10, 25, 50, 100];

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
    <div
      className="overflow-hidden rounded-[10px]"
      style={{ border: '1px solid var(--color-border)' }}
      role="table"
      aria-label="Call history"
    >
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
  );
}

export function CallHistoryEmpty() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 rounded-[12px] px-6 py-16 text-center"
      style={{ border: '1px dashed var(--color-border)' }}
    >
      <div
        className="flex h-11 w-11 items-center justify-center rounded-full"
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
        }}
      >
        <Clock size={18} style={{ color: 'var(--color-text-faint)' }} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[14px] font-[500]" style={{ color: 'var(--color-text)' }}>
          No calls match these filters
        </p>
        <p className="max-w-sm text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
          Try clearing search or widening the date range. New voice sessions appear here when they complete.
        </p>
      </div>
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
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-[12px] px-6 py-14 text-center"
      style={{ border: '1px dashed var(--color-border)' }}
    >
      <AlertCircle size={20} style={{ color: 'var(--color-state-error)' }} />
      <p className="text-[14px] font-[500]" style={{ color: 'var(--color-text)' }}>
        Could not load call history
      </p>
      <p className="text-[13px]" style={{ color: 'var(--color-state-error)' }}>
        {message}
      </p>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

export function CallHistorySkeleton() {
  return (
    <div
      className="overflow-hidden rounded-[10px]"
      style={{ border: '1px solid var(--color-border)' }}
      aria-busy="true"
      aria-label="Loading calls"
    >
      <div
        style={{
          height: 38,
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
        }}
      />
      {[...Array(7)].map((_, i) => (
        <div
          key={i}
          className="animate-pulse"
          style={{
            height: 56,
            background: 'var(--color-surface-raised)',
            borderTop: i > 0 ? '1px solid var(--color-border)' : undefined,
          }}
        />
      ))}
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
      {/* Page size selector */}
      <div className="flex items-center gap-2">
        <span className="whitespace-nowrap text-[12px]" style={{ color: 'var(--color-text-faint)' }}>
          Rows per page
        </span>
        <Select
          aria-label="Rows per page"
          value={String(pageSize)}
          onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSizeOption)}
          style={{ height: 32, minWidth: 84 }}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </Select>
      </div>

      {/* Page info + navigation */}
      <div className="flex items-center gap-3">
        <p className="text-[12px]" style={{ color: 'var(--color-text-faint)' }}>
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
