// Transparent proxy between the Web app and the REAL StudyMind AI backend, with injectable faults. Tests only.
//   UPSTREAM=http://127.0.0.1:8000 PORT=8002 node tests/fixtures/fault-proxy.mjs      (Web: STUDYMIND_AI_BASE_URL=http://127.0.0.1:8002)
// Everything is forwarded untouched (real auth, real authorisation) unless a fault rule matches:
//   POST   /__fault   {"match":"/api/auth/refresh","method":"POST","status":503,"times":1}   respond with `status` instead of forwarding
//                     {"match":"/api/modules","drop":true,"times":-1}                          destroy the connection (backend "down")
//                     {"match":"/api/modules","delayMs":3000}                                  forward, but slowly
//                     `times` = how many matching requests the rule applies to (-1 = until cleared, default 1)
//   DELETE /__fault   clear rules          GET /__log   requests seen (method, path, status, faulted)        DELETE /__log   clear
import http from 'node:http';

const UPSTREAM = (process.env.UPSTREAM || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const PORT = Number(process.env.PORT || 8002);
const HOST = process.env.HOST || '127.0.0.1';
if (!['127.0.0.1', 'localhost'].includes(new URL(UPSTREAM).hostname)) { console.error('fault-proxy only fronts a local backend'); process.exit(2); }
let rules = []; const log = [];
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const body = (req) => new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); });

http.createServer(async (req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/__fault') {
    if (req.method === 'DELETE') { rules = []; return json(res, 200, { cleared: true }); }
    if (req.method === 'POST') { const r = JSON.parse((await body(req)).toString() || '{}'); rules.push({ times: 1, ...r }); return json(res, 200, { rules: rules.length }); }
    return json(res, 200, rules);
  }
  if (path === '/__log') { if (req.method === 'DELETE') { log.length = 0; return json(res, 200, { cleared: true }); } return json(res, 200, log); }

  const rule = rules.find((r) => r.times !== 0 && new RegExp(r.match).test(path) && (!r.method || r.method === req.method));
  if (rule) { if (rule.times > 0) rule.times -= 1; }
  const entry = { method: req.method, path, faulted: Boolean(rule && (rule.status || rule.drop)) };
  const payload = await body(req);
  if (rule?.drop) { entry.status = 'dropped'; log.push(entry); return req.socket.destroy(); }
  if (rule?.status) { entry.status = rule.status; log.push(entry); return json(res, rule.status, { detail: 'injected fault' }); }
  if (rule?.delayMs) await new Promise((r) => setTimeout(r, rule.delayMs));
  try {
    const headers = { ...req.headers }; delete headers.host; delete headers['content-length'];
    const up = await fetch(UPSTREAM + req.url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : payload });
    entry.status = up.status; log.push(entry);
    const out = Buffer.from(await up.arrayBuffer());
    res.writeHead(up.status, { 'Content-Type': up.headers.get('content-type') || 'application/json' }); res.end(out);
  } catch { entry.status = 'upstream-unreachable'; log.push(entry); json(res, 502, { detail: 'upstream unreachable' }); }
}).listen(PORT, HOST, () => console.log(`fault-proxy ${HOST}:${PORT} -> ${UPSTREAM}`));
