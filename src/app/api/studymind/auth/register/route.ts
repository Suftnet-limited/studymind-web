import { NextResponse } from 'next/server';
import { aiIdentityRequest, setAiTokens } from '@/lib/studymind-identity';
import { apiDetail } from '@/lib/studymind-validation.mjs';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid registration' }, { status: 400 });
  const input = body as Record<string, unknown>;
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const full_name = typeof input.full_name === 'string' ? input.full_name.trim() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  const role = input.role;
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 320 || full_name.length < 2 || full_name.length > 120 ||
      password.length < 12 || password.length > 128 || !['student', 'lecturer', 'self_learner'].includes(String(role)))
    return NextResponse.json({ error: 'Invalid registration details' }, { status: 400 });
  try {
    const upstream = await aiIdentityRequest('/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, full_name, password, role }),
    });
    if (!upstream.ok) {
      const data = await upstream.json().catch(() => ({}));
      if (upstream.status === 429) return NextResponse.json({ error: 'Too many attempts. Please wait a moment and try again.' }, { status: 429 });
      return NextResponse.json({ error: apiDetail(data, 'Registration failed') },
        { status: [400, 403, 409, 422].includes(upstream.status) ? upstream.status : 502 });
    }
    // The canonical AI backend creates the account. Do not create a duplicate Prisma user.
    const login = await aiIdentityRequest('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    });
    if (!login.ok) return NextResponse.json({ registered: true, authenticated: false }, { status: 201 });
    const tokens = await login.json();
    if (!tokens.access_token || !tokens.refresh_token || !Number.isFinite(tokens.expires_in))
      return NextResponse.json({ registered: true, authenticated: false }, { status: 201 });
    await setAiTokens(tokens);
    return NextResponse.json({ registered: true, authenticated: true }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Identity service unavailable' }, { status: 502 }); }
}
