export const billingService={
 async checkout():Promise<string>{
  const response=await fetch('/api/billing/checkout',{method:'POST'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||typeof data.url!=='string')throw new Error(data.error||'Checkout unavailable');
  return data.url;
 }
};
