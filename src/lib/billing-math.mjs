/** Pure money-to-access reconciliation. Amounts are in Stripe minor currency units. */
export function proratedExpiry(startsAtMs, passDays, amount, refunded){
 if(!Number.isSafeInteger(startsAtMs)||!Number.isInteger(passDays)||passDays<1||passDays>365||!Number.isSafeInteger(amount)||amount<=0||!Number.isSafeInteger(refunded)||refunded<0)throw new Error('Invalid billing inputs');
 const retained=Math.max(0,amount-Math.min(amount,refunded));
 return new Date(startsAtMs+Math.floor(passDays*86400000*(retained/amount)));
}
