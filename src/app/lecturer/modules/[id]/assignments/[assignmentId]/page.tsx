'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  X, Download, Loader2, CheckCircle2, AlertCircle, Clock,
  ThumbsUp, ThumbsDown, Lightbulb, Users, FileText,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

type Submission = {
  id: string;
  student_name: string;
  student_email: string;
  submitted_at: string;
  status: 'pending' | 'grading' | 'graded' | 'error';
  score: number | null;
  strengths: string[] | null;
  weaknesses: string[] | null;
  recommendations: string[] | null;
  filename: string;
  file_download_url: string;
};

type Assignment = {
  id: string;
  title: string;
  due_at: string;
  submission_count: number;
};

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-emerald-500', 'bg-sky-500',
  'bg-amber-500', 'bg-rose-500', 'bg-teal-500', 'bg-indigo-500',
];

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

function ScoreRing({ score }: { score: number }) {
  const pct = Math.round(score);
  const color = pct >= 70 ? '#059669' : pct >= 50 ? '#d97706' : '#dc2626';
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="relative flex size-20 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(${color} ${pct}%, #e4e4e7 0%)` }}
      >
        <div className="absolute flex size-[58px] items-center justify-center rounded-full bg-white">
          <span className="text-lg font-bold" style={{ color }}>{pct}%</span>
        </div>
      </div>
      <p className="text-xs font-semibold text-zinc-500">AI score</p>
    </div>
  );
}

function FeedbackList({ icon: Icon, title, items, colorClass }: {
  icon: React.ElementType; title: string; items: string[]; colorClass: string;
}) {
  if (!items.length) return null;
  return (
    <div>
      <p className={`mb-2 flex items-center gap-1.5 text-sm font-bold ${colorClass}`}>
        <Icon className="size-4" /> {title}
      </p>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 rounded-lg bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-zinc-300" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SubmissionsPage() {
  const { id: moduleId, assignmentId } = useParams<{ id: string; assignmentId: string }>();
  const router = useRouter();
  const backHref = `/lecturer/modules/${moduleId}/assignments`;

  // Replace any sign-in / redirect page that ended up in the history stack
  // so the browser back button returns to the assignments list, not a login page.
  useEffect(() => {
    window.history.replaceState(null, '', window.location.href);
  }, []);

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    async function load() {
      const [aRes, sRes] = await Promise.all([
        fetch(`/api/assignments/lecturer/${assignmentId}`),
        fetch(`/api/assignments/${assignmentId}/submissions`),
      ]);
      if (aRes.ok) setAssignment(await aRes.json());
      if (sRes.ok) setSubmissions(await sRes.json());
      setLoading(false);
    }
    load();
  }, [assignmentId]);

  function openDrawer(sub: Submission) {
    setSelected(sub);
    setDrawerOpen(true);
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    setDrawerOpen(false);
    document.body.style.overflow = '';
  }

  const graded = submissions.filter(s => s.status === 'graded').length;
  const pending = submissions.filter(s => s.status === 'pending' || s.status === 'grading').length;
  const avgScore = graded > 0
    ? Math.round(submissions.filter(s => s.score !== null).reduce((acc, s) => acc + (s.score ?? 0), 0) / graded)
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-5 py-10">
      <button onClick={() => router.push(backHref)} className="text-sm font-semibold text-violet-700 hover:underline">
        ← Assignments
      </button>

      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-violet-600">Submissions</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">{assignment?.title ?? 'Assignment'}</h1>
        {assignment && (
          <p className="mt-1 text-sm text-zinc-500 flex items-center gap-1.5">
            <Clock className="size-3.5" />
            Due {new Date(assignment.due_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { n: submissions.length, l: 'Submitted' },
          { n: graded, l: 'Graded' },
          { n: pending, l: 'Pending' },
          { n: avgScore !== null ? `${avgScore}%` : '—', l: 'Avg score' },
        ].map(({ n, l }) => (
          <div key={l} className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-2xl font-bold text-zinc-900">{n}</p>
            <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">{l}</p>
          </div>
        ))}
      </div>

      {/* Student list */}
      {submissions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Users className="size-10 text-zinc-200" />
            <p className="font-semibold text-zinc-700">No submissions yet</p>
            <p className="text-sm text-zinc-500">Students who submit their work will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {submissions.map((sub, i) => (
              <button
                key={sub.id}
                onClick={() => openDrawer(sub)}
                className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-violet-50 first:rounded-t-2xl last:rounded-b-2xl border-b border-zinc-100 last:border-0"
              >
                {/* Avatar */}
                <div className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                  {initials(sub.student_name || sub.student_email)}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-zinc-900">{sub.student_name || sub.student_email}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {new Date(sub.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>

                {/* Score / status */}
                <div className="shrink-0">
                  {sub.status === 'graded' && sub.score !== null ? (
                    <span className={`text-lg font-bold ${sub.score >= 70 ? 'text-emerald-600' : sub.score >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                      {Math.round(sub.score)}%
                    </span>
                  ) : sub.status === 'pending' || sub.status === 'grading' ? (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-violet-600">
                      <Loader2 className="size-3.5 animate-spin" /> Grading
                    </span>
                  ) : sub.status === 'error' ? (
                    <AlertCircle className="size-5 text-red-400" />
                  ) : null}
                </div>

                <span className="text-zinc-300">›</span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={closeDrawer}
      />

      {/* Right drawer */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {selected && (
          <>
            {/* Drawer header */}
            <div className="flex items-center gap-3 border-b border-zinc-100 p-5">
              <button
                onClick={closeDrawer}
                className="flex size-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
              >
                <X className="size-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-zinc-900">{selected.student_name || selected.student_email}</p>
                <p className="text-xs text-zinc-500">{selected.student_email}</p>
              </div>
              <a
                href={selected.file_download_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex size-8 items-center justify-center rounded-lg border border-zinc-200 text-violet-600 hover:bg-violet-50"
                title="Download submission"
              >
                <Download className="size-4" />
              </a>
            </div>

            {/* Drawer body */}
            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              {/* Score ring or status */}
              {selected.status === 'graded' && selected.score !== null ? (
                <div className="flex justify-center pt-2">
                  <ScoreRing score={selected.score} />
                </div>
              ) : selected.status === 'pending' || selected.status === 'grading' ? (
                <div className="flex flex-col items-center gap-2 rounded-xl bg-violet-50 py-6 text-violet-700">
                  <Loader2 className="size-7 animate-spin" />
                  <p className="text-sm font-semibold">Grading in progress…</p>
                </div>
              ) : selected.status === 'error' ? (
                <div className="flex flex-col items-center gap-2 rounded-xl bg-red-50 py-6 text-red-600">
                  <AlertCircle className="size-7" />
                  <p className="text-sm font-semibold">Grading failed</p>
                  <p className="text-xs text-red-500">The student's submission could not be graded automatically. You can review the file directly.</p>
                </div>
              ) : null}

              {/* Submission meta */}
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-zinc-400">Submitted</p>
                <div className="flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-3">
                  <FileText className="size-4 shrink-0 text-violet-600" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800">{selected.filename}</span>
                  <span className="text-xs text-zinc-400">
                    {new Date(selected.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>

              {/* AI feedback */}
              {selected.status === 'graded' && (
                <>
                  <FeedbackList
                    icon={ThumbsUp}
                    title="Strengths"
                    items={selected.strengths ?? []}
                    colorClass="text-emerald-600"
                  />
                  <FeedbackList
                    icon={ThumbsDown}
                    title="Areas for improvement"
                    items={selected.weaknesses ?? []}
                    colorClass="text-amber-600"
                  />
                  <FeedbackList
                    icon={Lightbulb}
                    title="Recommendations"
                    items={selected.recommendations ?? []}
                    colorClass="text-violet-600"
                  />
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
