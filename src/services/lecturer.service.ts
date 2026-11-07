async function read(res:Response){const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'Request failed');return data;}
export const lecturerService={
 updateModule:(id:string,title:string,description:string)=>read(fetch(`/api/lecturer/modules/${encodeURIComponent(id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,description})})),
 prepareCourse:(id:string):Promise<{status?:string;error?:string}>=>read(fetch(`/api/modules/${encodeURIComponent(id)}/provision`,{method:'POST'})),
};
