import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { createSession } from '@/lib/session';
export const runtime='nodejs';
export async function POST(req:Request){const data=await req.formData();const email=String(data.get('email')||'').trim().toLowerCase();const password=String(data.get('password')||'');const user=await prisma.user.findUnique({where:{email}});if(!user||!(await compare(password,user.passwordHash)))return NextResponse.json({error:'Invalid email or password'}, {status:401});await createSession(user.id);return NextResponse.redirect(new URL('/dashboard',req.url),303)}
