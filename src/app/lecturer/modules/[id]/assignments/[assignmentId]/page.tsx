import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Download, Users, Clock, CheckCircle2, AlertCircle, Loader2, FileText } from 'lucide-react';
import { currentUserId } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { authenticatedAiFetch } from '@/lib/studymind-identity';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

type Submission = {
  id: string;
  student_name: string;
  student_email: string;
  submitted_at: string;
  is_late: boolean;
  status: string;
  score: number | null;
  file_download_url: string;
};

function StatusIcon({ status }: { status: string }) {
  if (status === 'graded') return <CheckCircle2 className="size-4 text-emerald-500" />;
  if (status === 'error') return <AlertCircle className="size-4 text-red-400" />;
  return <Loader2 className="size-4 animate-spin text-violet-500" />;
}

export default async function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string; assignmentId: string }>;
}) {
  const { id, assignmentId } = await params;
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');

  const module = await prisma.module.findFirst({ where: { id, lecturerId: userId }, select: { id: true, title: true } });
  if (!module) notFound();

  const upstream = await authenticatedAiFetch(`/api/assignments/${assignmentId}/submissions`);
  if (!upstream) redirect('/sign-in');

  let submissions: Submission[] = [];
  let assignmentTitle = '';
  let dueAt = '';

  if (upstream.ok) {
    submissions = await upstream.json().catch(() => []);
  } else if (upstream.status === 403 || upstream.status === 404) {
    notFound();
  }

  // Fetch assignment detail for title + due date
  const detailUpstream = await authenticatedAiFetch(`/api/assignments/lecturer/${assignmentId}`);
  if (detailUpstream?.ok) {
    const detail = await detailUpstream.json().catch(() => ({}));
    assignmentTitle = detail.title ?? '';
    dueAt = detail.due_at ?? '';
  }

  const graded = submissions.filter((s) => s.status === 'graded').length;
  const pending = submissions.filter((s) => s.status === 'pending' || s.status === 'grading').length;

  return (
    <div className="mx-auto max-w-4xl space-y-7 px-5 py-10">
      <Link href={`/lecturer/modules/${id}/assignments`} className="text-sm font-semibold text-violet-700 hover:underline">
        ← Assignments
      </Link>

      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-violet-600">Assignment</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">{assignmentTitle || 'Assignment'}</h1>
        {dueAt && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-500">
            <Clock className="size-4" />
            Due {new Date(dueAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="pt-5"><p className="text-xs font-semibold uppercase text-zinc-500">Submissions</p><p className="mt-1 text-3xl font-bold text-zinc-900">{submissions.length}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs font-semibold uppercase text-zinc-500">Graded</p><p className="mt-1 text-3xl font-bold text-emerald-600">{graded}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs font-semibold uppercase text-zinc-500">Pending</p><p className="mt-1 text-3xl font-bold text-violet-600">{pending}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Student submissions</CardTitle>
          <CardDescription>AI grading runs automatically after each submission. Scores are out of 100%.</CardDescription>
        </CardHeader>
        <CardContent>
          {submissions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <FileText className="size-10 text-zinc-200" />
              <p className="text-sm text-zinc-500">No submissions yet. Students can submit until the deadline.</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {submissions.map((s) => (
                <div key={s.id} className="flex items-center gap-4 py-4">
                  <StatusIcon status={s.status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-zinc-900">{s.student_name}</p>
                    <p className="text-xs text-zinc-500">{s.student_email} · Submitted {new Date(s.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {s.status === 'graded' && s.score !== null && (
                      <span className={`text-sm font-bold ${s.score >= 70 ? 'text-emerald-600' : s.score >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                        {Math.round(s.score)}%
                      </span>
                    )}
                    {s.is_late && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">Late</span>}
                    {s.file_download_url && (
                      <a href={s.file_download_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">
                        <Download className="size-3" /> Download
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
