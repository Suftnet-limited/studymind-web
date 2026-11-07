'use client';
import {UploadCloud} from 'lucide-react';
import {useModuleUpload} from '@/hooks/use-module-documents';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Card,CardContent,CardHeader,CardTitle,CardDescription} from '@/components/ui/card';
export function UploadForm({moduleId}:{moduleId:string}){
 const {upload,busy,message}=useModuleUpload(moduleId);
 return <Card className="border-violet-100"><CardHeader><CardTitle className="flex items-center gap-2"><UploadCloud className="size-5 text-violet-600"/>Upload class material</CardTitle><CardDescription>PDF, DOCX, TXT or Markdown, up to 20 MB. Materials are indexed asynchronously for AI study.</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={e=>{e.preventDefault();void upload(e.currentTarget);}}><label className="block space-y-2 text-sm font-medium text-zinc-700">Choose a document<Input type="file" name="file" accept=".pdf,.docx,.txt,.md" required disabled={busy} className="h-auto cursor-pointer py-2"/></label><Button type="submit" disabled={busy}>{busy?'Uploading…':'Upload document'}</Button></form>{message&&<p role="status" className="mt-3 text-sm text-zinc-600">{message}</p>}</CardContent></Card>;
}
