'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ApiError, studyMindModulesService } from '@/services/studymind-modules.service';
import { studyMindIdentityService } from '@/services/studymind-identity.service';
import { documentStatus, hasPendingDocuments, validateUpload } from '@/lib/studymind-validation.mjs';
import { EmptyState, ErrorBox, LoadingBlock, StatusBadge } from '@/components/learning/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
const POLL_MS = 5000;

export default function CanonicalModulePage() {
  const { id } = useParams<{ id: string }>();
  const cache = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [visibility, setVisibility] = useState<'class' | 'personal'>('personal');
  const [fileError, setFileError] = useState('');

  const overview = useQuery({ queryKey: ['canonical', 'overview'], queryFn: studyMindIdentityService.overview, retry: false });
  const module = useQuery({ queryKey: ['canonical', 'module', id], queryFn: () => studyMindModulesService.get(id), retry: false });
  const documents = useQuery({
    queryKey: ['canonical', 'documents', id], queryFn: () => studyMindModulesService.documents(id), retry: false,
    refetchInterval: query => (hasPendingDocuments(query.state.data) ? POLL_MS : false),
  });
  const upload = useMutation({
    mutationFn: () => { if (!file) throw new Error('Choose a document'); return studyMindModulesService.upload(id, file, visibility); },
    onSuccess: async () => { setFile(null); await cache.invalidateQueries({ queryKey: ['canonical', 'documents', id] }); },
  });

  const isOwner = !!overview.data && !!module.data && overview.data.user.id === module.data.owner_id;
  const courseId = module.data?.course_code || module.data?.id;
  const authError = module.error instanceof ApiError && module.error.status === 401;

  function pick(next: File | null) {
    setFile(next); upload.reset();
    const check = next ? validateUpload(next) : { ok: true as const };
    setFileError(check.ok ? '' : check.error);
  }
  function submit(e: FormEvent) { e.preventDefault(); if (file && !fileError) upload.mutate(); }

  return <div className="mx-auto max-w-4xl space-y-7 px-5 py-8 sm:py-10">
    <nav aria-label="Breadcrumb" className="text-sm text-zinc-500">
      <Link href="/my-learning" className="text-violet-700 hover:underline">Learning workspace</Link> <span aria-hidden>/</span> <span>{module.data?.title ?? 'Module'}</span>
    </nav>

    {module.isLoading && <LoadingBlock label="Loading module…" />}
    {authError && <ErrorBox message="Your session has expired. Sign in again from the learning workspace." />}
    {module.isError && !authError && <ErrorBox
      message={module.error instanceof ApiError && [403, 404].includes(module.error.status) ? 'This module was not found, or you do not have access to it.' : message(module.error)}
      onRetry={() => module.refetch()} />}

    {module.data && <>
      <header className="space-y-2">
        <h1 className="text-2xl font-bold sm:text-3xl">{module.data.title}</h1>
        {module.data.description && <p className="text-zinc-600">{module.data.description}</p>}
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-md bg-violet-50 px-2 py-1 capitalize text-violet-700">{module.data.access_type}</span>
          <span className="rounded-md bg-zinc-100 px-2 py-1 capitalize text-zinc-600">{module.data.status}</span>
        </div>
        {courseId && <p className="text-sm text-zinc-600">Course ID: <code className="break-all rounded bg-zinc-100 px-1.5 py-0.5 text-xs">{courseId}</code></p>}
      </header>

      <Card>
        <CardHeader><CardTitle>Upload course material</CardTitle><CardDescription>PDFs, slides and notes are indexed so StudyMind AI can answer from them. Maximum 50 MB.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <input aria-label="Document" type="file" required className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-violet-50 file:px-3 file:py-2 file:font-semibold file:text-violet-700" onChange={e => pick(e.target.files?.[0] || null)} />
            {isOwner && <label className="block text-sm font-medium">Visibility
              <select value={visibility} onChange={e => setVisibility(e.target.value as 'personal' | 'class')} className="ml-2 h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm">
                <option value="personal">Personal notes</option><option value="class">Class material</option>
              </select></label>}
            {fileError && <ErrorBox message={fileError} />}
            {upload.isError && <ErrorBox message={message(upload.error)} />}
            {upload.isSuccess && <p role="status" className="text-sm text-green-700">Uploaded. Indexing has started and this list updates automatically.</p>}
            <Button disabled={!file || !!fileError || upload.isPending}>{upload.isPending ? 'Uploading…' : 'Upload document'}</Button>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-3" aria-labelledby="materials">
        <h2 id="materials" className="text-xl font-semibold">Materials</h2>
        {documents.isLoading && <LoadingBlock label="Loading materials…" rows={2} />}
        {documents.isError && <ErrorBox message={message(documents.error)} onRetry={() => documents.refetch()} />}
        {documents.data?.length === 0 && <EmptyState title="No materials yet">Upload a document above to start building this module.</EmptyState>}
        <ul className="space-y-3">
          {documents.data?.map(d => <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white p-4">
            <div className="min-w-0">
              <p className="break-words font-medium">{d.filename || d.original_filename || 'Study material'}</p>
              {d.visibility && <p className="text-xs capitalize text-zinc-500">{d.visibility}</p>}
            </div>
            <StatusBadge status={documentStatus(d)} />
          </li>)}
        </ul>
      </section>
    </>}
  </div>;
}
