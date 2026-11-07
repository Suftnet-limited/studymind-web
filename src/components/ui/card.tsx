import * as React from 'react';
import {cn} from '@/lib/utils';
export function Card({className,...props}:React.HTMLAttributes<HTMLDivElement>){return <div data-slot="card" className={cn('rounded-2xl border border-zinc-200/80 bg-white text-zinc-900 shadow-sm',className)} {...props}/>}
export function CardHeader({className,...props}:React.HTMLAttributes<HTMLDivElement>){return <div data-slot="card-header" className={cn('flex flex-col gap-1.5 p-6',className)} {...props}/>}
export function CardTitle({className,...props}:React.HTMLAttributes<HTMLHeadingElement>){return <h3 data-slot="card-title" className={cn('text-lg font-semibold tracking-tight',className)} {...props}/>}
export function CardDescription({className,...props}:React.HTMLAttributes<HTMLParagraphElement>){return <p data-slot="card-description" className={cn('text-sm leading-6 text-zinc-500',className)} {...props}/>}
export function CardContent({className,...props}:React.HTMLAttributes<HTMLDivElement>){return <div data-slot="card-content" className={cn('px-6 pb-6',className)} {...props}/>}
