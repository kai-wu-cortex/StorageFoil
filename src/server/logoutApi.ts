import type { Request, Response } from 'express';
import { SessionAuthError, clearSessionCookie, sendJson } from './sessionAuth.ts';

export async function logoutApiHandler(
  req: Pick<Request, 'method'>,
  res: Pick<Response, 'status' | 'json' | 'setHeader'>,
): Promise<void> {
  if (req.method !== 'POST') {
    throw new SessionAuthError(405, 'METHOD_NOT_ALLOWED', '仅支持 POST。');
  }

  clearSessionCookie(res);
  sendJson(res, 200, { success: true });
}
