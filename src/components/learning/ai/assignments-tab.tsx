'use client';
import { useState, useEffect, useRef, type FormEvent } from 'react';
import {
  ClipboardList, Clock, Users, ArrowUpRight, Plus, FileText,
  CheckCircle2, AlertCircle, Loader2, Upload, X,
} from 'lucide-react';

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

const GRADING_PRESETS = [
  { id: 'standard', label: '📋 Standard', description: 'Grade against all criteria equally.', prompt: 'Grade this submission against all criteria in the marking scheme, applying each criterion with equal weight.' },
  { id: 'critical', label: '🧠 Critical thinking', description: 'Prioritise argument depth and analysis.', prompt: 'Prioritise depth of critical analysis, strength of argument, and evidence of original thinking. Surface-level coverage should be penalised.' },
  { id: 'referencing', label: '📚 Referencing', description: 'Penalise missing or poor citations.', prompt: 'Apply strict penalties for missing, incorrect, or poorly formatted citations. Proper academic referencing is weighted heavily.' },
  { id: 'stem', label: '⚗️ STEM / Technical', description: 'Focus on accuracy and methodology.', prompt: 'Focus on technical accuracy, correctness of methodology, logical reasoning, and appropriate use of evidence. Penalise calculation errors.' },
  { id: 'creative', label: '🎨 Creative', description: 'Reward originality and unique approach.', prompt: 'Reward originality and creativity. Apply the marking scheme flexibly — the spirit of the criteria matters more than rigid compliance.' },
  { id: 'applied', label: '🏭 Practical', description: 'Emphasise real-world application.', prompt: 'Emphasise real-world application and practical reasoning. Reward concrete examples over abstract discussion.' },
] as const;
type PresetId = typeof GRADING_PRESETS[number]['id'];

function StatusBadge({ dueAt, status }: { dueAt: string; status: string }) {
  if (status === 'closed') return <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-500">Closed</span>;
  const past = new Date(dueAt) < new Date();
  if (past) return <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Past due</span>;
  return <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Active</span>;
}

function SubmissionBadge({ status, dueAt }: { status: string | null; dueAt: string }) {
  if (status === 'graded') return <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="size-3" /> Graded</span>;
  if (status === 'grading' || status === 'pending') return <span className="flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700"><Loader2 className="size-3 animate-spin" /> Grading…</span>;
  if (status === 'error') return <span className="flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600"><AlertCircle className="size-3" /> Error</span>;
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

export function AssignmentsTab({ moduleId, isOwner }: { moduleId: string; isOwner: boolean }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Form state
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

  async function loadAssignments() {
    const endpoint = isOwner
      ? `/api/assignments/lecturer?module_id=${moduleId}`
      : `/api/assignments/student?module_id=${moduleId}`;
    const res = await fetch(endpoint).catch(() => null);
    if (res?.ok) setAssignments(await res.json().catch(() => []));
    setLoading(false);
  }

  useEffect(() => { void loadAssignments(); }, [moduleId, isOwner]); // eslint-disable-line react-hooks/exhaustive-deps

  function openDrawer() { setDrawerOpen(true); document.body.style.overflow = 'hidden'; }
  function closeDrawer() { setDrawerOpen(false); document.body.style.overflow = ''; }
  function resetForm() {
    setTitle(''); setDescription(''); setDueAt(''); setMaxScore(100);
    setBrief(null); setScheme(null); setPreset('standard'); setCustomPrompt(''); setFormError('');
  }

  async function handleSubmit(e: FormEvent) {
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
    form.append('brief', brief);
    form.append('scheme', scheme);
    try {
      const res = await fetch('/api/assignments/lecturer', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setFormError((data as { detail?: string }).detail || 'Failed to create assignment.'); return; }
      setDone(true);
      await loadAssignments();
      setTimeout(() => { closeDrawer(); setDone(false); resetForm(); }, 1000);
    } catch { setFormError('Network error — please try again.'); }
    finally { setBusy(false); }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="size-7 animate-spin text-violet-600" />
    </div>
  );

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-5">
        <p className="text-sm text-zinc-500">
          {isOwner
            ? 'Manage assignments. Click the arrow icon to view student submissions.'
            : 'Download each brief, submit before the deadline, and view AI feedback once graded.'}
        </p>
        {isOwner && (
          <button onClick={openDrawer}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold! text-white hover:bg-violet-700">
            <Plus className="size-4" /> New assignment
          </button>
        )}
      </div>

      {/* Assignment list */}
      {assignments.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-zinc-200 bg-white py-16 text-center shadow-sm">
          <ClipboardList className="size-10 text-zinc-200" />
          <p className="font-semibold text-zinc-700">No assignments yet</p>
          <p className="text-sm text-zinc-500">
            {isOwner ? 'Create your first assignment to get started.' : "Your lecturer hasn't posted any assignments yet."}
          </p>
          {isOwner && (
            <button onClick={openDrawer}
              className="mt-1 flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold! text-white hover:bg-violet-700">
              <Plus className="size-4" /> New assignment
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {assignments.map((a) => (
            <li key={a.id} className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-50">
                <ClipboardList className="size-5 text-violet-600" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-zinc-900">{a.title}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                  <span className="flex items-center gap-1"><Clock className="size-3" /> Due {new Date(a.due_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  {isOwner && <span className="flex items-center gap-1"><Users className="size-3" /> {a.submission_count ?? 0} submissions</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {isOwner
                  ? <StatusBadge dueAt={a.due_at} status={a.status} />
                  : <SubmissionBadge status={a.my_submission_status ?? null} dueAt={a.due_at} />}
                <a
                  href={isOwner
                    ? `/lecturer/modules/${moduleId}/assignments/${a.id}`
                    : `/my-learning/modules/${moduleId}/assignments/${a.id}`}
                  className="flex size-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600 transition hover:bg-violet-600 hover:text-white"
                  title={isOwner ? 'View submissions' : 'View assignment'}
                >
                  <ArrowUpRight className="size-4" />
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={closeDrawer}
      />

      {/* Right drawer */}
      <div className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center gap-3 border-b border-zinc-100 p-5">
          <button onClick={closeDrawer} className="flex size-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50">
            <X className="size-4" />
          </button>
          <div>
            <p className="font-bold text-zinc-900">New assignment</p>
            <p className="text-xs text-zinc-500">Fill in the details and upload files</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {done ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
              <CheckCircle2 className="size-12 text-emerald-500" />
              <p className="text-lg font-bold text-zinc-900">Assignment created!</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6 p-5">
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
      </div>
    </>
  );
}
