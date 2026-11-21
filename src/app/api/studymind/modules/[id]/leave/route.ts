import { NextResponse } from 'next/server';
import { authenticatedAiFetch } from '@/lib/studymind-identity';
import { isUuid } from '@/lib/studymind-validation.mjs';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

/**
 * Student leaves a module.
 * DELETE /api/studymind/modules/:id/leave
 */
export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Invalid module ID' }, { status: 400 });
  try {
    const upstream = await authenticatedAiFetch(`/api/modules/${id}/leave`, { method: 'DELETE' });
    if (!upstream || upstream.status === 401) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (upstream.status === 204) return new NextResponse(null, { status: 204 });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(
      { error: (data as { detail?: string }).detail || 'Unable to leave module' },
      { status: upstream.status < 500 ? upstream.status : 502 }
    );
  } catch { return NextResponse.json({ error: 'Learning service unavailable' }, { status: 502 }); }
}
