'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * An accessible modal dialog: labelled, focus moves in and is kept inside (Tab / Shift+Tab loop), Escape or a click on the dimmed
 * background closes it, the page behind does not scroll, and focus goes back to whatever opened it.
 */
export function Modal({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode }) {
  const titleId = useId(); const descId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const close = useRef(onClose); close.current = onClose;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const items = () => [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter(el => el.offsetParent !== null || el === document.activeElement);
    // focus the first form field (not the close button) so the user can type straight away
    requestAnimationFrame(() => { (panel.current?.querySelector<HTMLElement>('input, select, textarea') ?? items()[0] ?? panel.current)?.focus(); });
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close.current(); return; }
      if (e.key !== 'Tab') return;
      const list = items(); if (!list.length) { e.preventDefault(); return; }
      const first = list[0]; const last = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panel.current?.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !panel.current?.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = previousOverflow; opener.current?.focus?.(); };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-[#111034]/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={e => { if (e.target === e.currentTarget) close.current(); }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descId : undefined} tabIndex={-1}
        className="relative w-full max-w-lg rounded-t-3xl bg-white p-6 shadow-[0_30px_80px_rgba(17,16,52,0.35)] outline-none sm:rounded-3xl sm:p-8">
        <button type="button" aria-label="Close" onClick={() => close.current()} className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-xl text-zinc-500 hover:bg-violet-50 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"><X className="size-5" aria-hidden /></button>
        <h2 id={titleId} className="pr-10 text-2xl font-extrabold tracking-tight text-[#111034]">{title}</h2>
        {description && <p id={descId} className="mt-1.5 text-sm leading-6 text-zinc-500">{description}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </div>, document.body);
}
