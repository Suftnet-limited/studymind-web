import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { FileText, Plus, Users, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { currentUserId } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { authenticatedAiFetch } from '@/lib/studymind-identity';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { PageHeading } from '@/components/ui/page-heading';

type Assignment = {
  id: string;
  title: string;
  due_at: string;
  status: string;
  submission_count: number;
  max_score: number;
};

function statusBadge(due_at: string, status: string) {
  if (status === 'closed') return <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-500">Closed</span>;
  const overdue = new Date(due_at) < new Date();
  if (overdue) return <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">Past due</span>;
  return <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Active</span>;
}

export default async function LecturerAssignmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');

  const module = await prisma.module.findFirst({ where: { id, lecturerId: userId }, select: { id: true, title: true } });
  if (!module) notFound();

  let assignments: Assignment[] = [];
  const upstream = await authenticatedAiFetch(`/api/assignments/lecturer?module_id=${id}`);
  if (upstream?.ok) assignments = (await upstream.json().catch(() => [])) as Assignment[];

  return (
    <div className="mx-auto max-w-4xl space-y-7 px-5 py-10">
      <Link href={`/lecturer/modules/${id}`} className="text-sm font-semibold text-violet-700 hover:underline">
        ← {module.title}
      </Link>

      <PageHeading
        eyebrow="Assignments"
        title="Manage assignments"
        description="Create assignments, upload marking schemes, and review AI-graded submissions."
        action={
          <Link
            href={`/lecturer/modules/${id}/assignments/new`}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
          >
            <Plus className="size-4" /> New assignment
          </Link>
        }
      />

      {assignments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <FileText className="size-10 text-zinc-300" />
            <p className="font-semibold text-zinc-700">No assignments yet</p>
            <p className="text-sm text-zinc-500">Create your first assignment and upload a marking scheme to get started.</p>
            <Link href={`/lecturer/modules/${id}/assignments/new`} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
              Create assignment
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => (
            <Link key={a.id} href={`/lecturer/modules/${id}/assignments/${a.id}`} className="block">
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-zinc-900">{a.title}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                      <Clock className="size-3" />
                      Due {new Date(a.due_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="flex items-center gap-1 text-sm text-zinc-500">
                      <Users className="size-4" /> {a.submission_count}
                    </span>
                    {statusBadge(a.due_at, a.status)}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
