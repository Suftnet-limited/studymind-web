import Link from 'next/link';
import {notFound} from 'next/navigation';
import {moduleAccess,hasActivePass} from '@/lib/module-access';
import {StudyWorkspace} from './study-workspace';
import {PageHeading} from '@/components/ui/page-heading';
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from '@/components/ui/card';
export default async function StudyPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{tab?:string}>}){
 const {id}=await params;const {tab}=await searchParams;
 const initialTab=tab==='quiz'||tab==='flashcards'||tab==='summary'?tab:'tutor';
 const access=await moduleAccess(id);if(!access)notFound();
 const active=await hasActivePass(access.userId);
 return <div className="mx-auto max-w-6xl space-y-7 px-5 py-10 sm:py-12">
 <Link href={`/modules/${id}`} className="text-sm font-semibold text-violet-700 hover:underline">← Module overview</Link>
 <PageHeading eyebrow={access.module.title} title="AI Study Tools" description="Ask your tutor, practise with quizzes and flashcards, or generate a summary from course materials."/>
 {active?<StudyWorkspace moduleId={id} initialTab={initialTab}/>:<Card className="max-w-2xl"><CardHeader><CardTitle>Access pass required</CardTitle><CardDescription>An active StudyMind access pass is required to use AI study tools.</CardDescription></CardHeader><CardContent><Link href="/billing" className="inline-flex rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700">View access passes</Link></CardContent></Card>}</div>;
}