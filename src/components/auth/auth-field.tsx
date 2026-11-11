'use client';
import { useId, useState, type ChangeEvent, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A labelled input with a leading icon, focus ring, optional inline error and, for passwords, a show/hide toggle. */
export function AuthField({ label, icon, type = 'text', error, hint, children, ...input }: {
  label: string; icon?: ReactNode; type?: string; error?: string; hint?: string; children?: ReactNode;
  name?: string; value?: string; onChange?: (e: ChangeEvent<HTMLInputElement>) => void; autoComplete?: string; placeholder?: string;
  required?: boolean; minLength?: number; maxLength?: number; disabled?: boolean; autoFocus?: boolean;
}) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const isPassword = type === 'password';
  return <div>
    <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</label>
    <div className={cn('relative flex h-12 items-center rounded-xl border bg-white transition-all duration-200 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100',
      error ? 'border-red-400 ring-1 ring-red-100' : 'border-zinc-200 hover:border-zinc-300')}>
      {icon && <span className="pointer-events-none absolute left-3.5 flex items-center text-slate-400" aria-hidden>{icon}</span>}
      <input id={id} type={isPassword && shown ? 'text' : type} aria-invalid={error ? true : undefined}
        className={cn('h-full w-full rounded-xl bg-transparent px-3.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50', icon && 'pl-10', isPassword && 'pr-11')}
        {...input} />
      {isPassword && <button type="button" onClick={() => setShown(s => !s)} aria-pressed={shown} title={shown ? 'Hide password' : 'Show password'}
        className="absolute right-2.5 flex size-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-zinc-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
        {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        <span className="sr-only">{shown ? 'Hide' : 'Show'}</span>
      </button>}
    </div>
    {children}
    {hint && !error && <p className="mt-1.5 text-xs text-slate-400">{hint}</p>}
    {error && <p className="mt-1.5 flex items-center gap-1 text-xs text-red-500"><AlertCircle className="size-3" aria-hidden />{error}</p>}
  </div>;
}

export function AuthError({ message }: { message: string }) {
  return <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
    <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden /><p className="text-sm text-red-700">{message}</p>
  </div>;
}

export function AuthSubmit({ busy, busyText, children, disabled }: { busy: boolean; busyText: string; children: ReactNode; disabled?: boolean }) {
  return <button type="submit" disabled={busy || disabled}
    className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-violet-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
    {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}{busy ? busyText : children}
  </button>;
}

/** Password tips. Only the length is enforced by the form; the others are encouragement. */
export function PasswordChecks({ password, minLength }: { password: string; minLength: number }) {
  if (!password) return null;
  const checks = [
    { label: `${minLength}+ characters`, ok: password.length >= minLength },
    { label: 'Upper & lower case', ok: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: 'A number', ok: /\d/.test(password) },
  ];
  return <ul aria-label="Strength checks" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
    {checks.map(({ label, ok }) => <li key={label} data-ok={ok} className={cn('flex items-center gap-1 text-xs', ok ? 'text-emerald-600' : 'text-slate-400')}>
      <CheckCircle2 className={cn('size-3', ok ? 'text-emerald-500' : 'text-slate-300')} aria-hidden />{label}</li>)}
  </ul>;
}
