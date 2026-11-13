// Small decorative illustrations for the Plans and Allowances headers (inline SVG, no image files, hidden from assistive technology).
export function UsageIllustration({ className }: { className?: string }) {
  return <svg aria-hidden viewBox="0 0 240 150" className={className} fill="none">
    <defs>
      <linearGradient id="ui-tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#6d28d9" /></linearGradient>
      <linearGradient id="ui-book1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#7c3aed" /><stop offset="1" stopColor="#6d28d9" /></linearGradient>
      <linearGradient id="ui-book2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#818cf8" /><stop offset="1" stopColor="#6366f1" /></linearGradient>
    </defs>
    <rect x="40" y="14" width="104" height="104" rx="22" fill="url(#ui-tile)" />
    <rect x="62" y="70" width="18" height="30" rx="5" fill="#fff" fillOpacity=".75" /><rect x="90" y="52" width="18" height="48" rx="5" fill="#fff" fillOpacity=".85" /><rect x="118" y="34" width="18" height="66" rx="5" fill="#fff" fillOpacity=".95" />
    <rect x="120" y="96" width="96" height="22" rx="6" fill="url(#ui-book1)" /><rect x="128" y="99" width="84" height="16" rx="3" fill="#ede9fe" />
    <rect x="108" y="116" width="108" height="22" rx="6" fill="url(#ui-book2)" /><rect x="116" y="119" width="96" height="16" rx="3" fill="#e0e7ff" />
    <path d="M30 18l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#7c3aed" /><path d="M160 24l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#a78bfa" />
  </svg>;
}

export function PlansIllustration({ className }: { className?: string }) {
  return <svg aria-hidden viewBox="0 0 200 150" className={className} fill="none">
    <defs>
      <linearGradient id="pi-b1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#4f46e5" /><stop offset="1" stopColor="#6366f1" /></linearGradient>
      <linearGradient id="pi-b2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#7c3aed" /><stop offset="1" stopColor="#8b5cf6" /></linearGradient>
    </defs>
    <rect x="34" y="104" width="132" height="26" rx="7" fill="url(#pi-b1)" /><rect x="44" y="108" width="116" height="18" rx="3" fill="#e0e7ff" />
    <rect x="52" y="80" width="112" height="26" rx="7" fill="url(#pi-b2)" /><rect x="62" y="84" width="96" height="18" rx="3" fill="#ede9fe" />
    <path d="M100 26l56 24-56 24-56-24z" fill="#1e1b4b" /><path d="M72 62v18c0 6 12 12 28 12s28-6 28-12V62l-28 12z" fill="#312e81" />
    <path d="M150 54v26" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" /><circle cx="150" cy="84" r="4" fill="#f59e0b" />
    <path d="M168 24l4 6M178 34l6 3M170 40l7 0" stroke="#a78bfa" strokeWidth="3" strokeLinecap="round" />
  </svg>;
}
