import { NextResponse } from 'next/server';
import { moduleAccess, hasActivePass } from '@/lib/module-access';
import { studyMindApi } from '@/lib/studymind-ai';

export const runtime = 'nodejs';

type CourseStatus = { status: string; error?: string | null };
type IngestResult = { status: string; course_id: string; module_id: string };

/** Explicit, lecturer-only course ingestion. Module enrolment never depends on AI uptime. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await moduleAccess(id);
  if (!access) return NextResponse.json({ error: 'Module not found' }, { status: 404 });
  if (!access.isLecturer) return NextResponse.json({ error: 'Lecturer access required' }, { status: 403 });
  if (!await hasActivePass(access.userId))
    return NextResponse.json({ error: 'An active access pass is required' }, { status: 402 });

  try {
    const query = new URLSearchParams({ course_id: id, user_id: access.userId });
    const current = await studyMindApi<CourseStatus>(`/api/v1/courses/status?${query}`);
    if (current.status === 'ready' || current.status === 'indexing')
      return NextResponse.json({ status: current.status });
    const result = await studyMindApi<IngestResult>('/api/v1/courses/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course_id: id, user_id: access.userId, user_role: 'tutor',
        title: access.module.title, description: access.module.description || '',
        sections: [],
      }),
    });
    return NextResponse.json({ status: result.status }, { status: 202 });
  } catch (e) {
    console.error('StudyMind course provisioning failed', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'Unable to prepare AI course. Please retry.' }, { status: 502 });
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await moduleAccess(id);
  if (!access) return NextResponse.json({ error: 'Module not found' }, { status: 404 });
  if (!await hasActivePass(access.userId))
    return NextResponse.json({ error: 'An active access pass is required' }, { status: 402 });
  try {
    const query = new URLSearchParams({ course_id: id, user_id: access.userId });
    const result = await studyMindApi<CourseStatus>(`/api/v1/courses/status?${query}`);
    return NextResponse.json({ status: result.status, error: result.error || null });
  } catch {
    return NextResponse.json({ error: 'Unable to retrieve AI course status' }, { status: 502 });
  }
}
