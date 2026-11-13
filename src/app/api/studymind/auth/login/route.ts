import { NextResponse } from 'next/server';
import { aiIdentityRequest, setAiTokens } from '@/lib/studymind-identity';
import { apiDetail } from '@/lib/studymind-validation.mjs';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid credentials' }, { status: 400 });
  const input = body as Record<string, unknown>;
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!email || !password || email.length > 320 || password.length > 128)
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 400 });
  try {
    const upstream = await aiIdentityRequest('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    });
    if (!upstream.ok) {
      const data = await upstream.json().catch(() => ({}));
      switch (upstream.status) {
        case 401: return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
        case 403: return NextResponse.json({ error: apiDetail(data, 'This account cannot sign in right now') }, { status: 403 });
        case 400: case 422: return NextResponse.json({ error: 'Enter a valid email address and password' }, { status: 400 });
        case 429: return NextResponse.json({ error: 'Too many sign-in attempts. Please wait a moment and try again.' }, { status: 429 });
        default: return NextResponse.json({ error: 'Sign-in is temporarily unavailable. Please try again.' }, { status: 502 });
      }
    }
    const tokens = await upstream.json();
    if (!tokens.access_token || !tokens.refresh_token || !Number.isFinite(tokens.expires_in))
      return NextResponse.json({ error: 'Invalid identity response' }, { status: 502 });
    await setAiTokens(tokens);
    return NextResponse.json({ authenticated: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Identity service unavailable' }, { status: 502 }); }
}
