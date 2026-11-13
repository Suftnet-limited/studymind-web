import { NextResponse } from 'next/server';
import { authenticatedAiFetch } from '@/lib/studymind-identity';
import { isUuid } from '@/lib/studymind-validation.mjs';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Invalid module ID' }, { status: 400 });
  try {
    const upstream = await authenticatedAiFetch(`/api/modules/${id}`);
    if (!upstream || upstream.status === 401) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (!upstream.ok) return NextResponse.json({ error: 'Module unavailable' }, { status: upstream.status === 403 || upstream.status === 404 ? upstream.status : 502 });
    return NextResponse.json(await upstream.json(), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'Learning service unavailable' }, { status: 502 }); }
}
