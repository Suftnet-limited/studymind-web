import {NextResponse} from 'next/server';
import Stripe from 'stripe';
import {stripe} from '@/lib/stripe';
import {prisma} from '@/lib/prisma';
export const runtime='nodejs';
async function activate(session:Stripe.Checkout.Session){if(session.mode!=='payment'||session.payment_status!=='paid')return;const userId=session.client_reference_id;const paymentIntentId=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;if(!userId||!paymentIntentId||!session.metadata?.passDays)return;const days=Number(session.metadata.passDays);if(!Number.isInteger(days)||days<1||days>365)return;const user=await prisma.user.findUnique({where:{id:userId},select:{id:true}});if(!user)return;const now=new Date();await prisma.$transaction(async tx=>{const existing=await tx.accessPass.findUnique({where:{stripePaymentIntentId:paymentIntentId}});if(existing)return;const active=await tx.accessPass.findFirst({where:{userId,status:'ACTIVE',expiresAt:{gt:now}},orderBy:{expiresAt:'desc'},select:{expiresAt:true}});const start=active?.expiresAt&&active.expiresAt>now?active.expiresAt:now;await tx.accessPass.create({data:{userId,status:'ACTIVE',startsAt:start,expiresAt:new Date(start.getTime()+days*86400000),stripePaymentIntentId:paymentIntentId}})})}
async function revokeByPaymentIntent(paymentIntentId:string){await prisma.accessPass.updateMany({where:{stripePaymentIntentId:paymentIntentId,status:'ACTIVE'},data:{status:'REVOKED'}})}
async function reconcileRefund(charge:Stripe.Charge){
 const id=typeof charge.payment_intent==='string'?charge.payment_intent:charge.payment_intent?.id;
 if(!id||charge.amount<=0)return;
 const latest=await stripe().charges.retrieve(charge.id);
 const pass=await prisma.accessPass.findUnique({where:{stripePaymentIntentId:id}});
 if(!pass||pass.status==='REVOKED')return;
 const refunded=Math.min(latest.amount,Math.max(0,latest.amount_refunded));
 if(!refunded)return;
 if(refunded>=latest.amount){await revokeByPaymentIntent(id);return}
 const intent=await stripe().paymentIntents.retrieve(id);const days=Number(intent.metadata.passDays);if(!Number.isInteger(days)||days<1||days>365)throw new Error('Missing original pass duration for refund reconciliation');const originalMs=days*86400000;
 const remainingFraction=(latest.amount-refunded)/latest.amount;
 const revisedEnd=new Date(pass.startsAt.getTime()+Math.floor(originalMs*remainingFraction));
 await prisma.accessPass.updateMany({where:{id:pass.id,status:'ACTIVE',expiresAt:{gt:revisedEnd}},data:{expiresAt:revisedEnd}});
}
async function handleDispute(dispute:Stripe.Dispute){const chargeId=typeof dispute.charge==='string'?dispute.charge:dispute.charge?.id;if(!chargeId)return;const charge=await stripe().charges.retrieve(chargeId);const id=typeof charge.payment_intent==='string'?charge.payment_intent:charge.payment_intent?.id;if(!id)return;if(dispute.status==='won'){if(charge.refunded||charge.amount_refunded>0)return;const pass=await prisma.accessPass.findUnique({where:{stripePaymentIntentId:id}});if(pass?.status==='REVOKED'&&pass.expiresAt>new Date())await prisma.accessPass.update({where:{id:pass.id},data:{status:'ACTIVE'}});return}await revokeByPaymentIntent(id)}
export async function POST(req:Request){const secret=process.env.STRIPE_WEBHOOK_SECRET;if(!secret)return NextResponse.json({error:'Webhook not configured'},{status:503});const signature=req.headers.get('stripe-signature');if(!signature)return NextResponse.json({error:'Missing signature'},{status:400});let event:Stripe.Event;try{event=stripe().webhooks.constructEvent(await req.text(),signature,secret)}catch{return NextResponse.json({error:'Invalid signature'},{status:400})}try{if(event.type==='checkout.session.completed'||event.type==='checkout.session.async_payment_succeeded')await activate(event.data.object as Stripe.Checkout.Session);if(event.type==='charge.refunded')await reconcileRefund(event.data.object as Stripe.Charge);if(event.type==='charge.dispute.created'||event.type==='charge.dispute.updated'||event.type==='charge.dispute.closed')await handleDispute(event.data.object as Stripe.Dispute);return NextResponse.json({received:true})}catch(e){console.error('Webhook processing failed',e instanceof Error?e.message:'unknown');return NextResponse.json({error:'Processing failed'},{status:500})}}
