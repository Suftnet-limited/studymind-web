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
async function processEvent(event:Stripe.Event){
 if(event.type==='checkout.session.completed'||event.type==='checkout.session.async_payment_succeeded'){
  const session=await stripe().checkout.sessions.retrieve((event.data.object as Stripe.Checkout.Session).id);
  await activate(session);
 }
 if(event.type==='charge.refunded')await reconcileRefund(event.data.object as Stripe.Charge);
 if(event.type==='charge.dispute.created'||event.type==='charge.dispute.updated'||event.type==='charge.dispute.closed'){
  const latest=await stripe().disputes.retrieve((event.data.object as Stripe.Dispute).id);
  await handleDispute(latest);
 }
}
export async function POST(req:Request){
 const secret=process.env.STRIPE_WEBHOOK_SECRET;
 if(!secret)return NextResponse.json({error:'Webhook not configured'},{status:503});
 const signature=req.headers.get('stripe-signature');
 if(!signature)return NextResponse.json({error:'Missing signature'},{status:400});
 let event:Stripe.Event;
 try{event=stripe().webhooks.constructEvent(await req.text(),signature,secret)}
 catch{return NextResponse.json({error:'Invalid signature'},{status:400})}
 try{
  await prisma.stripeWebhookEvent.upsert({where:{id:event.id},create:{id:event.id,type:event.type},update:{}});
  const now=new Date();
  const stale=new Date(now.getTime()-5*60*1000);
  const claim=await prisma.stripeWebhookEvent.updateMany({
   where:{id:event.id,processedAt:null,OR:[{processingAt:null},{processingAt:{lt:stale}}]},
   data:{processingAt:now}
  });
  if(claim.count===0){
   const existing=await prisma.stripeWebhookEvent.findUnique({where:{id:event.id}});
   if(existing?.processedAt)return NextResponse.json({received:true,duplicate:true});
   return NextResponse.json({error:'Webhook processing in progress; retry later'},{status:503,headers:{'Retry-After':'30'}});
  }
  await processEvent(event);
  await prisma.stripeWebhookEvent.update({where:{id:event.id},data:{processedAt:new Date(),processingAt:null}});
  return NextResponse.json({received:true});
 }catch(e){
  await prisma.stripeWebhookEvent.updateMany({where:{id:event.id,processedAt:null},data:{processingAt:null}}).catch(()=>{});
  console.error('Webhook processing failed',event.id,e instanceof Error?e.message:'unknown');
  return NextResponse.json({error:'Processing failed; Stripe may retry'},{status:500});
 }
}
