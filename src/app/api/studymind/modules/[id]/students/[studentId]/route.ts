import { NextResponse } from 'next/server';
import { authenticatedAiFetch } from '@/lib/studymind-identity';
import { isUuid } from '@/lib/studymind-validation.mjs';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string; studentId: string }> };

/**
 * Lecturer removes a student from their module.
 * DELETE /api/studymind/modules/:id/students/:studentId
 */
export async function DELETE(_request: Request, context: Context) {
  const { id, studentId } = await context.params;
  if (!isUuid(id) || !isUuid(studentId))
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  try {
    const upstream = await authenticatedAiFetch(`/api/modules/${id}/students/${studentId}`, { method: 'DELETE' });
    if (!upstream || upstream.status === 401) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (upstream.status === 204) return new NextResponse(null, { status: 204 });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(
      { error: (data as { detail?: string }).detail || 'Unable to remove student' },
      { status: upstream.status < 500 ? upstream.status : 502 }
    );
  } catch { return NextResponse.json({ error: 'Learning service unavailable' }, { status: 502 }); }
}
