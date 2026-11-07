import {NextResponse} from 'next/server';
import {currentUserId} from '@/lib/session';
import {prisma} from '@/lib/prisma';
export const runtime='nodejs';
export async function GET(){const userId=await currentUserId();if(!userId)return NextResponse.json({error:'Sign in required'},{status:401});const now=new Date();const pass=await prisma.accessPass.findFirst({where:{userId,status:'ACTIVE',startsAt:{lte:now},expiresAt:{gt:now}},orderBy:{expiresAt:'desc'},select:{expiresAt:true,startsAt:true}});return NextResponse.json({active:!!pass,expiresAt:pass?.expiresAt||null},{headers:{'Cache-Control':'no-store'}})}
