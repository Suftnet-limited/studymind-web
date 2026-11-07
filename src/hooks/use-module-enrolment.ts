'use client';
import { useState } from 'react';
import { moduleService } from '@/services/module.service';
export function useModuleEnrolment() {
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  async function join(courseId: string) {
    if (busy) return;
    setBusy(true); setError('');
    try { const destination = await moduleService.join(courseId.trim()); window.location.assign(destination); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to join module'); setBusy(false); }
  }
  return { join, busy, error };
}
