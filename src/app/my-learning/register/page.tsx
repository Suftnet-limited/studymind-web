'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export default function RegisterLearning() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/studymind/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.get('email'), full_name: data.get('full_name'), password: data.get('password'), role: data.get('role') }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to create account');
      if (!result.authenticated) throw new Error('Account created. Please sign in with your new credentials.');
      router.replace('/my-learning'); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Registration failed'); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-md space-y-6 px-5 py-12">
    <h1 className="text-3xl font-bold">Create a StudyMind account</h1>
    <p className="text-sm text-zinc-600">One account for StudyMind Web and Mobile. Your courses and materials belong to your StudyMind AI account.</p>
    <form onSubmit={submit} className="space-y-4 rounded-xl border p-5">
      <label className="block text-sm">Full name<input name="full_name" required minLength={2} maxLength={120} className="mt-1 w-full rounded border p-2"/></label>
      <label className="block text-sm">Email<input name="email" type="email" required className="mt-1 w-full rounded border p-2"/></label>
      <label className="block text-sm">Password<input name="password" type="password" required minLength={12} maxLength={128} className="mt-1 w-full rounded border p-2"/></label>
      <label className="block text-sm">Account type<select name="role" className="mt-1 w-full rounded border p-2"><option value="self_learner">Independent learner</option><option value="student">Student</option><option value="lecturer">Lecturer</option></select></label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy} className="rounded bg-violet-700 px-4 py-2 text-white">{busy ? 'Creating…' : 'Create account'}</button>
    </form>
    <Link href="/my-learning" className="text-sm text-violet-700 underline">Already registered? Sign in</Link>
  </main>;
}
