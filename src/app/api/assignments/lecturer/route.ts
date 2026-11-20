/**
 * GET  /api/assignments/lecturer?module_id=<id>  — list assignments (lecturer)
 * POST /api/assignments/lecturer                 — create assignment (multipart)
 */
import { NextRequest, NextResponse } from 'next/server';
import { authenticatedAiFetch } from '@/lib/studymind-identity';
export const runtime = 'nodejs';
export const maxDuration = 120; // file uploads can take a while

export async function GET(req: NextRequest) {
  const moduleId = req.nextUrl.searchParams.get('module_id');
  if (!moduleId) return NextResponse.json({ error: 'module_id required' }, { status: 400 });
  const upstream = await authenticatedAiFetch(`/api/assignments/lecturer?module_id=${moduleId}`);
  if (!upstream) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await upstream.json().catch(() => null);
  return NextResponse.json(body, { status: upstream.status });
}

export async function POST(req: NextRequest) {
  // Stream the raw multipart body straight through — do NOT call req.formData() which
  // buffers the entire payload (PDFs) into memory and can exceed Render's 30s timeout.
  const contentType = req.headers.get('content-type');
  if (!contentType?.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }
  const init = {
    method: 'POST',
    body: req.body,
    headers: { 'content-type': contentType },
    duplex: 'half',
  } as unknown as RequestInit;
  const upstream = await authenticatedAiFetch('/api/assignments', init);
  if (!upstream) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const text = await upstream.text().catch(() => '');
  let body: unknown;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { detail: text || 'Unexpected response from server' }; }
  return NextResponse.json(body, { status: upstream.status });
}
