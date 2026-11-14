'use client';
import { type FormEvent } from 'react';
import { useAuthSubmit } from '@/hooks/use-auth-submit';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const { submit: submitAuth, busy, error } = useAuthSubmit(mode);
  const register = mode === 'register';

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submitAuth(e.currentTarget);
  }

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="space-y-1.5">
        <h1 className="text-2xl font-extrabold tracking-tight text-zinc-950">
          {register ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="text-sm text-zinc-500">
          {register
            ? 'Join Revvo and study smarter from your course materials.'
            : 'Sign in to continue with Revvo.'}
        </p>
      </div>

      {/* Form */}
      <form onSubmit={submit} className="space-y-4">
        {register && (
          <label className="block space-y-1.5 text-sm font-medium text-zinc-700">
            Full name
            <Input name="name" autoComplete="name" required maxLength={120} className="mt-1.5" />
          </label>
        )}

        <label className="block space-y-1.5 text-sm font-medium text-zinc-700">
          Email address
          <Input name="email" type="email" autoComplete="email" required className="mt-1.5" />
        </label>

        <label className="block space-y-1.5 text-sm font-medium text-zinc-700">
          Password
          <Input
            name="password"
            type="password"
            autoComplete={register ? 'new-password' : 'current-password'}
            minLength={register ? 12 : undefined}
            required
            className="mt-1.5"
          />
          {register && (
            <span className="block text-xs font-normal text-zinc-400 mt-1">At least 12 characters.</span>
          )}
        </label>

        {register && (
          <label className="block space-y-1.5 text-sm font-medium text-zinc-700">
            I am a
            <select
              name="role"
              required
              className="mt-1.5 h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              <option value="STUDENT">Student</option>
              <option value="LECTURER">Lecturer</option>
            </select>
          </label>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <Button
          className="w-full h-11 rounded-xl bg-violet-600 font-semibold text-white hover:bg-violet-700"
          type="submit"
          disabled={busy}
        >
          {busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
        </Button>
      </form>

      {/* Switch link */}
      <p className="text-center text-sm text-zinc-500">
        {register ? 'Already have an account?' : 'New to Revvo?'}{' '}
        <Link
          className="font-semibold text-violet-700 hover:underline"
          href={register ? '/sign-in' : '/sign-up'}
        >
          {register ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
    </div>
  );
}
