'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ChevronDown, Lock, Mail, User } from 'lucide-react';
import { AuthShell } from '@/components/auth/auth-shell';
import { AuthError, AuthField, AuthSubmit, PasswordChecks } from '@/components/auth/auth-field';

const ROLE_LABELS: Record<string, string> = { self_learner: 'Independent learner', student: 'Student', lecturer: 'Lecturer' };
const ROLE_HELP: Record<string, string> = {
  self_learner: 'Study on your own: upload your notes and practise with them.',
  student: 'Join your lecturer\'s modules and keep your own private notes.',
  lecturer: 'Create class modules, share materials with your students and use the study tools yourself.',
};
const MIN_PASSWORD = 12;

export default function RegisterLearning() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [roles, setRoles] = useState<string[]>(['self_learner', 'student', 'lecturer']);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('self_learner');
  useEffect(() => {
    fetch('/api/studymind/auth/config').then(r => r.json()).then(c => {
      if (Array.isArray(c.enabled_roles) && c.enabled_roles.length) {
        const allowed = Object.keys(ROLE_LABELS).filter(r => c.enabled_roles.includes(r));
        setRoles(allowed); setRole(current => allowed.includes(current) ? current : allowed[0]);
      }
    }).catch(() => {});
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/studymind/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, full_name: fullName, password, role }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to create account');
      if (!result.authenticated) throw new Error('Account created. Please sign in with your new credentials.');
      router.replace('/my-learning'); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Registration failed'); }
    finally { setBusy(false); }
  }
  return <AuthShell>
    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create a StudyMind account</h1>
    <p className="mt-1.5 text-sm text-slate-500">One account for StudyMind Web and Mobile. Your courses and materials belong to your StudyMind AI account.</p>
    <form onSubmit={submit} className="mt-7">
      {error && <AuthError message={error} />}
      <div className="space-y-3">
        <AuthField label="Full name" name="full_name" icon={<User className="size-4" />} placeholder="Alex Rivera" autoComplete="name" required minLength={2} maxLength={120} autoFocus value={fullName} onChange={e => setFullName(e.target.value)} />
        <AuthField label="Email" name="email" type="email" icon={<Mail className="size-4" />} placeholder="you@example.com" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        <AuthField label="Password" name="password" type="password" icon={<Lock className="size-4" />} placeholder={`At least ${MIN_PASSWORD} characters`} autoComplete="new-password" required minLength={MIN_PASSWORD} maxLength={128} value={password} onChange={e => setPassword(e.target.value)}>
          <PasswordChecks password={password} minLength={MIN_PASSWORD} />
        </AuthField>
        <div>
          <label htmlFor="account-type" className="mb-1.5 block text-xs font-semibold text-slate-700">Account type</label>
          <div className="relative">
            <select id="account-type" name="role" value={role} onChange={e => setRole(e.target.value)}
              className="h-12 w-full appearance-none rounded-xl border border-zinc-200 bg-white px-3.5 pr-10 text-sm text-slate-900 outline-none transition-all duration-200 hover:border-zinc-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-100">
              {roles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          </div>
          <p className="mt-1.5 text-xs text-slate-400">{ROLE_HELP[role]}</p>
        </div>
      </div>
      <AuthSubmit busy={busy} busyText="Creating account…">Create account</AuthSubmit>
    </form>
    <p className="mt-5 text-center text-sm text-slate-500">Already registered?{' '}<Link href="/my-learning" className="font-semibold text-violet-700 hover:underline">Sign in</Link></p>
  </AuthShell>;
}
