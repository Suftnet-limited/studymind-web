'use client';
import { useState } from 'react';

export function PrepareAiCourse({ moduleId }: { moduleId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function prepare() {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/modules/${moduleId}/provision`, { method: 'POST' });
      const data: {status?:string;error?:string} = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not prepare course');
      setMessage(data.status === 'ready' ? 'AI course is ready.' :
        'Course indexing started. You can check its status from the AI study workspace.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not prepare course');
    } finally { setBusy(false); }
  }
  return <div>
    <button className="btn secondary" type="button" disabled={busy} onClick={() => void prepare()}>
      {busy ? 'Preparing…' : 'Prepare AI course'}
    </button>
    {message && <p role="status" className="muted">{message}</p>}
  </div>;
}
