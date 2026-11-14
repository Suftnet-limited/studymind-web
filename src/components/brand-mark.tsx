/** Revvo logotype: sparkle icon + wordmark. Decorative on its own; give the surrounding link its accessible name. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold tracking-tight text-violet-700 ${className ?? ''}`}>
      {/* Sparkle / diamond icon */}
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="h-[1em] w-[1em] shrink-0" fill="currentColor">
        <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z" />
        <path d="M19 15l1.09 3.26L23 19l-2.91.74L19 23l-1.09-3.26L15 19l2.91-.74L19 15z" opacity=".6" />
        <path d="M5 2l.73 2.18L8 5l-2.27.82L5 8l-.73-2.18L2 5l2.27-.82L5 2z" opacity=".45" />
      </svg>
      <span>Revvo</span>
    </span>
  );
}
