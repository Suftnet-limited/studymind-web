'use client';
import {usePrepareCourse} from '@/hooks/use-lecturer-module';
import {Button} from '@/components/ui/button';
export function PrepareAiCourse({moduleId}:{moduleId:string}){
 const mutation=usePrepareCourse(moduleId);
 return <div className="space-y-3"><Button variant="outline" type="button" disabled={mutation.isPending} onClick={()=>mutation.mutate()}>{mutation.isPending?'Preparing…':'Prepare AI course'}</Button>
 {mutation.isSuccess&&<p role="status" className="text-sm text-emerald-700">{mutation.data.status==='ready'?'AI course is ready.':'Course indexing started. Check the AI study workspace for its status.'}</p>}
 {mutation.isError&&<p role="alert" className="text-sm text-red-700">{mutation.error.message}</p>}</div>;
}
