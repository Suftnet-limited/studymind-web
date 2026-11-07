'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { moduleService, type IndexDocument } from '@/services/module.service';
export function useModuleUpload(moduleId: string) {
  const router = useRouter();
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  async function upload(form: HTMLFormElement) {
    setBusy(true); setMessage('Uploading document…');
    try { await moduleService.upload(moduleId, new FormData(form)); setMessage('Document uploaded. AI indexing is in progress.'); form.reset(); router.refresh(); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Upload failed'); }
    finally { setBusy(false); }
  }
  return { upload, busy, message };
}
export function useModuleIndexing(moduleId: string) {
  const [docs,setDocs] = useState<IndexDocument[]>([]);
  const [error,setError] = useState('');
  const [refresh,setRefresh] = useState(0);
  useEffect(() => {
    let active = true; const controller = new AbortController();
    async function load() {
      try { const data = await moduleService.indexingStatus(moduleId, controller.signal); if (active) { setDocs(data); setError(''); } }
      catch(e) { if(active && !controller.signal.aborted) setError(e instanceof Error ? e.message : 'Status unavailable'); }
    }
    void load(); const timer = setInterval(() => void load(), 10000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, [moduleId,refresh]);
  return { docs, error, refresh: () => setRefresh(v => v+1) };
}
