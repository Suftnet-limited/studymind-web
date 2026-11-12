import type {Metadata} from 'next';
import {cookies} from 'next/headers';
import {currentUserId} from '@/lib/session';
import {SiteHeader} from '@/components/site-header';
import {prisma} from '@/lib/prisma';
import './globals.css';
import { QueryProvider } from '@/components/query-provider';
export const metadata:Metadata={title:'StudyMind | Learn smarter with AI',description:'StudyMind helps students and lecturers turn learning materials into meaningful study experiences.'};
export default async function RootLayout({children}:{children:React.ReactNode}){
 const userId=await currentUserId();
 const jar=await cookies();
 const hasAiSession=!!(jar.get('studymind_ai_access')||jar.get('studymind_ai_refresh'));
 const user=userId?await prisma.user.findUnique({where:{id:userId},select:{role:true,name:true}}):null;
 return <html lang="en"><body className="bg-[#fcfcff] text-zinc-900 antialiased"><SiteHeader legacyUser={user?{name:user.name,role:user.role}:null} initialSignedIn={hasAiSession}/>
<QueryProvider><main>{children}</main></QueryProvider><footer className="border-t border-zinc-100 bg-white py-8"><div className="mx-auto flex max-w-6xl flex-wrap px-5 items-center justify-between gap-2 text-sm text-zinc-500"><span>© {new Date().getFullYear()} StudyMind</span><span>Learn smarter. Teach better.</span></div></footer></body></html>
}
