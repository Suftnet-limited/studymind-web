import type {Metadata} from 'next';
import Link from 'next/link';
import {BookOpen} from 'lucide-react';
import {currentUserId} from '@/lib/session';
import {prisma} from '@/lib/prisma';
import './globals.css';
export const metadata:Metadata={title:'StudyMind | Learn smarter with AI',description:'StudyMind helps students and lecturers turn learning materials into meaningful study experiences.'};
export default async function RootLayout({children}:{children:React.ReactNode}){
 const userId=await currentUserId();
 const user=userId?await prisma.user.findUnique({where:{id:userId},select:{role:true,name:true}}):null;
 return <html lang="en"><body className="bg-[#fcfcff] text-zinc-900 antialiased"><header className="border-b border-zinc-100 bg-white"><div className="container flex min-h-[72px] flex-wrap items-center justify-between gap-3 py-3"><Link href="/" className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-violet-700"><span className="rounded-xl bg-violet-600 p-2 text-white"><BookOpen className="size-5"/></span>StudyMind</Link><nav aria-label="Main navigation" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-zinc-600 sm:gap-x-6">{user?<><Link className="hover:text-violet-700" href="/dashboard">Dashboard</Link><Link className="hover:text-violet-700" href="/modules">My modules</Link>{user.role==='LECTURER'&&<Link className="hover:text-violet-700" href="/lecturer">Teaching</Link>}<Link className="hover:text-violet-700" href="/billing">AI access</Link><form action="/api/auth/logout" method="post"><button type="submit" className="rounded-lg border border-zinc-200 px-3 py-2 hover:bg-zinc-50">Sign out</button></form></>:<><Link className="hidden hover:text-violet-700 sm:inline" href="/#features">Features</Link><Link className="hidden hover:text-violet-700 sm:inline" href="/#how-it-works">How it works</Link><Link href="/sign-in">Sign in</Link><Link className="rounded-lg bg-violet-600 px-4 py-2 font-semibold text-white hover:bg-violet-700" href="/sign-up">Get started</Link></>}</nav></div></header><main>{children}</main><footer className="border-t border-zinc-100 bg-white py-8"><div className="container flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-500"><span>© {new Date().getFullYear()} StudyMind</span><span>Learn smarter. Teach better.</span></div></footer></body></html>
}
