import { SiteFooter } from '@/components/site-footer';
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
 return <html lang="en"><body className="bg-[#fcfcff] text-zinc-900 antialiased flex flex-col min-h-screen"><SiteHeader legacyUser={user?{name:user.name,role:user.role}:null} initialSignedIn={hasAiSession}/>
<QueryProvider><main className="flex-1">{children}</main></QueryProvider><SiteFooter/></body></html>
}
