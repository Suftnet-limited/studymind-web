import Link from 'next/link';
import {notFound} from 'next/navigation';
import {moduleAccess} from '@/lib/module-access';
import {PreparationTool} from './preparation-tool';
export default async function PreparePage({params}:{params:Promise<{id:string}>}){const {id}=await params;const access=await moduleAccess(id);if(!access||!access.isLecturer)notFound();return <div className="container dashboard"><Link href={`/lecturer/modules/${id}`} style={{color:'#6554d9'}}>← Lecturer module</Link><div style={{marginTop:24}}><div className="eyebrow">Private lecturer workspace</div><h1>AI teaching preparation</h1><p className="muted">Create draft questions, exam material and teaching notes for your own review. Nothing is shared with students through StudyMind.</p></div><PreparationTool moduleId={id}/></div>}
