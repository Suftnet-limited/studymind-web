import Link from 'next/link';
import {notFound} from 'next/navigation';
import {moduleAccess} from '@/lib/module-access';
import {PreparationTool} from './preparation-tool';
import {PageHeading} from '@/components/ui/page-heading';
export default async function PreparePage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;const access=await moduleAccess(id);
 if(!access||!access.isLecturer)notFound();
 return <div className="mx-auto max-w-6xl space-y-7 px-5 py-10 sm:py-12">
 <Link href={`/lecturer/modules/${id}`} className="text-sm font-semibold text-violet-700 hover:underline">← Lecturer module</Link>
 <PageHeading eyebrow="Private lecturer workspace" title="AI teaching preparation" description="Create draft questions, exam material and teaching notes for review. Nothing is automatically shared with students."/>
 <PreparationTool moduleId={id}/></div>;
}