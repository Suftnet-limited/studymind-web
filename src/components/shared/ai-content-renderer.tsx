'use client';
// The one place AI-generated educational text is rendered: Markdown (GFM tables, lists, task lists), maths (KaTeX, with mhchem for
// \ce{...} chemistry), syntax-highlighted code, and safe links. Used by Chat, Quiz, Flashcards and Summary.
//
// Safety: raw HTML in the text is NEVER turned into elements (no rehype-raw), links are limited to http(s)/mailto by react-markdown's
// default URL filter, images are not loaded (model output must not make the browser fetch remote URLs), and KaTeX runs untrusted
// (no \href, \url or \includegraphics). A rendering failure falls back to the plain text instead of breaking the page.
import { Component, memo, useMemo, type ErrorInfo, type ReactNode } from 'react';
import ReactMarkdown, { type Components, type Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import 'katex/contrib/mhchem';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';
import { normalizeAIContent } from '@/lib/ai-content.mjs';
import { cn } from '@/lib/utils';

const remarkPlugins: Options['remarkPlugins'] = [remarkGfm, remarkMath];
const rehypePlugins: Options['rehypePlugins'] = [
  [rehypeKatex, { throwOnError: false, errorColor: '#b91c1c', strict: 'ignore', trust: false, maxExpand: 1000, maxSize: 40 }],
  [rehypeHighlight, { detect: false, ignoreMissing: true }],
];

const level = (n: 3 | 4 | 5 | 6, cls: string) => function Heading({ children }: { children?: ReactNode }) {
  const Tag = `h${n}` as 'h3';
  return <Tag className={cn('mt-5 mb-2 first:mt-0 font-bold tracking-tight text-[#111034]', cls)}>{children}</Tag>;
};

const codeFence = (language: string | undefined) => language ? <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{language}</span> : null;

const block: Components = {
  h1: level(3, 'text-xl'), h2: level(4, 'text-lg'), h3: level(5, 'text-base'), h4: level(6, 'text-base'), h5: level(6, 'text-sm'), h6: level(6, 'text-sm'),
  p: ({ children }) => <p className="my-2.5 first:mt-0 last:mb-0 break-words leading-7">{children}</p>,
  ul: ({ children, className }) => <ul className={cn('my-2.5 space-y-1 pl-6', className?.includes('contains-task-list') ? 'list-none pl-1' : 'list-disc marker:text-violet-400 [&_ul]:list-[circle]')}>{children}</ul>,
  ol: ({ children }) => <ol className="my-2.5 list-decimal space-y-1 pl-6 marker:font-semibold marker:text-violet-600">{children}</ol>,
  li: ({ children }) => <li className="break-words pl-0.5 leading-7 [&>p]:my-1">{children}</li>,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-violet-700 underline underline-offset-2 hover:text-violet-900">{children}</a>,
  blockquote: ({ children }) => <blockquote className="my-3 rounded-r-xl border-l-4 border-violet-300 bg-violet-50/50 px-4 py-1 text-zinc-700 [&>p]:my-1.5">{children}</blockquote>,
  hr: () => <hr className="my-5 border-zinc-200" />,
  strong: ({ children }) => <strong className="font-bold text-[#111034]">{children}</strong>,
  img: ({ alt }) => <span className="italic text-zinc-500">[{alt || 'image'}]</span>,        // never load remote images from model output
  table: ({ children }) => <div className="my-3 max-w-full overflow-x-auto rounded-xl border border-zinc-200" tabIndex={0} role="region" aria-label="Table"><table className="min-w-full border-collapse text-left text-sm">{children}</table></div>,
  thead: ({ children }) => <thead className="bg-violet-50/60">{children}</thead>,
  th: ({ children, style }) => <th style={style} className="border-b border-zinc-200 px-3.5 py-2.5 font-semibold text-[#111034]">{children}</th>,
  td: ({ children, style }) => <td style={style} className="border-t border-zinc-100 px-3.5 py-2.5 align-top">{children}</td>,
  input: ({ checked }) => <input type="checkbox" checked={!!checked} readOnly disabled className="mr-2 size-4 accent-violet-600 align-middle" />,
  pre: ({ children }) => {
    const code = (Array.isArray(children) ? children[0] : children) as { props?: { className?: string } } | undefined;
    const language = /language-([\w+-]+)/.exec(code?.props?.className ?? '')?.[1];
    return <pre tabIndex={0} className="my-3 max-w-full overflow-x-auto rounded-xl bg-zinc-900 px-4 py-3 text-[13px] leading-6 text-slate-200 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit">{codeFence(language)}{children}</pre>;
  },
  code: ({ children, className }) => <code className={cn('font-mono', className ?? 'rounded-md bg-zinc-100 px-1.5 py-0.5 text-[0.88em] text-rose-700')}>{children}</code>,
};

// Inline variant for places that sit inside a button, legend or label (flashcards, quiz options): paragraphs become spans.
const inline: Components = { ...block, p: ({ children }) => <span>{children}</span> };

const MATH_BOX = '[&_.katex-display]:my-3 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-1 [&_.katex-display>.katex]:max-w-full';

class Safe extends Component<{ text: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_e: Error, _i: ErrorInfo) { /* the plain-text fallback below is the recovery */ }
  componentDidUpdate(prev: { text: string }) { if (prev.text !== this.props.text && this.state.failed) this.setState({ failed: false }); }
  render() { return this.state.failed ? <span className="whitespace-pre-wrap break-words">{this.props.text}</span> : this.props.children; }
}

export type AIContentRendererProps = { content: string; inline?: boolean; className?: string };

/** Renders AI-generated Markdown with maths, chemistry and code. `inline` keeps everything in a single line box (for buttons and labels). */
export const AIContentRenderer = memo(function AIContentRenderer({ content, inline: isInline = false, className }: AIContentRendererProps) {
  const source = useMemo(() => normalizeAIContent(content), [content]);
  const Wrapper = isInline ? 'span' : 'div';
  return <Wrapper data-ai-content className={cn('min-w-0 max-w-full break-words text-[15px] text-zinc-900', MATH_BOX, className)}>
    <Safe text={source}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={isInline ? inline : block}>{source}</ReactMarkdown>
    </Safe>
  </Wrapper>;
});
