/** StudyMind AI server-side client. Mirrors the verified studymind-react API contract. */
import 'server-only';
const base=(process.env.STUDYMIND_AI_BASE_URL || 'https://api.aismartlearner.com').replace(/\/+$/,'');
function headers(){const key=process.env.STUDYMIND_AI_PLATFORM_API_KEY;if(!key)throw new Error('StudyMind platform API key not configured');return {Authorization:`Bearer ${key}`};}
export async function studyMindApi<T>(path:string,options:RequestInit={}):Promise<T>{if(!path.startsWith('/api/v1/'))throw new Error('Unexpected StudyMind API route');const res=await fetch(base+path,{...options,headers:{...headers(),...options.headers},cache:'no-store'});if(!res.ok)throw new Error(`StudyMind API returned ${res.status}`);return res.json() as Promise<T>}
export async function studyMindUpload<T>(path:string,form:FormData):Promise<T>{return studyMindApi<T>(path,{method:'POST',body:form})}
