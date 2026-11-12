'use client';
import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { ErrorBox } from '@/components/learning/states';
import { btnPrimary } from './layout';

export const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** Optional topic focus, shared by Quiz, Flashcards and Summary (the canonical API accepts a free-text topic). */
export function TopicField({ id, value, onChange, disabled, label = 'Focus on a topic (optional)' }: {
  id: string; value: string; onChange: (v: string) => void; disabled?: boolean; label?: string;
}) {
  return <div className="space-y-1.5">
    <label htmlFor={id} className="block text-sm font-semibold text-zinc-700">{label}</label>
    <Input id={id} value={value} maxLength={200} disabled={disabled} placeholder="e.g. a chapter or concept" onChange={e => onChange(e.target.value)} className="h-11 rounded-xl" />
  </div>;
}

/** Centered call to action with consistent loading and error states. */
export function GenerateState({ icon, text, buttonLabel, loadingLabel, loading, error, onGenerate, children }: {
  icon: ReactNode; text: string; buttonLabel: string; loadingLabel: string; loading: boolean; error: string | null;
  onGenerate: () => void; children?: ReactNode;
}) {
  return <div className="mx-auto max-w-md py-6 text-center">
    <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-3xl bg-violet-50 text-violet-600" aria-hidden>{icon}</div>
    <p className="mb-6 text-sm leading-6 text-zinc-600">{text}</p>
    {children && <div className="mb-5 text-left">{children}</div>}
    {error && <div className="mb-4 text-left"><ErrorBox message={error} onRetry={onGenerate} /></div>}
    <button type="button" onClick={onGenerate} disabled={loading} className={btnPrimary}>{loading ? loadingLabel : buttonLabel}</button>
    {loading && <p role="status" className="mt-3 text-xs text-zinc-500">This can take up to a minute.</p>}
  </div>;
}

export const clock = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); };
export function when(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return '';
  const today = new Date().toDateString() === d.toDateString();
  return today ? `Today, ${clock(iso)}` : `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}, ${clock(iso)}`;
}
