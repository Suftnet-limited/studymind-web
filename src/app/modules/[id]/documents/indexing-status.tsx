'use client';
import {RefreshCw} from 'lucide-react';
import {useModuleIndexing} from '@/hooks/use-module-documents';
import {Button} from '@/components/ui/button';
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from '@/components/ui/card';
export function IndexingStatus({moduleId}:{moduleId:string}){
 const {docs,error,refresh}=useModuleIndexing(moduleId);
 return <Card><CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle>Indexing status</CardTitle><CardDescription>Automatically refreshes every 10 seconds.</CardDescription></div><Button variant="outline" size="sm" type="button" onClick={refresh}><RefreshCw className="size-4"/>Refresh</Button></CardHeader><CardContent className="space-y-3">{error&&<p role="alert" className="text-sm text-red-600">{error}</p>}{docs.length?docs.map(d=><div key={d.id} className="flex items-center justify-between gap-3 border-b border-zinc-100 py-3 last:border-0"><div className="min-w-0"><p className="truncate text-sm font-semibold text-zinc-900">{d.filename}</p><p className="text-xs text-zinc-500">{d.status==='ready'?`Indexed · ${d.chunkCount} chunks`:d.status==='failed'?d.error||'Indexing failed':d.status==='indexing'?'Processing document…':'Waiting to index…'}</p></div><span className={d.status==='ready'?'rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700':d.status==='failed'?'rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700':'rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700'}>{d.status}</span></div>):<p className="py-5 text-sm text-zinc-500">No documents found in the StudyMind indexing service.</p>}</CardContent></Card>;
}
