'use client';
import { useModuleUpload } from '@/hooks/use-module-documents';
export function UploadForm({moduleId}:{moduleId:string}) {
  const {upload,busy,message} = useModuleUpload(moduleId);
  return <div className="panel" style={{marginTop:22,background:'#faf9ff'}}>
    <h2>Upload class material</h2><p className="muted">PDF, DOCX, TXT or Markdown, up to 20 MB. StudyMind indexes documents asynchronously.</p>
    <form onSubmit={e => {e.preventDefault(); void upload(e.currentTarget);}}>
      <label className="field">Choose a document<input type="file" name="file" accept=".pdf,.docx,.txt,.md" required disabled={busy}/></label>
      <button type="submit" className="btn" disabled={busy}>{busy?'Uploading…':'Upload document'}</button>
    </form>{message && <p role="status" className="muted">{message}</p>}
  </div>;
}
