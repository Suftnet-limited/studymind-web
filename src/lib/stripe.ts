import 'server-only';
import Stripe from 'stripe';
export function stripe(){const secret=process.env.STRIPE_SECRET_KEY;if(!secret)throw new Error('STRIPE_SECRET_KEY not configured');
 // Local and test runs must never reach a live Stripe account: refuse a live key anywhere except a production build.
 if(process.env.NODE_ENV!=='production'&&/^(sk|rk)_live_/.test(secret))throw new Error('A live Stripe key is not allowed outside production');return new Stripe(secret)}
export function passConfig(){const price=process.env.STRIPE_ACCESS_PRICE_ID;const days=Number(process.env.ACCESS_PASS_DAYS||'28');if(!price||!/^price_[A-Za-z0-9]+$/.test(price))throw new Error('STRIPE_ACCESS_PRICE_ID must be configured');if(!Number.isInteger(days)||days<1||days>365)throw new Error('ACCESS_PASS_DAYS must be 1-365');return {price,days}}
