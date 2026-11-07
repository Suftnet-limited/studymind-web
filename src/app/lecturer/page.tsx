import Link from 'next/link';
import {redirect} from 'next/navigation';
import {BookOpen,Users,FileText,ArrowUpRight} from 'lucide-react';
import {currentUserId} from '@/lib/session';
import {prisma} from '@/lib/prisma';
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from '@/components/ui/card';
import {PageHeading} from '@/components/ui/page-heading';
export default async function LecturerPage(){
 const id=await currentUserId();if(!id)redirect('/sign-in');
 const user=await prisma.user.findUnique({where:{id},select:{role:true}});if(user?.role!=='LECTURER')redirect('/dashboard');
 const modules=await prisma.module.findMany({where:{lecturerId:id},include:{_count:{select:{enrolments:true,documents:true}}},orderBy:{updatedAt:'desc'}});
 const students=modules.reduce((n,m)=>n+m._count.enrolments,0);const documents=modules.reduce((n,m)=>n+m._count.documents,0);
 const stats=[{label:'Modules',value:modules.length,Icon:BookOpen},{label:'Enrolments',value:students,Icon:Users},{label:'Documents',value:documents,Icon:FileText}];
 return <div className="mx-auto max-w-6xl space-y-9 px-5 py-10 sm:py-12"><PageHeading eyebrow="Lecturer workspace" title="Teaching dashboard" description="An overview of your courses, teaching materials and student enrolments." action={<Link href="/modules" className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700">Create module</Link>}/>
 <div className="grid gap-4 sm:grid-cols-3">{stats.map(({label,value,Icon})=><Card key={label}><CardHeader><div className="flex items-center justify-between"><CardDescription>{label}</CardDescription><Icon className="size-5 text-violet-500"/></div><CardTitle className="pt-2 text-3xl">{value}</CardTitle></CardHeader></Card>)}</div>
 <section className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold text-zinc-900">Your teaching modules</h2><Link className="text-sm font-semibold text-violet-700 hover:underline" href="/modules">Manage modules</Link></div>
 {modules.length?<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{modules.map(m=><Link href={`/lecturer/modules/${m.id}`} key={m.id} className="group"><Card className="h-full transition hover:border-violet-300 hover:shadow-md"><CardHeader><span className="w-fit rounded-md bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700">Teaching</span><CardTitle className="pt-2">{m.title}</CardTitle><CardDescription>{m.description||'Module workspace'}</CardDescription></CardHeader><CardContent><p className="mb-4 text-sm text-zinc-500">{m._count.enrolments} students · {m._count.documents} documents</p><span className="flex items-center gap-1 text-sm font-semibold text-violet-700">Manage module <ArrowUpRight className="size-4"/></span></CardContent></Card></Link>)}</div>:<Card><CardContent className="space-y-4 py-10 text-center"><p className="text-sm text-zinc-500">You haven't created any modules yet.</p><Link className="text-sm font-semibold text-violet-700" href="/modules">Create your first module</Link></CardContent></Card>}</section></div>;
}
