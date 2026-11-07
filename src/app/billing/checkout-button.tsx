'use client';
import {useBillingCheckout} from '@/hooks/use-billing-checkout';
import {Button} from '@/components/ui/button';
export function CheckoutButton(){
 const checkout=useBillingCheckout();
 async function start(){try{const url=await checkout.mutateAsync();window.location.assign(url)}catch{/* Mutation error is displayed below. */}}
 return <div className="space-y-3"><Button type="button" disabled={checkout.isPending} onClick={()=>void start()}>{checkout.isPending?'Opening Stripe…':'Purchase access pass'}</Button>{checkout.error&&<p role="alert" className="text-sm text-red-600">{checkout.error.message}</p>}</div>;
}
