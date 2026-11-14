import { NextResponse } from 'next/server';
import { aiIdentityRequest } from '@/lib/studymind-identity';
import { apiDetail } from '@/lib/studymind-validation.mjs';
export const runtime = 'nodejs';

/** Sets a new password from an emailed single-use token. The backend checks the token; this only validates the shape. */
export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const token = typeof input.token === 'string' ? input.token : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (token.length < 30 || token.length > 256) return NextResponse.json({ error: 'This reset link is invalid or has expired. Request a new one.' }, { status: 400 });
  if (password.length < 12 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password))
    return NextResponse.json({ error: 'Use at least 12 characters with upper and lower case letters and a number.' }, { status: 400 });
  try {
    const upstream = await aiIdentityRequest('/api/auth/password-recovery/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, new_password: password }) });
    if (upstream.ok) return NextResponse.json({ ok: true });
    const data = await upstream.json().catch(() => ({}));
    if (upstream.status === 400) return NextResponse.json({ error: 'This reset link is invalid or has expired. Request a new one.' }, { status: 400 });
    if (upstream.status === 422) return NextResponse.json({ error: apiDetail(data, 'Choose a stronger password.') }, { status: 400 });
    if (upstream.status === 503) return NextResponse.json({ error: 'Password reset is not available yet. Please contact support.' }, { status: 503 });
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 502 });
  } catch { return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 502 }); }
}
