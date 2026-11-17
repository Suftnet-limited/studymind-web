import { NextResponse } from 'next/server';
import { authenticatedAiFetch } from '@/lib/studymind-identity';
import { apiDetail, isUuid, parseUploadVisibility, validateUpload } from '@/lib/studymind-validation.mjs';
export const runtime = 'nodejs';
// Large files (semester booklets, full course PDFs) take time to upload and index.
export const maxDuration = 300; // 5 minutes
type Context = { params: Promise<{ id: string }> };
const valid = isUuid;
export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!valid(id)) return NextResponse.json({ error: 'Invalid module ID' }, { status: 400 });
  try {
    const upstream = await authenticatedAiFetch(`/api/modules/${id}/documents`);
    if (!upstream || upstream.status === 401) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (!upstream.ok) {
      const status = upstream.status;
      const error = status === 403 ? 'You do not have access to this module\'s materials.'
        : status === 404 ? 'This module could not be found.' : 'Unable to load documents';
      return NextResponse.json({ error }, { status: status < 500 ? status : 502 });
    }
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
  // The AI endpoint declares `visibility` and `week_id` as QUERY parameters; form fields are ignored,
  // which would silently store every upload as class material.
  const query = new URLSearchParams();
  const visibility = parseUploadVisibility(form?.get('visibility'));
  if (!visibility) return NextResponse.json({ error: 'Invalid document visibility' }, { status: 400 });
  query.set('visibility', visibility);
  const week = form?.get('week_id');
  if (isUuid(week)) query.set('week_id', week as string);
  const qs = query.toString() ? `?${query}` : '';
  try {
    // Large files (semester booklets, full course PDFs) can take several minutes to upload + index.
    const upstream = await authenticatedAiFetch(`/api/modules/${id}/documents${qs}`, { method: 'POST', body: payload, signal: AbortSignal.timeout(270_000) }); // 4.5 min
    if (!upstream || upstream.status === 401) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return NextResponse.json({ error: apiDetail(data, 'Unable to upload document') }, { status: upstream.status < 500 ? upstream.status : 502 });
    return NextResponse.json(data, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[documents POST] upstream error:', msg);
    const isTimeout = msg.includes('timed out') || msg.includes('abort') || msg.includes('TimeoutError');
    return NextResponse.json({ error: isTimeout ? 'Upload timed out — try a smaller file or try again.' : 'Learning service unavailable' }, { status: 502 });
  }
}
