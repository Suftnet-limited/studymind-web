import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { currentUserId } from '@/lib/session';
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
 // Course content is provisioned by the AI workspace, as in Edquis. Creating
 // an enrolment must not depend on an AI indexing service being available.
 // When the lecturer opens StudyMindPanel it ingests the module outline; the
 // documents endpoint can index class materials independently.

 return NextResponse.redirect(new URL(`/modules/${module.id}`,req.url),303);
}
