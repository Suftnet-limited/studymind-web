'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ApiError, studyMindModulesService } from '@/services/studymind-modules.service';
import { studyMindIdentityService } from '@/services/studymind-identity.service';
import { ALLOWED_EXTENSIONS, documentStatus, roleCapabilities, hasPendingDocuments, validateUpload } from '@/lib/studymind-validation.mjs';
import { BookOpen, CalendarDays, FileText, Files, Upload } from 'lucide-react';
import { CopyButton } from '@/components/learning/copy-button';
import { SideCard, ToolLayout, ToolPanel, btnPrimary } from '@/components/learning/ai/layout';
import { StudyTools } from '@/components/learning/ai/study-tools';
import { EmptyState, ErrorBox, LoadingBlock, StatusBadge } from '@/components/learning/states';
import { cn } from '@/lib/utils';

const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
const POLL_MS = 5000;
// A stable, friendly tint for the module's icon tile (chosen from the title so it does not change between visits).
const TONES = [
  { tile: 'bg-violet-100 text-violet-700' }, { tile: 'bg-emerald-100 text-emerald-700' }, { tile: 'bg-sky-100 text-sky-700' },
  { tile: 'bg-amber-100 text-amber-700' }, { tile: 'bg-rose-100 text-rose-700' },
] as const;
const toneFor = (title: string) => TONES[[...title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TONES.length];
const formatDate = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };

export default function CanonicalModulePage() {
  const { id } = useParams<{ id: string }>();
  const cache = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [visibility, setVisibility] = useState<'class' | 'personal'>('personal');
  const [fileError, setFileError] = useState('');

  const overview = useQuery({ queryKey: ['canonical', 'overview'], queryFn: studyMindIdentityService.overview, retry: false });
  const moduleQuery = useQuery({ queryKey: ['canonical', 'module', id], queryFn: () => studyMindModulesService.get(id), retry: false });
  const documents = useQuery({
    queryKey: ['canonical', 'documents', id], queryFn: () => studyMindModulesService.documents(id), retry: false,
    refetchInterval: query => (hasPendingDocuments(query.state.data) ? POLL_MS : false),
  });
  const upload = useMutation({
    mutationFn: () => { if (!file) throw new Error('Choose a document'); return studyMindModulesService.upload(id, file, visibility); },
    onSuccess: async () => { setFile(null); await cache.invalidateQueries({ queryKey: ['canonical', 'documents', id] }); },
  });

  const canUploadClass = !!overview.data && !!moduleQuery.data && overview.data.user.id === moduleQuery.data.owner_id && roleCapabilities(overview.data.user.role).canUploadClass;
  const isOwner = !!overview.data && !!moduleQuery.data && overview.data.user.id === moduleQuery.data.owner_id;
  // The module UUID is the Course ID for now. Only owners of class modules can share it; personal modules cannot be joined.
  const shareableCourseId = isOwner && moduleQuery.data?.access_type === 'class' ? moduleQuery.data.id : null;
  const docs = documents.data ?? [];
  const indexed = docs.filter(d => documentStatus(d) === 'indexed').length;
  const indexing = docs.filter(d => documentStatus(d) === 'processing').length;
  const authError = moduleQuery.error instanceof ApiError && moduleQuery.error.status === 401;

  function pick(next: File | null) {
    setFile(next); upload.reset();
    const check = next ? validateUpload(next) : { ok: true as const };
    setFileError(check.ok ? '' : check.error);
  }
  function submit(e: FormEvent) { e.preventDefault(); if (file && !fileError) upload.mutate(); }

  const updated = moduleQuery.data ? formatDate(moduleQuery.data.updated_at) : null;
  const tone = moduleQuery.data ? toneFor(moduleQuery.data.title) : TONES[0];

  const documentsPanel = <ToolLayout
    main={<ToolPanel icon={<Files className="size-5" />} title="Materials"
      subtitle={docs.length > 0 ? `${docs.length} ${docs.length === 1 ? 'file' : 'files'} · ${indexed} indexed${indexing > 0 ? ` · ${indexing} indexing…` : ''}` : 'Everything the AI tools can use in this module.'}>
      {documents.isLoading && <LoadingBlock label="Loading materials…" rows={2} />}
      {documents.isError && <ErrorBox message={message(documents.error)} onRetry={() => documents.refetch()} />}
      {documents.data?.length === 0 && <EmptyState title="No materials yet">Upload a document to start building this module.</EmptyState>}
      <ul className="space-y-3">
        {documents.data?.map(d => <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600" aria-hidden><FileText className="size-5" /></span>
            <div className="min-w-0">
              <p className="break-words font-semibold text-[#111034]">{d.filename || d.original_filename || 'Study material'}</p>
              {d.visibility && <p className="text-xs text-zinc-500">{d.visibility === 'personal' ? 'Personal note · only you can see it' : 'Class material · visible to the class'}</p>}
              {documentStatus(d) === 'failed' && <p className="mt-1 text-xs text-red-700">We could not index this file. Check that it is a readable, unprotected document, then upload it again.</p>}
            </div>
          </div>
          <StatusBadge status={documentStatus(d)} />
        </li>)}
      </ul>
    </ToolPanel>}
    side={<SideCard title="Upload course material" icon={<Upload className="size-4" />}>
      <p className="mb-4 text-sm leading-6 text-zinc-500">PDFs, slides and notes are indexed so StudyMind AI can answer from them. Accepted: PDF, DOCX, TXT, MD, CSV. Maximum 50 MB.</p>
      <form onSubmit={submit} className="space-y-4">
        <input aria-label="Document" type="file" required accept={ALLOWED_EXTENSIONS.join(',')} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-violet-50 file:px-3 file:py-2 file:font-semibold file:text-violet-700"
          onChange={e => pick(e.target.files?.[0] ?? null)} />
        {canUploadClass && <label className="block text-sm font-medium">Visibility
          <select value={visibility} onChange={e => setVisibility(e.target.value as 'personal' | 'class')} className="mt-1.5 block h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm">
            <option value="personal">Personal notes</option><option value="class">Class material</option>
          </select></label>}
        {fileError && <ErrorBox message={fileError} />}
        {upload.isError && <ErrorBox message={message(upload.error)} />}
        {upload.isSuccess && (documentStatus(upload.data) === 'failed'
          ? <p role="alert" className="text-sm text-red-700">The file was uploaded but could not be indexed. Check that it is readable and not password-protected, then try again.</p>
          : documentStatus(upload.data) === 'indexed'
            ? <p role="status" className="text-sm text-green-700">Uploaded and indexed. It is ready to use.</p>
            : <p role="status" className="text-sm text-green-700">Uploaded. Indexing has started and this list updates automatically.</p>)}
        <button type="submit" className={cn(btnPrimary, 'w-full')} disabled={!file || !!fileError || upload.isPending}>{upload.isPending ? 'Uploading…' : 'Upload document'}</button>
      </form>
    </SideCard>} />;

  return <div className="mx-auto max-w-6xl space-y-6 px-5 py-8 sm:py-10">
    <Link href="/my-learning" className="inline-flex items-center gap-1.5 text-sm font-semibold text-violet-700 hover:underline"><span aria-hidden>←</span> Back to learning workspace</Link>

    {moduleQuery.isLoading && <LoadingBlock label="Loading module…" />}
    {authError && <ErrorBox message="Your session has expired. Sign in again from the learning workspace." />}
    {moduleQuery.isError && !authError && <ErrorBox
      message={moduleQuery.error instanceof ApiError && [403, 404].includes(moduleQuery.error.status) ? 'This module was not found, or you do not have access to it.' : message(moduleQuery.error)}
      onRetry={() => moduleQuery.refetch()} />}

    {moduleQuery.data && <>
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
        <div className="flex min-w-0 items-center gap-4">
          <span className={cn('flex size-16 shrink-0 items-center justify-center rounded-2xl sm:size-[72px]', tone.tile)} aria-hidden><BookOpen className="size-8" /></span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="break-words text-3xl font-extrabold tracking-tight text-[#111034] sm:text-4xl">{moduleQuery.data.title}</h1>
              {moduleQuery.data.course_code && <span className="rounded-full bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-700">{moduleQuery.data.course_code}</span>}
            </div>
            <p className="mt-1.5 text-zinc-600">{moduleQuery.data.description || (moduleQuery.data.access_type === 'class' ? 'Class module' : 'Personal module')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-zinc-600">
          <span className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">{moduleQuery.data.access_type === 'class' ? 'Class' : 'Personal'}</span>
            {overview.data && <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-600">{isOwner ? 'Owned' : 'Enrolled'}</span>}
            {moduleQuery.data.status !== 'active' && <span className="rounded-full bg-amber-50 px-2.5 py-1 capitalize text-amber-700">{moduleQuery.data.status}</span>}
          </span>
          {updated && <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4 text-zinc-400" aria-hidden />Updated {updated}</span>}
          {documents.data && <span className="inline-flex items-center gap-1.5"><Files className="size-4 text-zinc-400" aria-hidden />{docs.length} {docs.length === 1 ? 'material' : 'materials'}</span>}
        </div>
      </header>

      {shareableCourseId && <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-violet-200 bg-violet-50/50 px-5 py-4">
        <p className="text-sm font-bold text-[#111034]">Course ID</p>
        <code data-testid="course-id" className="break-all rounded-lg bg-white px-2.5 py-1 text-xs ring-1 ring-zinc-200">{shareableCourseId}</code>
        <CopyButton value={shareableCourseId} label="Copy Course ID" />
        <p className="w-full text-xs text-zinc-600">Share this with your students. They paste it into <em>Join a course</em> in their learning workspace.</p>
      </div>}

      <StudyTools moduleId={id} hasMaterials={indexed > 0} documents={documentsPanel} />
    </>}
  </div>;
}
