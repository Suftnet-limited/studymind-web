'use client';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { Outline } from '@/lib/learning-ai.mjs';
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

const CUSTOM = '__custom__';
const CHAPTERS = '__chapters__';
const MAX_PICKED = 12;

/** What a quiz, flashcard set or summary should cover. `sections` are chapter references from the module outline. */
export type Focus = { mode: 'default' | 'chapters' | 'topic'; topic: string; sections: string[]; titles: string[] };
export const NO_FOCUS: Focus = { mode: 'default', topic: '', sections: [], titles: [] };
const hasChapters = (o: Outline | null) => (o?.chapters.length ?? 0) > 0;

/** The request fields for a Focus. With chapters detected, "whole module" is sent as `balanced` so every chapter is represented. */
export function focusRequest(f: Focus, outline: Outline | null): { topic?: string; sections?: string[]; balanced?: boolean; label?: string } {
  if (f.mode === 'topic' && f.topic.trim()) return { topic: f.topic.trim() };
  if (f.mode === 'chapters' && f.sections.length) return { sections: f.sections, label: f.titles.join(' + ').slice(0, 120) };
  return hasChapters(outline) ? { balanced: true } : {};
}
/** Chat only: a topic or chosen chapters narrow what the answer is drawn from. "Whole module" sends nothing (a question already finds its own passages). */
export function chatFocus(f: Focus): { topic?: string; sections?: string[] } {
  if (f.mode === 'topic' && f.topic.trim()) return { topic: f.topic.trim() };
  if (f.mode === 'chapters' && f.sections.length) return { sections: f.sections };
  return {};
}
/** A short note saying what a result was generated for, e.g. "Topic: Osmosis" or "Chapters: Cells, Genetics". */
export function focusNote(f: Focus, outline: Outline | null): string {
  if (f.mode === 'topic' && f.topic.trim()) return `Topic: ${f.topic.trim()}`;
  if (f.mode === 'chapters' && f.sections.length) return `Chapters: ${f.titles.join(', ')}`;
  return hasChapters(outline) ? 'Whole module' : '';
}

/**
 * "What should this cover?" for Quiz, Flashcards and Summary. When chapters were detected at upload it offers the whole module (spread
 * across every chapter) or a ticked selection of chapters; it also offers the module's weeks, its documents and a free-text topic.
 * With nothing detected it is the plain free-text field it has always been.
 */
export function TopicPicker({ id, value, onChange, disabled, outline, label = 'Focus on a topic (optional)', whole }: {
  id: string; value: Focus; onChange: (f: Focus) => void; disabled?: boolean; outline: Outline | null; label?: string; whole?: string;
}) {
  const weeks = outline?.weeks ?? []; const documents = outline?.documents ?? []; const groups = outline?.chapters ?? [];
  const [custom, setCustom] = useState(false);
  const known = (v: string) => weeks.some(o => o.value === v) || (groups.length === 0 && documents.some(o => o.value === v));
  if (weeks.length === 0 && documents.length === 0 && groups.length === 0)
    return <TopicField id={id} value={value.topic} onChange={t => onChange({ ...NO_FOCUS, mode: t ? 'topic' : 'default', topic: t })} disabled={disabled} label={label} />;
  const selected = value.mode === 'chapters' ? CHAPTERS : value.mode === 'topic' ? (custom || !known(value.topic) ? CUSTOM : value.topic) : '';
  const pick = (v: string) => {
    setCustom(v === CUSTOM);
    if (v === '') onChange(NO_FOCUS);
    else if (v === CHAPTERS) onChange({ ...NO_FOCUS, mode: 'chapters' });
    else if (v === CUSTOM) onChange({ ...NO_FOCUS, mode: 'topic' });
    else onChange({ ...NO_FOCUS, mode: 'topic', topic: v });
  };
  const toggle = (ref: string, title: string) => {
    const on = value.sections.includes(ref);
    if (!on && value.sections.length >= MAX_PICKED) return;
    onChange({ ...value, sections: on ? value.sections.filter(r => r !== ref) : [...value.sections, ref], titles: on ? value.titles.filter((_, i) => value.sections[i] !== ref) : [...value.titles, title] });
  };
  const select = 'h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-base text-zinc-900 outline-none focus-visible:border-violet-400 focus-visible:ring-2 focus-visible:ring-violet-100 disabled:opacity-60';
  return <div className="space-y-2">
    <label htmlFor={id} className="block text-sm font-semibold text-zinc-700">{label}</label>
    <select id={id} value={selected} disabled={disabled} className={select} onChange={e => pick(e.target.value)}>
      <option value="">{whole ?? (groups.length ? 'Whole module (spread across all chapters)' : 'All material')}</option>
      {groups.length > 0 && <option value={CHAPTERS}>Choose chapters…</option>}
      {weeks.length > 0 && <optgroup label="Weeks">{weeks.map(o => <option key={`w-${o.value}`} value={o.value}>{o.label}</option>)}</optgroup>}
      {groups.length === 0 && documents.length > 0 && <optgroup label="Documents">{documents.map(o => <option key={`d-${o.value}`} value={o.value}>{o.label}</option>)}</optgroup>}
      <option value={CUSTOM}>Type my own topic…</option>
    </select>
    {selected === CHAPTERS && <fieldset disabled={disabled} className="min-w-0 rounded-xl border border-zinc-200 bg-white">
      <legend className="sr-only">Chapters to cover</legend>
      <div className="max-h-64 space-y-3 overflow-y-auto p-3 text-left">
        {groups.map(g => <div key={g.document}>
          {groups.length > 1 && <p className="mb-1 truncate text-xs font-bold uppercase tracking-wide text-zinc-500">{g.document}</p>}
          <ul className="space-y-0.5">
            {g.sections.map(sec => {
              const on = value.sections.includes(sec.ref); const full = !on && value.sections.length >= MAX_PICKED;
              return <li key={sec.ref} style={{ paddingLeft: `${(sec.level - 1) * 16}px` }}>
                <label className={cn('flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-violet-50', full && 'cursor-not-allowed opacity-50')}>
                  <input type="checkbox" checked={on} disabled={full} onChange={() => toggle(sec.ref, sec.title)} className="mt-0.5 size-4 shrink-0 accent-violet-600" />
                  <span className="min-w-0 flex-1 break-words text-zinc-800">{sec.title}</span>
                  {sec.page && <span className="shrink-0 text-xs text-zinc-400">p. {sec.page}</span>}
                </label>
              </li>;
            })}
          </ul>
        </div>)}
      </div>
      <p className="border-t border-zinc-100 px-3 py-2 text-xs text-zinc-500">{value.sections.length === 0 ? 'Nothing ticked: the whole module is used.' : `${value.sections.length} selected${value.sections.length >= MAX_PICKED ? ' (the most you can pick)' : ''}`}</p>
    </fieldset>}
    {selected === CUSTOM && <Input autoFocus aria-label="Your own topic" value={value.topic} maxLength={200} disabled={disabled} placeholder="e.g. a chapter or concept" onChange={e => onChange({ ...value, mode: 'topic', topic: e.target.value })} className="h-11 rounded-xl" />}
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

const TONES = ['bg-rose-50 text-rose-600', 'bg-amber-50 text-amber-600', 'bg-emerald-50 text-emerald-600', 'bg-sky-50 text-sky-600', 'bg-violet-50 text-violet-600',
  'bg-pink-50 text-pink-600', 'bg-teal-50 text-teal-600', 'bg-orange-50 text-orange-600', 'bg-indigo-50 text-indigo-600'];
/** A colour for a list icon. It is derived from the item's id, so it looks random across the list but never changes between renders. */
export function iconTone(id: string) {
  let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}
