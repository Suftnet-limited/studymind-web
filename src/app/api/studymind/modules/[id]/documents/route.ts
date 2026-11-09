import { NextResponse } from 'next/server';
import { authenticatedAiFetch } from '@/lib/studymind-identity';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
const valid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!valid(id)) return NextResponse.json({ error: 'Invalid module ID' }, { status: 400 });
  try {
    const upstream = await authenticatedAiFetch(`/api/modules/${id}/documents`);
    if (!upstream || upstream.status === 401) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (!upstream.ok) return NextResponse.json({ error: 'Unable to load documents' }, { status: upstream.status < 500 ? upstream.status : 502 });
    return NextResponse.json(await upstream.json(), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'Learning service unavailable' }, { status: 502 }); }
}
export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  if (!valid(id)) return NextResponse.json({ error: 'Invalid module ID' }, { status: 400 });
  const type = request.headers.get('content-type') || '';
  if (!type.startsWith('multipart/form-data')) return NextResponse.json({ error: 'Expected file upload' }, { status: 415 });
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || !file.size || file.size > 50 * 1024 * 1024)
    return NextResponse.json({ error: 'File is empty or exceeds 50 MB' }, { status: 400 });
  const payload = new FormData();
  payload.set('file', file);
  const visibility = form?.get('visibility');
  if (visibility === 'personal' || visibility === 'class') payload.set('visibility', visibility);
  const week = form?.get('week_id');
  if (typeof week === 'string' && /^[0-9a-f-]{36}$/i.test(week)) payload.set('week_id', week);
  try {
    const upstream = await authenticatedAiFetch(`/api/modules/${id}/documents`, { method: 'POST', body: payload });
    if (!upstream || upstream.status === 401) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return NextResponse.json({ error: data.detail || 'Unable to upload document' }, { status: upstream.status < 500 ? upstream.status : 502 });
    return NextResponse.json(data, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Learning service unavailable' }, { status: 502 }); }
}
