'use client';
import {useState} from 'react';
import {useModuleEnrolment} from '@/hooks/use-module-enrolment';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
export function JoinModuleForm(){
 const [courseId,setCourseId]=useState('');
 const {join,busy,error}=useModuleEnrolment();
 return <form onSubmit={e=>{e.preventDefault();join(courseId);}} className="flex flex-col gap-3 sm:flex-row sm:items-start">
 <div className="min-w-0 flex-1"><Input name="courseId" required maxLength={128} value={courseId} onChange={e=>setCourseId(e.target.value)} aria-label="Course ID" placeholder="Enter Course ID" autoComplete="off"/>{error&&<p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}</div>
 <Button type="submit" disabled={busy}>{busy?'Joining…':'Join module'}</Button></form>;
}
