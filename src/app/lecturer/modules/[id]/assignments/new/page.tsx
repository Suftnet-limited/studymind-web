'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Upload, X, FileText, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

interface Props { params: Promise<{ id: string }> }

function FilePicker({ label, hint, name, file, onFile, onClear }: {
  label: string; hint: string; name: string;
  file: File | null; onFile: (f: File) => void; onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-zinc-700">{label}</p>
      <p className="mb-2 text-xs text-zinc-500">{hint}</p>
      {file ? (
        <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
          <FileText className="size-5 shrink-0 text-violet-600" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800">{file.name}</span>
          <button onClick={onClear} className="shrink-0 text-zinc-400 hover:text-zinc-700"><X className="size-4" /></button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-zinc-200 py-8 text-sm text-zinc-500 transition hover:border-violet-400 hover:text-violet-600"
        >
          <Upload className="size-6" />
          Click to upload PDF or Word file
          <input ref={ref} type="file" name={name} accept=".pdf,.docx,.doc" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
        </button>
      )}
    </div>
  );
}

export default function NewAssignmentPage({ params }: Props) {
  const router = useRouter();
  const [moduleId, setModuleId] = useState('');
  const [brief, setBrief] = useState<File | null>(null);
  const [scheme, setScheme] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Resolve module ID from params
  if (!moduleId) { params.then(p => setModuleId(p.id)); }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!brief || !scheme) { setError('Please upload both the assignment brief and marking scheme.'); return; }
    setError('');
    setBusy(true);

    const form = new FormData(e.currentTarget);
    form.set('module_id', moduleId);
    form.set('brief', brief);
    form.set('scheme', scheme);

    try {
      const res = await fetch('/api/assignments/lecturer', { method: 'POST', body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { detail?: string }).detail || 'Failed to create assignment.');
        return;
      }
      router.push(`/lecturer/modules/${moduleId}/assignments`);
      router.refresh();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-5 py-10">
      {moduleId && (
        <Link href={`/lecturer/modules/${moduleId}/assignments`} className="text-sm font-semibold text-violet-700 hover:underline">
          ← Assignments
        </Link>
      )}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-violet-600">New assignment</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">Create assignment</h1>
        <p className="mt-1 text-sm text-zinc-500">Upload the assignment brief students will see and a private marking scheme the AI uses for grading.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card>
          <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <label className="block text-sm font-semibold text-zinc-700">
              Title <span className="text-red-500">*</span>
              <input name="title" required maxLength={255} placeholder="e.g. Essay 1 — Literature Review"
                className="mt-1 block w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none" />
            </label>
            <label className="block text-sm font-semibold text-zinc-700">
              Description
              <textarea name="description" rows={3} placeholder="Brief overview for students (optional)"
                className="mt-1 block w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none" />
            </label>
            <label className="block text-sm font-semibold text-zinc-700">
              Deadline <span className="text-red-500">*</span>
              <input name="due_at" type="datetime-local" required
                className="mt-1 block w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none" />
            </label>
            <label className="block text-sm font-semibold text-zinc-700">
              Maximum score (%)
              <input name="max_score" type="number" min={1} max={100} defaultValue={100}
                className="mt-1 block w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none" />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Files</CardTitle>
            <CardDescription>Both files are stored privately. Students only see the brief.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <FilePicker
              label="Assignment brief *"
              hint="PDF or Word file — visible to students for download."
              name="brief"
              file={brief}
              onFile={setBrief}
              onClear={() => setBrief(null)}
            />
            <FilePicker
              label="Marking scheme *"
              hint="PDF or Word file — private, used only by the AI grader."
              name="scheme"
              file={scheme}
              onFile={setScheme}
              onClear={() => setScheme(null)}
            />
          </CardContent>
        </Card>

        {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}

        <div className="flex justify-end gap-3">
          {moduleId && (
            <Link href={`/lecturer/modules/${moduleId}/assignments`}
              className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50">
              Cancel
            </Link>
          )}
          <button type="submit" disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? 'Creating…' : 'Create assignment'}
          </button>
        </div>
      </form>
    </div>
  );
}
