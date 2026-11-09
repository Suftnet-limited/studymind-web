import { NextResponse } from 'next/server';
import { authenticatedAiFetch } from '@/lib/studymind-identity';
import { apiDetail, parseModuleInput } from '@/lib/studymind-validation.mjs';
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
  const parsed = parseModuleInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const upstream = await authenticatedAiFetch('/api/modules', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.value),
    });
    if (!upstream || upstream.status === 401) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return NextResponse.json({ error: apiDetail(data, 'Unable to create module') }, { status: upstream.status >= 500 ? 502 : upstream.status });
    return NextResponse.json(data, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Learning service unavailable' }, { status: 502 }); }
}
