import { NextResponse } from 'next/server';
import { authenticatedAiFetch } from '@/lib/studymind-identity';
export const runtime = 'nodejs';

/**
 * Starts a StudyMind Plus Checkout for the signed-in user. The browser sends NOTHING that matters: the backend takes the
 * user from the session, fixes the price and the product, and Stripe's webhook (verified server-side) is the only thing that
 * can grant access. This route therefore never reads a body, never returns anything but the Checkout URL, and a failure
 * here is reported as a message - it never touches the session cookies (a 403/429/5xx from billing must not sign anyone out).
 */
const HEADERS = { 'Cache-Control': 'no-store' };
const STRIPE_CHECKOUT = /^https:\/\/checkout\.stripe\.com\//;
const LOCAL_STAND_IN = /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}\//;     // local development only (never in production)
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: HEADERS });

export async function POST(request: Request) {
  // Refuse cross-site requests: a page on another origin must not be able to start a purchase for a signed-in user.
  const site = request.headers.get('sec-fetch-site');
  if (site && !['same-origin', 'same-site', 'none'].includes(site)) return fail(403, 'Cross-site requests are not allowed');
  const origin = request.headers.get('origin');
  try { if (origin && new URL(origin).host !== new URL(request.url).host) return fail(403, 'Cross-site requests are not allowed'); }
  catch { return fail(403, 'Cross-site requests are not allowed'); }
  try {
    const upstream = await authenticatedAiFetch('/api/billing/checkout', { method: 'POST' });
    if (!upstream || upstream.status === 401) return fail(401, 'Authentication required');
    if (upstream.status === 409) return fail(409, 'You already have an active StudyMind Plus pass.');
    if (upstream.status === 503 && (await upstream.clone().json().catch(() => null))?.detail === 'StudyMind Plus checkout is not available yet.') return fail(503, 'Purchases are not available yet.');
    if (upstream.status === 403 || upstream.status === 429) return fail(upstream.status, upstream.status === 429 ? 'Too many attempts. Please wait a moment and try again.' : 'You do not have permission to purchase this plan.');
    if (!upstream.ok) return fail(upstream.status === 503 ? 503 : 502, 'We could not start checkout. You have not been charged. Please try again.');
    const data = await upstream.json().catch(() => null);
    const url = typeof data?.checkout_url === 'string' ? data.checkout_url : '';
    const allowed = STRIPE_CHECKOUT.test(url) || (process.env.NODE_ENV !== 'production' && LOCAL_STAND_IN.test(url));
    if (!allowed) return fail(502, 'We could not start checkout. You have not been charged. Please try again.');
    return NextResponse.json({ url }, { headers: HEADERS });
  } catch { return fail(502, 'We could not start checkout. You have not been charged. Please try again.'); }
}
