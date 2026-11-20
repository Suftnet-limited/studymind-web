import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FileText, Clock, CheckCircle2, AlertCircle, ArrowUpRight, Loader2 } from 'lucide-react';
import { currentUserId } from '@/lib/session';
import { authenticatedAiFetch } from '@/lib/studymind-identity';
import { Card, CardContent } from '@/components/ui/card';

type Assignment = {
  id: string;
  title: string;
  description: string | null;
  due_at: string;
  status: string;
  max_score: number;
  my_submission_id: string | null;
  my_submission_status: string | null;
};

function SubmissionBadge({ status, dueAt }: { status: string | null; dueAt: string }) {
  if (status === 'graded') return <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="size-3" /> Graded</span>;
  if (status === 'grading' || status === 'pending') return <span className="flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700"><Loader2 className="size-3 animate-spin" /> Grading…</span>;
  if (status === 'error') return <span className="flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600"><AlertCircle className="size-3" /> Error</span>;
  const overdue = new Date(dueAt) < new Date();
  if (overdue) return <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">Past due</span>;
  return <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-500">Not submitted</span>;
}

export default async function StudentAssignmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');

  let assignments: Assignment[] = [];
  const upstream = await authenticatedAiFetch(`/api/assignments/student?module_id=${id}`);
  if (upstream?.ok) assignments = await upstream.json().catch(() => []);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-5 py-10">
      <Link href={`/my-learning/modules/${id}`} className="text-sm font-semibold text-violet-700 hover:underline">
        ← Back to module
      </Link>

      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-violet-600">Assignments</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">Your assignments</h1>
        <p className="mt-1 text-sm text-zinc-500">Download each brief, submit your work before the deadline, and view AI feedback once graded.</p>
      </div>

      {assignments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <FileText className="size-10 text-zinc-200" />
            <p className="font-semibold text-zinc-700">No assignments yet</p>
            <p className="text-sm text-zinc-500">Your lecturer hasn&apos;t posted any assignments for this module.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => {
            const href = `/my-learning/modules/${id}/assignments/${a.id}`;
            return (
              <Link key={a.id} href={href} className="block">
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-zinc-900">{a.title}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                        <Clock className="size-3" />
                        Due {new Date(a.due_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <SubmissionBadge status={a.my_submission_status} dueAt={a.due_at} />
                      <ArrowUpRight className="size-4 text-zinc-300" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
