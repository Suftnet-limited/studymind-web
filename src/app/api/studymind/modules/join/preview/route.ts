import { NextResponse } from 'next/server';
import { authenticatedAiFetch } from '@/lib/studymind-identity';
import { apiDetail } from '@/lib/studymind-validation.mjs';
export const runtime = 'nodejs';

/**
 * Preview a module before joining — returns name, lecturer and status.
 * GET /api/studymind/modules/join/preview?course_id=<id|code>
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const courseId = searchParams.get('course_id')?.trim() ?? '';
  if (!courseId) return NextResponse.json({ error: 'course_id is required' }, { status: 400 });
  try {
    const upstream = await authenticatedAiFetch(
      `/api/modules/join/preview?course_id=${encodeURIComponent(courseId)}`
    );
    if (!upstream || upstream.status === 401) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok)
      return NextResponse.json({ error: apiDetail(data, 'Course not found') }, { status: upstream.status < 500 ? upstream.status : 502 });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Learning service unavailable' }, { status: 502 }); }
}
