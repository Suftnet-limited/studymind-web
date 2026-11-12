'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, MoreVertical, Plus, Trash2 } from 'lucide-react';
import { studyMindAiService } from '@/services/studymind-ai.service';
import type { HistoryKind, HistoryRow } from '@/lib/learning-ai.mjs';
import { btnOutline } from './layout';
import { errorText, when } from './shared';
import { cn } from '@/lib/utils';

/** The caller's saved items of one kind for this module, newest first. History is private to the user and to the module (the server enforces both). */
export function useHistory(moduleId: string, kind: HistoryKind) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try { setRows(await studyMindAiService.listHistory(moduleId, kind)); setError(null); }
    catch (e) { setError(errorText(e, 'Unable to load your saved items')); setRows(r => r ?? []); }
  }, [moduleId, kind]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { rows, error, refresh };
}

type Words = { title: string; subtitle: string; newLabel: string; recent: string; empty: string; viewAll: string; fewer: string; item: string };
export const HISTORY_WORDS: Record<HistoryKind, Words> = {
  quiz: { title: 'Quiz', subtitle: 'Test yourself on this module', newLabel: 'New Quiz', recent: 'Recent Quizzes', empty: 'Quizzes you create for this module will appear here.', viewAll: 'View all quizzes', fewer: 'Show fewer quizzes', item: 'quiz' },
  flashcards: { title: 'Flashcards', subtitle: 'Memorise the key ideas', newLabel: 'New Flashcards', recent: 'Recent Flashcards', empty: 'Flashcard sets you create for this module will appear here.', viewAll: 'View all sets', fewer: 'Show fewer sets', item: 'flashcard set' },
  summary: { title: 'Summary', subtitle: 'A clear overview of the material', newLabel: 'New Summary', recent: 'Recent Summaries', empty: 'Summaries you create for this module will appear here.', viewAll: 'View all summaries', fewer: 'Show fewer summaries', item: 'summary' },
};

/**
 * The left-hand "Recent" card, in the same layout as the Chat tab: a header, a New button, and the recent items with a menu to delete.
 * On small screens the list collapses behind a toggle.
 */
export function HistoryRail({ kind, icon, rows, error, activeId, opening, busy, onNew, onOpen, onDelete }: {
  kind: HistoryKind; icon: ReactNode; rows: HistoryRow[] | null; error: string | null; activeId: string | null; opening: string | null; busy: boolean;
  onNew: () => void; onOpen: (id: string) => void; onDelete: (id: string) => Promise<void>;
}) {
  const w = HISTORY_WORDS[kind];
  const [showAll, setShowAll] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-hist-menu]')) { setMenuFor(null); setConfirmFor(null); } };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenuFor(null); setConfirmFor(null); } };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, []);
  async function remove(id: string) {
    setMenuFor(null); setConfirmFor(null); setRemoveError(null);
    try { await onDelete(id); } catch (e) { setRemoveError(errorText(e, `Unable to delete this ${w.item}`)); }
  }
  const shown = rows ? (showAll ? rows : rows.slice(0, 5)) : [];
  const list = <>
    {rows === null && <p role="status" className="px-1 py-3 text-sm text-zinc-500">Loading…</p>}
    {rows && rows.length === 0 && !error && <p className="px-1 py-3 text-sm leading-6 text-zinc-500">{w.empty}</p>}
    <ul className="space-y-1">
      {shown.map(r => <li key={r.id} data-hist-menu className="relative">
        <div className={cn('flex items-center gap-1 rounded-2xl pr-1 transition', r.id === activeId ? 'bg-violet-50' : 'hover:bg-zinc-50')}>
          <button type="button" onClick={() => onOpen(r.id)} aria-current={r.id === activeId ? 'true' : undefined} disabled={opening === r.id || busy}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
            <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm ring-1 ring-zinc-100 [&>svg]:size-[18px]">{icon}</span>
            <span className="min-w-0"><span className="block truncate text-sm font-semibold text-[#111034]">{r.title}</span><span className="block text-xs text-zinc-500">{when(r.created_at)}</span><span className="block text-xs text-zinc-500">{r.detail}</span></span>
          </button>
          <button type="button" aria-label={`Options for ${r.title}`} aria-haspopup="menu" aria-expanded={menuFor === r.id} onClick={() => { setMenuFor(menuFor === r.id ? null : r.id); setConfirmFor(null); }}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-white hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"><MoreVertical className="size-4" aria-hidden /></button>
        </div>
        {menuFor === r.id && <div role="menu" aria-label={`${w.title} options`} className="absolute right-1 top-full z-20 mt-1 w-56 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-[0_12px_36px_rgba(76,29,149,0.14)]">
          {confirmFor === r.id
            ? <div className="p-2"><p className="text-sm font-semibold text-[#111034]">Delete this {w.item}?</p><p className="mt-0.5 text-xs text-zinc-500">It cannot be restored.</p>
                <div className="mt-2 flex gap-2"><button type="button" role="menuitem" onClick={() => void remove(r.id)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs! font-semibold! text-white hover:bg-red-700">Delete</button>
                  <button type="button" role="menuitem" onClick={() => { setConfirmFor(null); setMenuFor(null); }} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs! font-semibold! text-zinc-700 hover:bg-zinc-50">Cancel</button></div></div>
            : <button type="button" role="menuitem" onClick={() => setConfirmFor(r.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm! font-semibold! text-red-700 hover:bg-red-50"><Trash2 className="size-4" aria-hidden /> Delete {w.item}</button>}
        </div>}
      </li>)}
    </ul>
    {(error || removeError) && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{removeError ?? error}</p>}
    {rows && rows.length > 5 && <button type="button" onClick={() => setShowAll(a => !a)} className="mt-3 w-full text-center text-sm! font-semibold! text-violet-700 hover:underline">{showAll ? w.fewer : <>{w.viewAll} <span aria-hidden>→</span></>}</button>}
  </>;
  return <aside aria-label={`${w.title} history`} className="min-w-0 rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_18px_50px_rgba(76,29,149,0.05)] lg:self-start">
    <div className="flex items-center gap-3.5">
      <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 [&>svg]:size-6">{icon}</span>
      <div className="min-w-0"><h2 className="text-lg font-bold leading-tight text-[#111034]">{w.title}</h2><p className="text-sm text-zinc-500">{w.subtitle}</p></div>
    </div>
    <button type="button" onClick={onNew} disabled={busy} className={cn(btnOutline, 'mt-5 w-full')}><Plus className="size-4" aria-hidden /> {w.newLabel}</button>
    <h3 className="mt-6 hidden text-base font-bold text-[#111034] lg:block">{w.recent}</h3>
    <button type="button" aria-expanded={recentOpen} onClick={() => setRecentOpen(o => !o)} className="mt-5 flex w-full items-center justify-between rounded-xl px-1 py-1 text-left text-base! font-bold! text-[#111034] lg:hidden">
      <span>{w.recent}{rows && rows.length > 0 ? ` (${rows.length})` : ''}</span><ChevronDown className={cn('size-4 text-zinc-500 transition-transform', recentOpen && 'rotate-180')} aria-hidden />
    </button>
    <div className={cn('mt-3', recentOpen ? 'block' : 'hidden lg:block')}>{list}</div>
  </aside>;
}
