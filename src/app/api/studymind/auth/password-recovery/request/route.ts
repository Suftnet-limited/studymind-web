import { NextResponse } from 'next/server';
import { aiIdentityRequest } from '@/lib/studymind-identity';
export const runtime = 'nodejs';

/** Asks the backend to email a reset link. The answer is always the same, so it never reveals whether an account exists. */
export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const email = body && typeof body === 'object' && typeof (body as Record<string, unknown>).email === 'string' ? ((body as Record<string, string>).email).trim().toLowerCase() : '';
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  try {
    const upstream = await aiIdentityRequest('/api/auth/password-recovery/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    if (upstream.status === 429) return NextResponse.json({ error: 'Too many attempts. Please wait a while and try again.' }, { status: 429 });
    if (upstream.status === 503) return NextResponse.json({ error: 'Password reset is not available yet. Please contact support.' }, { status: 503 });
    if (upstream.status === 400 || upstream.status === 422) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
    if (!upstream.ok) return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 502 }); }
}
