'use client';
import {useState} from 'react';
export function JoinModuleForm(){
 const [code,setCode]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 async function join(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   const form=new FormData();form.set('code',code.trim());
   const res=await fetch('/api/modules/enrol',{method:'POST',body:form});
   if(!res.ok){const data=await res.json().catch(()=>({}));throw new Error(data.error||'Unable to join module')}
   if(res.redirected){const url=new URL(res.url);if(url.origin!==window.location.origin)throw new Error('Unexpected redirect');window.location.assign(url.pathname+url.search);return}
   window.location.assign('/modules');
  }catch(e){setError(e instanceof Error?e.message:'Unable to join module');setBusy(false)}
 }
 return <form onSubmit={e=>void join(e)} className="actions"><input name="code" required maxLength={40} value={code} onChange={e=>setCode(e.target.value)} aria-label="Module enrolment code" placeholder="Enter module code" style={{padding:12,border:'1px solid #d9dce8',borderRadius:9}}/><button className="btn" type="submit" disabled={busy}>{busy?'Joining…':'Join module'}</button>{error&&<p role="alert" style={{color:'#b42318',width:'100%'}}>{error}</p>}</form>
}
