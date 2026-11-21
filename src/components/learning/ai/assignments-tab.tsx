'use client';
import { useState, useEffect, useRef, type FormEvent } from 'react';
import {
  ClipboardList, Clock, Users, Plus, FileText,
  CheckCircle2, AlertCircle, Loader2, Upload, X, CircleAlert,
  Download, ThumbsUp, ThumbsDown, Lightbulb, ArrowLeft,
} from 'lucide-react';
import { ToolLayout, ToolPanel } from './layout';

// ── Types ────────────────────────────────────────────────────────────────────

type Assignment = {
  id: string;
  title: string;
  description: string | null;
  due_at: string;
  status: string;
  max_score: number;
  submission_count?: number;
  my_submission_id?: string | null;
  my_submission_status?: string | null;
};

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

// ── Grading presets (lecturer only) ─────────────────────────────────────────

const GRADING_PRESETS = [
  { id: 'standard',    label: '📋 Standard',          description: 'Grade against all criteria equally.',              prompt: 'Grade this submission against all criteria in the marking scheme, applying each criterion with equal weight.' },
  { id: 'critical',   label: '🧠 Critical thinking',  description: 'Prioritise argument depth and analysis.',          prompt: 'Prioritise depth of critical analysis, strength of argument, and evidence of original thinking. Surface-level coverage should be penalised.' },
  { id: 'referencing',label: '📚 Referencing',         description: 'Penalise missing or poor citations.',              prompt: 'Apply strict penalties for missing, incorrect, or poorly formatted citations. Proper academic referencing is weighted heavily.' },
  { id: 'stem',       label: '⚗️ STEM / Technical',   description: 'Focus on accuracy and methodology.',              prompt: 'Focus on technical accuracy, correctness of methodology, logical reasoning, and appropriate use of evidence. Penalise calculation errors.' },
  { id: 'creative',   label: '🎨 Creative',            description: 'Reward originality and unique approach.',          prompt: 'Reward originality and creativity. Apply the marking scheme flexibly — the spirit of the criteria matters more than rigid compliance.' },
  { id: 'applied',    label: '🏭 Practical',           description: 'Emphasise real-world application.',               prompt: 'Emphasise real-world application and practical reasoning. Reward concrete examples over abstract discussion.' },
] as const;
type PresetId = typeof GRADING_PRESETS[number]['id'];

// ── Small shared components ──────────────────────────────────────────────────

function StatusBadge({ dueAt, status }: { dueAt: string; status: string }) {
  if (status === 'closed') return <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-500">Closed</span>;
  const past = new Date(dueAt) < new Date();
  if (past) return <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Past due</span>;
  return <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Active</span>;
}

function SubmissionBadge({ status, dueAt }: { status: string | null; dueAt: string }) {
  if (status === 'graded')   return <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="size-3" /> Graded</span>;
  if (status === 'grading' || status === 'pending') return <span className="flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700"><Loader2 className="size-3 animate-spin" /> Grading…</span>;
  if (status === 'error')    return <span className="flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600"><AlertCircle className="size-3" /> Error</span>;
  const overdue = new Date(dueAt) < new Date();
  if (overdue) return <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">Past due</span>;
  return <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-500">Not submitted</span>;
}

function FilePicker({ label, hint, file, onFile }: { label: string; hint: string; file: File | null; onFile: (f: File | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-zinc-900">{label}</p>
      <p className="mb-2 text-xs text-zinc-500">{hint}</p>
      {file ? (
        <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5">
          <FileText className="size-4 shrink-0 text-violet-600" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800">{file.name}</span>
          <button onClick={() => onFile(null)} type="button" className="text-zinc-400 hover:text-zinc-700"><X className="size-4" /></button>
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()}
          className="flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-zinc-200 py-5 text-sm text-zinc-500 transition hover:border-violet-400 hover:bg-violet-50 hover:text-violet-600">
          <Upload className="size-4" />
          Click to select (PDF or Word)
          <input ref={ref} type="file" accept=".pdf,.docx,.doc" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
        </button>
      )}
    </div>
  );
}

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

// ── Main component ───────────────────────────────────────────────────────────

type DrawerMode = 'create' | 'view';

export function AssignmentsTab({ moduleId, moduleTitle, isOwner }: { moduleId: string; moduleTitle?: string; isOwner: boolean }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  // A failed load must not look like "no assignments yet": show the error and let the user retry.
  const [loadError, setLoadError] = useState('');

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('create');
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);

  // Lecturer create-form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [maxScore, setMaxScore] = useState(100);
  const [brief, setBrief] = useState<File | null>(null);
  const [scheme, setScheme] = useState<File | null>(null);
  const [preset, setPreset] = useState<PresetId>('standard');
  const [customPrompt, setCustomPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState(false);

  // Student view state
  const [briefInfo, setBriefInfo] = useState<BriefInfo | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [subFile, setSubFile] = useState<File | null>(null);
  const [subBusy, setSubBusy] = useState(false);
  const [subError, setSubError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const subFileRef = useRef<HTMLInputElement>(null);

  // ── Load list ──────────────────────────────────────────────────────────────

  async function loadAssignments() {
    const endpoint = isOwner
      ? `/api/assignments/lecturer?module_id=${moduleId}`
      : `/api/assignments/student?module_id=${moduleId}`;
    try {
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json().catch(() => []);
        setAssignments(Array.isArray(data) ? data : []);
        setLoadError('');
      } else {
        setLoadError(res.status === 401 ? 'Your session has expired. Sign in again to see assignments.' : "We couldn't load the assignments. Please try again.");
      }
    } catch {
      setLoadError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    void loadAssignments();
  }, [moduleId, isOwner]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Drawer helpers ─────────────────────────────────────────────────────────

  function openCreate() {
    setDrawerMode('create');
    setDrawerOpen(true);
    document.body.style.overflow = 'hidden';
  }

  async function openView(a: Assignment) {
    setDrawerMode('view');
    setSelectedAssignment(a);
    setBriefInfo(null);
    setSubmission(null);
    setSubFile(null);
    setSubError('');
    setDrawerOpen(true);
    document.body.style.overflow = 'hidden';
    setSubLoading(true);
    const [briefRes, subRes] = await Promise.all([
      fetch(`/api/assignments/${a.id}/brief`),
      fetch(`/api/assignments/${a.id}/my-submission`),
    ]);
    if (briefRes.ok) setBriefInfo(await briefRes.json().catch(() => null));
    if (subRes.ok)   setSubmission(await subRes.json().catch(() => null));
    setSubLoading(false);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    document.body.style.overflow = '';
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  function resetCreateForm() {
    setTitle(''); setDescription(''); setDueAt(''); setMaxScore(100);
    setBrief(null); setScheme(null); setPreset('standard'); setCustomPrompt(''); setFormError('');
  }

  // ── Polling for grading ────────────────────────────────────────────────────

  useEffect(() => {
    const inProgress = submission && (submission.status === 'pending' || submission.status === 'grading');
    if (inProgress && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        const res = await fetch(`/api/assignments/${selectedAssignment?.id}/my-submission`);
        if (res.ok) {
          const data: Submission = await res.json();
          setSubmission(data);
          // Update badge in list
          setAssignments(prev => prev.map(a =>
            a.id === selectedAssignment?.id
              ? { ...a, my_submission_id: data.id, my_submission_status: data.status }
              : a
          ));
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
  }, [submission, selectedAssignment]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lecturer: create assignment ────────────────────────────────────────────

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!brief || !scheme) { setFormError('Please upload both the assignment brief and marking scheme.'); return; }
    setFormError(''); setBusy(true);
    const selectedPreset = GRADING_PRESETS.find(p => p.id === preset);
    const gradingPrompt = [selectedPreset?.prompt, customPrompt.trim()].filter(Boolean).join('\n\n');
    const form = new FormData();
    form.append('module_id', moduleId);
    form.append('title', title);
    form.append('description', description);
    form.append('due_at', new Date(dueAt).toISOString());
    form.append('max_score', String(maxScore));
    form.append('grading_prompt', gradingPrompt);
    form.append('brief', brief!);
    form.append('scheme', scheme!);
    try {
      const res = await fetch('/api/assignments/lecturer', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setFormError((data as { detail?: string } | null)?.detail || 'Failed to create assignment.'); return; }
      setDone(true);
      await loadAssignments();
      setTimeout(() => { closeDrawer(); setDone(false); resetCreateForm(); }, 1200);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create assignment.');
    } finally { setBusy(false); }
  }

  // ── Student: submit work ───────────────────────────────────────────────────

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!subFile || !selectedAssignment) { setSubError('Please select a file to submit.'); return; }
    setSubError(''); setSubBusy(true);
    const form = new FormData();
    form.append('work', subFile);
    try {
      const res = await fetch(`/api/assignments/${selectedAssignment.id}/submit`, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setSubError((data as { detail?: string }).detail || 'Submission failed.'); return; }
      setSubmission(data as Submission);
      setSubFile(null);
      // Update badge in list
      setAssignments(prev => prev.map(a =>
        a.id === selectedAssignment.id
          ? { ...a, my_submission_id: (data as Submission).id, my_submission_status: (data as Submission).status }
          : a
      ));
    } catch {
      setSubError('Network error — please try again.');
    } finally { setSubBusy(false); }
  }

  // ── Render: list ───────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="size-7 animate-spin text-violet-600" />
    </div>
  );

  const assignmentList = (
    <ToolPanel
      icon={<ClipboardList className="size-5" />}
      title="Assignments"
      subtitle={
        loadError
          ? 'Could not load assignments.'
          : assignments.length > 0
            ? `${assignments.length} ${assignments.length === 1 ? 'assignment' : 'assignments'}`
            : isOwner ? 'No assignments created yet.' : 'No assignments posted yet.'
      }
    >
      {loadError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span>{loadError}</span>
          <button type="button" onClick={() => { setLoading(true); void loadAssignments(); }} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 font-semibold text-red-700 hover:bg-red-100">Retry</button>
        </div>
      ) : assignments.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">
          {isOwner ? 'Create your first assignment using the panel on the right.' : "Your lecturer hasn't posted any assignments for this module."}
        </p>
      ) : (
        <ul className="space-y-3">
          {assignments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600" aria-hidden>
                  <ClipboardList className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="break-words font-semibold text-[#111034]">{a.title}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                    <span className="flex items-center gap-1"><Clock className="size-3" /> Due {new Date(a.due_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    {isOwner && <span className="flex items-center gap-1"><Users className="size-3" /> {a.submission_count ?? 0} submissions</span>}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {isOwner
                  ? <StatusBadge dueAt={a.due_at} status={a.status} />
                  : <SubmissionBadge status={a.my_submission_status ?? null} dueAt={a.due_at} />}
                {isOwner ? (
                  <a
                    href={`/lecturer/modules/${moduleId}/assignments/${a.id}`}
                    className="rounded-xl border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition"
                    title="View submissions"
                  >
                    View submissions
                  </a>
                ) : (
                  <button
                    onClick={() => openView(a)}
                    className="rounded-xl bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 transition"
                  >
                    Open
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </ToolPanel>
  );

  const lecturerSideCard = (
    <div className="rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_18px_50px_rgba(76,29,149,0.04)]">
      <p className="mb-4 text-sm leading-6 text-zinc-500">
        Before you create an assignment, make sure you have both files ready to upload:
      </p>
      <ul className="mb-5 space-y-3">
        <li className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600"><FileText className="size-4" /></span>
          <div>
            <p className="text-sm font-semibold text-zinc-900">Assignment brief</p>
            <p className="text-xs text-zinc-500">The task description shared with students (PDF or Word).</p>
          </div>
        </li>
        <li className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><CircleAlert className="size-4" /></span>
          <div>
            <p className="text-sm font-semibold text-zinc-900">Marking scheme <span className="text-xs font-normal text-zinc-400">(private)</span></p>
            <p className="text-xs text-zinc-500">Your grading criteria — only the AI sees this, never students.</p>
          </div>
        </li>
      </ul>
      <button onClick={openCreate}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold! text-white hover:bg-violet-700">
        <Plus className="size-4" /> New assignment
      </button>
    </div>
  );

  // ── Render: student view drawer content ────────────────────────────────────

  const studentDrawerContent = (
    <div className="flex-1 overflow-y-auto">
      {subLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-8 animate-spin text-violet-600" />
        </div>
      ) : (
        <div className="space-y-5 p-5">
          {/* Brief download */}
          {briefInfo && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <p className="mb-1 flex items-center gap-2 text-sm font-bold text-zinc-900"><FileText className="size-4 text-violet-600" /> Assignment brief</p>
              <p className="mb-3 text-xs text-zinc-500">Download the brief to see what you need to submit.</p>
              <a href={briefInfo.download_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition">
                <Download className="size-4 text-violet-600" /> {briefInfo.filename}
              </a>
            </div>
          )}

          {/* Submission area */}
          {!submission ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <p className="mb-1 text-sm font-bold text-zinc-900">Submit your work</p>
              <p className="mb-4 text-xs text-zinc-500">Upload a PDF or Word file. Late submissions are not accepted after the deadline.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                {subFile ? (
                  <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <FileText className="size-5 shrink-0 text-violet-600" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800">{subFile.name}</span>
                    <button onClick={() => setSubFile(null)} type="button" className="text-zinc-400 hover:text-zinc-700"><X className="size-4" /></button>
                  </div>
                ) : (
                  <button type="button" onClick={() => subFileRef.current?.click()}
                    className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-zinc-200 py-10 text-sm text-zinc-500 transition hover:border-violet-400 hover:text-violet-600">
                    <Upload className="size-6" />
                    Click to select (PDF or Word)
                    <input ref={subFileRef} type="file" accept=".pdf,.docx,.doc" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) setSubFile(f); }} />
                  </button>
                )}
                {subError && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{subError}</p>}
                <button type="submit" disabled={subBusy || !subFile}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold! text-white hover:bg-violet-700 disabled:opacity-60">
                  {subBusy && <Loader2 className="size-4 animate-spin" />}
                  {subBusy ? 'Submitting…' : 'Submit assignment'}
                </button>
              </form>
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-zinc-900">Your submission</p>
                  <p className="text-xs text-zinc-500">
                    Submitted {new Date(submission.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {submission.status === 'graded' && submission.score !== null && <ScoreRing score={submission.score} />}
                {(submission.status === 'pending' || submission.status === 'grading') && (
                  <div className="flex flex-col items-center gap-1 text-violet-600">
                    <Loader2 className="size-8 animate-spin" />
                    <p className="text-xs font-semibold">Grading…</p>
                  </div>
                )}
                {submission.status === 'error' && <AlertCircle className="size-8 text-red-400" />}
              </div>

              {submission.file_download_url && (
                <a href={submission.file_download_url} target="_blank" rel="noopener noreferrer"
                  className="mb-4 flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition">
                  <Download className="size-4 text-violet-600" /> {submission.filename}
                </a>
              )}

              {(submission.status === 'pending' || submission.status === 'grading') && (
                <p className="rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-700">
                  Your submission has been received and is being graded. This usually takes under a minute — the page will update automatically.
                </p>
              )}
              {submission.status === 'error' && (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  There was an issue grading your submission. Your lecturer can see it. Please contact them if this persists.
                </p>
              )}
              {submission.status === 'graded' && (
                <div className="space-y-5">
                  <div className="rounded-xl bg-zinc-50 p-4">
                    <p className="mb-1 text-xs font-bold uppercase tracking-wide text-zinc-500">Your score</p>
                    <p className="text-3xl font-bold text-zinc-900">{Math.round(submission.score ?? 0)}%</p>
                  </div>
                  <FeedbackSection icon={ThumbsUp}   title="Strengths"              items={submission.strengths ?? []}        color="text-emerald-600" />
                  <FeedbackSection icon={ThumbsDown} title="Areas for improvement"  items={submission.weaknesses ?? []}       color="text-amber-600"   />
                  <FeedbackSection icon={Lightbulb}  title="Recommendations"        items={submission.recommendations ?? []}  color="text-violet-600"  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ── Render: main ───────────────────────────────────────────────────────────

  return (
    <>
      {isOwner ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0">{assignmentList}</div>
          <aside className="min-w-0 lg:sticky lg:top-6 lg:h-fit">{lecturerSideCard}</aside>
        </div>
      ) : (
        <div className="min-w-0">{assignmentList}</div>
      )}

      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={closeDrawer}
      />

      {/* Right drawer */}
      <div className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        {/* Drawer header */}
        <div className="flex items-center gap-3 border-b border-zinc-100 p-5">
          <button onClick={closeDrawer} className="flex size-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50">
            {drawerMode === 'view' ? <ArrowLeft className="size-4" /> : <X className="size-4" />}
          </button>
          <div>
            {drawerMode === 'create' ? (
              <>
                <p className="font-bold text-zinc-900">New assignment</p>
                <p className="text-xs text-zinc-500">{moduleTitle ? <>For <strong className="font-semibold text-zinc-700">{moduleTitle}</strong> · fill in the details and upload files</> : 'Fill in the details and upload files'}</p>
              </>
            ) : (
              <>
                <p className="font-bold text-zinc-900 truncate max-w-[260px]">{selectedAssignment?.title}</p>
                <p className="text-xs text-zinc-500">
                  Due {selectedAssignment && new Date(selectedAssignment.due_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Drawer body */}
        {drawerMode === 'create' ? (
          <div className="flex-1 overflow-y-auto">
            {done ? (
              <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
                <CheckCircle2 className="size-12 text-emerald-500" />
                <p className="text-lg font-bold text-zinc-900">Assignment created!</p>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-6 p-5">
                <section className="space-y-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Assignment details</p>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-zinc-900">Title</label>
                    <input type="text" required value={title} onChange={e => setTitle(e.target.value)}
                      placeholder="e.g. Essay: Ethics in AI"
                      className="block w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-zinc-900">Description <span className="font-normal text-zinc-400">(optional)</span></label>
                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                      placeholder="Brief summary visible to students."
                      className="block w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-zinc-900">Due date & time</label>
                      <input type="datetime-local" required value={dueAt} onChange={e => setDueAt(e.target.value)}
                        className="block w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-zinc-900">Max score</label>
                      <input type="number" min={1} max={100} required value={maxScore} onChange={e => setMaxScore(Number(e.target.value))}
                        className="block w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none" />
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Files</p>
                    <p className="mt-0.5 text-xs text-zinc-500">The brief is shared with students. The marking scheme is private — AI grader only.</p>
                  </div>
                  <FilePicker label="Assignment brief" hint="Students download this." file={brief} onFile={setBrief} />
                  <FilePicker label="Marking scheme (private)" hint="Used by AI grader only." file={scheme} onFile={setScheme} />
                </section>

                <section className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Grading focus</p>
                  <div className="grid grid-cols-2 gap-2">
                    {GRADING_PRESETS.map(p => (
                      <button key={p.id} type="button" onClick={() => setPreset(p.id)}
                        className={`flex flex-col items-start rounded-xl border-2 p-3 text-left transition ${preset === p.id ? 'border-violet-500 bg-violet-50' : 'border-zinc-200 bg-white hover:border-violet-300'}`}>
                        <span className="text-sm font-semibold! text-zinc-900">{p.label}</span>
                        <span className="mt-0.5 text-xs text-zinc-500 leading-relaxed">{p.description}</span>
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-zinc-900">Additional instructions <span className="font-normal text-zinc-400">(optional)</span></label>
                    <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} rows={2}
                      placeholder="e.g. Focus heavily on the conclusion section."
                      className="block w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none" />
                  </div>
                </section>

                {formError && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{formError}</div>}

                <div className="flex gap-3 pb-2">
                  <button type="button" onClick={closeDrawer} className="flex-1 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold! text-zinc-700 hover:bg-zinc-50">Cancel</button>
                  <button type="submit" disabled={busy}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold! text-white hover:bg-violet-700 disabled:opacity-60">
                    {busy && <Loader2 className="size-4 animate-spin" />}
                    {busy ? 'Creating…' : 'Create assignment'}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : studentDrawerContent}
      </div>
    </>
  );
}
