import { NextResponse } from 'next/server';
import { moduleAccess } from '@/lib/module-access';
import { studyMindApi } from '@/lib/studymind-ai';
export const runtime='nodejs';
type RemoteDoc={id:string;filename:string;status:'pending'|'indexing'|'ready'|'failed';chunk_count:number;error?:string|null;created_at?:string|null};
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;const access=await moduleAccess(id);if(!access)return NextResponse.json({error:'Not found'},{status:404});try{const docs=await studyMindApi<RemoteDoc[]>(`/api/v1/documents/list?course_id=${encodeURIComponent(id)}`);return NextResponse.json({documents:docs.map(d=>({id:d.id,filename:d.filename,status:d.status,chunkCount:d.chunk_count,error:d.error||null,createdAt:d.created_at||null}))},{headers:{'Cache-Control':'no-store'}})}catch(e){console.error('Document status lookup failed',e instanceof Error?e.message:'unknown');return NextResponse.json({error:'Document indexing status unavailable'},{status:502})}}
