/**
 * GET  /api/assignments/lecturer?module_id=<id>  — list assignments (lecturer)
 * POST /api/assignments/lecturer                 — create assignment (multipart)
 */
import { NextRequest, NextResponse } from 'next/server';
import { authenticatedAiFetch } from '@/lib/studymind-identity';
export const runtime = 'nodejs';

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
  const upstream = await authenticatedAiFetch('/api/assignments', { method: 'POST', body: form });
  if (!upstream) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await upstream.json().catch(() => null);
  return NextResponse.json(body, { status: upstream.status });
}
