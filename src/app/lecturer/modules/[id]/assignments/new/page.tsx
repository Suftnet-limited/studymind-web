'use client';
import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Upload, FileText, X, Loader2, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeading } from '@/components/ui/page-heading';

const GRADING_PRESETS = [
  {
    id: 'standard',
    label: '📋 Standard grading',
    description: 'Grade against all criteria in the marking scheme equally.',
    prompt: 'Grade this submission against all criteria in the marking scheme, applying each criterion with equal weight.',
  },
  {
    id: 'critical',
    label: '🧠 Critical thinking',
    description: 'Prioritise argument depth and evidence of original analysis.',
    prompt: 'Prioritise depth of critical analysis, strength of argument, and evidence of original thinking. Surface-level coverage of topics should be penalised.',
  },
  {
    id: 'referencing',
    label: '📚 Strict on referencing',
    description: 'Penalise missing or poorly formatted citations heavily.',
    prompt: 'Apply strict penalties for missing, incorrect, or poorly formatted citations and references. Proper academic referencing is weighted heavily in this assessment.',
  },
  {
    id: 'stem',
    label: '⚗️ STEM / Technical',
    description: 'Focus on accuracy, methodology and logical reasoning.',
    prompt: 'Focus on technical accuracy, correctness of methodology, logical reasoning, and appropriate use of evidence. Penalise calculation errors and unsupported claims.',
  },
  {
    id: 'creative',
    label: '🎨 Creative work',
    description: 'Reward originality and creative approach.',
    prompt: 'Reward originality, creativity, and unique approaches. Apply the marking scheme flexibly — the spirit of the criteria matters more than rigid compliance.',
  },
  {
    id: 'applied',
    label: '🏭 Practical / Applied',
    description: 'Emphasise real-world application and practical reasoning.',
    prompt: 'Emphasise real-world application, practical reasoning, and the ability to connect theory to practice. Reward concrete examples over abstract discussion.',
  },
] as const;

type PresetId = typeof GRADING_PRESETS[number]['id'];

function FilePicker({
  label,
  hint,
  file,
  onFile,
}: {
  label: string;
  hint: string;
  file: File | null;
  onFile: (f: File | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-zinc-900">{label}</p>
      <p className="mb-3 text-xs text-zinc-500">{hint}</p>
      {file ? (
        <div className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
          <FileText className="size-5 shrink-0 text-violet-600" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800">{file.name}</span>
          <button onClick={() => onFile(null)} type="button" className="text-zinc-400 hover:text-zinc-700">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-zinc-200 py-8 text-sm text-zinc-500 transition hover:border-violet-400 hover:bg-violet-50 hover:text-violet-600"
        >
          <Upload className="size-5" />
          Click to select file (PDF or Word)
          <input
            ref={ref}
            type="file"
            accept=".pdf,.docx,.doc"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }}
          />
        </button>
      )}
    </div>
  );
}

export default function NewAssignmentPage() {
  const params = useParams();
  const router = useRouter();
  const [moduleId, setModuleId] = useState('');

  useEffect(() => {
    const id = params?.id;
    if (typeof id === 'string') setModuleId(id);
    else if (id instanceof Promise) void id.then(setModuleId);
  }, [params]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [maxScore, setMaxScore] = useState(100);
  const [brief, setBrief] = useState<File | null>(null);
  const [scheme, setScheme] = useState<File | null>(null);
  const [preset, setPreset] = useState<PresetId>('standard');
  const [customPrompt, setCustomPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!brief || !scheme) { setError('Please upload both the assignment brief and marking scheme.'); return; }
    if (!moduleId) { setError('Module ID missing.'); return; }
    setError('');
    setBusy(true);

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
      if (!res.ok) { setError((data as { detail?: string }).detail || 'Failed to create assignment.'); return; }
      setDone(true);
      setTimeout(() => router.push(`/lecturer/modules/${moduleId}/assignments`), 1200);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <CheckCircle2 className="size-12 text-emerald-500" />
        <p className="text-lg font-bold text-zinc-900">Assignment created!</p>
        <p className="text-sm text-zinc-500">Redirecting to assignments list…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-5 py-10">
      <Link href={`/lecturer/modules/${moduleId}/assignments`} className="text-sm font-semibold text-violet-700 hover:underline">
        ← Assignments
      </Link>

      <PageHeading eyebrow="Assignments" title="New assignment" description="Upload a brief and marking scheme, choose how the AI should grade submissions, and set a deadline." />

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assignment details</CardTitle>
            <CardDescription>Basic information students will see.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-zinc-900">Title</label>
              <input
                type="text" required value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Essay: Ethics in Artificial Intelligence"
                className="block w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 focus:border-violet-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-zinc-900">Description <span className="font-normal text-zinc-400">(optional)</span></label>
              <textarea
                value={description} onChange={e => setDescription(e.target.value)} rows={3}
                placeholder="Brief summary visible to students alongside the title."
                className="block w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 focus:border-violet-500 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-zinc-900">Due date & time</label>
                <input
                  type="datetime-local" required value={dueAt} onChange={e => setDueAt(e.target.value)}
                  className="block w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 focus:border-violet-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-zinc-900">Max score</label>
                <input
                  type="number" min={1} max={100} required value={maxScore}
                  onChange={e => setMaxScore(Number(e.target.value))}
                  className="block w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 focus:border-violet-500 focus:outline-none"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Files */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assignment files</CardTitle>
            <CardDescription>The brief is shared with students. The marking scheme is private — only the AI grader sees it.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <FilePicker
              label="Assignment brief"
              hint="Students will download this to understand what to submit."
              file={brief}
              onFile={setBrief}
            />
            <FilePicker
              label="Marking scheme (private)"
              hint="Used by the AI grader only. Never shared with students."
              file={scheme}
              onFile={setScheme}
            />
          </CardContent>
        </Card>

        {/* Grading focus */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Grading focus</CardTitle>
            <CardDescription>Tell the AI how to approach grading this assignment. Pick the best fit, then add any extra instructions below.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {GRADING_PRESETS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPreset(p.id)}
                  className={`flex flex-col items-start rounded-xl border-2 p-4 text-left transition ${
                    preset === p.id
                      ? 'border-violet-500 bg-violet-50'
                      : 'border-zinc-200 bg-white hover:border-violet-300 hover:bg-violet-50/50'
                  }`}
                >
                  <span className="text-sm font-bold text-zinc-900">{p.label}</span>
                  <span className="mt-1 text-xs leading-relaxed text-zinc-500">{p.description}</span>
                </button>
              ))}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-zinc-900">
                Additional instructions <span className="font-normal text-zinc-400">(optional)</span>
              </label>
              <textarea
                value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} rows={3}
                placeholder="e.g. Award extra credit for discussion of recent 2026 AI legislation. Focus heavily on the conclusion section."
                className="block w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 focus:border-violet-500 focus:outline-none"
              />
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? 'Creating…' : 'Create assignment'}
          </button>
        </div>
      </form>
    </div>
  );
}
