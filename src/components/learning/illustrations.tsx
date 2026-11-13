// Small decorative illustrations for the Plans and Allowances headers (inline SVG, no image files, hidden from assistive technology).
export function UsageIllustration({ className }: { className?: string }) {
  return <svg aria-hidden viewBox="0 0 300 190" className={className} fill="none">
    <defs>
      <linearGradient id="ui-book" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#7c3aed" /><stop offset="1" stopColor="#6d28d9" /></linearGradient>
      <linearGradient id="ui-book2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#7c3aed" /></linearGradient>
      <linearGradient id="ui-panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity=".95" /><stop offset="1" stopColor="#ede9fe" stopOpacity=".85" /></linearGradient>
      <linearGradient id="ui-bar" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#6d28d9" /></linearGradient>
      <radialGradient id="ui-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#c4b5fd" stopOpacity=".55" /><stop offset="1" stopColor="#c4b5fd" stopOpacity="0" /></radialGradient>
    </defs>
    <ellipse cx="170" cy="150" rx="140" ry="34" fill="url(#ui-glow)" />
    <rect x="96" y="104" width="150" height="34" rx="8" fill="url(#ui-book2)" /><rect x="104" y="108" width="138" height="26" rx="4" fill="#f5f3ff" /><path d="M110 118h120M110 126h104" stroke="#ddd6fe" strokeWidth="2" strokeLinecap="round" />
    <rect x="80" y="136" width="168" height="34" rx="8" fill="url(#ui-book)" /><rect x="90" y="140" width="154" height="26" rx="4" fill="#ede9fe" /><path d="M98 150h132M98 158h112" stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round" />
    <rect x="132" y="22" width="124" height="96" rx="14" fill="url(#ui-panel)" stroke="#ddd6fe" />
    <circle cx="148" cy="38" r="3.5" fill="#c4b5fd" /><circle cx="160" cy="38" r="3.5" fill="#c4b5fd" /><circle cx="172" cy="38" r="3.5" fill="#c4b5fd" />
    <rect x="152" y="86" width="16" height="20" rx="4" fill="url(#ui-bar)" /><rect x="176" y="72" width="16" height="34" rx="4" fill="url(#ui-bar)" /><rect x="200" y="58" width="16" height="48" rx="4" fill="url(#ui-bar)" /><rect x="224" y="44" width="16" height="62" rx="4" fill="url(#ui-bar)" />
    <path d="M104 40l3.5 9 9 3.5-9 3.5-3.5 9-3.5-9-9-3.5 9-3.5z" fill="#7c3aed" /><path d="M276 70l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#8b5cf6" />
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
