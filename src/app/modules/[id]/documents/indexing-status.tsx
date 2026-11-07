'use client';
import { useModuleIndexing } from '@/hooks/use-module-documents';
export function IndexingStatus({moduleId}:{moduleId:string}) {
  const {docs,error,refresh} = useModuleIndexing(moduleId);
  return <section className="panel" style={{marginTop:22}}>
    <div className="section-head"><div><h2>Indexing status</h2><p className="muted">Status refreshes every 10 seconds while this page is open.</p></div>
      <button className="btn secondary" type="button" onClick={refresh}>Refresh</button></div>
    {error && <p role="alert" style={{color:'#b42318'}}>{error}</p>}
    {docs.length ? docs.map(d=><div className="mini-row" key={d.id}><div><strong>{d.filename}</strong>
      <div className="muted" style={{fontSize:12}}>{d.status==='ready'?`Indexed · ${d.chunkCount} chunks`:d.status==='failed'?d.error||'Indexing failed':d.status==='indexing'?'Processing document…':'Waiting to index…'}</div>
    </div><span className="tag">{d.status}</span></div>) : <p className="muted">No documents found in the StudyMind indexing service.</p>}
  </section>;
}
