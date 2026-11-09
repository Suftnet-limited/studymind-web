'use client';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorBox } from '@/components/learning/states';

export const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** Optional topic focus, shared by Quiz, Flashcards and Summary (the canonical API accepts a free-text topic). */
export function TopicField({ id, value, onChange, disabled, label = 'Focus on a topic (optional)' }: {
  id: string; value: string; onChange: (v: string) => void; disabled?: boolean; label?: string;
}) {
  return <div className="space-y-1">
    <label htmlFor={id} className="block text-sm font-medium text-zinc-700">{label}</label>
    <Input id={id} value={value} maxLength={200} disabled={disabled} placeholder="e.g. a chapter or concept" onChange={e => onChange(e.target.value)} />
  </div>;
}

/** Centered call to action with consistent loading and error states. */
export function GenerateState({ icon, text, buttonLabel, loadingLabel, loading, error, onGenerate, children }: {
  icon: ReactNode; text: string; buttonLabel: string; loadingLabel: string; loading: boolean; error: string | null;
  onGenerate: () => void; children?: ReactNode;
}) {
  return <div className="space-y-4">
    {children}
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center">
      <div className="mb-2 flex justify-center text-zinc-400" aria-hidden>{icon}</div>
      <p className="mb-4 text-sm text-zinc-600">{text}</p>
      {error && <div className="mb-4 text-left"><ErrorBox message={error} onRetry={onGenerate} /></div>}
      <Button onClick={onGenerate} disabled={loading}>{loading ? loadingLabel : buttonLabel}</Button>
      {loading && <p role="status" className="mt-3 text-xs text-zinc-500">This can take up to a minute.</p>}
    </div>
  </div>;
}
