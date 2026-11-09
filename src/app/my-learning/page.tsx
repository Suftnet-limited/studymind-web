'use client';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { studyMindIdentityService } from '@/services/studymind-identity.service';
import { studyMindModulesService } from '@/services/studymind-modules.service';

export default function MyLearningPage() {
  const cache = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [title, setTitle] = useState('');
  const [accessType, setAccessType] = useState<'personal'|'class'>('personal');
  const overview = useQuery({ queryKey: ['canonical', 'overview'], queryFn: studyMindIdentityService.overview, retry: false });
  const modules = useQuery({ queryKey: ['canonical', 'modules'], queryFn: studyMindModulesService.list, enabled: overview.isSuccess, retry: false });
  const login = useMutation({ mutationFn: () => studyMindIdentityService.login(email, password), onSuccess: async () => {
    setPassword(''); await cache.invalidateQueries({ queryKey: ['canonical'] });
  } });
  const create = useMutation({ mutationFn: () => studyMindModulesService.create(title, accessType), onSuccess: async () => {
    setTitle(''); await cache.invalidateQueries({ queryKey: ['canonical'] });
  } });
  const logout = useMutation({ mutationFn: studyMindIdentityService.logout, onSuccess: async () => {
    cache.removeQueries({ queryKey: ['canonical'] }); await cache.invalidateQueries({ queryKey: ['canonical'] });
  } });
  return <main className="mx-auto max-w-4xl space-y-7 px-5 py-10">
    <header><p className="text-sm font-semibold text-violet-700">StudyMind AI</p><h1 className="text-3xl font-bold">My learning</h1><p className="mt-2 text-zinc-600">Your modules from the same StudyMind account used on Mobile.</p></header>
    {overview.isLoading && <p role="status">Loading your learning workspace…</p>}
    {overview.isError && <form className="max-w-md space-y-4 rounded-xl border p-5" onSubmit={e => {e.preventDefault();login.mutate();}}>
      <h2 className="font-semibold">Sign in with your existing StudyMind account</h2><p className="text-sm">New to StudyMind? <Link href="/my-learning/register" className="text-violet-700 underline">Create an account</Link></p>
      <label className="block text-sm">Email<input className="mt-1 w-full rounded border p-2" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <label className="block text-sm">Password<input className="mt-1 w-full rounded border p-2" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
      {login.isError && <p role="alert" className="text-sm text-red-700">{login.error.message}</p>}
      <button className="rounded bg-violet-700 px-4 py-2 text-white" disabled={login.isPending}>Sign in</button>
    </form>}
    {overview.data && <section className="space-y-5">
      <div className="flex items-center justify-between gap-3"><p>Signed in as <strong>{overview.data.user.full_name}</strong></p><button className="text-sm text-violet-700 underline" onClick={()=>logout.mutate()}>Sign out</button></div>
      <p className="text-sm text-zinc-600">Owned modules: {overview.data.modules.owned} · Enrolled modules: {overview.data.modules.enrolled}</p>
      {(overview.data.user.role === 'lecturer' || overview.data.user.role === 'self_learner') && <form className="flex flex-wrap gap-3 rounded-xl border p-4" onSubmit={e=>{e.preventDefault();create.mutate();}}>
        <input className="min-w-48 flex-1 rounded border p-2" placeholder="New module title" minLength={2} maxLength={255} required value={title} onChange={e=>setTitle(e.target.value)}/>
        <select className="rounded border p-2" value={accessType} onChange={e=>setAccessType(e.target.value as 'personal'|'class')}><option value="personal">Personal</option><option value="class">Class</option></select>
        <button className="rounded bg-violet-700 px-4 py-2 text-white" disabled={create.isPending}>Create module</button>
        {create.isError && <p role="alert" className="w-full text-sm text-red-700">{create.error.message}</p>}
      </form>}
      <h2 className="text-xl font-semibold">My modules</h2>
      {modules.isLoading && <p>Loading modules…</p>}
      {modules.isError && <p role="alert">Unable to load modules: {modules.error.message}</p>}
      {modules.data?.length === 0 && <p>No modules yet. Create a module or join a course on Mobile.</p>}
      <div className="grid gap-3 sm:grid-cols-2">{modules.data?.map(m=><article key={m.id} className="rounded-xl border p-5"><h3 className="font-semibold">{m.title}</h3><p className="mt-1 text-sm text-zinc-600">{m.description || 'Your StudyMind learning module'}</p><p className="mt-3 text-xs text-violet-700">{m.access_type} · {m.status}</p></article>)}</div>
    </section>}
  </main>;
}
