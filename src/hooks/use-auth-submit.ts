'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/services/auth.service';
export function useAuthSubmit(mode: 'login'|'register') {
  const router = useRouter();
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  async function submit(form: HTMLFormElement) {
    if (busy) return;
    setBusy(true); setError('');
    try { await authService.submit(mode, new FormData(form)); router.push('/dashboard'); router.refresh(); }
    catch(e) { setError(e instanceof Error ? e.message : 'Unable to complete request'); setBusy(false); }
  }
  return { submit, busy, error };
}
