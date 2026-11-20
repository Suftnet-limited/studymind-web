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
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  // Pass an explicit 120 s signal so the upstream fetch doesn't hit the 12 s default.
  const upstream = await authenticatedAiFetch('/api/assignments', {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!upstream) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const text = await upstream.text().catch(() => '');
  let body: unknown;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { detail: text || 'Unexpected response from server' }; }
  return NextResponse.json(body, { status: upstream.status });
}
