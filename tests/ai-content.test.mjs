import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAIContent as n } from '../src/lib/ai-content.mjs';

test('other LaTeX delimiters become $ and $$ (existing stored content)', () => {
  assert.equal(n(String.raw`Add \(\frac{2}{5}+\frac{3}{10}=\frac{7}{10}\) now`), String.raw`Add $\frac{2}{5}+\frac{3}{10}=\frac{7}{10}$ now`);
  assert.equal(n(String.raw`\[\int_0^1 x^2\,dx=\frac{1}{3}\]`).trim(), '$$\n' + String.raw`\int_0^1 x^2\,dx=\frac{1}{3}` + '\n$$', 'alone on its line: a block');
  assert.equal(n(String.raw`so \[x=1\] holds`), 'so $$x=1$$ holds', 'mid-sentence: stays inline');
  assert.equal(n('$$E=mc^2$$').trim(), '$$\nE=mc^2\n$$');
  assert.match(n('Steps:\n\\[\nx = 1\n+ 2\n\\]\nDone'), /\n\n\$\$\nx = 1\n\+ 2\n\$\$\n\n/);
  assert.equal(n(String.raw`$x^2+y^2=z^2$ and $$E=mc^2$$`), String.raw`$x^2+y^2=z^2$ and $$E=mc^2$$`);    // already right: untouched
  assert.match(n(String.raw`\begin{align}a&=b\\ c&=d\end{align}`), /\$\$\n\\begin\{align\}a&=b\\\\ c&=d\\end\{align\}\n\$\$/);
});

test('damaged backslashes are repaired: JSON control characters and doubled slashes', () => {
  assert.equal(n('$\frac{1}{2}$'), String.raw`$\frac{1}{2}$`);                                  // form feed + "rac"
  assert.equal(n('$6.02 \times 10^{23}$'), String.raw`$6.02 \times 10^{23}$`);                // tab + "imes"
  assert.equal(n('$\beta + \theta$'), String.raw`$\beta + \theta$`);                          // backspace, tab
  assert.equal(n('$a \neq b$'), String.raw`$a \neq b$`);                                      // newline + "eq"
  assert.equal(n('$\\left(x\r' + 'ight)$'), String.raw`$\left(x\right)$`);                          // CR + "ight"
  assert.equal(n(String.raw`$\\frac{1}{2}$ and \\(x\\)`), String.raw`$\frac{1}{2}$ and $x$`);   // double-encoded
  assert.equal(n(String.raw`$a \\ b$`), String.raw`$a \\ b$`, 'a real line break in maths is kept');
  assert.equal(n('Two\tcolumns\nneat'), 'Two\tcolumns\nneat', 'ordinary tabs and newlines are untouched');
});

test('currency and ordinary prose are never turned into maths', () => {
  assert.equal(n('It costs $5 and $10 in total.'), String.raw`It costs \$5 and \$10 in total.`);
  assert.equal(n('Revenue rose from $1.2m to $3.4m.'), String.raw`Revenue rose from \$1.2m to \$3.4m.`);
  assert.equal(n('Romeo said "But soft, what light through yonder window breaks?" (Act 2).'), 'Romeo said "But soft, what light through yonder window breaks?" (Act 2).');
  assert.equal(n('Plain text with symbols: π, θ, Σ, ∞, ≤, H₂O, 2H₂ + O₂ → 2H₂O, Na⁺, ⇌, °C'), 'Plain text with symbols: π, θ, Σ, ∞, ≤, H₂O, 2H₂ + O₂ → 2H₂O, Na⁺, ⇌, °C');
  assert.equal(n('Escaped \\$ stays escaped'), 'Escaped \\$ stays escaped');
});

test('code is left exactly as written', () => {
  const fenced = '```python\nprice = "$5"  # \\(x\\) and $y$\nprint("\\\\frac")\n```';
  assert.equal(n(fenced), fenced);
  const mixed = n('Use `$HOME` and \\(x\\)\n\n```\n$a$ \\[b\\]\n```\n\nAfter \\(y\\)');
  assert.ok(mixed.includes('`$HOME`') && mixed.includes('$x$') && mixed.includes('```\n$a$ \\[b\\]\n```') && mixed.includes('After $y$'));
  assert.equal(n('```js\nunclosed $x$ \\(y\\)'), '```js\nunclosed $x$ \\(y\\)', 'an unclosed fence protects the rest');
});

test('<sup> and <sub> become maths; empty and non-string input is safe', () => {
  assert.equal(n('m<sup>2</sup> and CO<sub>2</sub>'), 'm$^{2}$ and CO$_{2}$');
  assert.equal(n('<script>alert(1)</script>'), '<script>alert(1)</script>', 'raw HTML is passed on as text; the renderer never creates elements from it');
  for (const v of [undefined, null, 5, {}, '']) assert.equal(n(v), '');
});
