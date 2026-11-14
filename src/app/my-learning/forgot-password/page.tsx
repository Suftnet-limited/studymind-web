'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Mail, MailCheck } from 'lucide-react';
import { AuthShell } from '@/components/auth/auth-shell';
import { AuthError, AuthField, AuthSubmit } from '@/components/auth/auth-field';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/studymind/auth/password-recovery/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
      setSent(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  }
  return <AuthShell>
    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Forgot your password?</h1>
    {sent ? <div data-testid="reset-sent" className="mt-5 rounded-2xl bg-violet-50 p-5 text-sm leading-6 text-slate-700">
      <MailCheck className="mb-2 size-6 text-violet-600" aria-hidden />
      <p className="font-semibold text-slate-900">Check your email</p>
      <p className="mt-1">If an account exists for <strong>{email}</strong>, we have sent a link to choose a new password. It works once and expires in 30 minutes.</p>
    </div> : <>
      <p className="mt-1.5 text-sm text-slate-500">Enter the email you registered with and we will send you a link to choose a new password.</p>
      <form onSubmit={submit} className="mt-7">
        {error && <AuthError message={error} />}
        <AuthField label="Email" name="email" type="email" icon={<Mail className="size-4" />} placeholder="you@example.com" autoComplete="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)} />
        <AuthSubmit busy={busy} busyText="Sending…" disabled={!email}>Send reset link</AuthSubmit>
      </form>
    </>}
    <p className="mt-5 text-center text-sm text-slate-500"><Link href="/my-learning" className="font-semibold text-violet-700 hover:underline">Back to sign in</Link></p>
  </AuthShell>;
}
