'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Download, Upload, X, FileText, Loader2, CheckCircle2, AlertCircle, ThumbsUp, ThumbsDown, Lightbulb } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

type Submission = {
  id: string;
  status: 'pending' | 'grading' | 'graded' | 'error';
  score: number | null;
  strengths: string[] | null;
  weaknesses: string[] | null;
  recommendations: string[] | null;
  submitted_at: string;
  filename: string;
  file_download_url: string;
};

type BriefInfo = { download_url: string; filename: string };

function ScoreRing({ score }: { score: number }) {
  const pct = Math.round(score);
  const color = pct >= 70 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex size-24 items-center justify-center rounded-full" style={{ background: `conic-gradient(${color} ${pct}%, #e4e4e7 0%)` }}>
        <div className="absolute flex size-[72px] items-center justify-center rounded-full bg-white">
          <span className="text-2xl font-bold" style={{ color }}>{pct}%</span>
        </div>
      </div>
      <p className="text-xs font-semibold text-zinc-500">Score</p>
    </div>
  );
}

function FeedbackSection({ icon: Icon, title, items, color }: { icon: React.ElementType; title: string; items: string[]; color: string }) {
  if (!items.length) return null;
  return (
    <div>
      <p className={`mb-2 flex items-center gap-1.5 text-sm font-bold ${color}`}><Icon className="size-4" />{title}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-zinc-700">
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-zinc-300" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AssignmentPage() {
  const { id, assignmentId } = useParams<{ id: string; assignmentId: string }>();
  const [brief, setBrief] = useState<BriefInfo | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadData() {
    const [briefRes, subRes] = await Promise.all([
      fetch(`/api/assignments/${assignmentId}/brief`),
      fetch(`/api/assignments/${assignmentId}/my-submission`),
    ]);
    if (briefRes.ok) setBrief(await briefRes.json());
    if (subRes.ok) setSubmission(await subRes.json());
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  // Poll while grading is in progress
  useEffect(() => {
    const inProgress = submission && (submission.status === 'pending' || submission.status === 'grading');
    if (inProgress && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        const res = await fetch(`/api/assignments/${assignmentId}/my-submission`);
        if (res.ok) {
          const data: Submission = await res.json();
          setSubmission(data);
          if (data.status === 'graded' || data.status === 'error') {
            clearInterval(pollRef.current!);
            pollRef.current = null;
          }
        }
      }, 5000);
    }
    if (!inProgress && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [submission, assignmentId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError('Please select a file to submit.'); return; }
    setError('');
    setBusy(true);
    const form = new FormData();
    form.append('work', file);
    try {
      const res = await fetch(`/api/assignments/${assignmentId}/submit`, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError((data as { detail?: string }).detail || 'Submission failed.'); return; }
      setSubmission(data as Submission);
      setFile(null);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="size-8 animate-spin text-violet-600" />
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-5 py-10">
      <Link href={`/my-learning/modules/${id}/assignments`} className="text-sm font-semibold text-violet-700 hover:underline">
        ← Assignments
      </Link>

      {/* Brief download */}
      {brief && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><FileText className="size-5 text-violet-600" /> Assignment brief</CardTitle>
            <CardDescription>Download the brief to see what you need to submit.</CardDescription>
          </CardHeader>
          <CardContent>
            <a href={brief.download_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
              <Download className="size-4 text-violet-600" /> {brief.filename}
            </a>
          </CardContent>
        </Card>
      )}

      {/* Submission area */}
      {!submission ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Submit your work</CardTitle>
            <CardDescription>Upload a PDF or Word file. Late submissions are not accepted after the deadline.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {file ? (
                <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
                  <FileText className="size-5 shrink-0 text-violet-600" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800">{file.name}</span>
                  <button onClick={() => setFile(null)} type="button" className="text-zinc-400 hover:text-zinc-700"><X className="size-4" /></button>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-zinc-200 py-10 text-sm text-zinc-500 transition hover:border-violet-400 hover:text-violet-600">
                  <Upload className="size-6" />
                  Click to select your submission (PDF or Word)
                  <input ref={fileRef} type="file" accept=".pdf,.docx,.doc" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
                </button>
              )}
              {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}
              <div className="flex justify-end">
                <button type="submit" disabled={busy || !file}
                  className="flex items-center gap-2 rounded-lg bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  {busy ? 'Submitting…' : 'Submit assignment'}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base">Your submission</CardTitle>
                <CardDescription>
                  Submitted {new Date(submission.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </CardDescription>
              </div>
              {submission.status === 'graded' && submission.score !== null && (
                <ScoreRing score={submission.score} />
              )}
              {(submission.status === 'pending' || submission.status === 'grading') && (
                <div className="flex flex-col items-center gap-1 text-violet-600">
                  <Loader2 className="size-8 animate-spin" />
                  <p className="text-xs font-semibold">Grading…</p>
                </div>
              )}
              {submission.status === 'error' && (
                <AlertCircle className="size-8 text-red-400" />
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {submission.file_download_url && (
              <a href={submission.file_download_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
                <Download className="size-4 text-violet-600" /> {submission.filename}
              </a>
            )}

            {submission.status === 'pending' || submission.status === 'grading' ? (
              <p className="rounded-lg bg-violet-50 px-4 py-3 text-sm text-violet-700">
                Your submission has been received and is being graded. This usually takes under a minute — the page will update automatically.
              </p>
            ) : submission.status === 'error' ? (
              <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                There was an issue grading your submission. Your lecturer can see it. Please contact them if this persists.
              </p>
            ) : submission.status === 'graded' ? (
              <div className="space-y-5">
                <div className="rounded-lg bg-zinc-50 p-4">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-zinc-500">Your score</p>
                  <p className="text-3xl font-bold text-zinc-900">{Math.round(submission.score ?? 0)}%</p>
                </div>
                <FeedbackSection icon={ThumbsUp} title="Strengths" items={submission.strengths ?? []} color="text-emerald-600" />
                <FeedbackSection icon={ThumbsDown} title="Areas for improvement" items={submission.weaknesses ?? []} color="text-amber-600" />
                <FeedbackSection icon={Lightbulb} title="Recommendations" items={submission.recommendations ?? []} color="text-violet-600" />
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
