'use client';
import {useState,type FormEvent} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Card,CardContent,CardHeader,CardTitle,CardDescription} from '@/components/ui/card';
export function AuthForm({mode}:{mode:'login'|'register'}){
 const router=useRouter();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const register=mode==='register';
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   const data=new FormData(e.currentTarget);
   const res=await fetch(register?'/api/auth/register':'/api/auth/login',{method:'POST',body:data,redirect:'follow'});
   if(!res.ok){const payload=await res.json().catch(()=>({error:'Unable to complete request'}));throw new Error(payload.error||'Unable to complete request')}
   router.push('/dashboard');router.refresh();
  }catch(err){setError(err instanceof Error?err.message:'Unable to complete request');setBusy(false)}
 }
 return <div className="mx-auto w-full max-w-md px-4 py-14 sm:py-20"><Card className="shadow-lg shadow-violet-950/5"><CardHeader className="space-y-2"><span className="text-xs font-bold uppercase tracking-widest text-violet-700">{register?'Get started':'Welcome back'}</span><CardTitle className="text-2xl">{register?'Create your account':'Sign in to StudyMind'}</CardTitle><CardDescription>{register?'Choose how you want to learn or teach.':'Continue where you left off.'}</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="space-y-5">{register&&<label className="block space-y-2 text-sm font-semibold">Full name<Input name="name" autoComplete="name" required maxLength={120}/></label>}<label className="block space-y-2 text-sm font-semibold">Email address<Input name="email" type="email" autoComplete="email" required/></label><label className="block space-y-2 text-sm font-semibold">Password<Input name="password" type="password" autoComplete={register?'new-password':'current-password'} minLength={register?12:undefined} required/>{register&&<span className="block text-xs font-normal text-zinc-500">At least 12 characters.</span>}</label>{register&&<label className="block space-y-2 text-sm font-semibold">I am a<select name="role" required className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"><option value="STUDENT">Student</option><option value="LECTURER">Lecturer</option></select></label>}{error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<Button className="w-full" type="submit" disabled={busy}>{busy?'Please wait…':register?'Create account':'Sign in'}</Button></form><p className="mt-6 text-center text-sm text-zinc-500">{register?'Already have an account?':'New to StudyMind?'} <Link className="font-semibold text-violet-700 hover:underline" href={register?'/sign-in':'/sign-up'}>{register?'Sign in':'Create an account'}</Link></p></CardContent></Card></div>
}
