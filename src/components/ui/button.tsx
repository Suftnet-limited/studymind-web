import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
const buttonVariants=cva('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',{variants:{variant:{default:'bg-violet-600 text-white hover:bg-violet-700',outline:'border border-zinc-200 bg-white text-zinc-800 hover:bg-violet-50',secondary:'bg-violet-50 text-violet-700 hover:bg-violet-100',ghost:'text-zinc-600 hover:bg-zinc-100'},size:{default:'h-10 px-4 py-2',sm:'h-9 px-3',lg:'h-11 px-6',icon:'h-10 w-10'}},defaultVariants:{variant:'default',size:'default'}});
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>,VariantProps<typeof buttonVariants>{}
export function Button({className,variant,size,...props}:ButtonProps){return <button data-slot="button" className={cn(buttonVariants({variant,size,className}))} {...props}/>}
export {buttonVariants};
