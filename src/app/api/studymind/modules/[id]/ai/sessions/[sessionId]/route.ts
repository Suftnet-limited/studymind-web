import { sessionDelete, sessionOpen, type SessionContext } from '@/lib/learning-ai-proxy';
export const runtime = 'nodejs';

/** One of the caller's own chats FOR THIS MODULE, with its messages. */
export const GET = (_request: Request, context: SessionContext) => sessionOpen(context);
/** Permanently deletes one of the caller's own chats for this module. */
export const DELETE = (request: Request, context: SessionContext) => sessionDelete(request, context);
