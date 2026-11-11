// LOCAL STAND-IN for the parts of Stripe's TEST-mode API that the StudyMind backend uses. It is NOT Stripe and proves nothing about
// Stripe itself: it exists so the Web + backend purchase flow, webhook signature verification, replay/concurrency handling,
// failed/cancelled payments, refunds and disputes can be exercised repeatedly without a Stripe account.
//   PORT=18400 WEBHOOK_URL=http://127.0.0.1:8000/api/billing/stripe/webhook WEBHOOK_SECRET=whsec_... SECRET_KEY=sk_test_... node tests/fixtures/stripe-standin.mjs
//
// Stripe API (what the backend calls):   POST /v1/checkout/sessions   GET /v1/checkout/sessions/:id   GET /v1/payment_intents/:id
// Hosted "Checkout" page:                GET /pay/:id  (buttons: pay with 4242, declined card, cancel)
// Test controls:                         GET /__sessions   GET /__log   DELETE /__reset
//   POST /__deliver  {"session_id","type":"checkout.session.completed","times":1,"concurrent":false,"signature":"valid|bad|stale|none"}
//   POST /__refund   {"payment_intent","amount"?}  (full refund when amount omitted)     POST /__dispute {"payment_intent","disputed":true}
//   POST /__fail     {"match":"^/v1/checkout/sessions$","status":429,"times":1}   make the next matching Stripe API call fail
//   POST /__pay      {"session_id","deliver":true|false}   mark a session paid without the browser
import crypto from 'node:crypto';
import http from 'node:http';

const PORT = Number(process.env.PORT || 18400), HOST = process.env.HOST || '127.0.0.1';
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://127.0.0.1:8000/api/billing/stripe/webhook';
const SECRET = process.env.WEBHOOK_SECRET || '', KEY = process.env.SECRET_KEY || '';
if (!SECRET.startsWith('whsec_') || !KEY.startsWith('sk_test_')) { console.error('stripe stand-in needs WEBHOOK_SECRET=whsec_... and SECRET_KEY=sk_test_...'); process.exit(2); }
for (const u of [WEBHOOK_URL]) if (!['127.0.0.1', 'localhost'].includes(new URL(u).hostname)) { console.error('stand-in only delivers to a local backend'); process.exit(2); }

const sessions = new Map(), intents = new Map(), log = []; let failRules = [];   // failRules: [{match, status, times}] applied to /v1/ calls
const rid = (p, n = 24) => `${p}${crypto.randomBytes(n).toString('hex').slice(0, n)}`;
const read = (req) => new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c).toString())); });
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const html = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Checkout (STAND-IN, not Stripe)</title><body style="font-family:system-ui;max-width:28rem;margin:3rem auto;padding:0 1rem">${body}</body>`); };

const sign = (body, mode = 'valid') => {
  const t = Math.floor(Date.now() / 1000) - (mode === 'stale' ? 3600 : 0);
  const v1 = crypto.createHmac('sha256', mode === 'bad' ? 'whsec_wrong_secret' : SECRET).update(`${t}.${body}`).digest('hex');
  return mode === 'none' ? {} : { 'Stripe-Signature': `t=${t},v1=${v1}` };
};
async function deliver(event, mode = 'valid') {
  const body = JSON.stringify(event);
  const res = await fetch(WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...sign(body, mode) }, body });
  const entry = { event: event.id, type: event.type, signature: mode, status: res.status, body: (await res.text()).slice(0, 200), at: new Date().toISOString() };
  log.push(entry); return entry;
}
const completedEvent = (session) => ({ id: rid('evt_'), object: 'event', type: 'checkout.session.completed', livemode: false, data: { object: { id: session.id, object: 'checkout.session' } } });
const reversalEvent = (type, pi) => ({ id: rid('evt_'), object: 'event', type, livemode: false, data: { object: { object: type.startsWith('charge.dispute') ? 'dispute' : 'charge', payment_intent: pi } } });

function pay(session) {
  if (session.payment_status === 'paid') return;
  session.payment_status = 'paid'; session.status = 'complete'; session.payment_intent = rid('pi_');
  intents.set(session.payment_intent, { id: session.payment_intent, livemode: false, amount: session.amount_total, amount_refunded: 0, disputed: false });
}
const sessionView = (s) => ({ id: s.id, object: 'checkout.session', livemode: false, mode: 'payment', payment_status: s.payment_status, status: s.status, currency: s.currency, amount_total: s.amount_total,
  client_reference_id: s.client_reference_id, metadata: s.metadata, payment_intent: s.payment_intent, customer_email: s.customer_email, url: s.url });
const intentView = (i) => ({ id: i.id, object: 'payment_intent', livemode: false, latest_charge: { id: `ch_${i.id.slice(3)}`, object: 'charge', livemode: false, payment_intent: i.id, amount: i.amount,
  amount_refunded: i.amount_refunded, refunded: i.amount_refunded >= i.amount, disputed: i.disputed } });

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`); const path = url.pathname;
  try {
    // ── Stripe API ──
    if (path.startsWith('/v1/')) {
      const rule = failRules.find((r) => r.times !== 0 && new RegExp(r.match).test(path));
      if (rule) { if (rule.times > 0) rule.times -= 1; log.push({ api: path, injected_status: rule.status, at: new Date().toISOString() }); return json(res, rule.status, { error: { type: 'api_error', message: 'injected failure' } }); }
      if ((req.headers.authorization || '') !== `Bearer ${KEY}`) return json(res, 401, { error: { type: 'invalid_request_error', message: 'Invalid API Key provided' } });
      if (req.method === 'POST' && path === '/v1/checkout/sessions') {
        const f = Object.fromEntries(new URLSearchParams(await read(req)));
        const s = { id: rid('cs_test_', 32), status: 'open', payment_status: 'unpaid', payment_intent: null, mode: f.mode, currency: f['line_items[0][price_data][currency]'],
          amount_total: Number(f['line_items[0][price_data][unit_amount]']), client_reference_id: f.client_reference_id, customer_email: f.customer_email, success_url: f.success_url, cancel_url: f.cancel_url,
          metadata: { studymind_user_id: f['metadata[studymind_user_id]'], studymind_product: f['metadata[studymind_product]'] }, product_name: f['line_items[0][price_data][product_data][name]'], created: Date.now() };
        s.url = `http://${req.headers.host}/pay/${s.id}`; sessions.set(s.id, s);
        return json(res, 200, { id: s.id, url: s.url });
      }
      const m = path.match(/^\/v1\/checkout\/sessions\/([^/]+)$/);
      if (req.method === 'GET' && m) { const s = sessions.get(m[1]); return s ? json(res, 200, sessionView(s)) : json(res, 404, { error: { message: 'No such checkout.session' } }); }
      const p = path.match(/^\/v1\/payment_intents\/([^/]+)$/);
      if (req.method === 'GET' && p) { const i = intents.get(p[1]); return i ? json(res, 200, intentView(i)) : json(res, 404, { error: { message: 'No such payment_intent' } }); }
      return json(res, 404, { error: { message: 'Unknown stand-in route' } });
    }
    // ── hosted checkout page ──
    let m = path.match(/^\/pay\/([^/]+)$/);
    if (m && req.method === 'GET') {
      const s = sessions.get(m[1]); if (!s) return html(res, 404, '<h1>Unknown session</h1>');
      const msg = url.searchParams.get('declined') ? '<p role=alert style="color:#b00020">Your card was declined. No payment was taken.</p>' : '';
      return html(res, 200, `<p style="background:#fff3cd;padding:.5rem">LOCAL STAND-IN for Stripe Checkout (test mode). Not Stripe.</p><h1>${s.product_name}</h1><p>Amount: £${(s.amount_total / 100).toFixed(2)} (${s.currency})</p><p>${s.customer_email}</p>${msg}
        <form method=post action="/pay/${s.id}/complete"><button data-testid=pay-ok style="padding:.6rem 1rem">Pay with test card 4242 4242 4242 4242</button></form><br>
        <form method=post action="/pay/${s.id}/decline"><button data-testid=pay-declined style="padding:.6rem 1rem">Pay with declined test card 4000 0000 0000 0002</button></form><br>
        <a data-testid=cancel href="${s.cancel_url}">← Cancel and return</a>`);
    }
    m = path.match(/^\/pay\/([^/]+)\/(complete|decline)$/);
    if (m && req.method === 'POST') {
      const s = sessions.get(m[1]); if (!s) return html(res, 404, '<h1>Unknown session</h1>');
      if (m[2] === 'decline') { log.push({ session: s.id, type: 'card_declined', at: new Date().toISOString() }); res.writeHead(303, { Location: `/pay/${s.id}?declined=1` }); return res.end(); }
      pay(s); await deliver(completedEvent(s));           // like Stripe: the webhook is sent as the payment completes
      res.writeHead(303, { Location: s.success_url }); return res.end();
    }
    // ── test controls ──
    if (path === '/__sessions') return json(res, 200, [...sessions.values()].map((s) => ({ ...sessionView(s), success_url: s.success_url, cancel_url: s.cancel_url })));
    if (path === '/__log') return json(res, 200, log);
    if (path === '/__reset' && req.method === 'DELETE') { sessions.clear(); intents.clear(); log.length = 0; failRules = []; return json(res, 200, { reset: true }); }
    if (req.method === 'POST' && path.startsWith('/__')) {
      const b = JSON.parse((await read(req)) || '{}');
      if (path === '/__fail') { failRules.push({ times: 1, ...b }); return json(res, 200, { rules: failRules.length }); }
      if (path === '/__pay') { const s = sessions.get(b.session_id); if (!s) return json(res, 404, {}); pay(s); const d = b.deliver === false ? null : await deliver(completedEvent(s)); return json(res, 200, { payment_intent: s.payment_intent, delivery: d }); }
      if (path === '/__deliver') {
        const s = sessions.get(b.session_id); if (!s && b.type !== 'raw') return json(res, 404, { error: 'unknown session' });
        const event = b.type && b.type !== 'checkout.session.completed' ? reversalEvent(b.type, b.payment_intent) : completedEvent(s);
        const times = b.times || 1;
        const results = b.concurrent ? await Promise.all(Array.from({ length: times }, () => deliver({ ...event }, b.signature || 'valid')))
          : await (async () => { const r = []; for (let i = 0; i < times; i++) r.push(await deliver({ ...event }, b.signature || 'valid')); return r; })();
        return json(res, 200, results.map((r) => ({ status: r.status, body: r.body })));
      }
      if (path === '/__refund') { const i = intents.get(b.payment_intent); if (!i) return json(res, 404, {}); i.amount_refunded = b.amount ?? i.amount; const d = await deliver(reversalEvent('charge.refunded', i.id)); return json(res, 200, { delivery: d }); }
      if (path === '/__dispute') { const i = intents.get(b.payment_intent); if (!i) return json(res, 404, {}); i.disputed = b.disputed !== false; const d = await deliver(reversalEvent('charge.dispute.created', i.id)); return json(res, 200, { delivery: d }); }
    }
    json(res, 404, { error: 'not found' });
  } catch (e) { json(res, 500, { error: String(e?.message || e).slice(0, 200) }); }
}).listen(PORT, HOST, () => console.log(`STRIPE STAND-IN (not Stripe) on ${HOST}:${PORT} -> webhook ${WEBHOOK_URL}`));
