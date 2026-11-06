/** Server-only StudyMind platform client. Never expose the platform key to browsers. */
import 'server-only';
const base=process.env.STUDYMIND_AI_BASE_URL?.replace(/\/$/,'');
export async function studyMindApi<T>(path:string,options:RequestInit={}):Promise<T>{if(!base||!process.env.STUDYMIND_AI_PLATFORM_API_KEY)throw new Error('StudyMind AI API is not configured');if(!path.startsWith('/v1/'))throw new Error('Unexpected StudyMind API route');const response=await fetch(`${base}${path}`,{...options,headers:{'Content-Type':'application/json','X-API-Key':process.env.STUDYMIND_AI_PLATFORM_API_KEY,...options.headers},cache:'no-store'});if(!response.ok)throw new Error(`StudyMind API returned ${response.status}`);return response.json() as Promise<T>}
