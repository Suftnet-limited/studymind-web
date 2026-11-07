import * as React from 'react';
import {cn} from '@/lib/utils';
export function Badge({className,...props}:React.HTMLAttributes<HTMLSpanElement>){return <span data-slot="badge" className={cn('inline-flex items-center rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700',className)} {...props}/>}
