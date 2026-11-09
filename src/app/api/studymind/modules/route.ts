import { NextResponse } from 'next/server';
import { authenticatedAiFetch } from '@/lib/studymind-identity';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const upstream = await authenticatedAiFetch('/api/modules');
    if (!upstream || upstream.status === 401) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (!upstream.ok) return NextResponse.json({ error: 'Unable to load modules' }, { status: 502 });
    return NextResponse.json(await upstream.json(), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'Learning service unavailable' }, { status: 502 }); }
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid module' }, { status: 400 });
  const input = body as Record<string, unknown>;
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 255 ||
      typeof input.access_type !== 'string' || !['personal', 'class'].includes(input.access_type))
    return NextResponse.json({ error: 'Invalid module details' }, { status: 400 });
  try {
    const upstream = await authenticatedAiFetch('/api/modules', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!upstream || upstream.status === 401) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return NextResponse.json({ error: data.detail || 'Unable to create module' }, { status: upstream.status >= 500 ? 502 : upstream.status });
    return NextResponse.json(data, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Learning service unavailable' }, { status: 502 }); }
}
