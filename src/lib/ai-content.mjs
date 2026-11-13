// Prepares AI-generated text for the shared renderer (src/components/shared/ai-content-renderer.tsx). Pure string-to-string, so it is
// unit-tested without a browser. It never changes ordinary prose: it repairs damaged backslashes and maps the other LaTeX delimiters
// models (and older stored content) use onto the single form the renderer understands. Code (fenced or inline) is left untouched.

// LaTeX commands whose first letter is also a JSON escape (\f \b \t \r \n). A model that writes "\frac" inside a JSON string without
// doubling the backslash produces a form feed + "rac"; the characters below can only have come from that, so they are put back.
const CONTROL_FIXES = [
  [/\f/g, '\\f'],                                                              // \frac \forall \flat
  [/\x08/g, '\\b'],                                                            // \beta \bar \binom \bigg
  [/\r(?=(?:ight|ho|angle|ceil|floor)(?![a-z]))/g, '\\r'],                     // \right \rho \rangle   (a lone CR only)
  [/\t(?=(?:imes|heta|ext|extbf|au|an|ilde|riangle|op|o)(?![a-z]))/g, '\\t'],  // \times \theta \text \tau \tan \tilde \triangle \top \to
  [/\n(?=(?:eq|abla)(?![a-z]))/g, '\\n'],                                      // \neq \nabla
];

// Doubled backslashes ("\\frac") from double JSON encoding. Only before real command names, so a deliberate "\\" line break survives.
const COMMANDS = 'frac|dfrac|tfrac|sqrt|times|cdot|div|pm|mp|leq|geq|neq|approx|equiv|infty|pi|theta|alpha|beta|gamma|delta|Delta|lambda|mu|sigma|Sigma|omega|Omega|sum|prod|int|lim|log|ln|sin|cos|tan|text|mathrm|mathbf|left|right|ce|vec|hat|bar|overline|partial|nabla|to|rightarrow|Rightarrow|leftarrow|in|notin|subset|cup|cap|forall|exists|degree|circ|angle';
const DOUBLED = new RegExp('(`+[^`]*?`+)|\\\\\\\\(?=(?:' + COMMANDS + ')(?![a-zA-Z])|[()\\[\\]])', 'g');   // inline code is matched first and kept

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const SUP = /<sup>([^<>\n$]{1,24})<\/sup>/gi;
const SUB = /<sub>([^<>\n$]{1,24})<\/sub>/gi;

// One pass over ordinary text. Alternatives, in priority order: existing $$..$$, \[..\], \(..\), \begin..\end, inline $..$ (pandoc's rule:
// no space inside the dollars and a closing $ not followed by a digit, so "costs $5 and $10" is not read as maths), inline code.
const TOKEN = /(\$\$[\s\S]+?\$\$)|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(\\begin\{([A-Za-z]+\*?)\}[\s\S]+?\\end\{\5\})|(\$(?![\s$])(?:[^$\n\\]|\\.)*?[^\s$\\]\$(?!\d)|\$[^\s$\\]\$(?!\d))|(`+[^`]*?`+)/g;

function convert(text0) {
  const text = text0.replace(DOUBLED, (m, code) => code ?? '\\');
  let out = '';
  let last = 0;
  // Between maths: a lone "$" is a currency sign, so it is escaped; <sup>/<sub> (raw HTML is never rendered) become maths.
  const plain = (s) => s.replace(/\\[\s\S]|\$/g, (c) => (c === '$' ? '\\$' : c)).replace(SUP, (_, x) => `$^{${x}}$`).replace(SUB, (_, x) => `$_{${x}}$`);
  for (const m of text.matchAll(TOKEN)) {
    out += plain(text.slice(last, m.index));
    last = m.index + m[0].length;
    // A display equation alone on its line becomes a block (centred, scrolls sideways when wide); mid-sentence ones stay inline.
    const alone = (m.index === 0 || text[m.index - 1] === '\n') && (last >= text.length || text[last] === '\n');
    const display = (body) => (alone || body.includes('\n') ? `\n\n$$\n${body.trim()}\n$$\n\n` : `$$${body.trim()}$$`);
    if (m[1] !== undefined) out += display(m[1].slice(2, -2));                                    // $$ ... $$
    else if (m[2] !== undefined) out += display(m[2]);                                            // \[ ... \]
    else if (m[3] !== undefined) out += `$${m[3].trim()}$`;                                       // \( ... \)
    else if (m[4] !== undefined) out += `\n\n$$\n${m[4]}\n$$\n\n`;                                // bare \begin{align} ... \end{align}
    else out += m[0];                                                                             // inline $..$ or code
  }
  return out + plain(text.slice(last));
}

export function normalizeAIContent(input) {
  if (typeof input !== 'string' || !input) return '';
  let s = input.replace(/^﻿/, '');
  for (const [re, fix] of CONTROL_FIXES) s = s.replace(re, fix);
  s = s.replace(/\r\n?/g, '\n');

  // Split into fenced-code blocks (kept verbatim) and everything else.
  const parts = []; let buf = []; let fence = null;
  const flush = (code) => { if (buf.length) parts.push({ code, text: buf.join('\n') }); buf = []; };
  for (const line of s.split('\n')) {
    const f = FENCE.exec(line);
    if (!fence && f) { flush(false); fence = f[1]; buf.push(line); continue; }
    if (fence && f && f[1][0] === fence[0] && f[1].length >= fence.length && line.trim() === f[1]) { buf.push(line); flush(true); fence = null; continue; }
    buf.push(line);
  }
  flush(!!fence);
  return parts.map((p) => (p.code ? p.text : convert(p.text))).join('\n');
}
