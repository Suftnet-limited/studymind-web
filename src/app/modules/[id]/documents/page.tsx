import Link from 'next/link';
import {notFound} from 'next/navigation';
import {FileText,LockKeyhole} from 'lucide-react';
import {prisma} from '@/lib/prisma';
import {moduleAccess} from '@/lib/module-access';
import {UploadForm} from './upload-form';
import {IndexingStatus} from './indexing-status';
import {PageHeading} from '@/components/ui/page-heading';
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from '@/components/ui/card';
export default async function DocumentsPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;const access=await moduleAccess(id);if(!access)notFound();
 const docs=await prisma.studyDocument.findMany({where:{moduleId:id,OR:[{visibility:'CLASS'},{ownerId:access.userId}]},orderBy:{createdAt:'desc'}});
 const classDocs=docs.filter(d=>d.visibility==='CLASS');const myDocs=docs.filter(d=>d.visibility==='PERSONAL');
 return <div className="mx-auto max-w-6xl space-y-7 px-5 py-10 sm:py-12"><Link href={`/modules/${id}`} className="text-sm font-semibold text-violet-700 hover:underline">← Module overview</Link>
 <PageHeading eyebrow={access.module.title} title="Documents" description="Teaching materials and private study notes, organised in one place." action={<span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">{docs.length} documents</span>}/>
 <div className="grid gap-5 lg:grid-cols-2">{[{title:'Class documents',description:'Materials shared by your lecturer.',items:classDocs,Icon:FileText,empty:'No class materials uploaded yet.'},{title:'My notes',description:'Private documents visible only to you.',items:myDocs,Icon:LockKeyhole,empty:'You have not added personal notes yet.'}].map(group=><Card key={group.title}><CardHeader><CardTitle className="flex items-center gap-2"><group.Icon className="size-5 text-violet-600"/>{group.title}<span className="ml-auto rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-600">{group.items.length}</span></CardTitle><CardDescription>{group.description}</CardDescription></CardHeader><CardContent>{group.items.length?group.items.map(d=><div key={d.id} className="flex items-center justify-between gap-3 border-b border-zinc-100 py-3 last:border-0"><p className="min-w-0 truncate text-sm font-medium text-zinc-800">{d.title}</p><span className="rounded-md bg-violet-50 px-2 py-1 text-xs text-violet-700">{d.visibility==='CLASS'?'Class':'Private'}</span></div>):<p className="py-5 text-sm text-zinc-500">{group.empty}</p>}</CardContent></Card>)}</div>
 <IndexingStatus moduleId={id}/>{access.isLecturer&&<UploadForm moduleId={id}/>}</div>;
}
