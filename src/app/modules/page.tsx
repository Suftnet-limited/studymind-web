import Link from 'next/link';
import {redirect} from 'next/navigation';
import {BookOpen,Plus,ArrowUpRight,GraduationCap} from 'lucide-react';
import {currentUserId} from '@/lib/session';
import {prisma} from '@/lib/prisma';
import {JoinModuleForm} from './join-module-form';
import {Card,CardContent,CardHeader,CardTitle,CardDescription} from '@/components/ui/card';
import {PageHeading} from '@/components/ui/page-heading';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
export default async function ModulesPage(){
 const id=await currentUserId();if(!id)redirect('/sign-in');
 const user=await prisma.user.findUnique({where:{id},include:{modules:{orderBy:{updatedAt:'desc'}},enrolments:{include:{module:true},orderBy:{createdAt:'desc'}}}});
 if(!user)redirect('/sign-in');
 const lecturer=user.role==='LECTURER';const modules=lecturer?user.modules:user.enrolments.map(e=>e.module);
 return <div className="mx-auto max-w-6xl space-y-8 px-5 py-10 sm:py-12">
  <PageHeading eyebrow={lecturer?'Teaching workspace':'Learning workspace'} title="My Modules" description={lecturer?'Create modules, manage teaching materials and prepare AI learning.':'Join a course using the Course ID supplied by your lecturer.'} action={<Link href="/dashboard" className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">Dashboard</Link>}/>
  <Card className="border-violet-100 bg-gradient-to-br from-white to-violet-50/60"><CardHeader><div className="flex items-center gap-2 text-violet-600">{lecturer?<Plus className="size-5"/>:<GraduationCap className="size-5"/>}<CardTitle>{lecturer?'Create a module':'Join a module'}</CardTitle></div><CardDescription>{lecturer?'Give your new module a title. Its Course ID will be available to share with students.':'Enter the Course ID provided by your lecturer.'}</CardDescription></CardHeader><CardContent>{lecturer?<form action="/api/modules" method="post" className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label className="space-y-2 text-sm font-medium text-zinc-700">Module title<Input name="title" required maxLength={120} placeholder="e.g. Cell Biology"/></label><label className="space-y-2 text-sm font-medium text-zinc-700">Description<Input name="description" maxLength={500} placeholder="What will students learn?"/></label><Button type="submit">Create module</Button></form>:<JoinModuleForm/>}</CardContent></Card>
  <section className="space-y-5"><div className="flex items-center justify-between"><h2 className="text-xl font-bold tracking-tight text-zinc-900">{lecturer?'Teaching modules':'Enrolled modules'}</h2><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">{modules.length} modules</span></div>
  {modules.length?<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{modules.map(m=><Link key={m.id} href={`/modules/${m.id}`} className="group"><Card className="h-full transition hover:border-violet-300 hover:shadow-md"><CardHeader><div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><BookOpen className="size-5"/></div><CardTitle>{m.title}</CardTitle><CardDescription>{m.description||'Open your module workspace.'}</CardDescription></CardHeader><CardContent className="flex items-center gap-1 text-sm font-semibold text-violet-700">Open module <ArrowUpRight className="size-4 transition group-hover:translate-x-0.5"/></CardContent></Card></Link>)}</div>:<Card><CardContent className="py-12 text-center text-sm text-zinc-500">{lecturer?'Create your first module above.':'Join a module to start studying.'}</CardContent></Card>}</section>
 </div>;
}
