import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { moduleAccess } from '@/lib/module-access';
export const runtime='nodejs';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;const access=await moduleAccess(id);if(!access)return NextResponse.json({error:'Not found'},{status:404});const documents=await prisma.studyDocument.findMany({where:{moduleId:id,OR:[{visibility:'CLASS'},{ownerId:access.userId}]},select:{id:true,title:true,visibility:true,createdAt:true},orderBy:{createdAt:'desc'}});return NextResponse.json({documents});}
export async function POST(){return NextResponse.json({error:'Document upload is not enabled until secure storage and AI indexing are configured.'},{status:503});}
