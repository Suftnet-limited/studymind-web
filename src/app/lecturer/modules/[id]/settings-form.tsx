'use client';
import {useState} from 'react';
import {useUpdateModule} from '@/hooks/use-lecturer-module';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Button} from '@/components/ui/button';
export function ModuleSettingsForm({moduleId,title,description}:{moduleId:string;title:string;description:string}){
 const [name,setName]=useState(title);const [detail,setDetail]=useState(description);
 const mutation=useUpdateModule(moduleId);
 return <form className="space-y-4" onSubmit={e=>{e.preventDefault();mutation.mutate({title:name,description:detail});}}>
 <label className="block space-y-2 text-sm font-medium text-zinc-700">Title<Input required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>
 <label className="block space-y-2 text-sm font-medium text-zinc-700">Description<Textarea rows={4} maxLength={500} value={detail} onChange={e=>setDetail(e.target.value)}/></label>
 <Button type="submit" disabled={mutation.isPending}>{mutation.isPending?'Saving…':'Save changes'}</Button>
 {mutation.isSuccess&&<p role="status" className="text-sm text-emerald-700">Module updated.</p>}
 {mutation.isError&&<p role="alert" className="text-sm text-red-700">{mutation.error.message}</p>}
 </form>;
}
