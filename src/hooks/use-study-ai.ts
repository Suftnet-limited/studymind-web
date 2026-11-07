'use client';
import { useState } from 'react';
import { moduleService } from '@/services/module.service';
export function useStudyAi(moduleId: string) {
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  async function run(operation: string, payload: Record<string,unknown> = {}) {
    setBusy(true); setError('');
    try { return await moduleService.ai(moduleId, operation, payload); }
    catch(e) { setError(e instanceof Error ? e.message : 'Something went wrong'); return null; }
    finally { setBusy(false); }
  }
  return { run, busy, error, clearError: () => setError('') };
}
