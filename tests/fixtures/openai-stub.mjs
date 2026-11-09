// Recording stand-in for the OpenAI API, for SECURITY tests of the StudyMind AI backend. NOT real OpenAI.
//
// Purpose: prove whether the backend calls its AI provider for a request, and what content it sends.
//   - POST /v1/embeddings        -> a constant unit vector for every input, so every indexed chunk is a perfect match
//   - POST /v1/chat/completions  -> echoes the prompt it received (including any retrieved class material),
//                                    non-streaming and streaming (SSE)
//   - GET  /__hits               -> every provider request seen: [{ path, model, stream, text }]
//   - DELETE /__hits             -> clear the log
// Start the backend with OPENAI_API_BASE=http://127.0.0.1:18200/v1 and OPENAI_BASE_URL=<same>. Loopback only.
import http from 'node:http';

const PORT = Number(process.env.PORT || 18200);
const DIM = Number(process.env.EMBED_DIM || 3072);
const VECTOR = Array.from({ length: DIM }, (_, i) => (i === 0 ? 1 : 0));
const hits = [];

const readBody = (req) => new Promise((resolve) => { const p = []; req.on('data', (c) => p.push(c)); req.on('end', () => resolve(Buffer.concat(p).toString())); });
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const messageText = (messages) => (Array.isArray(messages) ? messages : []).map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n---\n');

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__hits') { if (req.method === 'DELETE') { hits.length = 0; return json(res, 200, { cleared: true }); } return json(res, 200, hits); }
  const raw = await readBody(req); let body = {}; try { body = JSON.parse(raw || '{}'); } catch { /* ignore */ }
  if (url.pathname.endsWith('/embeddings')) {
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    hits.push({ path: 'embeddings', model: body.model, stream: false, text: inputs.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('\n---\n') });
    return json(res, 200, { object: 'list', model: body.model || 'stub-embedding', data: inputs.map((_, index) => ({ object: 'embedding', index, embedding: VECTOR })), usage: { prompt_tokens: inputs.length, total_tokens: inputs.length } });
  }
  if (url.pathname.endsWith('/chat/completions')) {
    const text = messageText(body.messages);
    hits.push({ path: 'chat.completions', model: body.model, stream: !!body.stream, text });
    const answer = `[provider-stub echo]\n${text}`.slice(0, 24000);
    const base = { id: 'chatcmpl-stub', object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: body.model || 'stub' };
    if (body.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] })}\n\n`);
      for (let i = 0; i < answer.length; i += 800) res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { content: answer.slice(i, i + 800) }, finish_reason: null }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`); res.write('data: [DONE]\n\n'); return res.end();
    }
    return json(res, 200, { ...base, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: answer }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } });
  }
  hits.push({ path: url.pathname, model: undefined, stream: false, text: raw.slice(0, 500) });
  return json(res, 404, { error: { message: 'stub: unsupported route', type: 'invalid_request_error' } });
}).listen(PORT, '127.0.0.1', () => console.log(`openai-stub on 127.0.0.1:${PORT}`));
