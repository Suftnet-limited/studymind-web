'use client';
import Link from 'next/link';
import { Suspense, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Lock } from 'lucide-react';
import { AuthShell } from '@/components/auth/auth-shell';
import { AuthError, AuthField, AuthSubmit, PasswordChecks } from '@/components/auth/auth-field';

const MIN_PASSWORD = 12;

function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (password !== again) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/studymind/auth/password-recovery/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
      setDone(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  }
  if (done) return <>
    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Password changed</h1>
    <div data-testid="reset-done" className="mt-5 rounded-2xl bg-emerald-50 p-5 text-sm leading-6 text-slate-700"><CheckCircle2 className="mb-2 size-6 text-emerald-600" aria-hidden />You can now sign in with your new password. For your security you have been signed out on all devices.</div>
    <Link href="/my-learning" className="mt-6 block rounded-xl bg-violet-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-violet-700">Sign in</Link>
  </>;
  if (token.length < 30) return <>
    <h1 className="text-2xl font-bold tracking-tight text-slate-900">This link doesn’t work</h1>
    <p data-testid="reset-invalid" className="mt-3 text-sm leading-6 text-slate-600">The reset link is missing or incomplete. Request a new one and use the link from the latest email.</p>
    <Link href="/my-learning/forgot-password" className="mt-6 block rounded-xl bg-violet-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-violet-700">Request a new link</Link>
  </>;
  return <>
    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Choose a new password</h1>
    <p className="mt-1.5 text-sm text-slate-500">Pick a password you have not used elsewhere.</p>
    <form onSubmit={submit} className="mt-7">
      {error && <AuthError message={error} />}
      <div className="space-y-3">
        <AuthField label="New password" name="password" type="password" icon={<Lock className="size-4" />} placeholder={`At least ${MIN_PASSWORD} characters`} autoComplete="new-password" required minLength={MIN_PASSWORD} maxLength={128} autoFocus value={password} onChange={e => setPassword(e.target.value)}>
          <PasswordChecks password={password} minLength={MIN_PASSWORD} />
        </AuthField>
        <AuthField label="Confirm new password" name="confirm" type="password" icon={<Lock className="size-4" />} placeholder="Type it again" autoComplete="new-password" required minLength={MIN_PASSWORD} maxLength={128} value={again} onChange={e => setAgain(e.target.value)} />
      </div>
      <AuthSubmit busy={busy} busyText="Saving…" disabled={!password || !again}>Change password</AuthSubmit>
    </form>
  </>;
}

export default function ResetPassword() {
  return <AuthShell><Suspense fallback={null}><ResetForm /></Suspense></AuthShell>;
}
