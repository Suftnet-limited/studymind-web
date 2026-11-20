/**
 * GET /api/assignments/student?module_id=<id>  — list assignments (student view)
 */
import { NextRequest, NextResponse } from 'next/server';
import { authenticatedAiFetch } from '@/lib/studymind-identity';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const moduleId = req.nextUrl.searchParams.get('module_id');
  if (!moduleId) return NextResponse.json({ error: 'module_id required' }, { status: 400 });
  const upstream = await authenticatedAiFetch(`/api/assignments/student?module_id=${moduleId}`);
  if (!upstream) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await upstream.json().catch(() => null);
  return NextResponse.json(body, { status: upstream.status });
}
