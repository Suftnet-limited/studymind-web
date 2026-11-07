import 'server-only';
import { prisma } from '@/lib/prisma';
import { currentUserId } from '@/lib/session';
/** A module is accessible only to its lecturer or an enrolled student. */
export async function moduleAccess(moduleId:string){const userId=await currentUserId();if(!userId)return null;const module=await prisma.module.findFirst({where:{id:moduleId,OR:[{lecturerId:userId},{enrolments:{some:{userId}}}]},select:{id:true,title:true,description:true,lecturerId:true}});if(!module)return null;return {userId,module,isLecturer:module.lecturerId===userId};}
/** AI usage requires an active paid pass. Enrolment alone does not grant AI access. */
export async function hasActivePass(userId:string){return Boolean(await prisma.accessPass.findFirst({where:{userId,status:'ACTIVE',startsAt:{lte:new Date()},expiresAt:{gt:new Date()}},select:{id:true}}));}
