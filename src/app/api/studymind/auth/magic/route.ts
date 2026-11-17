import { type NextRequest, NextResponse } from 'next/server';
import { aiIdentityRequest, setAiTokens } from '@/lib/studymind-identity';
import { createSession } from '@/lib/session';

export async function POST(req: NextRequest) {
  let token: string;
  try {
    const body = (await req.json()) as { token?: unknown };
    if (typeof body.token !== 'string' || !body.token) {
      return NextResponse.json({ error: 'token required' }, { status: 400 });
    }
    token = body.token;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  let res: Response;
  try {
    res = await aiIdentityRequest('/api/auth/magic-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  if (!res.ok) {
    const status = res.status === 410 || res.status === 404 ? 410 : res.status;
    let message = 'Token invalid or expired';
    try {
      const data = (await res.json()) as { detail?: string };
      if (data.detail) message = data.detail;
    } catch { /* ignore */ }
    return NextResponse.json({ error: message }, { status });
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    user: { id: string; email: string; full_name: string; role: string };
  };

  // Set the AI backend JWT cookies (access + refresh)
  await setAiTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
  });

  // Set the web session cookie so middleware / server components see the user
  await createSession(data.user.id);

  return NextResponse.json({ ok: true, user: data.user });
}
