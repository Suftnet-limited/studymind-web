import { NextResponse } from 'next/server';
import { authenticatedAiFetch } from '@/lib/studymind-identity';
import { apiDetail, parseJoinInput } from '@/lib/studymind-validation.mjs';
export const runtime = 'nodejs';

/**
 * Joins a lecturer-created module by Course ID using the caller's canonical StudyMind AI session.
 * AI contract: `POST /api/modules/join { course_id }` -> `{ module_id, enrolment_id }`; only students and
 * self-learners may join (403 otherwise); 404 unknown ID; 409 ambiguous course code.
 */
export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = parseJoinInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const upstream = await authenticatedAiFetch('/api/modules/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.value),
    });
    if (!upstream || upstream.status === 401) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const data = await upstream.json().catch(() => ({}));
    if (upstream.status === 405) return NextResponse.json({ error: 'Joining courses is not available yet.' }, { status: 501 });
    if (!upstream.ok)
      return NextResponse.json({ error: apiDetail(data, 'Unable to join course') }, { status: upstream.status < 500 ? upstream.status : 502 });
    return NextResponse.json(data, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Learning service unavailable' }, { status: 502 }); }
}
