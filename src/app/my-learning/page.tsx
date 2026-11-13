'use client';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { studyMindIdentityService } from '@/services/studymind-identity.service';
import { ApiError, studyMindModulesService, type CanonicalModule } from '@/services/studymind-modules.service';
import { roleCapabilities } from '@/lib/studymind-validation.mjs';
import { ErrorBox, LoadingBlock } from '@/components/learning/states';
import { CreateModule, CreateModuleDialog, JoinCourse, ModuleTable, StatTiles, statIcons, type Stat } from '@/components/learning/dashboard';
import { dashboardStats } from '@/lib/dashboard.mjs';
import { Mail, Lock } from 'lucide-react';
import { AuthShell } from '@/components/auth/auth-shell';
import { AuthError, AuthField, AuthSubmit } from '@/components/auth/auth-field';

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
  return <AuthShell>
    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1>
    <p className="mt-1.5 text-sm text-slate-500">Sign in to your StudyMind account. It is the same account you use on Mobile.</p>
    <form onSubmit={submit} className="mt-7" noValidate={false}>
      {login.isError && <AuthError message={message(login.error)} />}
      <div className="space-y-3">
        <AuthField label="Email" type="email" icon={<Mail className="size-4" />} placeholder="name@example.com" autoComplete="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)} />
        <AuthField label="Password" type="password" icon={<Lock className="size-4" />} placeholder="Enter your password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
      </div>
      <AuthSubmit busy={login.isPending} busyText="Signing in…" disabled={!email || !password}>Sign in</AuthSubmit>
    </form>
    <div className="mt-6 flex items-center gap-3"><div className="h-px flex-1 bg-zinc-100" /><span className="text-xs text-slate-400">or</span><div className="h-px flex-1 bg-zinc-100" /></div>
    <p className="mt-5 text-center text-sm text-slate-500">New to StudyMind?{' '}<Link href="/my-learning/register" className="font-semibold text-violet-700 hover:underline">Create an account</Link></p>
    <p className="mt-6 text-center text-xs text-slate-400">Have an older StudyMind Web account? <Link href="/sign-in" className="font-semibold text-violet-700 underline">Sign in with it here</Link></p>
  </AuthShell>;
}

export default function MyLearningPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const overview = useQuery({
    queryKey: ['canonical', 'overview'], queryFn: studyMindIdentityService.overview,
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1,
  });
  const modules = useQuery({ queryKey: ['canonical', 'modules'], queryFn: studyMindModulesService.list, enabled: overview.isSuccess, retry: false });
  const signedOut = overview.error instanceof ApiError && overview.error.status === 401;
  const user = overview.data?.user;
  const caps = roleCapabilities(user?.role ?? '');
  const owned = (modules.data ?? []).filter(m => m.owner_id === user?.id);
  const enrolled = (modules.data ?? []).filter(m => m.owner_id !== user?.id);

  const all = (modules.data ?? []).map(m => ({ ...m, owned: m.owner_id === user?.id }));
  const stats = dashboardStats(owned, enrolled);
  const tiles: Stat[] = caps.canJoin
    ? [{ label: 'Owned modules', value: stats.owned, tone: 'violet', icon: statIcons.layers }, { label: 'Enrolled modules', value: stats.enrolled, tone: 'blue', icon: statIcons.cap },
       { label: 'In progress', value: stats.inProgress, tone: 'amber', icon: statIcons.play }, { label: 'Completed', value: stats.completed, tone: 'green', icon: statIcons.done }]
    : [{ label: 'Owned modules', value: stats.owned, tone: 'violet', icon: statIcons.layers }, { label: 'Class modules', value: stats.classModules, tone: 'blue', icon: statIcons.cap },
       { label: 'Students', value: stats.students, tone: 'amber', icon: statIcons.users }, { label: 'Materials', value: stats.materials, tone: 'green', icon: statIcons.file }];

  return <div className="mx-auto max-w-[88rem] space-y-8 px-5 py-8 sm:py-10">
    <header>
      {user && <p className="text-sm font-medium text-zinc-500">Welcome back, {user.full_name}</p>}
      <h1 className="text-3xl font-bold tracking-tight text-zinc-500 sm:text-4xl">Dashboard</h1>
      <p className="mt-2 text-zinc-600">Your modules, shared with the StudyMind account you use on Mobile.</p>
    </header>

    {overview.isLoading && <LoadingBlock label="Loading your learning workspace…" />}
    {signedOut && <SignIn />}
    {overview.isError && !signedOut && <ErrorBox message={message(overview.error)} onRetry={() => overview.refetch()} />}

    {overview.data && user && <>
      {modules.data && <StatTiles stats={tiles} />}

      {/* lecturers create from a dialog opened by the "Create module" badge in the table; everyone else keeps the cards */}
      {((caps.canCreatePersonal && !caps.canCreateClass) || caps.canJoin) && <div className="grid gap-5 lg:grid-cols-2">
        {caps.canCreatePersonal && !caps.canCreateClass && <CreateModule canCreateClass={false} />}
        {caps.canJoin && <JoinCourse />}
      </div>}

      {modules.isLoading && <LoadingBlock label="Loading modules…" rows={2} />}
      {modules.isError && <ErrorBox message={message(modules.error)} onRetry={() => modules.refetch()} />}
      {modules.data && <ModuleTable id="my-modules" title="My modules" searchLabel="Search modules…" modules={all} userOwnsClass={caps.canCreateClass} onCreate={caps.canCreateClass ? () => setCreateOpen(true) : undefined}
        empty={caps.canJoin ? 'Use Create a module above to start one, or paste a Course ID to join a class.' : 'Modules you create appear here. Use Create a module above to start one.'} />}
      {caps.canCreateClass && <CreateModuleDialog open={createOpen} onClose={() => setCreateOpen(false)} canCreateClass />}
    </>}
  </div>;
}
