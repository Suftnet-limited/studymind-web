import * as React from 'react';
import { cn } from '@/lib/utils';
export function Textarea({className,...props}:React.TextareaHTMLAttributes<HTMLTextAreaElement>){return <textarea data-slot="textarea" className={cn('flex min-h-24 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus-visible:border-violet-500 focus-visible:ring-2 focus-visible:ring-violet-500/20 disabled:opacity-50',className)} {...props}/>;}
