import { NextResponse } from 'next/server';
import { authenticatedAiFetch } from '@/lib/studymind-identity';
import { isUuid, validateUpload } from '@/lib/studymind-validation.mjs';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
const valid = isUuid;
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
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  const check = validateUpload(file);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
  const payload = new FormData();
  payload.set('file', file);
  const visibility = form?.get('visibility');
  if (visibility === 'personal' || visibility === 'class') payload.set('visibility', visibility);
  const week = form?.get('week_id');
  if (typeof week === 'string' && isUuid(week)) payload.set('week_id', week);
  try {
    const upstream = await authenticatedAiFetch(`/api/modules/${id}/documents`, { method: 'POST', body: payload });
    if (!upstream || upstream.status === 401) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return NextResponse.json({ error: data.detail || 'Unable to upload document' }, { status: upstream.status < 500 ? upstream.status : 502 });
    return NextResponse.json(data, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Learning service unavailable' }, { status: 502 }); }
}
