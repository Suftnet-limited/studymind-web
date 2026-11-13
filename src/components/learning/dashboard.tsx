'use client';
// The learner dashboard pieces: stat tiles, create / join cards and the searchable, sortable, paged module tables.
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpDown, Atom, BookOpen, Calculator, Check, CheckCircle2, ChevronLeft, ChevronRight, Code2, Copy, FileText, FlaskConical, GraduationCap, Landmark, Languages, Layers, Leaf, MoreHorizontal, Play, Search, SquarePlus, Users } from 'lucide-react';
import { studyMindModulesService, type CanonicalModule } from '@/services/studymind-modules.service';
import { ErrorBox } from '@/components/learning/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TYPES, addedAt, formatDate, matchesSearch, matchesType, moduleIconKind, paginate, sortModules, statusOf, typeCounts, type IconKind, type Sort, type TypeFilter } from '@/lib/dashboard.mjs';
import { cn } from '@/lib/utils';

const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

// ── Stat tiles ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const TONES = {
  violet: { tile: 'from-violet-100/80 to-violet-50', dot: 'bg-violet-100 text-violet-600' },
  blue: { tile: 'from-sky-100/80 to-sky-50', dot: 'bg-sky-100 text-sky-600' },
  amber: { tile: 'from-amber-100/80 to-amber-50', dot: 'bg-amber-100 text-amber-600' },
  green: { tile: 'from-emerald-100/80 to-emerald-50', dot: 'bg-emerald-100 text-emerald-600' },
} as const;
export type Stat = { label: string; value: number; tone: keyof typeof TONES; icon: ReactNode };

export function StatTiles({ stats }: { stats: Stat[] }) {
  return <ul aria-label="Overview" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
    {stats.map(s => <li key={s.label} className={cn('flex items-center gap-3 rounded-3xl bg-gradient-to-br p-4 sm:gap-4 sm:p-5', TONES[s.tone].tile)}>
      <span aria-hidden className={cn('flex size-12 shrink-0 items-center justify-center rounded-full sm:size-14', TONES[s.tone].dot)}>{s.icon}</span>
      <div className="min-w-0"><p className="text-2xl font-extrabold leading-none text-[#111034] sm:text-3xl">{s.value}</p><p className="mt-1.5 text-sm text-zinc-600">{s.label}</p></div>
    </li>)}
  </ul>;
}
export const statIcons = { layers: <Layers className="size-6" />, cap: <GraduationCap className="size-6" />, play: <Play className="size-6" />, done: <CheckCircle2 className="size-6" />, users: <Users className="size-6" />, file: <FileText className="size-6" /> };

// ── Create and join ───────────────────────────────────────────────────────────────────────────────────────────────────────
function ActionCard({ icon, title, description, tint, children }: { icon: ReactNode; title: string; description: string; tint?: boolean; children: ReactNode }) {
  return <section className={cn('rounded-3xl border p-5 shadow-[0_18px_50px_rgba(76,29,149,0.05)] sm:p-6', tint ? 'border-violet-200 bg-violet-50/40' : 'border-zinc-200/80 bg-white')}>
    <div className="flex items-start gap-4">
      <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">{icon}</span>
      <div className="min-w-0"><h2 className="text-lg font-bold tracking-tight text-[#111034]">{title}</h2><p className="mt-0.5 text-sm leading-6 text-zinc-500">{description}</p></div>
    </div>
    <div className="mt-4">{children}</div>
  </section>;
}

export function CreateModule({ canCreateClass }: { canCreateClass: boolean }) {
  const cache = useQueryClient();
  const [title, setTitle] = useState('');
  const [accessType, setAccessType] = useState<'personal' | 'class'>('personal');
  const create = useMutation({
    mutationFn: () => studyMindModulesService.create(title.trim(), canCreateClass ? accessType : 'personal'),
    onSuccess: async () => { setTitle(''); await cache.invalidateQueries({ queryKey: ['canonical'] }); },
  });
  return <ActionCard tint icon={<SquarePlus className="size-6" />} title="Create a module"
    description={canCreateClass ? 'Create a class module for your students, or a personal one for your own notes.' : 'Start a personal space for your own notes and materials.'}>
    <form className="flex flex-wrap gap-3" onSubmit={e => { e.preventDefault(); create.mutate(); }}>
      <Input aria-label="Module title" className="min-w-48 flex-1" placeholder="e.g. Organic Chemistry" minLength={2} maxLength={255} required value={title} onChange={e => setTitle(e.target.value)} />
      {canCreateClass && <select aria-label="Access type" className="h-11 rounded-lg border border-zinc-200 bg-white px-3 text-base" value={accessType} onChange={e => setAccessType(e.target.value as 'personal' | 'class')}>
        <option value="personal">Personal</option><option value="class">Class</option>
      </select>}
      <Button disabled={create.isPending || title.trim().length < 2}>{create.isPending ? 'Creating…' : 'Create module'}</Button>
    </form>
    {create.isError && <div className="mt-3"><ErrorBox message={message(create.error)} /></div>}
  </ActionCard>;
}

export function JoinCourse() {
  const cache = useQueryClient();
  const [courseId, setCourseId] = useState('');
  const join = useMutation({
    mutationFn: () => studyMindModulesService.join(courseId.trim()),
    onSuccess: async () => { setCourseId(''); await cache.invalidateQueries({ queryKey: ['canonical'] }); },
  });
  return <ActionCard icon={<Users className="size-6" />} title="Join a course" description="Paste the Course ID your lecturer shared with you.">
    <form className="flex flex-wrap gap-3" onSubmit={e => { e.preventDefault(); join.mutate(); }}>
      <Input aria-label="Course ID" className="min-w-48 flex-1" placeholder="Course ID" required maxLength={64} autoComplete="off" spellCheck={false} value={courseId}
        onChange={e => { setCourseId(e.target.value); if (join.isError || join.isSuccess) join.reset(); }} />
      <Button variant="secondary" disabled={join.isPending || courseId.trim().length < 3}>{join.isPending ? 'Joining…' : 'Join course'}</Button>
    </form>
    {join.isError && <div className="mt-3"><ErrorBox message={message(join.error)} /></div>}
    {join.isSuccess && <p role="status" className="mt-3 text-sm text-green-700">You have joined the course. It now appears in My modules.</p>}
  </ActionCard>;
}

// ── Module tables ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const ICONS: Record<IconKind, ReactNode> = {
  maths: <Calculator className="size-5" />, biology: <Leaf className="size-5" />, chemistry: <FlaskConical className="size-5" />, physics: <Atom className="size-5" />,
  code: <Code2 className="size-5" />, humanities: <Landmark className="size-5" />, language: <Languages className="size-5" />, document: <FileText className="size-5" />, book: <BookOpen className="size-5" />,
};
function ModuleIcon({ module }: { module: CanonicalModule }) {
  return <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-xl text-violet-600 ring-1 ring-violet-100">{module.emoji || ICONS[moduleIconKind(module.title) as IconKind]}</span>;
}
const PILL = { green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', muted: 'bg-zinc-100 text-zinc-600' } as const;
const StatusPill = ({ module, owned }: { module: CanonicalModule; owned: boolean }) => { const s = statusOf(module, owned); return <span className={cn('inline-flex rounded-lg px-3 py-1 text-sm font-semibold', PILL[s.tone as keyof typeof PILL])}>{s.label}</span>; };
const TypePill = ({ module }: { module: CanonicalModule }) => <span className={cn('inline-flex rounded-lg px-3 py-1 text-sm font-semibold', module.access_type === 'class' ? 'bg-sky-50 text-sky-700' : 'bg-violet-50 text-violet-700')}>{module.access_type === 'class' ? 'Class' : 'Personal'}</span>;
function Progress({ value }: { value: number }) {
  return <div className="flex items-center gap-3"><span className="w-10 shrink-0 text-sm font-semibold text-zinc-700">{value}%</span>
    <div role="progressbar" aria-label="Study progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} className="h-2.5 w-full min-w-24 max-w-48 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-violet-600" style={{ width: `${value}%` }} /></div></div>;
}

function RowActions({ module, canCopy }: { module: CanonicalModule; canCopy: boolean }) {
  const [open, setOpen] = useState(false); const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null); const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', key);
    box.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key); };
  }, [open]);
  const item = 'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm! font-semibold! text-zinc-700 hover:bg-violet-50 focus-visible:bg-violet-50 focus-visible:outline-none';
  return <div ref={box} className="relative inline-block">
    <button ref={trigger} type="button" aria-label={`Actions for ${module.title}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}
      className="flex size-10 items-center justify-center rounded-xl text-zinc-500 transition hover:bg-violet-50 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"><MoreHorizontal className="size-5" aria-hidden /></button>
    {open && <div role="menu" aria-label={`${module.title} actions`} className="absolute right-0 top-full z-20 mt-1 w-52 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-[0_12px_36px_rgba(76,29,149,0.14)]">
      <Link role="menuitem" href={`/my-learning/modules/${module.id}`} className={item}><BookOpen className="size-4" aria-hidden /> Open module</Link>
      {canCopy && <button type="button" role="menuitem" className={item} onClick={async () => { try { await navigator.clipboard.writeText(module.id); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard unavailable */ } }}>
        {copied ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}{copied ? 'Course ID copied' : 'Copy Course ID'}</button>}
    </div>}
  </div>;
}

function SortHead({ label, by, sort, onSort, className }: { label: string; by: 'name' | 'date' | 'status'; sort: Sort; onSort: (by: 'name' | 'date' | 'status') => void; className?: string }) {
  const active = sort?.by === by;
  return <th scope="col" aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={cn('px-5 py-4 text-left text-sm font-bold text-[#111034]', className)}>
    <button type="button" onClick={() => onSort(by)} className="inline-flex items-center gap-1.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">{label}<ArrowUpDown className={cn('size-3.5', active ? 'text-violet-600' : 'text-zinc-400')} aria-hidden /></button>
  </th>;
}

export type ModuleRow = CanonicalModule & { owned: boolean };
const TYPE_LABEL: Record<TypeFilter, string> = { all: 'All', personal: 'Personal', class: 'Class' };

/** One table for every module the learner owns or is enrolled in, with type badges to filter it. */
export function ModuleTable({ id, title, searchLabel, modules, userOwnsClass, empty }: {
  id: string; title: string; searchLabel: string; modules: ModuleRow[]; userOwnsClass: boolean; empty: string;
}) {
  const [query, setQuery] = useState(''); const [type, setType] = useState<TypeFilter>('all'); const [sort, setSort] = useState<Sort>(null); const [page, setPage] = useState(1);
  const counts = useMemo(() => typeCounts(modules), [modules]);
  const rows = useMemo(() => sortModules(modules.filter(m => matchesType(m, type) && matchesSearch(m, query)), sort), [modules, type, query, sort]);
  const view = paginate(rows, page);
  const onSort = (by: 'name' | 'date' | 'status') => { setSort(s => (s?.by === by ? (s.dir === 'asc' ? { by, dir: 'desc' } : null) : { by, dir: 'asc' })); setPage(1); };
  const canCopy = (m: ModuleRow) => m.owned && userOwnsClass && m.access_type === 'class';
  const pct = (m: ModuleRow) => Math.min(100, Math.max(0, Number(m.progress) || 0));
  const filtered = type !== 'all' || query.trim() !== '';
  const pager = rows.length > 0 && <nav aria-label={`${title} pages`} className="flex items-center justify-center gap-2 border-t border-zinc-100 px-4 py-4">
    <button type="button" aria-label="Previous page" disabled={view.page === 1} onClick={() => setPage(view.page - 1)} className="flex size-10 items-center justify-center rounded-xl text-zinc-600 hover:bg-violet-50 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"><ChevronLeft className="size-5" aria-hidden /></button>
    {Array.from({ length: view.pages }, (_, i) => i + 1).map(n => <button key={n} type="button" aria-label={`Page ${n}`} aria-current={n === view.page ? 'page' : undefined} onClick={() => setPage(n)}
      className={cn('flex size-10 items-center justify-center rounded-full text-sm! font-bold! focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500', n === view.page ? 'bg-violet-600 text-white' : 'text-zinc-600 hover:bg-violet-50')}>{n}</button>)}
    <button type="button" aria-label="Next page" disabled={view.page === view.pages} onClick={() => setPage(view.page + 1)} className="flex size-10 items-center justify-center rounded-xl text-zinc-600 hover:bg-violet-50 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"><ChevronRight className="size-5" aria-hidden /></button>
  </nav>;
  const added = (m: ModuleRow) => <><span className="whitespace-nowrap text-zinc-700">{formatDate(addedAt(m))}</span><span className="block text-xs text-zinc-400">{m.owned ? 'Created' : 'Enrolled'}</span></>;

  return <section aria-labelledby={id} className="space-y-4">
    <h2 id={id} className="flex items-center gap-3 text-2xl font-extrabold tracking-tight text-[#111034]">{title}<span className="rounded-full bg-violet-50 px-3 py-1 text-sm font-bold text-violet-700" aria-label={`${modules.length} modules`}>{modules.length}</span></h2>

    {modules.length === 0
      ? <div className="rounded-3xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center"><p className="font-semibold text-[#111034]">No modules yet</p><p className="mt-1 text-sm text-zinc-500">{empty}</p></div>
      : <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Filter by type" className="flex flex-wrap gap-2">
            {TYPES.map(t => <button key={t} type="button" aria-pressed={type === t} onClick={() => { setType(t); setPage(1); }}
              className={cn('inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm! font-semibold! transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
                type === t ? 'border-violet-600 bg-violet-600 text-white shadow-sm' : 'border-violet-200 bg-white text-violet-700 hover:bg-violet-50')}>
              {TYPE_LABEL[t]}<span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', type === t ? 'bg-white/25 text-white' : 'bg-violet-50 text-violet-700')}>{counts[t]}</span></button>)}
          </div>
          <label className="relative block w-full sm:w-80"><span className="sr-only">{searchLabel}</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" aria-hidden />
            <input type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder={searchLabel} className="h-11 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-3 text-base text-zinc-900 outline-none placeholder:text-zinc-400 focus-visible:border-violet-400 focus-visible:ring-2 focus-visible:ring-violet-100" />
          </label>
        </div>

        <div className="overflow-hidden rounded-3xl border border-zinc-200/80 bg-white shadow-[0_18px_50px_rgba(76,29,149,0.05)]">
          {rows.length === 0 && <div role="status" className="px-6 py-10 text-center text-sm text-zinc-500">No modules match{filtered ? ' your search or filter' : ''}.
            {filtered && <button type="button" onClick={() => { setQuery(''); setType('all'); }} className="ml-2 font-semibold! text-violet-700 underline">Clear filters</button>}</div>}
          {rows.length > 0 && <>
            <table className="hidden w-full md:table">
              <caption className="sr-only">{title}</caption>
              <thead className="bg-violet-50/60"><tr>
                <SortHead label="Module name" by="name" sort={sort} onSort={onSort} />
                <th scope="col" className="px-5 py-4 text-left text-sm font-bold text-[#111034]">Type</th>
                <SortHead label="Date" by="date" sort={sort} onSort={onSort} />
                <th scope="col" className="px-5 py-4 text-left text-sm font-bold text-[#111034]">Materials</th>
                <th scope="col" className="px-5 py-4 text-left text-sm font-bold text-[#111034]">Progress</th>
                <SortHead label="Status" by="status" sort={sort} onSort={onSort} />
                <th scope="col" className="px-5 py-4 text-right text-sm font-bold text-[#111034]">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {view.items.map(m => <tr key={m.id} className="transition hover:bg-violet-50/30">
                  <td className="px-5 py-3.5"><Link href={`/my-learning/modules/${m.id}`} className="flex items-center gap-4 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"><ModuleIcon module={m} /><span className="break-words font-bold text-[#111034] hover:text-violet-700">{m.title}</span></Link></td>
                  <td className="px-5 py-3.5"><TypePill module={m} /></td>
                  <td className="px-5 py-3.5">{added(m)}</td>
                  <td className="px-5 py-3.5"><span className="inline-flex items-center gap-2 text-zinc-700"><FileText className="size-5 text-zinc-400" aria-hidden />{m.document_count ?? 0}<span className="sr-only"> materials</span></span></td>
                  <td className="px-5 py-3.5"><Progress value={pct(m)} /></td>
                  <td className="px-5 py-3.5"><StatusPill module={m} owned={m.owned} /></td>
                  <td className="px-5 py-3.5 text-right"><RowActions module={m} canCopy={canCopy(m)} /></td>
                </tr>)}
              </tbody>
            </table>

            <ul className="divide-y divide-zinc-100 md:hidden" aria-label={title}>
              {view.items.map(m => <li key={m.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/my-learning/modules/${m.id}`} className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"><ModuleIcon module={m} /><span className="break-words font-bold text-[#111034]">{m.title}</span></Link>
                  <RowActions module={m} canCopy={canCopy(m)} />
                </div>
                <div className="flex flex-wrap items-center gap-2"><TypePill module={m} /><StatusPill module={m} owned={m.owned} /></div>
                <p className="text-sm text-zinc-600">{m.owned ? 'Created' : 'Enrolled'} {formatDate(addedAt(m))} · <FileText className="mb-0.5 inline size-4 text-zinc-400" aria-hidden /> {m.document_count ?? 0} materials</p>
                <Progress value={pct(m)} />
              </li>)}
            </ul>
            {pager}
          </>}
        </div>
      </>}
  </section>;
}
