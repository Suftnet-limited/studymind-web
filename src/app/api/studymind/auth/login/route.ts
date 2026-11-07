import { NextResponse } from 'next/server';
import { aiIdentityRequest, setAiTokens } from '@/lib/studymind-identity';
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
    if (!upstream.ok) return NextResponse.json({ error: 'Invalid email or password' }, { status: upstream.status === 401 || upstream.status === 403 ? upstream.status : 502 });
    const tokens = await upstream.json();
    if (!tokens.access_token || !tokens.refresh_token || !Number.isFinite(tokens.expires_in))
      return NextResponse.json({ error: 'Invalid identity response' }, { status: 502 });
    await setAiTokens(tokens);
    return NextResponse.json({ authenticated: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Identity service unavailable' }, { status: 502 }); }
}
