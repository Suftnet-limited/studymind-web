import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { createSession } from '@/lib/session';
export const runtime='nodejs';
export async function POST(req:Request){const data=await req.formData();const name=String(data.get('name')||'').trim();const email=String(data.get('email')||'').trim().toLowerCase();const password=String(data.get('password')||'');const role=String(data.get('role')||'');if(!name||!/^\S+@\S+\.\S+$/.test(email)||password.length<12||!['STUDENT','LECTURER'].includes(role))return NextResponse.json({error:'Invalid registration details'}, {status:400});const existing=await prisma.user.findUnique({where:{email}});if(existing)return NextResponse.json({error:'Account already exists'}, {status:409});const user=await prisma.user.create({data:{name,email,passwordHash:await hash(password,12),role:role as 'STUDENT'|'LECTURER'}});await createSession(user.id);return NextResponse.redirect(new URL('/dashboard',req.url),303)}
