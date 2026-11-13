import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { DocumentStatus } from '@/lib/studymind-validation.mjs';

export function LoadingBlock({ label, rows = 1 }: { label: string; rows?: number }) {
  return <div role="status" aria-live="polite" className="space-y-3">
    <span className="sr-only">{label}</span>
    {Array.from({ length: rows }, (_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-zinc-100" />)}
  </div>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
    <span>{message}</span>
    {onRetry && <button type="button" onClick={onRetry} className="rounded-lg border border-red-300 bg-white px-3 py-1.5 font-semibold hover:bg-red-100">Try again</button>}
  </div>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center">
    <p className="font-semibold text-zinc-900">{title}</p>
    {children && <div className="mt-2 text-sm text-zinc-500">{children}</div>}
  </div>;
}

const STATUS: Record<DocumentStatus, { label: string; cls: string }> = {
  indexed: { label: 'Indexed', cls: 'bg-green-50 text-green-700' },
  processing: { label: 'Indexing…', cls: 'bg-amber-50 text-amber-700' },
  failed: { label: 'Indexing failed', cls: 'bg-red-50 text-red-700' },
  unknown: { label: 'Status unknown', cls: 'bg-zinc-100 text-zinc-600' },
};
export function StatusBadge({ status }: { status: DocumentStatus }) {
  const { label, cls } = STATUS[status];
  return <span className={cn('rounded-md px-2 py-1 text-xs font-semibold', cls)}>{label}</span>;
}
