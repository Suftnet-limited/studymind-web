'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Check, Crown, Info, Settings, Sprout } from 'lucide-react';
import { ApiError } from '@/services/studymind-modules.service';
import { ALLOWANCE_KEYS, allowanceUnit, PLANS } from '@/lib/plans';
import { longDate, useEntitlements } from '@/lib/use-entitlements';
import { PlansIllustration } from '@/components/learning/illustrations';
import { cn } from '@/lib/utils';

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

export default function PlansPage() {
  const [returned, setReturned] = useState<Returned>(null);
  const [confirming, setConfirming] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const router = useRouter();
  const entitlements = useEntitlements(confirming ? 2000 : false);
  const data = entitlements.data?.available ? entitlements.data : null;
  const currentPlan = data ? data.plan : null;
  const purchaseAvailable = data?.purchase_available === true;
  const signedOut = entitlements.error instanceof ApiError && entitlements.error.status === 401;

  // Coming back from Stripe: ?checkout=success|cancelled. Payment is only ever confirmed by the webhook, so we watch the
  // backend's entitlement (poll every 2 s for up to a minute) rather than trusting the redirect.
  useEffect(() => { if (window.location.hash === '#allowances') router.replace('/my-learning/allowances'); }, [router]);   // links from before the split
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
  const expires = data?.expires_at ? longDate(data.expires_at) : null;

  return <div className="mx-auto max-w-5xl space-y-7 px-5 py-8 sm:py-10">
    <header className="text-center">
      <span className="inline-flex rounded-xl bg-violet-100 px-4 py-1.5 text-sm font-bold text-violet-700">Subscription Plans</span>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-[#111034] sm:text-5xl">Choose your StudyMind plan</h1>
      <p className="mx-auto mt-3 max-w-2xl text-base text-zinc-600">Get more from your learning with AI-powered tools, quizzes and study resources.</p>
      <PlansIllustration className="mx-auto mt-4 h-32 w-auto sm:h-40" />
    </header>

    {returned === 'cancelled' && <p role="status" data-testid="checkout-cancelled" className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-800">Checkout cancelled. You have not been charged and your plan has not changed.</p>}
    {returned === 'success' && currentPlan === 'plus' && <p role="status" data-testid="checkout-confirmed" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">Payment confirmed. StudyMind Plus is active{expires ? ` until ${expires}` : ''}.</p>}
    {returned === 'success' && currentPlan !== 'plus' && confirming && <p role="status" data-testid="checkout-confirming" className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">Confirming your payment… this usually takes a few seconds. Please keep this page open.</p>}
    {returned === 'success' && currentPlan !== 'plus' && timedOut && <p role="status" data-testid="checkout-timeout" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">We have not received confirmation of your payment yet. It can take a minute: refresh this page shortly. You will not be charged twice, and access is only added once the payment is confirmed.</p>}

    {purchaseAvailable
      ? <div role="note" className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:p-5">
          <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p><strong>Test payments only.</strong> StudyMind is not live. Checkout uses Stripe&apos;s test mode: pay with the test card 4242 4242 4242 4242 (any future expiry, any CVC). No real money is taken.</p>
        </div>
      : <div role="note" className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:p-5">
          <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p><strong>Pricing preview.</strong> This page is for information only. Purchasing StudyMind Plus is not open yet, and nothing here will charge you.</p>
        </div>}

    <section aria-label="Plans" className="grid items-start gap-6 md:grid-cols-2">
      {PLANS.map(plan => {
        const plus = plan.id === 'plus';
        return <div key={plan.id} data-testid={`plan-${plan.id}`} className={cn('rounded-3xl border bg-white p-6 shadow-[0_18px_50px_rgba(76,29,149,0.06)] sm:p-7', plus ? 'border-violet-300 bg-gradient-to-br from-white to-violet-50/60 ring-1 ring-violet-200' : 'border-zinc-200/80')}>
          <div className="flex items-start gap-4">
            <span aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">{plus ? <Crown className="size-8" /> : <Sprout className="size-8" />}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-2xl font-extrabold tracking-tight text-[#111034]">{plan.name}</h2>
                {currentPlan === plan.id && <span className="inline-flex items-center gap-1.5 rounded-xl bg-violet-100 px-3 py-1.5 text-sm font-semibold text-violet-700">Your current plan <Check className="size-4" aria-hidden /></span>}
              </div>
              <p className="mt-2"><span className="text-4xl font-extrabold text-[#111034]">{plan.price}</span> <span className="text-base text-zinc-500">{plan.cadence}</span></p>
              <p className="mt-1 text-zinc-600">{plan.note}</p>
            </div>
          </div>
          <hr className="my-6 border-zinc-200/80" />
          <ul className="space-y-3.5 text-base">
            {ALLOWANCE_KEYS.map(key => <li key={key} className="flex items-center gap-3"><Check className="size-5 shrink-0 text-violet-600" aria-hidden /><span><strong className="font-semibold">{plan.allowances[key]}</strong> {allowanceUnit(key, plan.allowances[key])}</span></li>)}
          </ul>

          <div className="mt-7">
            {!plus && (currentPlan === 'free'
              ? <p className="rounded-2xl border border-violet-200 bg-white px-5 py-3.5 text-center text-base font-semibold text-violet-700">You are on Free</p>
              : <p className="rounded-2xl border border-violet-200 bg-white px-5 py-3.5 text-center text-base font-semibold text-violet-700">Included with every account</p>)}
            {plus && !purchaseAvailable && <p className="rounded-xl bg-violet-50 px-4 py-3 text-center text-sm font-semibold text-violet-800">Coming soon — purchases are not available yet.</p>}
            {plus && purchaseAvailable && currentPlan === 'plus' && <>
              <p data-testid="plus-active" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">StudyMind Plus is active{expires ? ` until ${expires}` : ''}.</p>
              <Link href="/my-learning/allowances" className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-violet-700 px-5 py-3.5 text-base font-bold text-white shadow-sm hover:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"><Settings className="size-5" aria-hidden /> View my allowances</Link>
            </>}
            {plus && purchaseAvailable && currentPlan === 'free' && <>
              <button type="button" data-testid="buy-plus" onClick={() => checkout.mutate()} disabled={checkout.isPending || checkout.isSuccess}
                className="w-full rounded-2xl bg-violet-700 px-5 py-3.5 text-base font-bold text-white shadow-sm hover:bg-violet-800 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2">
                {checkout.isPending || checkout.isSuccess ? 'Opening secure checkout…' : 'Get StudyMind Plus — £3.99'}
              </button>
              {checkoutError && <p role="alert" data-testid="checkout-error" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                {checkoutError.status === 401 ? <>Your session needs refreshing. <Link href="/my-learning" className="font-semibold underline">Sign in again</Link> to continue.</> : checkoutError.message}
              </p>}
            </>}
            {plus && purchaseAvailable && signedOut && <p className="text-sm"><Link href="/my-learning" className="font-semibold text-violet-700 underline">Sign in</Link> to get StudyMind Plus.</p>}
          </div>
        </div>;
      })}
    </section>

    <p className="text-center text-sm text-zinc-600">Want to see what you have left? <Link href="/my-learning/allowances" className="font-semibold text-violet-700 underline">View your allowances</Link>.</p>
  </div>;
}
