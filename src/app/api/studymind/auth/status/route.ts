import { NextResponse } from 'next/server';
import { authenticatedAiRequest, type LearningOverview } from '@/lib/studymind-identity';

export const runtime = 'nodejs';

/** Minimal "who am I" for the site header: a yes/no and a display name, nothing else. */
export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const upstream = await authenticatedAiRequest('/api/auth/learning-overview');
    if (!upstream || upstream.status === 401 || upstream.status === 403) return NextResponse.json({ authenticated: false }, { headers });
    if (!upstream.ok) return NextResponse.json({ authenticated: null }, { status: 503, headers });   // unknown, NOT signed out
    const { user }: LearningOverview = await upstream.json();
    return NextResponse.json({ authenticated: true, name: String(user.full_name ?? '').slice(0, 80) }, { headers });
  } catch { return NextResponse.json({ authenticated: null }, { status: 503, headers }); }
}
