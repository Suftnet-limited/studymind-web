import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ClipboardList, Clock, Users, ArrowUpRight, Plus } from 'lucide-react';
import { currentUserId } from '@/lib/session';
import { authenticatedAiFetch } from '@/lib/studymind-identity';
import { PageHeading } from '@/components/ui/page-heading';
import { Card, CardContent } from '@/components/ui/card';

type Assignment = {
  id: string;
  title: string;
  description: string | null;
  due_at: string;
  status: string;
  max_score: number;
  submission_count: number;
};

function StatusBadge({ dueAt, status }: { dueAt: string; status: string }) {
  if (status === 'closed') return <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-500">Closed</span>;
  const past = new Date(dueAt) < new Date();
  if (past) return <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Past due</span>;
  return <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Active</span>;
}

export default async function LecturerAssignmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');

  let assignments: Assignment[] = [];
  const upstream = await authenticatedAiFetch(`/api/assignments/lecturer?module_id=${id}`);
  if (upstream?.ok) assignments = await upstream.json().catch(() => []);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-5 py-10">
      <Link href={`/lecturer/modules/${id}`} className="text-sm font-semibold text-violet-700 hover:underline">
        ← Back to module
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          eyebrow="Module management"
          title="Assignments"
          description="Create and manage assignments for this module. Click the submissions icon to review student work."
        />
        <Link
          href={`/lecturer/modules/${id}/assignments/new`}
          className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
        >
          <Plus className="size-4" /> New assignment
        </Link>
      </div>

      {assignments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ClipboardList className="size-10 text-zinc-200" />
            <p className="font-semibold text-zinc-700">No assignments yet</p>
            <p className="text-sm text-zinc-500">Create your first assignment to get started.</p>
            <Link
              href={`/lecturer/modules/${id}/assignments/new`}
              className="mt-2 flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
            >
              <Plus className="size-4" /> New assignment
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {assignments.map(a => (
            <div key={a.id} className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              {/* Icon */}
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-50">
                <ClipboardList className="size-5 text-violet-600" />
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-zinc-900">{a.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    Due {new Date(a.due_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="size-3" />
                    {a.submission_count} {a.submission_count === 1 ? 'submission' : 'submissions'}
                  </span>
                </div>
              </div>

              {/* Badge + action */}
              <div className="flex shrink-0 items-center gap-3">
                <StatusBadge dueAt={a.due_at} status={a.status} />
                <Link
                  href={`/lecturer/modules/${id}/assignments/${a.id}`}
                  className="flex size-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600 transition hover:bg-violet-600 hover:text-white"
                  title="View submissions"
                >
                  <ArrowUpRight className="size-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
