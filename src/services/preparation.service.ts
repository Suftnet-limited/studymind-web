export type PreparationQuestion={position?:number;question:string;options?:{id:string;text:string}[]|string[]|null;correct_answer?:string;explanation?:string};
export type PreparationResult={result:{questions?:PreparationQuestion[];summary?:string}};
export const preparationService={
 async generate(moduleId:string,payload:{type:'manual'|'questions';topic:string;count:number;complexity:'simple'|'normal'|'expert'}):Promise<PreparationResult>{
  const response=await fetch(`/api/lecturer/modules/${encodeURIComponent(moduleId)}/prepare`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Generation failed');
  return data as PreparationResult;
 }
};
