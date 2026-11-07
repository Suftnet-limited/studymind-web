'use client';
import {useState} from 'react';
export function ShareModuleCode({code}:{code:string}){
 const [copied,setCopied]=useState(false);
 async function copy(){try{await navigator.clipboard.writeText(code);setCopied(true)}catch{setCopied(false)}}
 return <div><h2 style={{letterSpacing:2}}>{code}</h2><button type="button" className="btn secondary" onClick={()=>void copy()}>{copied?'Copied':'Copy enrolment code'}</button><p role="status" className="muted">{copied?'Code copied. Share it securely with your students.':''}</p></div>
}
