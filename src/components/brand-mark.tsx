/** Ciquis brand mark: mortarboard icon + wordmark. Decorative on its own; give the surrounding link its accessible name. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-extrabold tracking-tight text-violet-700 ${className ?? ''}`}>
      <svg viewBox="0 0 52 42" aria-hidden="true" focusable="false" className="h-[1.1em] w-auto shrink-0" fill="currentColor">
        <path d="M26 2 2 14.5 26 27l24-12.5L26 2Z" />
        <path d="M11 22.5V31c0 3.9 6.7 7.5 15 7.5S41 34.9 41 31v-8.5L26 30.3l-15-7.8Z" opacity=".82" />
        <path d="M46.5 16.5v13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
        <circle cx="46.5" cy="32.5" r="3" />
      </svg>
      <span>Ciquis</span>
    </span>
  );
}
