'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
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

function useEntitlements(pollMs: number | false = false) {
  return useQuery({ queryKey: ['canonical', 'entitlements'], queryFn: loadEntitlements, retry: false, refetchInterval: pollMs });
}

const CONFIRM_TIMEOUT_MS = 60_000;
type Returned = 'success' | 'cancelled' | null;

/** Starts a Checkout through Web's own route. A failure is shown as a message; nothing here ever signs the user out. */
async function startCheckout(): Promise<string> {
  const response = await fetch('/api/studymind/checkout', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error || 'We could not start checkout. You have not been charged.', response.status);
  if (typeof body.url !== 'string') throw new ApiError('We could not start checkout. You have not been charged.', 502);
  return body.url;
}

function Allowances() {
  const query = useEntitlements();
  const signedOut = query.error instanceof ApiError && query.error.status === 401;
  return <Card id="allowances" className="scroll-mt-6" aria-labelledby="allowances-title">
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
        {query.data.enforcement_enabled === false && <p data-testid="enforcement-note" className="mb-4 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">These allowances are shown for information. Usage limits are not being enforced yet.</p>}
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
  const [returned, setReturned] = useState<Returned>(null);
  const [confirming, setConfirming] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const entitlements = useEntitlements(confirming ? 2000 : false);
  const data = entitlements.data?.available ? entitlements.data : null;
  const currentPlan = data ? data.plan : null;
  const purchaseAvailable = data?.purchase_available === true;
  const signedOut = entitlements.error instanceof ApiError && entitlements.error.status === 401;

  // Coming back from Stripe: ?checkout=success|cancelled. Payment is only ever confirmed by the webhook, so we watch the
  // backend's entitlement (poll every 2 s for up to a minute) rather than trusting the redirect.
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('checkout');
    if (value === 'success' || value === 'cancelled') {
      setReturned(value);
      if (value === 'success') setConfirming(true);
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    }
  }, []);
  useEffect(() => {
    if (!confirming) return;
    if (currentPlan === 'plus') { setConfirming(false); return; }
    const timer = setTimeout(() => { setConfirming(false); setTimedOut(true); }, CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [confirming, currentPlan]);

  const checkout = useMutation({ mutationFn: startCheckout, onSuccess: (url) => { window.location.assign(url); } });
  const checkoutError = checkout.error instanceof ApiError ? checkout.error : null;
  const expires = data?.expires_at ? new Date(data.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  return <div className="mx-auto max-w-4xl space-y-7 px-5 py-8 sm:py-10">
    <header>
      <p className="text-sm font-semibold text-violet-700">StudyMind AI</p>
      <h1 className="text-2xl font-bold sm:text-3xl">Plans and allowances</h1>
      <p className="mt-2 text-zinc-600">A simple look at what each plan includes.</p>
    </header>

    {returned === 'cancelled' && <p role="status" data-testid="checkout-cancelled" className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-800">Checkout cancelled. You have not been charged and your plan has not changed.</p>}
    {returned === 'success' && currentPlan === 'plus' && <p role="status" data-testid="checkout-confirmed" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">Payment confirmed. StudyMind Plus is active{expires ? ` until ${expires}` : ''}.</p>}
    {returned === 'success' && currentPlan !== 'plus' && confirming && <p role="status" data-testid="checkout-confirming" className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">Confirming your payment… this usually takes a few seconds. Please keep this page open.</p>}
    {returned === 'success' && currentPlan !== 'plus' && timedOut && <p role="status" data-testid="checkout-timeout" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">We have not received confirmation of your payment yet. It can take a minute: refresh this page shortly. You will not be charged twice, and access is only added once the payment is confirmed.</p>}

    {purchaseAvailable
      ? <div role="note" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p><strong>Test payments only.</strong> StudyMind is not live. Checkout uses Stripe&apos;s test mode: pay with the test card 4242 4242 4242 4242 (any future expiry, any CVC). No real money is taken.</p>
        </div>
      : <div role="note" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p><strong>Pricing preview.</strong> This page is for information only. Purchasing StudyMind Plus is not open yet, and nothing here will charge you.</p>
        </div>}

    <section aria-label="Plans" className="grid gap-4 md:grid-cols-2">
      {PLANS.map(plan => <Card key={plan.id} className={plan.id === 'plus' ? 'border-violet-300 ring-1 ring-violet-200' : ''}>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{plan.name}</CardTitle>
            {currentPlan === plan.id && <span className="rounded-md bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-800">Your current plan</span>}
          </div>
          <p className="pt-1"><span className="text-3xl font-extrabold">{plan.price}</span> <span className="text-sm text-zinc-500">{plan.cadence}</span></p>
          <CardDescription>{plan.note}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {ALLOWANCE_KEYS.map(key => <li key={key} className="flex items-center gap-2"><Check className="size-4 shrink-0 text-violet-600" aria-hidden /><span><strong>{plan.allowances[key]}</strong> {allowanceUnit(key, plan.allowances[key])}</span></li>)}
          </ul>
          {plan.id === 'plus' && !purchaseAvailable && <p className="mt-5 rounded-lg bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800">Coming soon — purchases are not available yet.</p>}
          {plan.id === 'plus' && purchaseAvailable && currentPlan === 'plus' && <p data-testid="plus-active" className="mt-5 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">StudyMind Plus is active{expires ? ` until ${expires}` : ''}.</p>}
          {plan.id === 'plus' && purchaseAvailable && currentPlan === 'free' && <div className="mt-5">
            <button type="button" data-testid="buy-plus" onClick={() => checkout.mutate()} disabled={checkout.isPending || checkout.isSuccess}
              className="w-full rounded-lg bg-violet-600 px-4 py-2.5 font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
              {checkout.isPending || checkout.isSuccess ? 'Opening secure checkout…' : 'Get StudyMind Plus — £3.99'}
            </button>
            {checkoutError && <p role="alert" data-testid="checkout-error" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {checkoutError.status === 401 ? <>Your session needs refreshing. <Link href="/my-learning" className="font-semibold underline">Sign in again</Link> to continue.</> : checkoutError.message}
            </p>}
          </div>}
          {plan.id === 'plus' && purchaseAvailable && signedOut && <p className="mt-5 text-sm"><Link href="/my-learning" className="font-semibold text-violet-700 underline">Sign in</Link> to get StudyMind Plus.</p>}
        </CardContent>
      </Card>)}
    </section>

    <Allowances />
  </div>;
}
