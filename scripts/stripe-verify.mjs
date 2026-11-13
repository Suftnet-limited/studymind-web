// Verifies Stripe TEST-mode credentials before billing is enabled locally. Prints PASS/FAIL lines only - never a secret.
//   STRIPE_SECRET_KEY=... [STRIPE_PUBLISHABLE_KEY=...] [STRIPE_WEBHOOK_SECRET=...] [STRIPE_PRICE_ID=...] node scripts/stripe-verify.mjs
// Exit 0 = usable test credentials. Exit 3 = a LIVE credential was detected (fail closed). Exit 1 = missing/invalid/placeholder.
const env = process.env; let bad = 0, live = 0;
const out = (ok, what, extra = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${extra ? `  (${extra})` : ''}`); return ok; };
const looksFake = (v) => v.length < 30 || /replace|your|xxx|example|placeholder|dummy|changeme|todo|standin/i.test(v);
const LIVE = /^(sk|pk|rk)_live_/;

const sk = env.STRIPE_SECRET_KEY || '', pk = env.STRIPE_PUBLISHABLE_KEY || '', wh = env.STRIPE_WEBHOOK_SECRET || '', price = env.STRIPE_PRICE_ID || '';
for (const [name, v] of [['secret key', sk], ['publishable key', pk]]) if (LIVE.test(v)) { live++; out(false, `${name} is a LIVE key: refusing`); }
if (live) process.exit(3);
out(sk.startsWith('sk_test_'), 'secret key begins with sk_test_');
out(!!sk && !looksFake(sk), 'secret key is not a placeholder');
if (pk) { out(pk.startsWith('pk_test_'), 'publishable key begins with pk_test_'); } else console.log('NOTE  no publishable key configured (not needed: Checkout is a server-side redirect)');
if (wh) { out(wh.startsWith('whsec_'), 'webhook secret begins with whsec_'); out(!looksFake(wh), 'webhook secret is not a placeholder'); } else console.log('NOTE  no webhook secret yet (use `stripe listen --print-secret` for the local endpoint)');
if (bad) process.exit(1);

const get = async (path) => { const r = await fetch(`https://api.stripe.com${path}`, { headers: { Authorization: `Bearer ${sk}` }, signal: AbortSignal.timeout(15000) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
try {
  const bal = await get('/v1/balance');
  out(bal.status === 200 && bal.body.livemode === false, 'Stripe confirms this key is TEST mode (balance.livemode === false)', `HTTP ${bal.status}`);
  if (price) { const p = await get(`/v1/prices/${price}`); out(p.status === 200 && p.body.livemode === false, 'price exists in the test environment', `HTTP ${p.status}`);
    if (p.status === 200) out(p.body.unit_amount === 399 && p.body.currency === 'gbp', 'price is GBP 3.99', `${p.body.currency} ${p.body.unit_amount}`); }
} catch (e) { out(false, 'could not reach Stripe', String(e.message).slice(0, 80)); }
process.exit(bad ? 1 : 0);
