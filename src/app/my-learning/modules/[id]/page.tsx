'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ApiError, studyMindModulesService } from '@/services/studymind-modules.service';
import { studyMindIdentityService } from '@/services/studymind-identity.service';
import { ALLOWED_EXTENSIONS, documentStatus, roleCapabilities, hasPendingDocuments, validateUpload } from '@/lib/studymind-validation.mjs';
import { CopyButton } from '@/components/learning/copy-button';
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

  const canUploadClass = !!overview.data && !!module.data && overview.data.user.id === module.data.owner_id && roleCapabilities(overview.data.user.role).canUploadClass;
  const isOwner = !!overview.data && !!module.data && overview.data.user.id === module.data.owner_id;
  // The module UUID is the Course ID for now. Only owners of class modules can share it; personal modules cannot be joined.
  const shareableCourseId = isOwner && module.data?.access_type === 'class' ? module.data.id : null;
  const docs = documents.data ?? [];
  const indexed = docs.filter(d => documentStatus(d) === 'indexed').length;
  const indexing = docs.filter(d => documentStatus(d) === 'processing').length;
  const authError = module.error instanceof ApiError && module.error.status === 401;

  function pick(next: File | null) {
    setFile(next); upload.reset();
    const check = next ? validateUpload(next) : { ok: true as const };
    setFileError(check.ok ? '' : check.error);
  }
  function submit(e: FormEvent) { e.preventDefault(); if (file && !fileError) upload.mutate(); }

  return <div className="mx-auto max-w-4xl space-y-7 px-5 py-8 sm:py-10">
    <Link href="/my-learning" className="inline-flex items-center gap-1 text-sm font-semibold text-violet-700 hover:underline"><span aria-hidden>←</span> Back to learning workspace</Link>

    {module.isLoading && <LoadingBlock label="Loading module…" />}
    {authError && <ErrorBox message="Your session has expired. Sign in again from the learning workspace." />}
    {module.isError && !authError && <ErrorBox
      message={module.error instanceof ApiError && [403, 404].includes(module.error.status) ? 'This module was not found, or you do not have access to it.' : message(module.error)}
      onRetry={() => module.refetch()} />}

    {module.data && <>
      <header className="space-y-3">
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-md bg-violet-50 px-2 py-1 text-violet-700">{module.data.access_type === 'class' ? 'Class' : 'Personal'}</span>
          {overview.data && <span className="rounded-md bg-zinc-100 px-2 py-1 text-zinc-600">{isOwner ? 'Owned' : 'Enrolled'}</span>}
          {module.data.status !== 'active' && <span className="rounded-md bg-amber-50 px-2 py-1 capitalize text-amber-700">{module.data.status}</span>}
        </div>
        <h1 className="break-words text-2xl font-bold sm:text-3xl">{module.data.title}</h1>
        {module.data.description && <p className="text-zinc-600">{module.data.description}</p>}
        {shareableCourseId && <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
          <p className="text-sm font-semibold">Course ID</p>
          <div className="flex flex-wrap items-center gap-3">
            <code data-testid="course-id" className="break-all rounded bg-white px-2 py-1 text-xs ring-1 ring-zinc-200">{shareableCourseId}</code>
            <CopyButton value={shareableCourseId} label="Copy Course ID" />
          </div>
          <p className="text-xs text-zinc-600">Share this with your students. They paste it into <em>Join a course</em> in their learning workspace.</p>
        </div>}
      </header>

      <Card>
        <CardHeader><CardTitle>Study tools</CardTitle><CardDescription>Chat, quizzes, flashcards and summaries use the materials in this module.</CardDescription></CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-600">They are available in the StudyMind Mobile app today and are not part of the Web workspace yet. Your uploaded materials are shared with Mobile automatically.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Upload course material</CardTitle><CardDescription>PDFs, slides and notes are indexed so StudyMind AI can answer from them. Accepted: PDF, DOCX, TXT, MD, CSV. Maximum 50 MB.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <input aria-label="Document" type="file" required accept={ALLOWED_EXTENSIONS.join(',')} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-violet-50 file:px-3 file:py-2 file:font-semibold file:text-violet-700" onChange={e => pick(e.target.files?.[0] || null)} />
            {canUploadClass && <label className="block text-sm font-medium">Visibility
              <select value={visibility} onChange={e => setVisibility(e.target.value as 'personal' | 'class')} className="ml-2 h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm">
                <option value="personal">Personal notes</option><option value="class">Class material</option>
              </select></label>}
            {fileError && <ErrorBox message={fileError} />}
            {upload.isError && <ErrorBox message={message(upload.error)} />}
            {upload.isSuccess && (documentStatus(upload.data) === 'failed'
              ? <p role="alert" className="text-sm text-red-700">The file was uploaded but could not be indexed. Check that it is readable and not password-protected, then try again.</p>
              : documentStatus(upload.data) === 'indexed'
                ? <p role="status" className="text-sm text-green-700">Uploaded and indexed. It is ready to use.</p>
                : <p role="status" className="text-sm text-green-700">Uploaded. Indexing has started and this list updates automatically.</p>)}
            <Button disabled={!file || !!fileError || upload.isPending}>{upload.isPending ? 'Uploading…' : 'Upload document'}</Button>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-3" aria-labelledby="materials">
        <h2 id="materials" className="text-xl font-semibold">Materials</h2>
        {docs.length > 0 && <p className="text-sm text-zinc-600">{docs.length} {docs.length === 1 ? 'file' : 'files'} · {indexed} indexed{indexing > 0 && <> · {indexing} indexing…</>}</p>}
        {documents.isLoading && <LoadingBlock label="Loading materials…" rows={2} />}
        {documents.isError && <ErrorBox message={message(documents.error)} onRetry={() => documents.refetch()} />}
        {documents.data?.length === 0 && <EmptyState title="No materials yet">Upload a document above to start building this module.</EmptyState>}
        <ul className="space-y-3">
          {documents.data?.map(d => <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white p-4">
            <div className="min-w-0">
              <p className="break-words font-medium">{d.filename || d.original_filename || 'Study material'}</p>
              {d.visibility && <p className="text-xs text-zinc-500">{d.visibility === 'personal' ? 'Personal note · only you can see it' : 'Class material · visible to the class'}</p>}
              {documentStatus(d) === 'failed' && <p className="mt-1 text-xs text-red-700">We could not index this file. Check that it is a readable, unprotected document, then upload it again.</p>}
            </div>
            <StatusBadge status={documentStatus(d)} />
          </li>)}
        </ul>
      </section>
    </>}
  </div>;
}
