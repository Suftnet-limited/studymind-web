'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Check, Info } from 'lucide-react';
import { ApiError } from '@/services/studymind-modules.service';
import { ALLOWANCE_KEYS, ALLOWANCE_LABELS, allowanceUnit, PLANS } from '@/lib/plans';
import type { Entitlements } from '@/lib/studymind-validation.mjs';
import { ErrorBox, LoadingBlock } from '@/components/learning/states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type EntitlementResponse = ({ available: true } & Entitlements) | { available: false };

async function loadEntitlements(): Promise<EntitlementResponse> {
  const response = await fetch('/api/studymind/entitlements', { cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error || 'Unable to load your allowances', response.status);
  return body as EntitlementResponse;
}

function Allowances() {
  const query = useQuery({ queryKey: ['canonical', 'entitlements'], queryFn: loadEntitlements, retry: false });
  const signedOut = query.error instanceof ApiError && query.error.status === 401;
  return <Card aria-labelledby="allowances-title">
    <CardHeader>
      <CardTitle id="allowances-title">Your remaining allowances</CardTitle>
      <CardDescription>Usage is counted by StudyMind AI, so Web and Mobile share one balance.</CardDescription>
    </CardHeader>
    <CardContent>
      {query.isLoading && <LoadingBlock label="Loading your allowances…" />}
      {signedOut && <p className="text-sm text-zinc-600"><Link href="/my-learning" className="font-semibold text-violet-700 underline">Sign in</Link> to see your remaining allowances.</p>}
      {query.isError && !signedOut && <ErrorBox message={query.error.message} onRetry={() => query.refetch()} />}
      {query.data && !query.data.available && <p className="text-sm text-zinc-600">Allowance tracking is not available yet. Your remaining chats, quizzes, flashcards and summaries will appear here once it is switched on.</p>}
      {query.data?.available && <>
        <p className="mb-4 text-sm text-zinc-600">Current plan: <strong>{query.data.plan === 'plus' ? 'StudyMind Plus' : 'Free'}</strong>
          {query.data.expires_at && <> · until {new Date(query.data.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</>}</p>
        <ul className="grid gap-4 sm:grid-cols-2">
          {ALLOWANCE_KEYS.map(key => {
            const a = query.data.available ? query.data.allowances[key] : undefined;
            return <li key={key} className="rounded-xl border border-zinc-200 p-4">
              <p className="text-sm font-medium">{ALLOWANCE_LABELS[key]}</p>
              {a ? <>
                <p className="mt-1 text-2xl font-bold">{a.remaining}<span className="text-sm font-normal text-zinc-500"> of {a.limit} left</span></p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100" role="progressbar" aria-label={`${ALLOWANCE_LABELS[key]} remaining`} aria-valuemin={0} aria-valuemax={a.limit} aria-valuenow={a.remaining}>
                  <div className="h-full rounded-full bg-violet-600" style={{ width: `${a.limit ? Math.round((a.remaining / a.limit) * 100) : 0}%` }} />
                </div>
              </> : <p className="mt-1 text-sm text-zinc-500">Not reported</p>}
            </li>;
          })}
        </ul>
      </>}
    </CardContent>
  </Card>;
}

export default function PlansPage() {
  return <div className="mx-auto max-w-4xl space-y-7 px-5 py-8 sm:py-10">
    <header>
      <p className="text-sm font-semibold text-violet-700">StudyMind AI</p>
      <h1 className="text-2xl font-bold sm:text-3xl">Plans and allowances</h1>
      <p className="mt-2 text-zinc-600">A simple look at what each plan includes.</p>
    </header>

    <div role="note" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
      <p><strong>Pricing preview.</strong> This page is for information only. Purchasing StudyMind Plus is not open yet, and nothing here will charge you.</p>
    </div>

    <section aria-label="Plans" className="grid gap-4 md:grid-cols-2">
      {PLANS.map(plan => <Card key={plan.id} className={plan.id === 'plus' ? 'border-violet-300 ring-1 ring-violet-200' : ''}>
        <CardHeader>
          <CardTitle>{plan.name}</CardTitle>
          <p className="pt-1"><span className="text-3xl font-extrabold">{plan.price}</span> <span className="text-sm text-zinc-500">{plan.cadence}</span></p>
          <CardDescription>{plan.note}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {ALLOWANCE_KEYS.map(key => <li key={key} className="flex items-center gap-2"><Check className="size-4 shrink-0 text-violet-600" aria-hidden /><span><strong>{plan.allowances[key]}</strong> {allowanceUnit(key, plan.allowances[key])}{plan.id === 'free' ? ' per month' : ''}</span></li>)}
          </ul>
          {plan.id === 'plus' && <p className="mt-5 rounded-lg bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800">Coming soon — purchases are not available yet.</p>}
        </CardContent>
      </Card>)}
    </section>

    <Allowances />
  </div>;
}
