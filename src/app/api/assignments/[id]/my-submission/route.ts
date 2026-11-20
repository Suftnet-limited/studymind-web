/**
 * GET /api/assignments/[id]/my-submission  — student's own submission + grading result
 */
import { NextRequest, NextResponse } from 'next/server';
import { authenticatedAiFetch } from '@/lib/studymind-identity';
export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const upstream = await authenticatedAiFetch(`/api/assignments/${id}/my-submission`);
  if (!upstream) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await upstream.json().catch(() => null);
  return NextResponse.json(body, { status: upstream.status });
}
