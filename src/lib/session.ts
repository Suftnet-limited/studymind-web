import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
const cookieName = 'studymind_session';
function key(){const secret=process.env.SESSION_SECRET;if(!secret || new TextEncoder().encode(secret).length<32)throw new Error('SESSION_SECRET must be at least 32 bytes');return new TextEncoder().encode(secret)}
export async function createSession(userId:string){const token=await new SignJWT({sub:userId}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('7d').sign(key());(await cookies()).set(cookieName,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:60*60*24*7})}
export async function currentUserId(){const token=(await cookies()).get(cookieName)?.value;if(!token)return null;try{const {payload}=await jwtVerify(token,key());return typeof payload.sub==='string'?payload.sub:null}catch{return null}}
export async function endSession(){(await cookies()).delete(cookieName)}
