/**
 * POST /api/assignments/[id]/submit  — student submits work (multipart)
 */
import { NextRequest, NextResponse } from 'next/server';
import { authenticatedAiFetch } from '@/lib/studymind-identity';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  const upstream = await authenticatedAiFetch(`/api/assignments/${id}/submit`, { method: 'POST', body: form });
  if (!upstream) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await upstream.json().catch(() => null);
  return NextResponse.json(body, { status: upstream.status });
}
