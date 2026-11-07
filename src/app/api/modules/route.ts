import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { currentUserId } from '@/lib/session';
import { studyMindApi } from '@/lib/studymind-ai';
export const runtime='nodejs';
export async function POST(req:Request){
 const id=await currentUserId();
 if(!id)return NextResponse.json({error:'Authentication required'},{status:401});
 const user=await prisma.user.findUnique({where:{id},select:{role:true}});
 if(user?.role!=='LECTURER')return NextResponse.json({error:'Lecturer account required'},{status:403});
 const data=await req.formData();
 const title=String(data.get('title')||'').trim();
 const description=String(data.get('description')||'').trim();
 if(!title||title.length>120||description.length>500)return NextResponse.json({error:'Invalid module details'},{status:400});
 const enrolmentCode=randomBytes(8).toString('hex').toUpperCase();
 const module=await prisma.module.create({data:{title,description:description||null,lecturerId:id,enrolmentCode}});
 try{
  // Ingest the same module identifier used by web AI routes; do not invent a module CRUD endpoint.
  await studyMindApi('/api/v1/courses/ingest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({course_id:module.id,user_id:id,user_role:'lecturer',title,description,sections:[]})});
 }catch(e){
  // Avoid advertising a module whose AI course was never created.
  await prisma.module.delete({where:{id:module.id}}).catch(()=>{});
  console.error('Course ingest failed',e instanceof Error?e.message:'unknown');
  return NextResponse.json({error:'Module could not be provisioned in StudyMind AI. Please retry.'},{status:502});
 }
 return NextResponse.redirect(new URL(`/modules/${module.id}`,req.url),303);
}
