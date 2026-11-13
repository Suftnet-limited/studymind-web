'use client';
import Link from 'next/link';
import { CalendarDays, ClipboardList, Crown, FileText, Layers, MessageCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiError } from '@/services/studymind-modules.service';
import { ALLOWANCE_KEYS, ALLOWANCE_LABELS, type AllowanceKey } from '@/lib/plans';
import { daysLeft, longDate, useEntitlements } from '@/lib/use-entitlements';
import { ErrorBox, LoadingBlock } from '@/components/learning/states';
import { UsageIllustration } from '@/components/learning/illustrations';
import { cn } from '@/lib/utils';

const TONES: Record<AllowanceKey, { tile: string; pill: string; icon: ReactNode }> = {
  chats: { tile: 'bg-violet-100 text-violet-600', pill: 'bg-violet-100 text-violet-700', icon: <MessageCircle className="size-7" /> },
  quizzes: { tile: 'bg-sky-100 text-sky-600', pill: 'bg-sky-100 text-sky-700', icon: <ClipboardList className="size-7" /> },
  flashcards: { tile: 'bg-amber-100 text-amber-600', pill: 'bg-amber-100 text-amber-700', icon: <Layers className="size-7" /> },
  summaries: { tile: 'bg-emerald-100 text-emerald-600', pill: 'bg-emerald-100 text-emerald-700', icon: <FileText className="size-7" /> },
};

export default function AllowancesPage() {
  const query = useEntitlements();
  const signedOut = query.error instanceof ApiError && query.error.status === 401;
  const data = query.data?.available ? query.data : null;
  const expires = data?.expires_at ?? null;
  const plus = data?.plan === 'plus';
  const resets = expires ? `Valid until ${longDate(expires)}` : 'Resets monthly';

  return <div className="mx-auto max-w-5xl space-y-8 px-5 py-8 sm:py-10">
    <header className="relative min-h-36 lg:min-h-44">
      <div className="max-w-xl">
        <p className="text-base font-semibold text-violet-700">Your Usage</p>
        <h1 className="text-4xl font-extrabold tracking-tight text-[#111034] sm:text-5xl">Allowances</h1>
        <p className="mt-3 text-base text-zinc-600">Track your remaining usage for StudyMind AI across Web and Mobile.</p>
      </div>
      <UsageIllustration className="pointer-events-none absolute right-0 top-0 hidden h-36 w-auto sm:block lg:h-44" />
    </header>

    {query.isLoading && <LoadingBlock label="Loading your allowances…" />}
    {signedOut && <p className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600"><Link href="/my-learning" className="font-semibold text-violet-700 underline">Sign in</Link> to see your remaining allowances.</p>}
    {query.isError && !signedOut && <ErrorBox message={query.error.message} onRetry={() => query.refetch()} />}
    {query.data && !query.data.available && <p className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">Allowance tracking is not available yet. Your remaining chats, quizzes, flashcards and summaries will appear here once it is switched on.</p>}

    {data && <>
      <section aria-label="Your plan" data-testid="current-plan" className="grid gap-5 rounded-3xl bg-gradient-to-r from-violet-100/80 via-violet-50 to-white p-5 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:p-6">
        <div className="flex items-center gap-4">
          <span aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 shadow-sm"><Crown className="size-8" /></span>
          <div><p className="text-sm font-medium text-zinc-600">Current Plan</p><p className="text-2xl font-extrabold tracking-tight text-[#111034] sm:text-3xl">{plus ? 'StudyMind Plus' : 'Free'}</p></div>
        </div>
        <div aria-hidden className="hidden h-16 w-px bg-violet-200/70 sm:block" />
        <div className="flex items-center gap-4">
          <span aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-white text-violet-600 shadow-sm"><CalendarDays className="size-8" /></span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-600">{expires ? 'Active until' : 'Allowance resets'}</p>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-2xl font-extrabold tracking-tight text-violet-700 sm:text-3xl">{expires ? longDate(expires) : 'Every month'}</p>
              {expires && <span className="rounded-full bg-violet-100 px-3.5 py-1.5 text-sm font-semibold text-violet-700">{daysLeft(expires)} {daysLeft(expires) === 1 ? 'day' : 'days'} left</span>}
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="allowances-title" id="allowances" className="space-y-5">
        <div>
          <h2 id="allowances-title" className="text-2xl font-extrabold tracking-tight text-[#111034]">Your Remaining Allowances</h2>
          <p className="mt-1 text-zinc-600">Usage is counted by StudyMind AI, so Web and Mobile share one balance.</p>
        </div>
        {data.enforcement_enabled === false && <p data-testid="enforcement-note" className="rounded-xl bg-zinc-50 px-4 py-2.5 text-sm text-zinc-600">These allowances are shown for information. Usage limits are not being enforced yet.</p>}
        <ul className="grid gap-5 md:grid-cols-2">
          {ALLOWANCE_KEYS.map(key => {
            const a = data.allowances[key];
            const pct = a && a.limit ? Math.round((a.remaining / a.limit) * 100) : 0;
            return <li key={key} className="rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_18px_50px_rgba(76,29,149,0.06)] sm:p-6">
              <div className="flex items-start gap-4">
                <span aria-hidden className={cn('flex size-14 shrink-0 items-center justify-center rounded-2xl', TONES[key].tile)}>{TONES[key].icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-lg font-bold text-[#111034]">{ALLOWANCE_LABELS[key]}</p>
                      {a ? <p className="mt-0.5 text-4xl font-extrabold leading-tight text-[#111034]">{a.remaining}<span className="text-lg font-normal text-zinc-500"> of {a.limit} left</span></p>
                         : <p className="mt-1 text-sm text-zinc-500">Not reported</p>}
                    </div>
                    {a && <span className={cn('rounded-full px-3.5 py-1.5 text-base font-bold', TONES[key].pill)}>{pct}%</span>}
                  </div>
                </div>
              </div>
              {a && <>
                <div className="mt-4 h-3 overflow-hidden rounded-full bg-zinc-100" role="progressbar" aria-label={`${ALLOWANCE_LABELS[key]} remaining`} aria-valuemin={0} aria-valuemax={a.limit} aria-valuenow={a.remaining}>
                  <div className="h-full rounded-full bg-violet-600 transition-[width] duration-300" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-4 flex items-center gap-2 text-sm text-zinc-600"><CalendarDays className="size-5 text-zinc-400" aria-hidden />{resets}</p>
              </>}
            </li>;
          })}
        </ul>
        {!plus && <p className="text-sm text-zinc-600">Need more? <Link href="/my-learning/plans" className="font-semibold text-violet-700 underline">See the plans</Link>.</p>}
      </section>
    </>}
  </div>;
}
