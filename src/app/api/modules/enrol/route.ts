import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUserId } from '@/lib/session';
export const runtime = 'nodejs';

/** Students join by the stable Course ID shown to lecturers.
 * Legacy enrolment codes remain accepted for existing classrooms.
 */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role !== 'STUDENT') return NextResponse.json({ error: 'Student account required' }, { status: 403 });

  let data: FormData;
  try { data = await req.formData(); }
  catch { return NextResponse.json({ error: 'Invalid form' }, { status: 400 }); }
  const courseId = String(data.get('courseId') || data.get('code') || '').trim();
  if (!courseId || courseId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(courseId))
    return NextResponse.json({ error: 'Enter a valid Course ID' }, { status: 400 });

  const module = await prisma.module.findFirst({
    where: { OR: [{ id: courseId }, { enrolmentCode: courseId.toUpperCase() }] },
    select: { id: true },
  });
  if (!module) return NextResponse.json({ error: 'Course ID not found' }, { status: 404 });
  await prisma.enrolment.upsert({
    where: { userId_moduleId: { userId, moduleId: module.id } },
    update: {},
    create: { userId, moduleId: module.id },
  });
  return NextResponse.redirect(new URL(`/modules/${module.id}`, req.url), 303);
}
