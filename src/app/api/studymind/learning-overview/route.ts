import { NextResponse } from 'next/server';
import { authenticatedAiRequest, type LearningOverview } from '@/lib/studymind-identity';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const upstream = await authenticatedAiRequest('/api/auth/learning-overview');
    if (!upstream || upstream.status === 401) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (!upstream.ok) return NextResponse.json({ error: 'Learning overview unavailable' }, { status: 502 });
    const overview: LearningOverview = await upstream.json();
    return NextResponse.json(overview, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'Learning service unavailable' }, { status: 502 }); }
}
