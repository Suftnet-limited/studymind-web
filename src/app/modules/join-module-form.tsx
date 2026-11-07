'use client';
import { useState } from 'react';
import { useModuleEnrolment } from '@/hooks/use-module-enrolment';
export function JoinModuleForm() {
  const [courseId,setCourseId] = useState('');
  const { join,busy,error } = useModuleEnrolment();
  return <form onSubmit={e => { e.preventDefault(); join(courseId); }} className="actions">
    <input name="courseId" required maxLength={128} value={courseId} onChange={e => setCourseId(e.target.value)}
      aria-label="Course ID" placeholder="Enter Course ID" autoComplete="off"
      style={{padding:12,border:'1px solid #d9dce8',borderRadius:9}}/>
    <button className="btn" type="submit" disabled={busy}>{busy?'Joining…':'Join module'}</button>
    {error && <p role="alert" style={{color:'#b42318',width:'100%'}}>{error}</p>}
  </form>;
}
