'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

async function data<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result as T;
}
type Module = { id: string; title: string; description: string | null; access_type: string; status: string; course_code: string | null };
type Document = { id: string; filename?: string; original_filename?: string; visibility?: string; chunk_count?: number };
export default function CanonicalModulePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const cache = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [visibility, setVisibility] = useState<'class'|'personal'>('personal');
  const module = useQuery({ queryKey: ['canonical', 'module', id], queryFn: async () => data<Module>(await fetch(`/api/studymind/modules/${encodeURIComponent(id)}`, { cache: 'no-store' })) });
  const documents = useQuery({ queryKey: ['canonical', 'documents', id], queryFn: async () => data<Document[]>(await fetch(`/api/studymind/modules/${encodeURIComponent(id)}/documents`, { cache: 'no-store' })) });
  const upload = useMutation({ mutationFn: async () => {
    if (!file) throw new Error('Choose a document');
    const form = new FormData(); form.set('file', file); form.set('visibility', visibility);
    return data<unknown>(await fetch(`/api/studymind/modules/${encodeURIComponent(id)}/documents`, { method: 'POST', body: form }));
  }, onSuccess: async () => { setFile(null); await cache.invalidateQueries({ queryKey: ['canonical', 'documents', id] }); } });
  function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); upload.mutate(); }
  return <main className="mx-auto max-w-4xl space-y-7 px-5 py-10">
    <Link href="/my-learning" className="text-sm text-violet-700 underline">Back to My Learning</Link>
    {module.isLoading && <p>Loading module…</p>}
    {module.isError && <p role="alert">{module.error.message}</p>}
    {module.data && <header><h1 className="text-3xl font-bold">{module.data.title}</h1><p className="mt-2 text-zinc-600">{module.data.description}</p><p className="mt-2 text-sm">{module.data.access_type} · {module.data.status}</p></header>}
    {module.data && <form onSubmit={submit} className="space-y-3 rounded-xl border p-5">
      <h2 className="font-semibold">Upload course material</h2>
      <input type="file" required onChange={e=>setFile(e.target.files?.[0] || null)} />
      <label className="block text-sm">Visibility <select value={visibility} onChange={e=>setVisibility(e.target.value as 'personal'|'class')} className="ml-2 rounded border p-2"><option value="personal">Personal notes</option><option value="class">Class material (owners only)</option></select></label>
      <button disabled={!file || upload.isPending} className="rounded bg-violet-700 px-4 py-2 text-white">{upload.isPending ? 'Uploading…' : 'Upload document'}</button>
      {upload.isError && <p role="alert" className="text-sm text-red-700">{upload.error.message}</p>}
      {upload.isSuccess && <p role="status" className="text-sm text-green-700">Document submitted for indexing. It appears when indexing completes.</p>}
    </form>}
    <section className="space-y-3"><h2 className="text-xl font-semibold">Indexed materials</h2>
      {documents.isLoading && <p>Loading documents…</p>}
      {documents.isError && <p role="alert">{documents.error.message}</p>}
      {documents.data?.length === 0 && <p>No indexed materials yet.</p>}
      {documents.data?.map(d=><div key={d.id} className="rounded-xl border p-4"><p className="font-medium">{d.filename || d.original_filename || 'Study material'}</p><p className="text-xs text-zinc-500">{d.visibility || 'Course document'}</p></div>)}
    </section>
  </main>;
}
