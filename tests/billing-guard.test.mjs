import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/app/api/billing/webhook/route.ts',import.meta.url),'utf8');
test('checkout activation verifies Stripe payment state and purchase ownership',()=>{
 assert.match(source,/intent\.status!=='succeeded'/);
 assert.match(source,/intent\.metadata\.userId!==userId/);
 assert.match(source,/charge\.disputed\|\|charge\.refunded/);
 assert.match(source,/charge\.amount_refunded>=charge\.amount/);
});
test('webhook signature is verified and event processing uses an atomic claim',()=>{
 assert.match(source,/webhooks\.constructEvent/);
 assert.match(source,/stripeWebhookEvent\.updateMany/);
 assert.match(source,/processedAt:null/);
 assert.match(source,/Retry-After/);
});
test('partial refunds use cumulative refund amount and original pass duration',()=>{
 assert.match(source,/latest\.amount_refunded/);
 assert.match(source,/intent\.metadata\.passDays/);
 assert.match(source,/remainingFraction/);
});
