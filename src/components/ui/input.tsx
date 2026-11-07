import * as React from 'react';
import {cn} from '@/lib/utils';
export function Input({className,type='text',...props}:React.InputHTMLAttributes<HTMLInputElement>){return <input data-slot="input" type={type} className={cn('flex h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50',className)} {...props}/>}
