import { NextResponse } from 'next/server';
import { authenticatedAiFetch } from '@/lib/studymind-identity';
import { isUuid } from '@/lib/studymind-validation.mjs';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

/**
 * Lecturer lists all enrolled students in their module.
 * GET /api/studymind/modules/:id/students
 */
export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Invalid module ID' }, { status: 400 });
  try {
    const upstream = await authenticatedAiFetch(`/api/modules/${id}/students`);
    if (!upstream || upstream.status === 401) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (!upstream.ok) {
      const data = await upstream.json().catch(() => ({}));
      return NextResponse.json(
        { error: (data as { detail?: string }).detail || 'Unable to load students' },
        { status: upstream.status < 500 ? upstream.status : 502 }
      );
    }
    return NextResponse.json(await upstream.json(), { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Learning service unavailable' }, { status: 502 }); }
}
