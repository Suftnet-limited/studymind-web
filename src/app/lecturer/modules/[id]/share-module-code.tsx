'use client';
import {useState} from 'react';
import {Copy,Check} from 'lucide-react';
import {Button} from '@/components/ui/button';
export function ShareModuleCode({code}:{code:string}){
 const [copied,setCopied]=useState(false);
 async function copy(){try{await navigator.clipboard.writeText(code);setCopied(true)}catch{setCopied(false)}}
 return <div className="space-y-3"><code className="block break-all rounded-lg border border-violet-100 bg-violet-50 px-3 py-3 text-sm font-semibold text-violet-900">{code}</code>
 <Button variant="outline" type="button" onClick={()=>void copy()}>{copied?<Check className="size-4"/>:<Copy className="size-4"/>}{copied?'Copied':'Copy Course ID'}</Button>
 <p role="status" className="text-xs text-zinc-500">{copied?'Course ID copied.':''}</p></div>;
}
