import { SiteFooter } from '@/components/site-footer';
import type {Metadata} from 'next';
import {cookies} from 'next/headers';
import {currentUserId} from '@/lib/session';
import {SiteHeader} from '@/components/site-header';
import {prisma} from '@/lib/prisma';
import './globals.css';
import { QueryProvider } from '@/components/query-provider';
import { RecaptchaProvider } from '@/components/recaptcha-provider';
import { AnalyticsProvider } from '@/components/analytics-provider';
import { Suspense } from 'react';
export const metadata: Metadata = {
  title: { default: 'Ciquis — AI Study Companion', template: '%s | Ciquis' },
  description: 'Ciquis turns your course materials into an AI tutor, quizzes, flashcards and smart summaries. Join your module with an enrolment code and study smarter.',
  metadataBase: new URL('https://ciquis.com'),
  robots: { index: true, follow: true },
  icons: { icon: '/favicon.ico' },
};
export default async function RootLayout({children}:{children:React.ReactNode}){
 const userId=await currentUserId();
 const jar=await cookies();
 const hasAiSession=!!(jar.get('studymind_ai_access')||jar.get('studymind_ai_refresh'));
 const user=userId?await prisma.user.findUnique({where:{id:userId},select:{role:true,name:true}}):null;
 return <html lang="en"><body className="bg-[#fcfcff] text-zinc-900 antialiased flex flex-col min-h-screen"><SiteHeader legacyUser={user?{name:user.name,role:user.role}:null} initialSignedIn={hasAiSession}/>
<Suspense><AnalyticsProvider /></Suspense><RecaptchaProvider><QueryProvider><main className="flex-1">{children}</main></QueryProvider></RecaptchaProvider><SiteFooter/></body></html>
}
