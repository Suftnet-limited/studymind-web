'use client';
import Link from 'next/link';
import { ClipboardList, Crown, FileText, Layers, MessageCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiError } from '@/services/studymind-modules.service';
import { ALLOWANCE_KEYS, ALLOWANCE_LABELS, type AllowanceKey } from '@/lib/plans';
import { daysLeft, longDate, useEntitlements } from '@/lib/use-entitlements';
import { ErrorBox, LoadingBlock } from '@/components/learning/states';
import { UsageIllustration } from '@/components/learning/illustrations';
import { cn } from '@/lib/utils';

const TONES: Record<AllowanceKey, { tile: string; pill: string; bar: string; icon: ReactNode }> = {
  chats: { tile: 'bg-violet-100/80 text-violet-600', pill: 'bg-violet-100/80 text-violet-600', bar: 'bg-violet-600', icon: <MessageCircle className="size-8" strokeWidth={1.75} /> },
  quizzes: { tile: 'bg-sky-100/80 text-sky-600', pill: 'bg-sky-100/80 text-blue-500', bar: 'bg-blue-500', icon: <ClipboardList className="size-8" strokeWidth={1.75} /> },
  flashcards: { tile: 'bg-amber-100/80 text-amber-500', pill: 'bg-amber-100/80 text-amber-500', bar: 'bg-amber-400', icon: <Layers className="size-8" strokeWidth={1.75} /> },
  summaries: { tile: 'bg-emerald-100/80 text-emerald-500', pill: 'bg-emerald-100/80 text-emerald-500', bar: 'bg-green-500', icon: <FileText className="size-8" strokeWidth={1.75} /> },
};

export default function AllowancesPage() {
  const query = useEntitlements();
  const signedOut = query.error instanceof ApiError && query.error.status === 401;
  const data = query.data?.available ? query.data : null;
  const expires = data?.expires_at ?? null;
  const plus = data?.plan === 'plus';
  const left = expires ? daysLeft(expires) : 0;

  return <div className="mx-auto max-w-6xl space-y-9 px-5 py-8 sm:py-10">
    <header className="relative min-h-40 lg:min-h-48">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 h-56 bg-gradient-to-b from-violet-100/50 via-violet-50/30 to-transparent [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="relative max-w-2xl">
        <p className="text-base font-semibold text-violet-600">Your Usage</p>
        <h1 className="mt-1 text-4xl font-extrabold tracking-tight text-[#111034] sm:text-5xl">Allowances</h1>
        <p className="mt-4 max-w-xl text-lg leading-8 text-zinc-600">Track your remaining AI usage for chats, quizzes, flashcards and summaries across Web and Mobile. Usage is shared on one balance.</p>
      </div>
      <UsageIllustration className="pointer-events-none absolute right-0 top-0 hidden h-40 w-auto sm:block lg:h-48" />
    </header>

    {query.isLoading && <LoadingBlock label="Loading your allowances…" />}
    {signedOut && <p className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600"><Link href="/my-learning" className="font-semibold text-violet-700 underline">Sign in</Link> to see your remaining allowances.</p>}
    {query.isError && !signedOut && <ErrorBox message={query.error.message} onRetry={() => query.refetch()} />}
    {query.data && !query.data.available && <p className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">Allowance tracking is not available yet. Your remaining chats, quizzes, flashcards and summaries will appear here once it is switched on.</p>}

    {data && <section aria-labelledby="allowances-title" id="allowances" className="space-y-5">
      <h2 id="allowances-title" className="sr-only">Your remaining allowances</h2>
      {data.enforcement_enabled === false && <p data-testid="enforcement-note" className="rounded-xl bg-zinc-50 px-4 py-2.5 text-sm text-zinc-600">These allowances are shown for information. Usage limits are not being enforced yet.</p>}
      <ul className="grid gap-6 md:grid-cols-2">
        {ALLOWANCE_KEYS.map(key => {
          const a = data.allowances[key];
          const pct = a && a.limit ? Math.round((a.remaining / a.limit) * 100) : 0;
          return <li key={key} className="rounded-[1.75rem] border border-zinc-200/70 bg-white px-4 pb-8 pt-5 shadow-[0_18px_50px_rgba(76,29,149,0.07)] sm:px-7 sm:pb-9 sm:pt-6">
            <div className="flex items-start gap-3.5 sm:gap-5">
              <span aria-hidden className={cn('flex size-14 shrink-0 items-center justify-center rounded-2xl sm:size-[4.5rem] sm:rounded-3xl', TONES[key].tile)}>{TONES[key].icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-[#111034] sm:text-xl">{ALLOWANCE_LABELS[key]}</p>
                    {a ? <p className="mt-1 text-4xl font-extrabold leading-tight text-[#111034] sm:text-5xl">{a.remaining}<span className="text-base font-normal text-zinc-500 sm:text-xl"> of {a.limit} left</span></p>
                       : <p className="mt-2 text-sm text-zinc-500">Not reported</p>}
                  </div>
                  {a && <span className={cn('rounded-full px-3 py-1.5 text-base font-bold sm:px-4 sm:py-2 sm:text-lg', TONES[key].pill)}>{pct}%</span>}
                </div>
              </div>
            </div>
            {a && <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-zinc-100" role="progressbar" aria-label={`${ALLOWANCE_LABELS[key]} remaining`} aria-valuemin={0} aria-valuemax={a.limit} aria-valuenow={a.remaining}>
              <div className={cn('h-full rounded-full transition-[width] duration-300', TONES[key].bar)} style={{ width: `${pct}%` }} />
            </div>}
          </li>;
        })}
      </ul>

      <p data-testid="current-plan" className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 pt-1 text-sm text-zinc-600">
        <Crown className="size-4 text-violet-600" aria-hidden />
        <span>Current plan: <strong className="text-[#111034]">{plus ? 'StudyMind Plus' : 'Free'}</strong></span>
        <span aria-hidden className="text-zinc-300">·</span>
        {expires
          ? <><span>Active until <strong className="text-violet-700">{longDate(expires)}</strong></span><span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">{left} {left === 1 ? 'day' : 'days'} left</span></>
          : <span>Resets monthly</span>}
        {!plus && <><span aria-hidden className="text-zinc-300">·</span><Link href="/my-learning/plans" className="font-semibold text-violet-700 underline">See the plans</Link></>}
      </p>
    </section>}
  </div>;
}
