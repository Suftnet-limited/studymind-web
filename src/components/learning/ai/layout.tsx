'use client';
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/*
 * Shared building blocks for the module page (panel, side card, progress bar, numbered grid, buttons).
 * Font size and weight on <button> use the `!` modifier because the app's global, unlayered `button, input { font: inherit }`
 * rule otherwise beats every Tailwind font utility.
 */
export const btnPrimary = 'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 text-sm! font-semibold! text-white shadow-sm transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
export const btnOutline = 'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-5 text-sm! font-semibold! text-violet-700 transition hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/** A rounded white panel with an icon tile, title, subtitle and an optional right-hand slot. */
export function ToolPanel({ icon, title, subtitle, right, children, className }: { icon: ReactNode; title: string; subtitle?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={cn('rounded-3xl border border-zinc-200/80 bg-white shadow-[0_18px_50px_rgba(76,29,149,0.05)]', className)}>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4 sm:px-7 sm:py-5">
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600" aria-hidden>{icon}</span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight tracking-tight text-[#111034]">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>}
        </div>
      </div>
      {right}
    </header>
    <div className="px-5 py-5 sm:px-7 sm:py-6">{children}</div>
  </section>;
}

export function SideCard({ title, icon, right, children }: { title: string; icon?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return <section className="rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_18px_50px_rgba(76,29,149,0.04)]">
    <div className="mb-4 flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-base font-bold text-[#111034]">{icon && <span className="text-violet-600" aria-hidden>{icon}</span>}{title}</h3>
      {right}
    </div>
    {children}
  </section>;
}

/** Main content plus a right-hand column on wide screens; the column stacks below on small screens. */
export function ToolLayout({ main, side }: { main: ReactNode; side: ReactNode }) {
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]"><div className="min-w-0">{main}</div><aside className="min-w-0 space-y-5">{side}</aside></div>;
}

export function ProgressBar({ value, max, label, className }: { value: number; max: number; label: string; className?: string }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className={cn('h-2.5 overflow-hidden rounded-full bg-zinc-100', className)}>
    <div className="h-full rounded-full bg-violet-600 transition-[width] duration-300" style={{ width: `${pct}%` }} />
  </div>;
}

export type CellState = 'idle' | 'current' | 'done' | 'correct' | 'wrong';
const CELL: Record<CellState, string> = {
  idle: 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-violet-300',
  current: 'border-violet-500 bg-violet-50 text-violet-700 ring-2 ring-violet-100',
  done: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  correct: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  wrong: 'border-red-200 bg-red-50 text-red-700',
};
/** Numbered square buttons (question or card navigator). The state is also exposed in the accessible name. */
export function NumberGrid({ label, states, onSelect, noun }: { label: string; states: CellState[]; onSelect: (index: number) => void; noun: string }) {
  const word: Record<CellState, string> = { idle: '', current: ', current', done: ', done', correct: ', correct', wrong: ', incorrect' };
  return <ul aria-label={label} className="grid grid-cols-5 gap-2">
    {states.map((state, i) => <li key={i}>
      <button type="button" onClick={() => onSelect(i)} aria-current={state === 'current' ? 'true' : undefined} aria-label={`${noun} ${i + 1}${word[state]}`}
        className={cn('relative flex h-11 w-full items-center justify-center rounded-xl border text-sm! font-bold! transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500', CELL[state])}>
        {i + 1}
        {(state === 'done' || state === 'correct') && <Check className="absolute bottom-1 right-1 size-3 rounded-full bg-emerald-500 p-px text-white" aria-hidden />}
      </button>
    </li>)}
  </ul>;
}

/** A label/value row used in the settings card. */
export function SettingRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <li className="flex items-center gap-3 border-t border-zinc-100 py-3 text-sm text-zinc-700 first:border-t-0 first:pt-0 last:pb-0"><span className="text-zinc-400" aria-hidden>{icon}</span><span className="min-w-0 break-words">{children}</span></li>;
}
