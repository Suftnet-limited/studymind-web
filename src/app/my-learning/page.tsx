'use client';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { studyMindIdentityService } from '@/services/studymind-identity.service';
import { ApiError, studyMindModulesService, type CanonicalModule } from '@/services/studymind-modules.service';
import { roleCapabilities } from '@/lib/studymind-validation.mjs';
import { EmptyState, ErrorBox, LoadingBlock } from '@/components/learning/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

function SignIn() {
  const cache = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: () => studyMindIdentityService.login(email, password),
    onSuccess: async () => { setPassword(''); await cache.invalidateQueries({ queryKey: ['canonical'] }); },
  });
  function submit(e: FormEvent) { e.preventDefault(); login.mutate(); }
  return <Card className="mx-auto w-full max-w-md">
    <CardHeader>
      <CardTitle>Sign in to your learning workspace</CardTitle>
      <CardDescription>Use the StudyMind account you already use on Mobile. New here? <Link href="/my-learning/register" className="font-semibold text-violet-700 underline">Create an account</Link></CardDescription>
    </CardHeader>
    <CardContent>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-medium">Email
          <Input className="mt-1" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        <label className="block text-sm font-medium">Password
          <Input className="mt-1" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        {login.isError && <ErrorBox message={message(login.error)} />}
        <Button className="w-full" disabled={login.isPending}>{login.isPending ? 'Signing in…' : 'Sign in'}</Button>
      </form>
    </CardContent>
  </Card>;
}

function CreateModule({ canCreateClass }: { canCreateClass: boolean }) {
  const cache = useQueryClient();
  const [title, setTitle] = useState('');
  const [accessType, setAccessType] = useState<'personal' | 'class'>('personal');
  const create = useMutation({
    mutationFn: () => studyMindModulesService.create(title.trim(), canCreateClass ? accessType : 'personal'),
    onSuccess: async () => { setTitle(''); await cache.invalidateQueries({ queryKey: ['canonical'] }); },
  });
  return <Card className="border-violet-200 bg-violet-50/40">
    <CardHeader><CardTitle>Create a module</CardTitle><CardDescription>{canCreateClass ? 'Create a class module for your students, or a personal one for your own notes.' : 'Start a personal space for your own notes and materials.'}</CardDescription></CardHeader>
    <CardContent>
      <form className="flex flex-wrap gap-3" onSubmit={e => { e.preventDefault(); create.mutate(); }}>
        <Input aria-label="Module title" className="min-w-48 flex-1" placeholder="e.g. Organic Chemistry" minLength={2} maxLength={255} required value={title} onChange={e => setTitle(e.target.value)} />
        {canCreateClass && <select aria-label="Access type" className="h-11 rounded-lg border border-zinc-200 bg-white px-3 text-sm" value={accessType} onChange={e => setAccessType(e.target.value as 'personal' | 'class')}>
          <option value="personal">Personal</option><option value="class">Class</option>
        </select>}
        <Button disabled={create.isPending || title.trim().length < 2}>{create.isPending ? 'Creating…' : 'Create module'}</Button>
      </form>
      {create.isError && <div className="mt-3"><ErrorBox message={message(create.error)} /></div>}
    </CardContent>
  </Card>;
}

function JoinCourse() {
  const cache = useQueryClient();
  const [courseId, setCourseId] = useState('');
  const join = useMutation({
    mutationFn: () => studyMindModulesService.join(courseId.trim()),
    onSuccess: async () => { setCourseId(''); await cache.invalidateQueries({ queryKey: ['canonical'] }); },
  });
  return <Card>
    <CardHeader><CardTitle>Join a course</CardTitle><CardDescription>Paste the Course ID your lecturer shared with you.</CardDescription></CardHeader>
    <CardContent>
      <form className="flex flex-wrap gap-3" onSubmit={e => { e.preventDefault(); join.mutate(); }}>
        <Input aria-label="Course ID" className="min-w-48 flex-1" placeholder="Course ID" required maxLength={64} autoComplete="off" spellCheck={false} value={courseId} onChange={e => { setCourseId(e.target.value); if (join.isError || join.isSuccess) join.reset(); }} />
        <Button variant="secondary" disabled={join.isPending || courseId.trim().length < 3}>{join.isPending ? 'Joining…' : 'Join course'}</Button>
      </form>
      {join.isError && <div className="mt-3"><ErrorBox message={message(join.error)} /></div>}
      {join.isSuccess && <p role="status" className="mt-3 text-sm text-green-700">You have joined the course. It now appears under Enrolled modules.</p>}
    </CardContent>
  </Card>;
}

function ModuleCard({ module, owned }: { module: CanonicalModule; owned: boolean }) {
  return <Link href={`/my-learning/modules/${module.id}`} className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
    <Card className="h-full transition group-hover:border-violet-300 group-hover:shadow-md">
      <CardHeader>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-md bg-violet-50 px-2 py-1 text-violet-700">{module.access_type === 'class' ? 'Class' : 'Personal'}</span>
          {module.status !== 'active' && <span className="rounded-md bg-amber-50 px-2 py-1 capitalize text-amber-700">{module.status}</span>}
        </div>
        <CardTitle className="break-words pt-1">{module.title}</CardTitle>
        {module.description && <CardDescription className="line-clamp-2">{module.description}</CardDescription>}
      </CardHeader>
      <CardContent><span className="text-sm font-semibold text-violet-700 group-hover:underline">{owned ? 'Manage module' : 'Open module'} →</span></CardContent>
    </Card>
  </Link>;
}

function ModuleSection({ id, title, count, owned, modules, empty }: {
  id: string; title: string; count: number; owned: boolean; modules: CanonicalModule[]; empty: string;
}) {
  return <section className="space-y-4" aria-labelledby={id}>
    <h2 id={id} className="flex items-center gap-2 text-xl font-semibold">{title}<span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600" aria-label={`${count} modules`}>{count}</span></h2>
    {modules.length === 0
      ? <EmptyState title={`No ${title.toLowerCase()} yet`}>{empty}</EmptyState>
      : <ul className="grid gap-4 sm:grid-cols-2">{modules.map(m => <li key={m.id}><ModuleCard module={m} owned={owned} /></li>)}</ul>}
  </section>;
}

export default function MyLearningPage() {
  const cache = useQueryClient();
  const overview = useQuery({
    queryKey: ['canonical', 'overview'], queryFn: studyMindIdentityService.overview,
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1,
  });
  const modules = useQuery({ queryKey: ['canonical', 'modules'], queryFn: studyMindModulesService.list, enabled: overview.isSuccess, retry: false });
  const logout = useMutation({
    mutationFn: studyMindIdentityService.logout,
    onSuccess: async () => { cache.removeQueries({ queryKey: ['canonical'] }); await cache.invalidateQueries({ queryKey: ['canonical'] }); },
  });
  const signedOut = overview.error instanceof ApiError && overview.error.status === 401;
  const user = overview.data?.user;
  const caps = roleCapabilities(user?.role ?? '');
  const owned = (modules.data ?? []).filter(m => m.owner_id === user?.id);
  const enrolled = (modules.data ?? []).filter(m => m.owner_id !== user?.id);

  return <div className="mx-auto max-w-4xl space-y-7 px-5 py-8 sm:py-10">
    <header>
      <p className="text-sm font-semibold text-violet-700">StudyMind AI</p>
      <h1 className="text-2xl font-bold sm:text-3xl">Learning workspace</h1>
      <p className="mt-2 text-zinc-600">Your modules, shared with the StudyMind account you use on Mobile.</p>
    </header>

    {overview.isLoading && <LoadingBlock label="Loading your learning workspace…" />}
    {signedOut && <SignIn />}
    {overview.isError && !signedOut && <ErrorBox message={message(overview.error)} onRetry={() => overview.refetch()} />}

    {overview.data && user && <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4">
        <div>
          <p className="text-sm">Signed in as <strong>{user.full_name}</strong> <span className="text-zinc-500">({user.role.replace('_', ' ')})</span></p>
          <p className="mt-1 text-xs text-zinc-500">{overview.data.modules.owned} owned · {overview.data.modules.enrolled} enrolled</p>
        </div>
        <Button variant="outline" size="sm" disabled={logout.isPending} onClick={() => logout.mutate()}>Sign out</Button>
      </div>

      {(caps.canCreatePersonal || caps.canJoin) && <div className="grid gap-4 md:grid-cols-2">
        {caps.canCreatePersonal && <CreateModule canCreateClass={caps.canCreateClass} />}
        {caps.canJoin && <JoinCourse />}
      </div>}

      {modules.isLoading && <LoadingBlock label="Loading modules…" rows={2} />}
      {modules.isError && <ErrorBox message={message(modules.error)} onRetry={() => modules.refetch()} />}
      {modules.data && <>
        {(caps.canCreatePersonal || owned.length > 0) && <ModuleSection id="owned-modules" title="Owned modules" count={owned.length} owned modules={owned}
          empty="Modules you create appear here. Use Create a module above to start one." />}
        {(caps.canJoin || enrolled.length > 0) && <ModuleSection id="enrolled-modules" title="Enrolled modules" count={enrolled.length} owned={false} modules={enrolled}
          empty="Courses you join appear here. Paste a Course ID above to join one." />}
      </>}
    </>}
  </div>;
}
