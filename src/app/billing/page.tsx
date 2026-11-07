import Link from 'next/link';
import {redirect} from 'next/navigation';
import {currentUserId} from '@/lib/session';
import {prisma} from '@/lib/prisma';
import {CheckoutButton} from './checkout-button';
export const dynamic='force-dynamic';
export default async function BillingPage(){const userId=await currentUserId();if(!userId)redirect('/sign-in');const now=new Date();const pass=await prisma.accessPass.findFirst({where:{userId,status:'ACTIVE',startsAt:{lte:now},expiresAt:{gt:now}},orderBy:{expiresAt:'desc'},select:{expiresAt:true}});return <div className="container dashboard"><div className="eyebrow">StudyMind Web</div><h1>AI access pass</h1><p className="muted">One-time payment, no recurring subscription. Access is activated after Stripe confirms your payment.</p><div className="panel" style={{maxWidth:640,marginTop:26}}>{pass?<><h2>Access active</h2><p>Available until {pass.expiresAt.toLocaleDateString('en-GB',{dateStyle:'long'})}.</p><Link className="btn" href="/dashboard">Continue to dashboard</Link></>:<><h2>Unlock AI learning and teaching tools</h2><p className="muted">The price and duration are shown and confirmed in Stripe Checkout. Payment does not activate access until verified.</p><CheckoutButton/></>}</div></div>}
